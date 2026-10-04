/**
 * The ephemeral/durable split, and the write-path guard that enforces it.
 *
 * These are the two tests in Phase 1 that exist to catch a failure which is
 * invisible when it happens. A stray document write does not throw, does not
 * fail a typecheck, and does not fail any other test. It produces a board that
 * is orders of magnitude larger than its content, an undo stack with one step per
 * frame, and remote cursors that lag behind local ones. Nothing says "wrong".
 *
 * So the invariant is made mechanical in two places: `durableUpdates` counts, and
 * the `beforeTransaction` guard throws.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as Y from "yjs";

import {
  FiroDoc,
  LOCAL_ORIGIN,
  openBoardMemory,
  UnauthoredWriteError,
  applyEphemeralPatch,
  EMPTY_EPHEMERAL_STATE,
} from "@firo/doc";

import type { FiroElement } from "@firo/schema";

/** A minimal valid element. */
const note = (id: string, over: Partial<FiroElement> = {}): FiroElement =>
  ({
    id,
    type: "stickynote",
    text: `note ${id}`,
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    angle: 0,
    version: 1,
    versionNonce: 1,
    index: null,
    created: 1,
    updated: 1,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    isDeleted: false,
    isContainer: false,
    fontSize: 20,
    fontFamily: 6,
    textAlign: "left",
    verticalAlign: "top",
    ...over,
  } as unknown as FiroElement);

let doc: FiroDoc;

/**
 * A five-minute timer, running.
 *
 * An *anchor*, not a countdown -- which is the property the whole facilitation
 * split rests on. The started time is a fixed epoch value rather than
 * `Date.now()` for two reasons: this package must not read a clock to be
 * testable, and a fixed value means the assertions below cannot accidentally
 * depend on how long the test took to run.
 */
const RUNNING_TIMER = {
  startedAt: 1_700_000_000_000,
  durationMs: 5 * 60 * 1000,
  remainingMs: 5 * 60 * 1000,
} as const;

beforeEach(() => {
  doc = openBoardMemory();
});

afterEach(() => {
  doc.destroy();
});

/* -------------------------------------------------------------------------- */
/* The test that matters                                                       */
/* -------------------------------------------------------------------------- */

