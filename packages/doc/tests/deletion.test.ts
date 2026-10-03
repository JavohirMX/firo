/**
 * Tombstones carry when they happened, not only that they happened.
 *
 * ## Why this file exists
 *
 * `deletedAt` is declared on `ElementBase` and every element type's validator
 * accepts it, so it is part of the file format whether or not anything writes
 * it. This file pins the three states it is allowed to be in -- absent, a
 * number, or explicitly null -- and which transitions produce which.
 *
 * The distinction between "absent" and "null" is not pedantry. A note that was
 * never deleted must not acquire a `deletedAt` just because it went through a
 * round trip, or a board full of live notes reports every one of them as
 * deleted at the epoch. The validators make the same call independently, by
 * spreading the key only when the input had it (see `types/stickynote.ts`).
 *
 * ## What the renderer does *not* use
 *
 * `deletedAt` is a record for the document and for undo. Nothing that draws
 * reads it: the renderer asks `isDeleted`, and the element's absence from
 * `elementOrder` is what makes it invisible. That is deliberate -- a second
 * source of truth for "is this deleted" would be a second thing to disagree --
 * so these tests also pin the `isDeleted`-only behaviour, because a change that
 * made the renderer start consulting `deletedAt` would be a behaviour change
 * dressed as a refactor.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { openBoardMemory } from "@firo/doc";

import { asFractionalIndex, loadBoard, serializeBoard } from "@firo/schema";

import type { FiroDoc } from "@firo/doc";
import type { FiroElement } from "@firo/schema";

const note = (id: string, over: Record<string, unknown> = {}): FiroElement =>
  ({
    id,
    type: "stickynote",
    text: `note ${id}`,
    x: 10,
    y: 20,
    width: 200,
    height: 200,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "#fff9b1",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    version: 1,
    versionNonce: 1,
    index: asFractionalIndex("a0"),
    created: 1750000000000,
    updated: 1750000000000,
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

/** The raw Y.Map for an element, so a *missing* key is distinguishable from null. */
const rawNode = (doc: FiroDoc, id: string) =>
  doc.ydoc.getMap("elements").get(id) as {
    get: (key: string) => unknown;
    has: (key: string) => boolean;
  };

let doc: FiroDoc;

beforeEach(() => {
  doc = openBoardMemory();
});

afterEach(() => {
  doc.destroy();
});

/* -------------------------------------------------------------------------- */
/* The three states                                                            */
/* -------------------------------------------------------------------------- */

