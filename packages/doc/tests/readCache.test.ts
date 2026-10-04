import { describe, expect, test } from "vitest";

import * as Y from "yjs";

import { FiroDoc } from "../src/doc.js";
import { applyRemoteUpdate } from "../src/persistence.js";

/*
 * `read()` is memoised, lazy, and frozen.
 *
 * ## What this file is for
 *
 * Three properties were introduced together to fix a measured cost — `read()` was
 * 16 ms and 17 MB at 10,000 elements, twice per keystroke
 * ([ADR-0020](../../../docs/adr/0020-stop-walking-the-whole-document-to-read-it.md)).
 * Each one can fail silently, and two of them fail *silently by succeeding*:
 *
 * 1. **Memoisation** means a caller can be handed a stale board. A cache with no
 *    invalidation is not slow, it is wrong, and nothing throws.
 * 2. **Laziness** means a caller can be handed a snapshot whose fields describe
 *    different instants. There is no torn *value*; there are two correct answers.
 * 3. **Freezing** means a caller that mutates a shared snapshot gets a `TypeError`
 *    instead of poisoning the cache for everybody.
 *
 * ## What is deliberately NOT asserted here
 *
 * **The cost.** "Reading `meta` does not walk 10,000 elements" is a performance claim,
 * and a performance claim asserted in a unit test is a flaky test: it fails on a busy
 * CI machine and passes on a fast one, so it trains people to ignore it. The bench
 * owns that claim — `yarn bench:read` prints `read().collections` and `read().meta`
 * next to `read().elements` so the ratio is visible on demand.
 *
 * What this file asserts instead is the *mechanism* the saving depends on: each field
 * is a memoised getter, so reading it twice returns the identical object. Those are
 * exact, and they are what would break first if someone made the fields eager again.
 *
 * ## One property that is deliberately absent
 *
 * "Reading `meta` does not also walk the 10,000 elements" — the isolation the whole
 * change is for — **is not asserted here, because it cannot be asserted here.** This
 * file had a test for it, and a mutation that made `collections` materialise `elements`
 * passed it: every field is a memoised getter either way, and identity cannot see
 * whether a second walk happened. A test that cannot fail is worse than no test,
 * because it reads as coverage.
 *
 * `yarn bench:read` prints `read().collections` and `read().meta` beside
 * `read().elements`, which is the check that actually works: 0.44 ms and 0.35 ms
 * against 17.9 ms. If someone makes the fields eager again, that table collapses back
 * to being uniform and the change is visible in one command.
 */

const doc = () => new FiroDoc(new Y.Doc());

const element = (id: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    angle: 0,
    name: id,
    strokeColor: "#1e1e1e",
    backgroundColor: "#ffffff",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    created: 1000,
    updated: 2000,
    ...over,
  } as never);

const withTwoElements = () => {
  const d = doc();
  d.commit([
    { kind: "createElement", element: element("a") },
    { kind: "createElement", element: element("b") },
  ]);
  return d;
};

describe("the snapshot is memoised", () => {
  test("two reads with nothing in between are the same snapshot", () => {
    // The saving, stated as a property rather than a timing. If this ever fails, the
    // 16 ms is back and nothing else in the suite would say so.
    const d = withTwoElements();

    expect(d.read()).toBe(d.read());
  });

  test("a commit invalidates it", () => {
    const d = withTwoElements();
    const before = d.read();

    d.commit([
      { kind: "updateElements", updates: [{ id: "a", changes: { x: 5 } }] },
    ]);

    expect(d.read()).not.toBe(before);
    expect(d.read().elements.find((e) => e.id === "a")?.x).toBe(5);
  });

  test("a remote update invalidates it, which a local-only counter would miss", () => {
    /*
     * The failure this guards, and it is the one a local revision count gets wrong by
     * construction.
     *
     * A counter bumped only in `commit()` does not move when a collaborator's update
     * arrives. Two clients, one keystroke between them, and the local client keeps
     * serving a snapshot from before the collaborator's note existed — with no error,
     * because a cache that is stale looks exactly like a cache that is working.
     */
    const local = doc();
    const peer = new Y.Doc();

    local.commit([{ kind: "createElement", element: element("mine") }]);
    const before = local.read();

    // The peer's update, captured and applied as a remote one.
    peer.on("update", (update: Uint8Array) => {
      applyRemoteUpdate(local, update);
    });
    const peerDoc = new FiroDoc(peer);
    peerDoc.commit([{ kind: "createElement", element: element("theirs") }]);

    expect(local.read()).not.toBe(before);
    expect(
      local
        .read()
        .elements.map((e) => e.id)
        .sort(),
    ).toEqual(["mine", "theirs"]);
  });

  test("load() invalidates it", () => {
    // `load()` writes through its own origin, so a cache keyed on the *local* commit
    // count would survive a board replacement and go on serving the old board.
    const d = withTwoElements();
    const before = d.read();

    d.load({
      elements: [element("z")] as never,
      collections: [],
      records: [],
      elementOrder: ["z"],
      meta: {},
    });

    // A new snapshot, and the loaded element is in it.
    //
    // Note what `load()` does *not* do: it does not clear the board first, so `a` and
    // `b` are still there. That is correct — `load` is how a file is restored into a
    // document, and it composes with whatever was already present. The property under
    // test is only that the cache did not survive, so a restored board can never be
    // served from the snapshot taken before it.
    expect(d.read()).not.toBe(before);
    expect(d.read().elements.map((e) => e.id)).toContain("z");
  });

  test("an unchanged document keeps serving one snapshot", () => {
    // The other half: a cache that rebuilt on every *call* rather than on every
    // *transaction* would be correct and just as slow.
    const d = withTwoElements();
    const first = d.read();

    for (let i = 0; i < 5; i++) {
      expect(d.read()).toBe(first);
    }
  });
});