describe("a five-second drag produces zero document updates", () => {
  test("300 pointer-move events over 5s: no durable updates, only awareness", () => {
    /*
     * The shape of the failure this prevents: a `pointermove` handler that calls
     * something which writes to the document. Every one of those 300 writes is
     * persisted, enters the undo history, and -- once a provider exists -- is
     * broadcast and applied by every peer. The result is a document several
     * orders of magnitude larger than its content, and an undo stack with 300
     * steps in it, so the user's Ctrl-Z moves one frame.
     *
     * 60 Hz for 5 seconds is the real number, not a rounded-down one.
     */
    const FRAMES = 300;
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    expect(doc.durableUpdates).toBe(1);

    const start = doc.durableUpdates;

    // A Yjs update listener, so a write through any route would be caught --
    // not just one through `commit()`, which is the only legal route anyway.
    const rawUpdates: Uint8Array[] = [];
    doc.ydoc.on("update", (update: Uint8Array) => rawUpdates.push(update));

    for (let frame = 0; frame < FRAMES; frame += 1) {
      const t = frame / 60;
      doc.setEphemeral({ cursor: { x: frame * 3, y: frame * 2 } });
      doc.setEphemeral({
        dragPreview: {
          elementId: "el-1",
          x: frame * 3,
          y: frame * 2,
          width: 200,
          height: 200,
        },
      });
      doc.setEphemeral({ hover: frame % 2 === 0 ? "el-1" : null });
      void t;
    }

    expect(doc.durableUpdates - start).toBe(0);
    // The stronger form: Yjs itself emitted no update at all. This is what
    // proves nothing wrote to the document by any route, including a route this
    // test has not thought of.
    expect(rawUpdates).toHaveLength(0);
  });

  test("the drag commits once, on pointer-up, as a single undo step", () => {
    // The other half. Once the pointer is released the move must be durable --
    // an ephemeral-only drag would mean the board resets itself on reload.
    //
    // `captureTimeout: 0` makes every commit its own stack item, so "one step"
    // is testable directly. The production value is a *coalescing* window, not a
    // step count: a real drag's create lands at pointer-down and its move at
    // pointer-up, which are seconds apart and already separate steps.
    const undo = doc.createUndoManager({ captureTimeout: 0 });

    for (let frame = 0; frame < 60; frame += 1) {
      doc.setEphemeral({
        dragPreview: {
          elementId: "el-1",
          x: frame,
          y: frame,
          width: 200,
          height: 200,
        },
      });
    }
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    doc.commit([
      {
        kind: "updateElements",
        updates: [{ id: "el-1", changes: { x: 59, y: 59 } }],
      },
    ]);

    expect(doc.durableUpdates).toBe(2);
    expect(doc.element("el-1")?.x).toBe(59);

    undo.undo();
    // One step back to the pre-drag position, not 60 steps back to nothing.
    expect(doc.element("el-1")?.x).toBe(0);
    undo.redo();
    expect(doc.element("el-1")?.x).toBe(59);
  });

  test("ephemeral state never appears in the document, in any form", () => {
    // Every root, not just `elements`. Serialising one map and asserting on it
    // is how this test would have passed while a timer sat in `meta`: the write
    // is real, the document really is bigger, and the assertion is looking at
    // the one place it was not.
    const wholeDocument = (): string =>
      JSON.stringify(
        Object.fromEntries(
          [...doc.ydoc.share.entries()].map(([name, type]) => [
            name,
            (type as { toJSON: () => unknown }).toJSON(),
          ]),
        ),
      );

    // An element and a meta entry are committed first, so the assertions below
    // have something to be *not* contained in. Without them the serialised
    // document is nearly empty and every `not.toContain` passes vacuously --
    // which is the shape of an assertion that survives the exact change it was
    // written to catch.
    doc.commit([
      { kind: "createElement", element: note("el-1") },
      { kind: "setMeta", entries: { title: "board" } },
    ]);
    doc.setEphemeral({ cursor: { x: 11, y: 22 }, laser: { x: 5, y: 5 } });
    doc.setEphemeral({
      dragPreview: { elementId: "x", x: 1, y: 2, width: 3, height: 4 },
    });
    doc.setEphemeral({ timer: RUNNING_TIMER });
    doc.setEphemeral({ reveal: { mode: "private" } });

    const raw = wholeDocument();
    // The control: the committed content *is* here, so the negatives below are
    // real and not the vacuous pass of an empty document.
    expect(raw).toContain("el-1");
    expect(raw).toContain("board");
    expect(raw).not.toContain("cursor");
    expect(raw).not.toContain("laser");
    expect(raw).not.toContain("dragPreview");
    // The facilitator half, same rule. A timer in the document is the 300-update
    // bug; a reveal toggle in it is a board that saves "still private" forever.
    expect(raw).not.toContain("timer");
    expect(raw).not.toContain("startedAt");
    expect(raw).not.toContain("reveal");
    // And no root exists for them, so there is nowhere for them to have leaked.
    expect([...doc.ydoc.share.keys()].sort()).toEqual([
      "assets",
      "collections",
      "elementOrder",
      "elements",
      "meta",
      "recordOrder",
      "records",
    ]);
  });

  test("the full ephemeral table from the TRD is expressible without a document write", () => {
    // Every row of the table in docs/trd/03-crdt-and-sync.md, so a future
    // addition to the left-hand column is a type error rather than a leak.
    //
    // The `toEqual` is exhaustive on purpose and is the reason the new fields
    // are required-but-nullable: add one to `EphemeralState` and this assertion
    // fails until it is given a row here, instead of quietly becoming
    // `{ timer: undefined }` that no consumer has to defend against.
    const before = doc.durableUpdates;
    doc.setEphemeral({ cursor: { x: 1, y: 1 } });
    doc.setEphemeral({
      dragPreview: { elementId: "a", x: 0, y: 0, width: 1, height: 1 },
    });
    doc.setEphemeral({ selection: ["a", "b"] });
    doc.setEphemeral({ hover: "a" });
    doc.setEphemeral({ laser: { x: 9, y: 9 } });
    doc.setEphemeral({ idleSince: 1234 });
    doc.setEphemeral({ viewport: { scrollX: 0, scrollY: 0, zoom: 1 } });
    doc.setEphemeral({ timer: RUNNING_TIMER });
    doc.setEphemeral({ reveal: { mode: "private" } });
    doc.setEphemeral({
      presentation: {
        active: true,
        slideIds: ["frame-1", "frame-2"],
        index: 1,
      },
    });
    expect(doc.durableUpdates).toBe(before);

    expect(doc.getEphemeral()).toEqual({
      cursor: { x: 1, y: 1 },
      dragPreview: { elementId: "a", x: 0, y: 0, width: 1, height: 1 },
      selection: ["a", "b"],
      hover: "a",
      laser: { x: 9, y: 9 },
      idleSince: 1234,
      viewport: { scrollX: 0, scrollY: 0, zoom: 1 },
      timer: RUNNING_TIMER,
      reveal: { mode: "private" },
      presentation: {
        active: true,
        slideIds: ["frame-1", "frame-2"],
        index: 1,
      },
    });
  });

  test("a fresh client starts revealed, with no timer", () => {
    // The other direction, and the one a required-but-nullable pair can get
    // wrong: `undefined` would render as a board with no clock at all, and would
    // hide a board nobody hid if `mode` were read defensively.
    expect(EMPTY_EPHEMERAL_STATE.timer).toBeNull();
    expect(EMPTY_EPHEMERAL_STATE.reveal).toEqual({ mode: "revealed" });
    expect(EMPTY_EPHEMERAL_STATE.presentation).toEqual({
      active: false,
      slideIds: [],
      index: 0,
    });
    expect(doc.getEphemeral()).toEqual(EMPTY_EPHEMERAL_STATE);
  });
});