describe("deletedAt", () => {
  test("is absent on an element that has never been deleted", () => {
    // The reason the field is optional rather than `number | null`. A null here
    // would be indistinguishable from "deleted at the epoch" forever after.
    doc.commit([{ kind: "createElement", element: note("el-1") }]);

    const node = rawNode(doc, "el-1");
    expect(node.has("deletedAt")).toBe(false);
    expect(node.get("deletedAt")).toBeUndefined();
    expect(doc.element("el-1")).not.toHaveProperty("deletedAt");
  });

  test("is a number once the element is tombstoned", () => {
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);

    const node = rawNode(doc, "el-1");
    expect(node.has("deletedAt")).toBe(true);
    expect(typeof node.get("deletedAt")).toBe("number");
    expect(doc.element("el-1")?.deletedAt).toBe(node.get("deletedAt"));
  });

  test("is the same value as the `updated` the delete stamps", () => {
    // One `applyMutation` call computes `timestamp` once and both fields take
    // it. Two separate `Date.now()` calls would differ by a millisecond often
    // enough to make "when was this deleted" and "when did this change"
    // disagree about the same event, which is the sort of thing that only shows
    // up in a bug report about restore ordering.
    //
    // Asserted under a clock that returns a different value on every call, so a
    // second `Date.now()` cannot hide behind landing in the same millisecond.
    // Under the real clock this assertion is satisfied by an implementation
    // that computes the timestamp twice: the two calls are adjacent statements
    // and agree to the millisecond. That is not hypothetical -- swapping the
    // shared `timestamp` for a fresh `Date.now()` survived the first version of
    // this test, and the second expectation is what catches it.
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    const node = rawNode(doc, "el-1");
    const clock = vi.spyOn(Date, "now");
    try {
      let tick = 5_000;
      clock.mockImplementation(() => (tick += 1));
      doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
      expect(node.get("deletedAt")).toBe(node.get("updated"));
      expect(tick).toBe(5_001);
    } finally {
      clock.mockRestore();
    }
  });

  test("is a plausible wall-clock time, not a counter", () => {
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    const before = Date.now();
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    const after = Date.now();

    const stamped = doc.element("el-1")?.deletedAt as number;
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  test("is stamped per element, and every element in one delete shares the stamp", () => {
    // One commit is one timestamp, so a delete-selection is atomically
    // "these were deleted together". That is the property a trash view that
    // groups by delete time depends on.
    doc.commit([
      { kind: "createElement", element: note("el-1") },
      { kind: "createElement", element: note("el-2", { x: 300 }) },
    ]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1", "el-2"] }]);

    const one = doc.element("el-1")?.deletedAt;
    const two = doc.element("el-2")?.deletedAt;
    expect(typeof one).toBe("number");
    expect(two).toBe(one);
  });

  test("is restamped by a second delete rather than left at the first", () => {
    // Deleting an already-deleted element is a no-op as far as `isDeleted` goes,
    // but it is a fresh event. Leaving the original stamp would claim the
    // element was deleted at a time it demonstrably was not deleted.
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    const first = doc.element("el-1")?.deletedAt;

    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    const second = doc.element("el-1")?.deletedAt;

    expect(typeof second).toBe("number");
    expect(second).toBeGreaterThanOrEqual(first as number);
  });

  test("an id that is not in the document is skipped, not created", () => {
    // `deleteElements` tolerates a missing id on purpose -- a concurrent delete
    // on a peer must not make this throw. It must equally not conjure an
    // element out of nothing.
    doc.commit([{ kind: "deleteElements", ids: ["ghost"] }]);
    expect(doc.element("ghost")).toBeNull();
    expect(doc.read().elements).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Restore                                                                     */
/* -------------------------------------------------------------------------- */

describe("restoreElements", () => {
  test("removes the key rather than setting it to null", () => {
    // The distinction the file format turns on: absent means "never deleted",
    // null means "a version that wrote null wrote null". Writing null here would
    // make every restored note look like it had been deleted at some epoch.
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    doc.commit([{ kind: "restoreElements", ids: ["el-1"] }]);

    const node = rawNode(doc, "el-1");
    expect(node.has("deletedAt")).toBe(false);
    expect(node.get("deletedAt")).toBeUndefined();
    expect(doc.element("el-1")).not.toHaveProperty("deletedAt");
  });

  test("returns the element to exactly the state a delete disturbed", () => {
    // Everything the delete touched, and nothing else. If `restore` also reset
    // `created` or lost a field, the note would come back subtly wrong and the
    // canvas would look fine, because the renderer draws `created` nowhere.
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    const before = { ...doc.element("el-1")! };
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    doc.commit([{ kind: "restoreElements", ids: ["el-1"] }]);
    const after = doc.element("el-1")!;

    // `updated` is deliberately *not* compared: both the delete and the restore
    // restamp it, and that is the honest record of what happened.
    const { updated: _beforeUpdated, ...beforeRest } = before;
    const { updated: _afterUpdated, ...afterRest } = after;
    expect(afterRest).toEqual(beforeRest);
  });

  test("a second restore is harmless and does not resurrect a stamp", () => {
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    doc.commit([{ kind: "restoreElements", ids: ["el-1"] }]);
    doc.commit([{ kind: "restoreElements", ids: ["el-1"] }]);

    expect(doc.element("el-1")?.isDeleted).toBe(false);
    expect(rawNode(doc, "el-1").has("deletedAt")).toBe(false);
  });

  test("delete, restore, delete gives a newer stamp than the first delete", () => {
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    const first = doc.element("el-1")?.deletedAt;

    doc.commit([{ kind: "restoreElements", ids: ["el-1"] }]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    const third = doc.element("el-1")?.deletedAt;

    expect(third).toBeGreaterThanOrEqual(first as number);
  });

  test("undoing a delete clears the stamp too", () => {
    // The undo manager restores the pre-delete Yjs state wholesale rather than
    // going through `restoreElements`, so this is a genuinely different code
    // path that has to reach the same place. If it did not, a note would come
    // back undeleted but carrying the time it was deleted.
    const undo = doc.createUndoManager({ captureTimeout: 0 });
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    expect(rawNode(doc, "el-1").has("deletedAt")).toBe(true);

    undo.undo();

    expect(doc.element("el-1")?.isDeleted).toBe(false);
    expect(rawNode(doc, "el-1").has("deletedAt")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The round trip                                                               */
/* -------------------------------------------------------------------------- */

describe("deletedAt survives serialisation", () => {
  test("a tombstoned note comes back with the stamp it went in with", () => {
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    const stamped = doc.element("el-1")?.deletedAt as number;

    const other = openBoardMemory();
    const loaded = loadBoard(serializeBoard(doc.read()));
    // A repair here would mean the validator rewrote the field, and the
    // assertion below would be comparing two different normalisations of it.
    expect(loaded.log.hasRepairs, loaded.log.summary()).toBe(false);
    other.load(loaded as never);

    expect(other.element("el-1")?.deletedAt).toBe(stamped);
    expect(other.element("el-1")?.isDeleted).toBe(true);
    other.destroy();
  });

  test("a live note does not acquire a deletedAt on the way", () => {
    // The other direction, and the one that would be easy to break by making
    // the validators "helpful": normalising an absent optional to null. The
    // assertion is on the key's absence, not its value, because a null would
    // satisfy a `not.toBeUndefined()` check written the other way round.
    doc.commit([{ kind: "createElement", element: note("el-1") }]);

    const other = openBoardMemory();
    other.load(loadBoard(serializeBoard(doc.read())) as never);

    expect(other.element("el-1")?.isDeleted).toBe(false);
    expect(other.element("el-1")).not.toHaveProperty("deletedAt");
    expect(rawNode(other, "el-1").has("deletedAt")).toBe(false);
    other.destroy();
  });

  test("a tombstone is still a tombstone after a round trip, not resurrected", () => {
    // The reason the field matters at all. If the stamp were lost in
    // serialisation the element would still be `isDeleted`, but anything
    // ordering restores by `deletedAt` would silently put it back in the wrong
    // place relative to a concurrent delete.
    doc.commit([
      { kind: "createElement", element: note("el-1") },
      { kind: "createElement", element: note("el-2", { x: 300 }) },
    ]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    const stamped = doc.element("el-1")?.deletedAt as number;

    const other = openBoardMemory();
    other.load(loadBoard(serializeBoard(doc.read())) as never);

    expect(other.element("el-1")?.isDeleted).toBe(true);
    expect(other.element("el-1")?.deletedAt).toBe(stamped);
    expect(other.element("el-2")?.isDeleted).toBe(false);
    other.destroy();
  });

  test("a reloaded tombstone is back in the z-order, so `isDeleted` is load-bearing", () => {
    // `load` appends "anything the file listed in `elements` but not in
    // `elementOrder`", so a tombstone -- which the delete deliberately removed
    // from the order and the serialiser therefore omits -- is re-added on the
    // way back in. That is not a z-order bug: the renderer hides an element by
    // `isDeleted`, and Excalidraw honours that itself.
    //
    // It is the reason `isDeleted` and not `deletedAt` is the field the renderer
    // reads. Anything that inferred visibility from the presence of a tombstone
    // in the z-order would show a deleted note after every reload, and only
    // after a reload, which is the worst shape a rendering bug can have.
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    expect(doc.elementOrder()).toEqual([]);

    const other = openBoardMemory();
    other.load(loadBoard(serializeBoard(doc.read())) as never);

    expect(other.elementOrder()).toEqual(["el-1"]);
    expect(other.element("el-1")?.isDeleted).toBe(true);
    other.destroy();
  });
});

/* -------------------------------------------------------------------------- */
/* What the renderer depends on, which deletedAt must not become                */
/* -------------------------------------------------------------------------- */

describe("the isDeleted-only behaviour the renderer reads", () => {
  test("deleting keeps the element readable but drops it from the z-order", () => {
    // Two independent facts, and the renderer needs both. `read()` must still
    // hand the tombstone over -- a projection that dropped it would lose the
    // delete -- and `elementOrder` must not list it, because that is what the
    // hit-testing and z-order walk reads.
    //
    // `read()` returns the tombstone *after* the live elements rather than
    // omitting it: `readAllElements` appends anything the order array does not
    // mention, so a document still yields every element it has.
    doc.commit([
      { kind: "createElement", element: note("el-1") },
      { kind: "createElement", element: note("el-2", { x: 300 }) },
    ]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);

    expect(doc.element("el-1")).not.toBeNull();
    expect(doc.element("el-1")?.isDeleted).toBe(true);
    expect(doc.read().elements.map((e) => e.id)).toEqual(["el-2", "el-1"]);
    expect(doc.elementOrder()).toEqual(["el-2"]);
  });

  test("restoring puts the element back in the z-order and flips the flag", () => {
    doc.commit([
      { kind: "createElement", element: note("el-1") },
      { kind: "createElement", element: note("el-2", { x: 300 }) },
    ]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    doc.commit([{ kind: "restoreElements", ids: ["el-1"] }]);

    expect(doc.element("el-1")?.isDeleted).toBe(false);
    expect(doc.elementOrder()).toContain("el-1");
    expect(doc.elementOrder()).toHaveLength(2);
  });

  test("`isDeleted` alone is what hides an element, with `deletedAt` unread", () => {
    // Pinned as a positive assertion rather than an absence: a future change
    // that made the renderer require `deletedAt !== null` instead of
    // `isDeleted` would break every element loaded from a file written before
    // the field existed, and the break would be invisible here.
    doc.commit([{ kind: "createElement", element: note("el-1") }]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);

    const element = doc.element("el-1")!;
    expect(element.isDeleted).toBe(true);
    // The renderer's own predicate, spelled out. `isDeleted` is the whole of it.
    const visibleToRenderer = [element].filter((e) => !e.isDeleted);
    expect(visibleToRenderer).toHaveLength(0);
  });

  test("an element born deleted has no stamp; one deleted later does", () => {
    // The distinction `deletedAt` exists to draw, and the only reason to keep
    // the field. `isDeleted: true` on the way in is how a paste or an import
    // expressed an element that was already deleted, and it has no moment to
    // record. Stamping it at `created` would invent one.
    //
    // Both are hidden identically, which is what makes the field safe to leave
    // out of the renderer's way: nothing about visibility reads it.
    doc.commit([
      {
        kind: "createElement",
        element: note("el-born-dead", { isDeleted: true }),
      },
      { kind: "createElement", element: note("el-live") },
    ]);
    doc.commit([{ kind: "deleteElements", ids: ["el-live"] }]);

    expect(doc.element("el-born-dead")?.isDeleted).toBe(true);
    expect(rawNode(doc, "el-born-dead").has("deletedAt")).toBe(false);

    expect(doc.element("el-live")?.isDeleted).toBe(true);
    expect(typeof doc.element("el-live")?.deletedAt).toBe("number");

    // And the renderer's predicate agrees on both, so the difference kept in
    // the document never reaches the canvas.
    const live = doc.read().elements.filter((e) => e.isDeleted !== true);
    expect(live).toHaveLength(0);
  });
});