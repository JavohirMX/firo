/*
 * Private mode, end to end through the sync.
 *
 * ## The feature under test, and the way it can destroy the thing it protects
 *
 * Private mode works by withholding elements from the editor's scene. That is the
 * whole mechanism, and it is what stops a hidden note reaching the exporter --
 * every PNG and SVG path in this app walks the scene (`LayerUI` is handed
 * `scene.getNonDeletedElements()`, and `prepareElementsForRender` narrows only by
 * frame and by tombstone), so an element that never reaches the scene cannot
 * reach a file.
 *
 * The cost is that `diff()` stops being able to read its own inputs. It computes
 * `gone` as "the ids the document has that the editor does not" and commits
 * `deleteElements` for them, which is right for a user pressing delete and
 * catastrophically wrong for an element this class deliberately never sent. The
 * symptom is not a crash and not a wrong picture: a tombstone, written on the
 * next keystroke, over a facilitator's private brainstorm. And a tombstone in a
 * CRDT is not a hidden row, it is a row that cannot come back.
 *
 * So the tests here are mostly about the *document*, not the canvas: what matters
 * is that `doc.element(id).isDeleted` stays false, that no mutation ever names the
 * hidden id, and that the board's z-order and its real deletions are unaffected.
 * A test that only checked "the note is not on screen" would pass against every
 * version of this bug.
 *
 * ## Why this is not in `sync.test.ts`
 *
 * Because the invariant is only visible with private mode on, and turning it on
 * for the whole file would change what every other test in there means. It is also
 * the only place the sync is asked to keep two truths apart — what the board holds
 * and what the canvas is allowed to see — and that deserves to be readable in one
 * place.
 */

import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";

import type { Mutation } from "@firo/doc";
import type { RevealMode } from "@firo/facilitation";
import type { FiroElement } from "@firo/schema";

import { createStickyNote } from "../src/defaults.js";
import { fromEditorElements } from "../src/elements.js";
import { BoardSync, type EditorBridge } from "../src/sync.js";

/** A stand-in for the editor: holds elements, counts writes, and echoes. */
const fakeEditor = (initial: Record<string, unknown>[] = []) => {
  let elements = [...initial];
  let writes = 0;

  const bridge: EditorBridge = {
    read: () => elements,
    write: (next) => {
      writes += 1;
      elements = [...next];
    },
  };

  return {
    bridge,
    get elements() {
      return elements;
    },
    get writes() {
      return writes;
    },
    /** What the user did in the editor. */
    set: (next: Record<string, unknown>[]) => {
      elements = [...next];
    },
  };
};

const note = (id: string, over: Record<string, unknown> = {}) =>
  createStickyNote({ id, x: 0, y: 0, ...over });

/**
 * A started sync over the given notes, in the given reveal mode.
 *
 * The mode is set *before* `start()`, because `start()` is what pulls the scene
 * and the reveal mode is read there. A toggle that happens after a sync is
 * attached changes nothing until the next `pull()` -- the toggle is ephemeral, so
 * it is deliberately not a document change and nothing notifies subscribers. That
 * is a property of the design, not an oversight here, and it is why `pull()` is
 * the refresh point rather than the constructor.
 */
const privateBoard = (notes: FiroElement[], mode: RevealMode) => {
  const doc = new FiroDoc(new Y.Doc());
  doc.commit(
    notes.map((element) => ({ kind: "createElement" as const, element })),
  );
  doc.setEphemeral({ reveal: { mode } });

  const editor = fakeEditor();
  const sync = new BoardSync(doc, editor.bridge);
  sync.start();

  return {
    doc,
    editor,
    sync,
    setMode: (next: RevealMode) => doc.setEphemeral({ reveal: { mode: next } }),
  };
};

/** The document as a comparable string, to assert it did not change at all. */
const fingerprint = (doc: FiroDoc): string => JSON.stringify(doc.read());

/** The scene's ids, in order. */
const sceneIds = (elements: readonly Record<string, unknown>[]): string[] =>
  elements.map((element) => element.id as string);