/* -------------------------------------------------------------------------- */
/* Facilitation state rides awareness, not the document                       */
/* -------------------------------------------------------------------------- */

describe("the facilitator's timer and reveal toggle are ephemeral", () => {
  test("a five-minute timer at 1Hz produces zero document updates", () => {
    /*
     * The property that matters, and the second half of this file's argument
     * after the drag.
     *
     * The shape of the failure: a timer stored as a per-second countdown. That
     * is not a subtle regression -- it is the obvious first implementation, and
     * it is *correct* in the sense that every tick updates the clock on every
     * screen. It just does it with 300 durable writes: 300 persisted values, 300
     * undo steps (so Ctrl-Z walks back through the last five minutes), and 300
     * broadcasts per participant. A five-minute exercise, five people.
     *
     * The fix is the anchor, and this is the test that holds it in place: 301
     * identical `setEphemeral` calls, each one what a repaint would trigger,
     * producing no document traffic whatsoever.
     */
    const TICKS = 5 * 60;

    // A Yjs update listener, so a write through *any* route is caught -- not
    // just one through `commit()`, which is the only legal route anyway.
    const rawUpdates: Uint8Array[] = [];
    doc.ydoc.on("update", (update: Uint8Array) => rawUpdates.push(update));

    const before = doc.durableUpdates;

    for (let tick = 0; tick <= TICKS; tick += 1) {
      // Deliberately a fresh object literal each tick, exactly as a re-render
      // would build it. `remainingMs` does not change, which is the point: the
      // anchor is the only number a running timer holds, so 301 writes of this
      // are 301 writes of the same fact.
      doc.setEphemeral({
        timer: {
          startedAt: RUNNING_TIMER.startedAt,
          durationMs: RUNNING_TIMER.durationMs,
          remainingMs: RUNNING_TIMER.remainingMs,
        },
      });
    }

    // The stronger form: Yjs itself emitted no update at all. Nothing wrote to
    // the document by any route, including a route this test has not thought of.
    expect(rawUpdates).toHaveLength(0);
    expect(doc.durableUpdates - before).toBe(0);

    // And the anchor survived all of it -- a timer that reads back wrong after
    // a no-op loop is not a timer that was never written, it is one that was
    // written and mangled.
    expect(doc.getEphemeral().timer).toEqual(RUNNING_TIMER);
  });

  test("setting the timer leaves selection, cursor and laser alone", () => {
    // The patch is partial, and this is the field most likely to be set from the
    // same handler that clears the selection. A merge that rebuilt the state
    // from the timer alone would silently deselect everything on the first tick.
    doc.setEphemeral({
      selection: ["a", "b"],
      cursor: { x: 1, y: 2 },
      laser: { x: 3, y: 4 },
    });

    doc.setEphemeral({ timer: RUNNING_TIMER });

    const after = doc.getEphemeral();
    expect(after.timer).toEqual(RUNNING_TIMER);
    expect(after.selection).toEqual(["a", "b"]);
    expect(after.cursor).toEqual({ x: 1, y: 2 });
    expect(after.laser).toEqual({ x: 3, y: 4 });
  });

  test("`timer: null` clears the timer rather than being ignored", () => {
    /*
     * The near-miss, and the reason the merge uses a spread rather than a
     * per-field truthy guard. `null` is falsy, so
     * `patch.timer ? { timer: patch.timer } : {}` compiles, typechecks, reads as
     * defensive -- and keeps the old timer. The facilitator hits stop and the
     * clock keeps running on every screen, for the rest of the session, from a
     * patch that looked obviously correct.
     */
    doc.setEphemeral({ timer: RUNNING_TIMER });
    expect(doc.getEphemeral().timer).not.toBeNull();

    doc.setEphemeral({ timer: null });

    // `toBeNull` rather than `toBeFalsy`, so a regression to `undefined` fails
    // here instead of reaching a renderer that would print a blank clock.
    expect(doc.getEphemeral().timer).toBeNull();
  });

  test("setting reveal leaves the timer alone", () => {
    // Going private mid-exercise is the common case, not the exotic one: hide
    // the board, un-hide it, and the clock must not have reset. These two are
    // independent facets of one session and are written by different controls.
    doc.setEphemeral({ timer: RUNNING_TIMER });
    doc.setEphemeral({ reveal: { mode: "private" } });
    doc.setEphemeral({ reveal: { mode: "revealed" } });

    const after = doc.getEphemeral();
    expect(after.reveal).toEqual({ mode: "revealed" });
    expect(after.timer).toEqual(RUNNING_TIMER);
  });

  test("the result is frozen, so a tick cannot mutate the shared state", () => {
    // The same guarantee the merge already gives every other field, asserted on
    // the new ones: a timer arrives from awareness as whatever a peer sent, and
    // a state object that a renderer can scribble on is a state object two
    // collaborators will disagree about.
    const withTimer = applyEphemeralPatch(EMPTY_EPHEMERAL_STATE, {
      timer: RUNNING_TIMER,
    });
    const withReveal = applyEphemeralPatch(withTimer, {
      reveal: { mode: "private" },
    });

    expect(Object.isFrozen(withTimer)).toBe(true);
    expect(Object.isFrozen(withReveal)).toBe(true);
  });

  test("the shared default reveal mode cannot be written through", () => {
    // `EMPTY_EPHEMERAL_STATE.reveal` is reachable from every state derived from
    // it -- a patch that does not mention `reveal` replaces nothing -- so a
    // mutable default would be shared by all of them. `Readonly<>` refuses this
    // at compile time; the freeze is what makes it true at runtime too, and this
    // is the only assertion that can tell the difference.
    const shared = EMPTY_EPHEMERAL_STATE.reveal;
    expect(Object.isFrozen(shared)).toBe(true);
  });

  test("a peer's timer is readable through awareness", () => {
    // The half that makes the field worth having: it is not local state that
    // merely *looks* shared. Five people watching one clock means the timer has
    // to travel, and awareness is the only channel it is allowed to use.
    doc.setEphemeral({ timer: RUNNING_TIMER });
    const peers = doc.peersEphemeral();

    expect(peers.size).toBe(1);
    expect([...peers.values()][0].timer).toEqual(RUNNING_TIMER);
    expect([...peers.values()][0].reveal).toEqual({ mode: "revealed" });
  });
});

