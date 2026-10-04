import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";

import type { FiroElement } from "@firo/schema";

import { BoardSync, type EditorBridge } from "../src/sync.js";

/*
 * Presentation mode across the board/editor boundary.
 *
 * ## Why this needs its own file
 *
 * Private mode already proved that withholding works and, more importantly, that
 * `diff()` refuses to read a withheld element as deleted. Presentation withholds for
 * a second reason, through the same mechanism — and "the same mechanism" is exactly
 * the kind of claim that is true until the second reason arrives and someone adds
 * `|| presentation` to a filter without thinking about `withheldIds`.
 *
 * So the property under test is not "the right elements are shown". It is:
 *
 * > **Presenting a board does not damage it.**
 *
 * Everything outside the current slide is withheld from the editor, the editor
 * reports a scene without them, and the sync must not conclude they were deleted.
 * If it does, stepping to the next slide destroys the previous one's contents from
 * the document — irreversibly, and on the one operation where a facilitator is
 * certain nothing is being edited.
 *
 * That is the same failure private mode nearly shipped, reached by a different road,
 * which is why it is worth a file rather than two more cases in the reveal suite.
 */

/**
 * A document element.
 *
 * The full set of fields the fold reads, because `toEditorElements` reaches into
 * several of them unconditionally — an earlier version of this file built a thinner
 * element and every test in it failed inside `toBoundElements` on `bindings`, which
 * says nothing about presentation and everything about the fixture.
 */
const element = (
  id: string,
  type: string,
  frameId: string | null = null,
): FiroElement =>
  ({
    id,
    type,
    x: 0,
    y: 0,
    width: 400,
    height: 300,
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
    versionNonce: 7,
    index: "a0",
    isDeleted: false,
    groupIds: [],
    frameId,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    created: 1000,
    updated: 2000,
  } as unknown as FiroElement);

/**
 * A board with two frames and a note in each, plus a stray note outside both.
 *
 * The stray is the point: an element with no `frameId` is on no slide, so it is
 * withheld for the whole presentation, and it is the element most likely to be
 * misread as deleted because it is missing from *every* slide.
 */
const board = () => {
  const doc = new FiroDoc(new Y.Doc());
  let scene: Record<string, unknown>[] = [];
  const bridge: EditorBridge = {
    read: () => scene,
    write: (next) => {
      scene = [...next];
    },
  };
  const sync = new BoardSync(doc, bridge);
  sync.start();

  doc.commit([
    { kind: "createElement", element: element("f1", "frame") },
    { kind: "createElement", element: element("n1", "rectangle", "f1") },
    { kind: "createElement", element: element("f2", "frame") },
    { kind: "createElement", element: element("n2", "rectangle", "f2") },
    { kind: "createElement", element: element("stray", "rectangle") },
  ] as never);

  return {
    doc,
    sync,
    /** The ids the editor can currently see. */
    shown: () => scene.map((e) => e.id as string).sort(),
    /** The ids the document still holds. */
    stored: () =>
      doc
        .read()
        .elements.map((e) => e.id)
        .sort(),
    /**
     * Every id the document has tombstoned.
     *
     * Not the same question as `stored()`, and the distinction is the whole reason
     * this helper exists. `deleteElements` writes an `isDeleted` tombstone and
     * **keeps the row**, so a tombstoned element still appears in `read().elements`
     * with its id intact. An assertion on id presence therefore reports a healthy
     * board while the board is being destroyed — which is exactly what the first
     * version of the "does not delete" test did, and it passed with the deletion
     * guard removed.
     */
    tombstoned: () =>
      doc
        .read()
        .elements.filter((e) => e.isDeleted)
        .map((e) => e.id)
        .sort(),
  };
};

const presenting = (doc: FiroDoc, slideIds: string[], index: number) =>
  doc.setEphemeral({ presentation: { active: true, slideIds, index } });

describe("what presenting shows", () => {
  it("shows the current frame and its contents, and nothing else", () => {
    const { doc, sync, shown } = board();

    presenting(doc, ["f1", "f2"], 0);
    sync.pull();

    expect(shown()).toEqual(["f1", "n1"]);
  });

  it("follows the current slide", () => {
    const { doc, sync, shown } = board();

    presenting(doc, ["f1", "f2"], 1);
    sync.pull();

    expect(shown()).toEqual(["f2", "n2"]);
  });

  it("keeps the frame itself, because it is the slide", () => {
    // Withholding the frame would leave nothing to navigate to and nothing to frame
    // the shot with. The culling applies to what is *inside* it.
    const { doc, sync, shown } = board();

    presenting(doc, ["f1", "f2"], 0);
    sync.pull();

    expect(shown()).toContain("f1");
  });

  it("shows everything again once the presentation stops", () => {
    const { doc, sync, shown } = board();

    presenting(doc, ["f1", "f2"], 0);
    sync.pull();
    doc.setEphemeral({
      presentation: { active: false, slideIds: [], index: 0 },
    });
    sync.pull();

    expect(shown()).toEqual(["f1", "f2", "n1", "n2", "stray"]);
  });

  it("shows everything on a board that is not presenting", () => {
    const { sync, shown } = board();

    sync.pull();

    expect(shown()).toEqual(["f1", "f2", "n1", "n2", "stray"]);
  });
});