/**
 * Whether any mutation *changes* an element, as opposed to naming its position.
 *
 * `reorderElements` is deliberately not a match: `orderFor` has to name a
 * withheld id so the document can put it back where it was, and that is a
 * statement about z-order, not an edit to the note. Asserting on the wrong
 * granularity is how a test ends up passing for the wrong reason.
 */
const mutates = (mutations: readonly Mutation[], id: string): boolean =>
  mutations.some((mutation) => {
    switch (mutation.kind) {
      case "createElement":
        return mutation.element.id === id;
      case "createElements":
        return mutation.elements.some((element) => element.id === id);
      case "updateElements":
        return mutation.updates.some((update) => update.id === id);
      case "deleteElements":
      case "restoreElements":
        return mutation.ids.includes(id);
      default:
        return false;
    }
  });

/**
 * Reorder the scene by note id, carrying each note's label with it.
 *
 * Restated from `sync.test.ts` rather than imported: a vitest test module has no
 * cross-file scope and reaching into another test file is worse than a second
 * copy. A note is two editor elements and the editor keeps a label immediately
 * after its note, so moving one without the other builds a scene no editor would
 * ever produce -- and the fold then finds the note with no text.
 */
const reorderNotes = (
  elements: readonly Record<string, unknown>[],
  order: readonly string[],
): Record<string, unknown>[] => {
  const pairs = new Map<string, Record<string, unknown>[]>();
  for (const element of elements) {
    if (element.type === "stickynote") {
      pairs.set(element.id as string, [element]);
    } else {
      const owner = element.containerId as string | undefined;
      const pair = owner ? pairs.get(owner) : undefined;
      if (pair) {
        pair.push(element);
      }
    }
  }
  return order.flatMap((id) => pairs.get(id) ?? []);
};

/** Remove a note from the scene the way an editor that drops rather than marks would. */
const withoutNote = (
  elements: readonly Record<string, unknown>[],
  id: string,
): Record<string, unknown>[] =>
  elements.filter((element) => element.id !== id && element.containerId !== id);

/** Mark a note and its label as deleted, the way the editor tombstones. */
const tombstoned = (
  elements: readonly Record<string, unknown>[],
  id: string,
): Record<string, unknown>[] =>
  elements.map((element) =>
    element.id === id || element.containerId === id
      ? { ...element, isDeleted: true }
      : element,
  );

describe("private mode withholds an element from the editor", () => {
  it("never puts the hidden note in the scene, nor its label", () => {
    // The label is the half that matters and the half that is easy to forget: a
    // sticky note projects to two editor elements, so filtering "the note" and
    // leaving `labelIdFor(note)` behind would put the note's text on the canvas
    // in front of everybody. The text is the entire reason to hide a note.
    const { editor } = privateBoard(
      [note("visible"), note("secret", { hiddenUntilRevealed: true })],
      "private",
    );

    const ids = sceneIds(editor.elements);
    expect(ids).not.toContain("secret");
    expect(ids).not.toContain("secret~label");
    expect(ids).toContain("visible");
    expect(ids).toContain("visible~label");
  });

  it("leaves the document holding it", () => {
    const { doc } = privateBoard(
      [note("secret", { hiddenUntilRevealed: true })],
      "private",
    );

    expect(doc.element("secret")).toBeDefined();
    expect(doc.element("secret")?.isDeleted).toBe(false);
  });

  it("hides nothing while the board is revealed", () => {
    // The flag is durable; the mode is what makes it bite. A board written
    // yesterday opens showing everything, which is the whole reason
    // `DEFAULT_REVEAL_STATE` is `revealed` rather than `private`.
    const { editor } = privateBoard(
      [note("secret", { hiddenUntilRevealed: true })],
      "revealed",
    );

    expect(sceneIds(editor.elements)).toEqual(["secret", "secret~label"]);
  });

  it("hides nothing on a port that does not know about private mode", () => {
    // The `getEphemeral` member is optional, so a caller that predates private
    // mode keeps working. "Revealed" is the only safe answer for a port that
    // cannot say: a board must never be private because a host forgot to wire
    // something up, which would present a facilitator's blank canvas to a room.
    const doc = new FiroDoc(new Y.Doc());
    doc.commit([
      {
        kind: "createElement",
        element: note("secret", { hiddenUntilRevealed: true }),
      },
    ]);

    const editor = fakeEditor();
    const port = {
      read: () => doc.read(),
      commit: (mutations: readonly Mutation[]) => doc.commit(mutations),
      subscribe: () => () => {},
    };

    new BoardSync(port, editor.bridge).start();

    expect(sceneIds(editor.elements)).toEqual(["secret", "secret~label"]);
  });
});