describe("the write path is enforced, not documented", () => {
  test("a direct Yjs write throws", () => {
    // The guard. If this test ever starts passing silently -- because someone
    // loosened the guard to make something else work -- the protection is gone
    // and nothing else in the suite would say so.
    expect(() => {
      doc.ydoc.getMap("elements").set("sneaky", note("el-x"));
    }).toThrow(UnauthoredWriteError);
  });

  test("the error names the two legal alternatives", () => {
    try {
      doc.ydoc.getMap("meta").set("name", "nope");
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("doc.commit()");
      expect(message).toContain("doc.setEphemeral()");
    }
  });

  test("the refusal leaves the document untouched", () => {
    // A partial write is worse than a refused one: the caller retries against a
    // document that already has half of what it tried to add.
    doc.commit([{ kind: "createElement", element: note("good") }]);
    const before = JSON.stringify(doc.read());

    expect(() => {
      doc.ydoc.transact(() => {
        doc.ydoc.getMap("meta").set("a", 1);
        doc.ydoc.getMap("meta").set("b", 2);
      });
    }).toThrow(UnauthoredWriteError);

    expect(JSON.stringify(doc.read())).toBe(before);
  });

  test("a nested map cannot be reached in and mutated", () => {
    // The bypass that a `beforeTransaction` guard would miss entirely: a nested
    // Yjs type is handed out, and Yjs starts an implicit untagged transaction the
    // moment you mutate it. An element *is* a nested map, so this is the shape a
    // real bug would take. The guard wraps return values for exactly this reason.
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    const node = doc.ydoc.getMap("elements").get("el-1") as unknown as {
      set: (key: string, value: unknown) => void;
    };
    expect(node).toBeDefined();
    expect(() => node.set("x", 999)).toThrow(UnauthoredWriteError);
    expect(doc.element("el-1")?.x).toBe(0);
  });

  test("a nested map reached through forEach is guarded too", () => {
    // `forEach` is how a renderer enumerates, so it is exactly how a bug would
    // obtain a live node. The callback argument is wrapped, not the value.
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    let grabbed: { set: (key: string, value: unknown) => void } | null = null;
    doc.ydoc.getMap("elements").forEach((node: unknown) => {
      grabbed = node as { set: (key: string, value: unknown) => void };
    });
    expect(grabbed).not.toBeNull();
    expect(() => grabbed?.set("x", 999)).toThrow(UnauthoredWriteError);
  });

  test("the guard survives a violation and still catches the next one", () => {
    // The reason this is a Proxy and not a throwing event listener: Yjs emits
    // `beforeTransaction` outside the `try` in `transact()`, so a throw there
    // leaves `_transaction` set and the guard never fires again. Refusing before
    // the write is what keeps this test possible.
    const writeSneaky = (attempt: number) =>
      doc.ydoc.getMap("meta").set("sneaky", attempt);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(() => writeSneaky(attempt)).toThrow(UnauthoredWriteError);
    }
    expect(doc.ydoc.getMap("meta").get("sneaky")).toBeUndefined();
    // And the document still works.
    doc.commit([{ kind: "setMeta", entries: { name: "still fine" } }]);
    expect(doc.read().meta.name).toBe("still fine");
  });

  test("reads are not blocked, so the guard cannot make a board unusable", () => {
    // The other failure mode of an enforcement mechanism: too strict, so
    // everything is refused and the app is obviously broken. Someone would
    // "fix" it by removing the guard rather than by adding a read entry.
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    const map = doc.ydoc.getMap("elements");
    expect(map.size).toBe(1);
    expect(map.has("el-1")).toBe(true);
    expect(map.get("el-1")).toBeDefined();
    expect(map.toJSON()).toBeDefined();
    expect([...map.keys()]).toEqual(["el-1"]);
    expect([...map.values()].length).toBe(1);
    expect(JSON.stringify(map.toJSON())).toContain("el-1");
    expect(doc.ydoc.getArray("elementOrder").toArray()).toEqual(["el-1"]);
  });

  test("the origin tag cannot be forged from outside the package", () => {
    // A string origin would be guessable and would silently disable the guard.
    // Symbols are not, which is why the tags are `unique symbol`.
    expect(() => {
      doc.ydoc.transact(() => {
        doc.ydoc.getMap("meta").set("x", 1);
      }, "local");
    }).toThrow(UnauthoredWriteError);

    expect(() => {
      doc.ydoc.transact(() => {
        doc.ydoc.getMap("meta").set("x", 1);
      }, null);
    }).toThrow(UnauthoredWriteError);
  });

  test("and the real tag is accepted", () => {
    // The control: the guard rejects untagged writes without rejecting writes.
    expect(() => {
      doc.ydoc.transact(() => {
        doc.ydoc.getMap("meta").set("x", 1);
      }, LOCAL_ORIGIN);
    }).not.toThrow();
  });

  test("commit() is the only way durableUpdates moves", () => {
    const before = doc.durableUpdates;
    doc.commit([{ kind: "setMeta", entries: { name: "Board" } }]);
    expect(doc.durableUpdates).toBe(before + 1);
  });
});