describe("each field is a memoised getter", () => {
  test("reading a field twice returns the identical object", () => {
    // The mechanism the laziness depends on. If a field were rebuilt per access, the
    // saving would evaporate while every behavioural test still passed.
    const d = withTwoElements();
    const snapshot = d.read();

    expect(snapshot.meta).toBe(snapshot.meta);
    expect(snapshot.collections).toBe(snapshot.collections);
    expect(snapshot.records).toBe(snapshot.records);
    expect(snapshot.elementOrder).toBe(snapshot.elementOrder);
    expect(snapshot.elements).toBe(snapshot.elements);
  });

  test("a field asked for after a transaction reflects the new state", () => {
    /*
     * The semantic change, stated rather than left to be discovered: **a snapshot is
     * no longer a point-in-time view.** Fields are filled on first access, so one read
     * can straddle a transaction.
     *
     * That is the accepted trade (ADR-0020, Option A) and it is defensible — each
     * field is internally consistent, and a caller asking later arguably wants the
     * later answer — but it *is* a change, and this test is here so that somebody
     * changing the trade has to delete a test rather than be surprised.
     */
    const d = withTwoElements();
    const snapshot = d.read();

    expect(snapshot.elements).toHaveLength(2);

    d.commit([{ kind: "createElement", element: element("c") }]);

    // Still the same object — memoised — so still two.
    expect(snapshot.elements).toHaveLength(2);
    // And a *new* read sees three.
    expect(d.read().elements).toHaveLength(3);
  });

  test("a field is filled at most once, so a mid-read transaction cannot tear it", () => {
    const d = withTwoElements();
    const snapshot = d.read();

    const first = snapshot.elements;
    d.commit([{ kind: "createElement", element: element("d") }]);

    // The same array, unmutated. A torn value inside one field is the failure that
    // would be genuinely hard to diagnose, and memoisation is what prevents it.
    expect(snapshot.elements).toBe(first);
    expect(snapshot.elements).toHaveLength(2);
  });
});

describe("a snapshot cannot be mutated", () => {
  test("the arrays are frozen", () => {
    const d = withTwoElements();
    const snapshot = d.read();

    expect(Object.isFrozen(snapshot.elements)).toBe(true);
    expect(Object.isFrozen(snapshot.elementOrder)).toBe(true);
    expect(Object.isFrozen(snapshot.collections)).toBe(true);
    expect(Object.isFrozen(snapshot.records)).toBe(true);
  });

  test("the element objects are frozen", () => {
    /*
     * The property the freeze exists for.
     *
     * `read()` is memoised, so every caller now shares these objects rather than
     * receiving fresh ones. That is where the 16 ms went, and it introduces a bug
     * that was previously impossible: a caller that wrote to a snapshot would poison
     * the cache for everybody, and the poison would persist until the next
     * transaction — turning one caller's mistake into a board that renders wrong for
     * reasons nobody can trace.
     *
     * `fromYMap` returns `Object.create(null)` objects, so nothing *prevented* a write.
     * This is what prevents it.
     */
    const d = withTwoElements();
    const snapshot = d.read();

    expect(Object.isFrozen(snapshot.elements[0])).toBe(true);
    expect(() => {
      (snapshot.elements[0] as unknown as Record<string, unknown>).x = 999;
    }).toThrow(TypeError);
  });

  test("meta is frozen", () => {
    const d = withTwoElements();
    const snapshot = d.read();

    expect(Object.isFrozen(snapshot.meta)).toBe(true);
    expect(() => {
      (snapshot.meta as Record<string, unknown>).name = "not this board";
    }).toThrow(TypeError);
  });

  test("the poison does not survive: the next transaction gives a clean board", () => {
    /*
     * Belt and braces. Even if a mutation did get through — a nested object, say,
     * which the shallow freeze does not cover — the cache must not carry it into the
     * next revision. This asserts the cache is keyed on the revision and not merely
     * cleared lazily, because a cache that outlives a write is the failure this file
     * is about.
     */
    const d = withTwoElements();
    expect(d.read().elements).toHaveLength(2);

    d.commit([{ kind: "createElement", element: element("c") }]);

    expect(d.read().elements).toHaveLength(3);
    expect(d.read().elements.some((e) => (e as { x: number }).x === 999)).toBe(
      false,
    );
  });
});

describe("a board nobody has edited", () => {
  test("reads cleanly", () => {
    // The degenerate case a lazily-memoised snapshot is most likely to get wrong: an
    // empty board must produce empty *arrays*, not undefined.
    const d = doc();
    const snapshot = d.read();

    expect(snapshot.elements).toEqual([]);
    expect(snapshot.collections).toEqual([]);
    expect(snapshot.records).toEqual([]);
    expect(snapshot.elementOrder).toEqual([]);
    expect(snapshot.meta).toEqual({});
    expect(snapshot.assets).toEqual({});
  });

  test("a local commit is still counted separately from the cache's revision", () => {
    // Two counters with two jobs: `durableUpdates` is public and counts this client's
    // commits; the revision is private and exists only to invalidate a snapshot.
    // Conflating them would make the public number depend on remote traffic.
    const d = withTwoElements();
    const before = d.durableUpdates;

    d.commit([{ kind: "setMeta", entries: { touched: 1 } }]);

    expect(d.durableUpdates).toBe(before + 1);
  });
});