describe("hiding does not tombstone", () => {
  it("commits nothing at all across repeated idle pushes", () => {
    // This is the whole regression. Without the exclusion in `diff`, the first
    // push sees the hidden id in the document and absent from the scene, reads it
    // as a deletion, and writes a tombstone -- on the next keystroke, for a note
    // the facilitator never touched.
    const { doc, editor, sync } = privateBoard(
      [note("visible"), note("secret", { hiddenUntilRevealed: true })],
      "private",
    );
    const before = fingerprint(doc);
    const durable = doc.durableUpdates;

    for (let i = 0; i < 10; i++) {
      editor.set([...editor.elements]);
      expect(sync.push()).toEqual([]);
    }

    expect(doc.element("secret")?.isDeleted).toBe(false);
    expect(doc.durableUpdates).toBe(durable);
    expect(fingerprint(doc)).toBe(before);
  });

  it("does not delete it on the back of somebody else's edit", () => {
    // The realistic version, and the one that matters: the hidden note is deleted
    // by the *next* push, not by its own. Moving an unrelated note is enough.
    const { doc, editor, sync } = privateBoard(
      [note("visible"), note("secret", { hiddenUntilRevealed: true })],
      "private",
    );

    editor.set(
      editor.elements.map((element) =>
        element.type === "stickynote" ? { ...element, x: 400 } : element,
      ),
    );
    const mutations = sync.push();

    // The edit landed...
    expect(mutates(mutations, "visible")).toBe(true);
    expect(doc.element("visible")?.x).toBe(400);
    // ...and took nothing else with it.
    expect(mutates(mutations, "secret")).toBe(false);
    expect(doc.element("secret")?.isDeleted).toBe(false);
    expect(doc.read().elements.map((element) => element.id)).toEqual([
      "visible",
      "secret",
    ]);
  });

  it("never puts the hidden id in a mutation at all", () => {
    // Stated over every mutation the sync can produce rather than over one, so a
    // protection that covers `deleteElements` and misses `restoreElements` fails
    // here. It is the assertion that would survive somebody adding a second
    // deletion-shaped path later.
    const { doc, editor, sync } = privateBoard(
      [
        note("visible"),
        note("secret", { hiddenUntilRevealed: true }),
        note("other", { hiddenUntilRevealed: true }),
      ],
      "private",
    );

    const seen: Mutation[] = [];
    for (let i = 0; i < 5; i++) {
      editor.set([...editor.elements]);
      seen.push(...sync.push());
    }
    editor.set(
      editor.elements.map((element) =>
        element.type === "stickynote" ? { ...element, y: 77 } : element,
      ),
    );
    seen.push(...sync.push());

    for (const id of ["secret", "other"]) {
      expect(mutates(seen, id)).toBe(false);
      expect(doc.element(id)?.isDeleted).toBe(false);
    }
  });

  it("protects a hidden note that is already a tombstone", () => {
    // The awkward case, and the reason the exclusion is on `gone` rather than on
    // "delete something that is not deleted yet". `deleteElements` stamps
    // `deletedAt` and `updated` unconditionally, so re-deleting a hidden
    // tombstone writes to the document *every push* -- the write loop
    // `sync.test.ts` documents, reached from the other direction. A board with
    // one hidden, deleted note would never settle.
    const doc = new FiroDoc(new Y.Doc());
    doc.commit([
      { kind: "createElement", element: note("visible") },
      {
        kind: "createElement",
        element: note("secret", { hiddenUntilRevealed: true }),
      },
    ]);
    doc.commit([{ kind: "deleteElements", ids: ["secret"] }]);

    doc.setEphemeral({ reveal: { mode: "private" } });
    const editor = fakeEditor();
    const sync = new BoardSync(doc, editor.bridge);
    sync.start();

    const durable = doc.durableUpdates;
    for (let i = 0; i < 10; i++) {
      editor.set([...editor.elements]);
      expect(sync.push()).toEqual([]);
    }

    expect(doc.durableUpdates).toBe(durable);
  });

  it("protects it after the mode has moved on but before the pull", () => {
    // The reason the withheld set is *tracked* rather than re-derived, and the
    // reason it cannot be derived from the document's flags.
    //
    // Between a toggle and the `pull()` that follows it, the reveal mode and the
    // scene disagree — and they disagree in the ordinary case, because the
    // toggle is ephemeral, is deliberately not a document change, and so notifies
    // nobody. A `diff` that asked the mode "which of these should I be hiding?"
    // would answer "none, the board was just revealed" and read every withheld id
    // as a deletion. So the facilitator reveals a board, the scene has not caught
    // up yet, they delete one ordinary note — and a private brainstorm is
    // tombstoned by the very act of un-hiding it, with nothing on screen to
    // explain it.
    //
    // The recorded set has no such window: it says what the editor is actually
    // missing, and that is the only question `gone` is asking.
    const { doc, editor, sync, setMode } = privateBoard(
      [note("visible"), note("secret", { hiddenUntilRevealed: true })],
      "private",
    );

    // Empty the scene the way a delete leaves it.
    editor.set(withoutNote(editor.elements, "visible"));
    expect(sync.push().map((m) => m.kind)).toEqual(["deleteElements"]);
    expect(doc.element("visible")?.isDeleted).toBe(true);

    // Revealed — and no pull, which is the whole point: nothing notifies.
    setMode("revealed");
    editor.set([...editor.elements]);
    const mutations = sync.push();

    expect(mutates(mutations, "secret")).toBe(false);
    expect(doc.element("secret")?.isDeleted).toBe(false);

    // And once the scene catches up, the note is still the facilitator's.
    sync.pull();
    expect(sceneIds(editor.elements)).toContain("secret");
    expect(doc.element("secret")?.isDeleted).toBe(false);
  });
});