/* -------------------------------------------------------------------------- */
/* commit() as the boundary                                                    */
/* -------------------------------------------------------------------------- */

describe("commit() validates its input", () => {
  test("a non-array is refused", () => {
    expect(() => doc.commit({ kind: "setMeta" } as never)).toThrow(TypeError);
  });

  test("an unknown mutation kind is refused", () => {
    // Mutations arrive from plugins, a URL, and MCP tools. A TypeScript type is
    // not a validation, and `commit` is the last place that can still refuse.
    expect(() => doc.commit([{ kind: "dropDatabase" } as never])).toThrow(
      /Not a mutation/,
    );
  });

  test("updating an element that is not there throws rather than silently skipping", () => {
    // Skipping would let a delete-then-update race look like success, and the
    // caller would never learn the edit was lost.
    expect(() =>
      doc.commit([
        {
          kind: "updateElements",
          updates: [{ id: "ghost", changes: { x: 1 } }],
        },
      ]),
    ).toThrow(/not in the document/);
  });

  test("a rejected commit leaves nothing behind", () => {
    const before = doc.durableUpdates;
    expect(() =>
      doc.commit([
        { kind: "createElement", element: note("ok") },
        {
          kind: "updateElements",
          updates: [{ id: "ghost", changes: { x: 1 } }],
        },
      ]),
    ).toThrow();

    // Yjs keeps the transaction open until the callback returns normally, so a
    // throw discards the whole thing -- which is why "ok" is absent too.
    expect(doc.element("ok")).toBeNull();
    expect(doc.durableUpdates).toBe(before);
  });
});