describe("presenting does not damage the board", () => {
  it("does not delete what it withheld when the editor pushes", () => {
    const { doc, sync, tombstoned } = board();

    presenting(doc, ["f1", "f2"], 0);
    sync.pull();
    sync.push();

    /*
     * The whole file.
     *
     * `push()` diffs the editor's scene against the document. The scene is missing
     * `f2`, `n2` and `stray` because they are on another slide, and a diff that
     * reads a missing element as deleted — which is the correct reading of a scene
     * with no other explanation — commits three deletions. Stepping to the next
     * slide would then reveal an empty frame.
     */
    expect(tombstoned()).toEqual([]);
  });

  it("survives a full present-and-push cycle on every slide", () => {
    const { doc, sync, tombstoned } = board();

    for (const index of [0, 1, 0]) {
      presenting(doc, ["f1", "f2"], index);
      sync.pull();
      sync.push();
    }

    expect(tombstoned()).toEqual([]);
  });

  it("keeps the withheld elements where the document had them", () => {
    /*
     * `reorderElements` resolves a partial id list by appending everything it was
     * not given to the end. A scene filtered to one slide cannot speak about the
     * whole board's z-order, so asking it to silently demotes every off-slide
     * element to the back — and the presenter finds their deck reordered when they
     * step out of presentation mode. Private mode needed `orderFor` for exactly
     * this, and a second withholding reason is the case where that protection gets
     * quietly bypassed.
     */
    const { doc, sync } = board();
    const orderBefore = doc.read().elements.map((e) => e.id);

    presenting(doc, ["f1", "f2"], 0);
    sync.pull();
    sync.push();

    expect(doc.read().elements.map((e) => e.id)).toEqual(orderBefore);
  });

  it("does not commit anything to the document to get there", () => {
    const { doc, sync } = board();

    const before = doc.durableUpdates;
    presenting(doc, ["f1", "f2"], 0);
    sync.pull();
    sync.push();

    // Ephemeral in, ephemeral out: a presentation is not an edit.
    expect(doc.durableUpdates).toBe(before);
  });
});

describe("presenting composes with private mode", () => {
  it("applies both reasons to withhold", () => {
    // Two reasons to hide, and the danger is that they become two *filters* that
    // agree today and disagree after the next change. There is one
    // `elementsForPresentation` call on this path, which is the point.
    const { doc, sync, shown } = board();
    doc.commit([
      {
        kind: "updateElements",
        updates: [{ id: "n1", changes: { hiddenUntilRevealed: true } }],
      },
    ] as never);

    presenting(doc, ["f1", "f2"], 0);
    doc.setEphemeral({ reveal: { mode: "private" } });
    sync.pull();

    // `n1` is on the current slide but hidden until revealed, so it is withheld for
    // a second and different reason.
    expect(shown()).toEqual(["f1"]);
  });

  it("does not treat a privately hidden note as deleted either", () => {
    const { doc, sync, tombstoned } = board();
    doc.commit([
      {
        kind: "updateElements",
        updates: [{ id: "n1", changes: { hiddenUntilRevealed: true } }],
      },
    ] as never);

    presenting(doc, ["f1", "f2"], 0);
    doc.setEphemeral({ reveal: { mode: "private" } });
    sync.pull();
    sync.push();

    expect(tombstoned()).toEqual([]);
  });
});

describe("nested frames", () => {
  /**
   * A frame inside a frame, with a note inside that.
   *
   * `inner` sits in `f1`, and `deep` sits in `inner` — two levels down from the
   * board and one level down from `inner`.
   */
  const nested = () => {
    const { doc, sync, shown } = board();
    doc.commit([
      { kind: "createElements", elements: [element("inner", "frame", "f1")] },
      {
        kind: "createElements",
        elements: [element("deep", "rectangle", "inner")],
      },
    ] as never);
    return { doc, sync, shown };
  };

  it("shows a two-levels-down element with the outer frame", () => {
    const { doc, sync, shown } = nested();

    presenting(doc, ["f1"], 0);
    sync.pull();

    /*
     * The case that needs the parent lookup.
     *
     * `deep`'s own `frameId` is `inner`, which is *not* the current frame, so the
     * first comparison fails and the walk has to go up a level to find `f1`. With no
     * `frameOf` the walk stops after one hop, treats "unknown" as "not an
     * ancestor", and withholds the deepest note on the slide — a silent omission,
     * because everything still looks present and nothing throws.
     *
     * `n1` is in the list because it is in `f1` directly: one level is the
     * comparison, not the walk.
     */
    expect(shown()).toEqual(["deep", "f1", "inner", "n1"]);
  });

  it("still shows the inner frame's own contents when the inner frame is the slide", () => {
    const { doc, sync, shown } = nested();

    presenting(doc, ["f1", "inner"], 1);
    sync.pull();

    // Here `deep`'s `frameId` *is* the current frame, so no walk is needed. Both
    // paths are worth having: the direct one for the common case, the walk for the
    // deep one.
    expect(shown()).toEqual(["deep", "inner"]);
  });

  it("withholds another frame's contents", () => {
    const { doc, sync, shown } = board();
    doc.commit([
      { kind: "createElements", elements: [element("n3", "rectangle", "f2")] },
    ] as never);

    presenting(doc, ["f1", "f2"], 0);
    sync.pull();

    // A note in a frame that is another slide is not on this one.
    expect(shown()).toEqual(["f1", "n1"]);
  });

  it("does not hang on a frame that contains itself", () => {
    // A hand-edited file can produce a cycle in the `frameId` relation. The walk is
    // bounded for that reason, and an unbounded one would freeze the canvas rather
    // than fail.
    const { doc, sync, shown } = board();
    doc.commit([
      { kind: "createElements", elements: [element("loop", "frame")] },
      {
        kind: "updateElements",
        updates: [{ id: "loop", changes: { frameId: "loop" } }],
      },
    ] as never);

    presenting(doc, ["loop"], 0);
    sync.pull();

    expect(shown()).toEqual(["loop"]);
  });
});