describe("a hidden element cannot be edited while hidden", () => {
  it("the array the push folds does not contain it, so no mutation can", () => {
    // Confirmed rather than assumed, because the alternative -- "an edit to a
    // hidden element is discarded" -- would be a claim about code that cannot
    // run. `push()` folds exactly `editor.read()` and nothing else, and the fold
    // is the only source of every id a mutation can name except the document's
    // own. An element absent from the fold cannot produce an update, and the
    // exclusion in `diff` means its absence cannot produce a delete either.
    //
    // So the answer is: there is nothing to edit. Not "the edit is ignored" --
    // there is no gesture that reaches an element the canvas does not hold, and
    // the board's own answer to "how do I change a hidden note" is to reveal.
    const { editor, sync } = privateBoard(
      [
        note("visible"),
        note("secret", { hiddenUntilRevealed: true, text: "x" }),
      ],
      "private",
    );

    const folded = fromEditorElements(editor.elements as never[]);
    expect(folded.map((element) => element.id)).toEqual(["visible"]);
    expect(sync.push()).toEqual([]);
  });

  it("and a real edit beside it still commits", () => {
    // The other half, or "it cannot be edited" could be satisfied by refusing to
    // sync at all while private.
    const { doc, editor, sync } = privateBoard(
      [note("visible"), note("secret", { hiddenUntilRevealed: true })],
      "private",
    );

    const [, label] = editor.elements;
    editor.set(
      editor.elements.map((element) =>
        element.id === (label?.id as string)
          ? { ...element, originalText: "edited", text: "edited" }
          : element,
      ),
    );
    const mutations = sync.push();

    expect(mutations.length).toBeGreaterThan(0);
    expect(
      doc.element("visible")?.type === "stickynote" &&
        doc.element("visible")?.text,
    ).toBe("edited");
    expect(doc.element("secret")?.isDeleted).toBe(false);
  });
});