/* -------------------------------------------------------------------------- */
/* Awareness                                                                  */
/* -------------------------------------------------------------------------- */

describe("awareness is the only channel for ephemeral state", () => {
  test("a peer's ephemeral state is readable, and ours is in it", () => {
    doc.setEphemeral({ cursor: { x: 3, y: 4 } });
    const peers = doc.peersEphemeral();
    expect(peers.size).toBe(1);
    expect([...peers.values()][0].cursor).toEqual({ x: 3, y: 4 });
  });

  test("awareness updates produce Yjs awareness messages, not document updates", () => {
    const rawUpdates: Uint8Array[] = [];
    doc.ydoc.on("update", (u: Uint8Array) => rawUpdates.push(u));

    for (let i = 0; i < 50; i += 1) {
      doc.setEphemeral({ cursor: { x: i, y: i } });
    }
    expect(rawUpdates).toHaveLength(0);

    // Awareness is a separate channel entirely: the state is registered, and a
    // provider would relay it as an awareness message rather than an update.
    expect(doc.awareness.getLocalState()).not.toBeNull();
  });
});

describe("the ephemeral merge is pure and total", () => {
  test("a patch touches only the keys it names", () => {
    // Testable without an `Awareness` instance, because the interesting bug in
    // ephemeral.ts is a merge that drops a key.
    const first = applyEphemeralPatch(EMPTY_EPHEMERAL_STATE, { hover: "a" });
    const second = applyEphemeralPatch(first, { cursor: { x: 1, y: 2 } });
    expect(second.hover).toBe("a");
    expect(second.cursor).toEqual({ x: 1, y: 2 });
  });

  test("selection is replaced, not merged, so deselect-all is expressible", () => {
    const selected = applyEphemeralPatch(EMPTY_EPHEMERAL_STATE, {
      selection: ["a", "b", "c"],
    });
    // An additive merge could never express this, and a handler that had to
    // read-modify-write would be racing a field that is disposable.
    expect(applyEphemeralPatch(selected, { selection: [] }).selection).toEqual(
      [],
    );
  });

  test("a patch that omits selection leaves it alone", () => {
    const selected = applyEphemeralPatch(EMPTY_EPHEMERAL_STATE, {
      selection: ["a"],
    });
    expect(applyEphemeralPatch(selected, { hover: "b" }).selection).toEqual([
      "a",
    ]);
  });

  test("the result is frozen, so a handler cannot mutate shared state", () => {
    const state = applyEphemeralPatch(EMPTY_EPHEMERAL_STATE, { hover: "a" });
    expect(Object.isFrozen(state)).toBe(true);
  });

  test("the selection array is copied, not aliased", () => {
    const ids = ["a", "b"];
    const state = applyEphemeralPatch(EMPTY_EPHEMERAL_STATE, {
      selection: ids,
    });
    ids.push("c");
    expect(state.selection).toEqual(["a", "b"]);
  });
});