describe("revealing", () => {
  it("puts it back, and the document never moved while it was gone", () => {
    const { doc, editor, sync, setMode } = privateBoard(
      [note("visible"), note("secret", { hiddenUntilRevealed: true })],
      "private",
    );

    const before = fingerprint(doc);
    for (let i = 0; i < 5; i++) {
      editor.set([...editor.elements]);
      sync.push();
      expect(fingerprint(doc)).toBe(before);
    }

    setMode("revealed");
    // A mode change is ephemeral, so it is not a document change and nothing
    // calls `pull()` on its own. That is rule 1 working as intended; the caller
    // refreshes the scene explicitly.
    sync.pull();

    expect(sceneIds(editor.elements)).toEqual([
      "visible",
      "visible~label",
      "secret",
      "secret~label",
    ]);
    // Still the facilitator's note, still marked, still not deleted -- a reveal is
    // a moment in a session, not a decision about the board.
    expect(doc.element("secret")?.isDeleted).toBe(false);
    expect(fingerprint(doc)).toBe(before);
  });

  it("reads the mode fresh on every pull rather than caching it", () => {
    // A cached mode is the obvious optimisation and it is wrong: nothing notifies
    // subscribers when an ephemeral field changes, so a cache is only ever stale.
    // The symptom would be notes still hidden after a reveal, for as long as the
    // board stayed open.
    const { editor, sync, setMode } = privateBoard(
      [note("secret", { hiddenUntilRevealed: true })],
      "private",
    );
    expect(editor.elements).toEqual([]);

    setMode("revealed");
    sync.pull();
    expect(sceneIds(editor.elements)).toEqual(["secret", "secret~label"]);
  });

  it("hides again on the way back, without a tombstone in between", () => {
    const { doc, editor, sync, setMode } = privateBoard(
      [note("visible"), note("secret", { hiddenUntilRevealed: true })],
      "private",
    );
    setMode("revealed");
    sync.pull();
    expect(sceneIds(editor.elements)).toContain("secret");

    setMode("private");
    sync.pull();
    expect(sceneIds(editor.elements)).not.toContain("secret");

    editor.set([...editor.elements]);
    expect(sync.push()).toEqual([]);
    expect(doc.element("secret")?.isDeleted).toBe(false);
  });
});

describe("with nothing withheld, nothing changes", () => {
  /*
   * The regression guard for the other direction.
   *
   * `pull()` now filters, `diff()` now takes a third argument, and the z-order
   * mutation is built by a new function. Every one of those is on the path of a
   * board nobody has made private, so "no notes were lost today" is not evidence
   * that they were not lost *differently* today. What is asserted here is the
   * exact mutation each gesture produces, so a change in the ordinary path shows
   * up as a failing assertion rather than as a board that is subtly wrong.
   */

  const board = (mode: RevealMode) =>
    privateBoard([note("a"), note("b"), note("c")], mode);

  it("emits exactly one reorder, naming every id, for 'send to back'", () => {
    const { doc, editor, sync } = board("revealed");

    editor.set(reorderNotes(editor.elements, ["c", "b", "a"]));
    const mutations = sync.push();

    expect(mutations.map((m) => m.kind)).toEqual(["reorderElements"]);
    expect(doc.read().elementOrder).toEqual(["c", "b", "a"]);
  });

  it("still tombstones a real deletion", () => {
    const { doc, editor, sync } = board("revealed");

    editor.set(withoutNote(editor.elements, "b"));
    const mutations = sync.push();

    expect(mutations.map((m) => m.kind)).toEqual(["deleteElements"]);
    expect(doc.element("b")?.isDeleted).toBe(true);
  });

  it("treats a flagged element as ordinary while revealed", () => {
    // The flag is durable and the mode is what makes it bite. A board carrying a
    // marked note that is on screen must behave *exactly* like one without it --
    // including being deletable, which is the half that a filter reading the
    // element instead of the mode would get wrong.
    //
    // Reorder first, delete second. `deleteElements` tombstones the element and
    // drops it from `elementOrder` but leaves the node in `read().elements`, so a
    // board that lost a note *from the scene* keeps re-asking the document to
    // delete it on every later push. That is pre-existing behaviour and not this
    // test's business; ordering the gestures the other way round would make the
    // reorder assertion below measure that instead of what it means to measure.
    const doc = new FiroDoc(new Y.Doc());
    doc.commit([
      { kind: "createElement", element: note("a") },
      {
        kind: "createElement",
        element: note("b", { hiddenUntilRevealed: true }),
      },
      { kind: "createElement", element: note("c") },
    ]);

    const editor = fakeEditor();
    const sync = new BoardSync(doc, editor.bridge);
    sync.start();

    // On screen, flag and all.
    expect(sceneIds(editor.elements)).toContain("b");
    expect(sceneIds(editor.elements)).toContain("b~label");

    // Reorderable, with its id in the emitted list like any other element's.
    editor.set(reorderNotes(editor.elements, ["c", "b", "a"]));
    const reordered = sync.push();
    expect(reordered.map((m) => m.kind)).toEqual(["reorderElements"]);
    expect(doc.read().elementOrder).toEqual(["c", "b", "a"]);

    // Deletable.
    editor.set(reorderNotes(editor.elements, ["c", "a"]));
    const deleted = sync.push();
    expect(deleted.map((m) => m.kind)).toEqual(["deleteElements"]);
    expect(doc.element("b")?.isDeleted).toBe(true);
  });
});