describe("destroying the document", () => {
  test("tears down awareness and clears the document", () => {
    const d = openBoardMemory();
    d.setEphemeral({ cursor: { x: 1, y: 1 } });
    expect(d.awareness.getLocalState()).not.toBeNull();

    d.destroy();

    // `Awareness.destroy` drops the local state and detaches the handlers, so
    // there is nothing left that can relay. Asserted positively rather than as
    // "it throws", because a throw here would be Yjs's behaviour and not ours.
    expect(d.awareness.getLocalState()).toBeNull();
    expect(d.awareness.getStates().size).toBe(0);
  });

  test("subscribers are dropped, so a destroyed doc cannot notify", () => {
    const d = openBoardMemory();
    const seen: number[] = [];
    d.subscribe(() => seen.push(1));
    d.destroy();
    d.commit([{ kind: "setMeta", entries: { x: 1 } }]);
    expect(seen).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* No timers, no globals                                                       */
/* -------------------------------------------------------------------------- */

describe("this package does not reach for a global it was not given", () => {
  test("a document works with no `window`, and no ambient Yjs doc either", () => {
    // An upstream-inherited rule: use `app.ownerDocument` / `app.ownerWindow`, so
    // the editor can be embedded in an iframe or a shadow root. Phase 1 has no
    // DOM at all, and a test asserting that keeps it that way.
    const ydoc = new Y.Doc();
    const d = new FiroDoc(ydoc);
    d.commit([{ kind: "createElement", element: note("el-1") }]);
    expect(d.element("el-1")).not.toBeNull();
    d.destroy();
  });

  test("commit does not depend on wall-clock advancing", () => {
    // `updated` is a timestamp, and a test that needs `vi.useFakeTimers` to be
    // deterministic would be a test that cannot assert on a real board. Frozen
    // time here proves the ordering, not the clock.
    vi.useFakeTimers();
    try {
      doc.commit([
        { kind: "createElement", element: note("first") },
        { kind: "createElement", element: note("second") },
      ]);
      const first = doc.element("first");
      const second = doc.element("second");
      expect(first?.updated).toBe(second?.updated);
    } finally {
      vi.useRealTimers();
    }
  });
});