describe("the withheld set and z-order", () => {
  const board = () =>
    privateBoard(
      [note("a"), note("secret", { hiddenUntilRevealed: true }), note("c")],
      "private",
    );

  it("does not report a reorder that did not happen", () => {
    // A scene that is missing elements cannot describe the board's order, so a
    // comparison of raw lengths reports a change on *every* push and every
    // keystroke writes to the document. That is the loop this class exists to
    // stop, reached by making the scene honest.
    const { editor, sync } = board();

    editor.set([...editor.elements]);
    expect(sync.push()).toEqual([]);
    editor.set([...editor.elements]);
    expect(sync.push()).toEqual([]);
  });

  it("settles rather than writing on every idle push", () => {
    const { doc, editor, sync } = board();

    editor.set([...editor.elements]);
    sync.push();
    const settled = doc.durableUpdates;

    for (let i = 0; i < 10; i++) {
      editor.set([...editor.elements]);
      expect(sync.push()).toEqual([]);
    }
    expect(doc.durableUpdates).toBe(settled);
  });

  it("keeps a hidden note in its slot when the visible notes move", () => {
    // `reorderElements` resolves an id it was not given by appending it to the
    // end, so the obvious implementation -- pass it the ids the editor holds --
    // does not "leave the hidden ones alone". It moves every hidden note to the
    // back of the board, once, on the first genuine reorder during a private
    // session, and it is still true when the room is revealed. `secret` sits
    // between `a` and `c` here, which is the only position that can be checked:
    // a hidden note at either end would coincidentally come out right.
    const { doc, editor, sync } = board();
    expect(doc.read().elementOrder).toEqual(["a", "secret", "c"]);

    editor.set(reorderNotes(editor.elements, ["c", "a"]));
    expect(sync.push().map((m) => m.kind)).toEqual(["reorderElements"]);

    expect(doc.read().elementOrder).toEqual(["c", "secret", "a"]);
  });

  it("and settles after that reorder, with the slot still held", () => {
    // The half of the previous test that is about convergence rather than
    // correctness: the next push must find the board already in the order the
    // completed list describes, or the reorder is re-emitted forever.
    const { doc, editor, sync } = board();

    editor.set(reorderNotes(editor.elements, ["c", "a"]));
    sync.push();
    expect(doc.read().elementOrder).toEqual(["c", "secret", "a"]);

    const settled = doc.durableUpdates;
    for (let i = 0; i < 10; i++) {
      editor.set([...editor.elements]);
      expect(sync.push()).toEqual([]);
    }
    expect(doc.durableUpdates).toBe(settled);
    expect(doc.read().elementOrder).toEqual(["c", "secret", "a"]);
  });

  it("holds the slot for a hidden note at either end of the board too", () => {
    // The ends are the degenerate cases and they are where a positional merge
    // can quietly drop an id -- which `reorderElements` would then append to the
    // end, moving the note without a word.
    //
    // The rule being pinned is "a withheld element keeps its slot; only the
    // elements the editor can see move". `secret` sits at index 0 here and stays
    // at index 0, while `a` and `c` trade places underneath it. The alternative
    // -- keeping it at the same *rank among the visible notes*, which would give
    // `["c", "secret", "a"]` -- is a position the document has never had, chosen
    // by a merge nobody asked for. There is no information about where a hidden
    // note should go, so the only answer that cannot be wrong is the one it has.
    const atFront = privateBoard(
      [note("secret", { hiddenUntilRevealed: true }), note("a"), note("c")],
      "private",
    );
    expect(atFront.doc.read().elementOrder).toEqual(["secret", "a", "c"]);

    atFront.editor.set(reorderNotes(atFront.editor.elements, ["c", "a"]));
    expect(atFront.sync.push().map((m) => m.kind)).toEqual(["reorderElements"]);
    expect(atFront.doc.read().elementOrder).toEqual(["secret", "c", "a"]);

    const atBack = privateBoard(
      [note("a"), note("c"), note("secret", { hiddenUntilRevealed: true })],
      "private",
    );
    expect(atBack.doc.read().elementOrder).toEqual(["a", "c", "secret"]);

    atBack.editor.set(reorderNotes(atBack.editor.elements, ["c", "a"]));
    expect(atBack.sync.push().map((m) => m.kind)).toEqual(["reorderElements"]);
    expect(atBack.doc.read().elementOrder).toEqual(["c", "a", "secret"]);
  });

  it("still tombstones a visible element deleted while another is hidden", () => {
    // The exclusion is on *withheld* ids, not on "there is something hidden", so
    // a real deletion keeps working. A protection written against the presence of
    // hidden notes rather than against their ids would swallow this one, and the
    // symptom would be a note that cannot be deleted at all while any other note
    // is hidden -- which looks like a broken Delete key rather than like a
    // data-loss feature.
    const { doc, editor, sync } = board();

    editor.set(withoutNote(editor.elements, "c"));
    const mutations = sync.push();

    expect(mutations.map((m) => m.kind)).toEqual(["deleteElements"]);
    expect(doc.element("c")?.isDeleted).toBe(true);
    expect(doc.element("secret")?.isDeleted).toBe(false);
  });

  it("tombstones only the deleted one when the editor marks rather than drops", () => {
    // The same thing through the editor's real delete, which marks the element
    // and keeps it in the scene. So a deletion and a withholding arrive together
    // in one push and must not be confused for each other.
    const { doc, editor, sync } = board();

    editor.set(tombstoned(editor.elements, "c"));
    const mutations = sync.push();

    expect(mutates(mutations, "c")).toBe(true);
    expect(mutates(mutations, "secret")).toBe(false);
    expect(doc.element("c")?.isDeleted).toBe(true);
    expect(doc.element("secret")?.isDeleted).toBe(false);
    expect(doc.read().elements).toHaveLength(3);
  });
});
