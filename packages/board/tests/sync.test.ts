import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";

import { createStickyNote } from "../src/defaults.js";
import { toEditorElements } from "../src/elements.js";
import { BoardSync, type EditorBridge } from "../src/sync.js";

/*
 * The sync loop, and the guard against it.
 *
 * The dangerous test here is `does not loop`. A two-way sync without a guard
 * settles into an infinite commit cycle within a few frames, and the symptom in
 * the app is a board that burns a core and gets slower the longer it is open —
 * which looks like a rendering problem and is not one. Everything else in this
 * file is in service of proving that does not happen.
 */

/** A stand-in for the editor: holds elements, counts writes, and echoes. */
const fakeEditor = (initial: Record<string, unknown>[] = []) => {
  let elements = [...initial];
  let writes = 0;
  let reads = 0;

  const bridge: EditorBridge = {
    read: () => {
      reads += 1;
      return elements;
    },
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
    get reads() {
      return reads;
    },
    /** What the user did in the editor. */
    set: (next: Record<string, unknown>[]) => {
      elements = [...next];
    },
  };
};

const newDoc = () => new FiroDoc(new Y.Doc());

const note = (id: string, over: Record<string, unknown> = {}) =>
  createStickyNote({ id, x: 0, y: 0, ...over });

describe("BoardSync", () => {
  it("puts the document's notes into an empty editor on start", () => {
    const doc = newDoc();
    doc.commit([{ kind: "createElement", element: note("a") }]);

    const editor = fakeEditor();
    new BoardSync(doc, editor.bridge).start();

    // A note is two editor elements: the note and its label.
    expect(editor.elements).toHaveLength(2);
    expect(editor.elements[0].id).toBe("a");
  });

  it("starts an empty document with an empty canvas", () => {
    const editor = fakeEditor();
    new BoardSync(newDoc(), editor.bridge).start();
    expect(editor.elements).toEqual([]);
  });

  describe("the loop guard", () => {
    it("does not commit when the editor only echoes what was pushed", () => {
      // The whole point. Pushing into the editor fires its change event; without
      // this the sync would commit, which would push, which would fire again.
      const doc = newDoc();
      doc.commit([{ kind: "createElement", element: note("a") }]);

      const editor = fakeEditor();
      const sync = new BoardSync(doc, editor.bridge);
      sync.start();

      const before = doc.revision;
      editor.set([...editor.elements]); // same objects, an exact echo
      expect(sync.push()).toEqual([]);
      expect(doc.revision).toBe(before);
    });

    it("survives repeated echoes without growing the document", () => {
      const doc = newDoc();
      doc.commit([{ kind: "createElement", element: note("a") }]);

      const editor = fakeEditor();
      const sync = new BoardSync(doc, editor.bridge);
      sync.start();

      for (let i = 0; i < 20; i++) {
        editor.set([...editor.elements]);
        sync.push();
      }

      expect(doc.read().elements).toHaveLength(1);
    });

    it("does commit a real edit", () => {
      // The guard must not be so eager that it swallows genuine changes.
      const doc = newDoc();
      doc.commit([{ kind: "createElement", element: note("a") }]);

      const editor = fakeEditor();
      const sync = new BoardSync(doc, editor.bridge);
      sync.start();

      // `originalText`, not `text`: a sticky note's label keeps the typed string
      // in `originalText` and the layout's wrapped form in `text`, so this is
      // what a real edit writes.
      const [, label] = editor.elements;
      editor.set(
        editor.elements.map((element) =>
          element.id === label.id
            ? {
                ...element,
                originalText: "edited",
                text: "edited",
                version: 99,
              }
            : element,
        ),
      );

      const mutations = sync.push();
      expect(mutations.length).toBeGreaterThan(0);
      expect(
        doc.element("a")?.type === "stickynote" && doc.element("a")?.text,
      ).toBe("edited");
    });

    it("recognises an echo that arrives as equal-but-not-identical objects", () => {
      // The editor rebuilds its element objects on every render, so identity
      // comparison would miss every echo. This is why it compares fields.
      const doc = newDoc();
      doc.commit([{ kind: "createElement", element: note("a") }]);

      const editor = fakeEditor();
      const sync = new BoardSync(doc, editor.bridge);
      sync.start();

      editor.set(editor.elements.map((element) => ({ ...element })));
      expect(sync.push()).toEqual([]);
    });

    it("does not push the document back after its own commit", () => {
      /*
       * The regression that cost an afternoon. Every commit notifies subscribers,
       * including this sync, so reacting to one means rewriting the editor's
       * elements mid-edit. The editor holds a sticky note's label in two fields;
       * replacing the elements wipes what is being typed.
       *
       * The symptom is invisible in unit terms: no crash, no loop, the document
       * still ends up with the right elements. A person types a word into a note
       * and it vanishes on the way out. So the assertion is on the *editor's*
       * contents, not the document's.
       */
      const doc = newDoc();
      doc.commit([{ kind: "createElement", element: note("a") }]);
      const editor = fakeEditor();
      const sync = new BoardSync(doc, editor.bridge);
      sync.start();

      const writesAfterStart = editor.writes;
      const [sticky, label] = editor.elements;

      // The user is typing. The editor is mid-edit and holds the new text.
      editor.set(
        editor.elements.map((element) =>
          element.id === label.id
            ? { ...element, originalText: "typed", text: "typed" }
            : element,
        ),
      );
      sync.push();

      // The commit must not have sent the document back over what is on screen.
      expect(editor.writes).toBe(writesAfterStart);
      const live = editor.elements.find((e) => e.id === label.id);
      expect(live?.originalText).toBe("typed");
      expect(sticky.id).toBe("a");
    });

    it("still pushes a change that came from somewhere else", () => {
      // The guard must not swallow genuine remote changes, or collaboration
      // would silently stop working when it is added.
      const doc = newDoc();
      const editor = fakeEditor();
      const sync = new BoardSync(doc, editor.bridge);
      sync.start();

      const writesAfterStart = editor.writes;
      doc.commit([{ kind: "createElement", element: note("remote") }]);
      expect(editor.writes).toBeGreaterThan(writesAfterStart);
      expect(editor.elements.some((e) => e.id === "remote")).toBe(true);
    });

    it("stops listening when stopped", () => {
      const doc = newDoc();
      const editor = fakeEditor();
      const sync = new BoardSync(doc, editor.bridge);
      sync.start();
      sync.stop();

      doc.commit([{ kind: "createElement", element: note("late") }]);
      expect(editor.elements).toHaveLength(0);
    });
  });

  describe("editing", () => {
    const started = () => {
      const doc = newDoc();
      const editor = fakeEditor();
      const sync = new BoardSync(doc, editor.bridge);
      sync.start();
      return { doc, editor, sync };
    };

    it("adds a note the user drew", () => {
      const { doc, editor, sync } = started();
      editor.set([...toEditorElements(note("new"))]);
      sync.push();

      expect(doc.read().elements.map((e) => e.id)).toEqual(["new"]);
    });

    it("moves a note", () => {
      const { doc, editor, sync } = started();
      doc.commit([
        { kind: "createElement", element: note("a", { x: 0, y: 0 }) },
      ]);
      sync.pull();

      editor.set(
        editor.elements.map((element) =>
          element.type === "stickynote"
            ? { ...element, x: 300, version: 2 }
            : element,
        ),
      );
      sync.push();

      expect(doc.element("a")?.x).toBe(300);
    });

    it("writes only the fields the edit changed", () => {
      // A whole-element write would reset the fields the editor cannot represent
      // — a binding's focus and gap, for one — and merge would stop working.
      const { doc, editor, sync } = started();
      doc.commit([{ kind: "createElement", element: note("a") }]);
      sync.pull();

      editor.set(
        editor.elements.map((element) =>
          element.type === "stickynote"
            ? { ...element, x: 42, version: 2 }
            : element,
        ),
      );

      const update = sync.push().find((m) => m.kind === "updateElements");
      expect(update).toBeDefined();
      if (update?.kind === "updateElements") {
        const changes = update.updates[0].changes as Record<string, unknown>;
        expect(Object.keys(changes)).toContain("x");
        expect(Object.keys(changes)).not.toContain("y");
      }
    });

    it("tombstones a note deleted in the editor, rather than forgetting it", () => {
      // A CRDT delete that removed the key would be indistinguishable from never
      // having existed, which breaks undo and lets a concurrent edit resurrect it.
      const { doc, editor, sync } = started();
      doc.commit([{ kind: "createElement", element: note("a") }]);
      sync.pull();

      editor.set(
        editor.elements.map((element) =>
          element.type === "stickynote"
            ? { ...element, isDeleted: true, version: 5 }
            : element,
        ),
      );
      sync.push();

      expect(doc.element("a")?.isDeleted).toBe(true);
      expect(doc.read().elements.map((e) => e.id)).toEqual(["a"]);
    });

    it("restores a note the editor brought back", () => {
      const { doc, editor, sync } = started();
      doc.commit([
        { kind: "createElement", element: note("a", { isDeleted: true }) },
      ]);
      sync.pull();

      editor.set(
        editor.elements.map((element) =>
          element.type === "stickynote"
            ? { ...element, isDeleted: false, version: 7 }
            : element,
        ),
      );
      sync.push();

      expect(doc.element("a")?.isDeleted).toBe(false);
    });

    it("never stores a note's label as an element of its own", () => {
      const { doc, editor, sync } = started();
      editor.set([...toEditorElements(note("a", { text: "hi" }))]);
      sync.push();

      // Two editor elements in, one document element out.
      expect(doc.read().elements).toHaveLength(1);
    });

    it("keeps a note's text, which lives on the editor's label", () => {
      const { doc, editor, sync } = started();
      editor.set([...toEditorElements(note("a", { text: "remember me" }))]);
      sync.push();

      const stored = doc.element("a");
      expect(stored?.type === "stickynote" && stored.text).toBe("remember me");
    });
  });

  describe("z-order", () => {
    // A sticky note is two editor elements -- the note and its derived label --
    // so a reorder test has to reason about the pair, or it will pass for the
    // wrong reason. These helpers pick the note elements out of the noise.

    const notes = (elements: readonly Record<string, unknown>[]) =>
      elements
        .filter((e) => e.type === "stickynote")
        .map((e) => e.id as string);

    /**
     * Reorder the editor's scene by note id, carrying each note's label with it.
     *
     * A note is two editor elements -- the note and its derived label -- and the
     * editor keeps a label immediately after its note. Moving a note without its
     * label produces a scene no editor would ever build, and the fold then finds
     * the note with no text. So the unit of reordering is the pair, and this is
     * the only honest way to simulate a person dragging something.
     */
    const reorderNotes = (
      elements: readonly Record<string, unknown>[],
      order: readonly string[],
    ) => {
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

    const seedThree = () => {
      const doc = newDoc();
      doc.commit([
        { kind: "createElement", element: note("a") },
        { kind: "createElement", element: note("b") },
        { kind: "createElement", element: note("c") },
      ]);
      const editor = fakeEditor();
      const sync = new BoardSync(doc, editor.bridge);
      sync.start();
      return { doc, editor, sync };
    };

    it("reaches the document when the editor sends an element to the back", () => {
      // "Send to back" changes only `index`, so this was the case that failed:
      // the element matched the baseline on every editor-owned field, was called
      // an echo, and was discarded. The document kept the original order and the
      // file disagreed with the canvas with nothing to show for it.
      const { doc, editor, sync } = seedThree();
      expect(notes(doc.read().elements)).toEqual(["a", "b", "c"]);

      editor.set(reorderNotes(editor.elements, ["b", "c", "a"]));
      const mutations = sync.push();

      expect(mutations.map((m) => m.kind)).toContain("reorderElements");
      expect(notes(doc.read().elements)).toEqual(["b", "c", "a"]);
    });

    it("reaches the document for a partial reorder, not only a full reversal", () => {
      // A reversal moves every element; swapping two neighbours moves half the
      // scene. The comparison is over the whole array, so a partial move is the
      // case most likely to be missed by an implementation that only notices a
      // complete reversal.
      const { doc, editor, sync } = seedThree();

      editor.set(reorderNotes(editor.elements, ["b", "a", "c"]));
      sync.push();

      expect(notes(doc.read().elements)).toEqual(["b", "a", "c"]);
    });

    it("commits nothing when nothing moved", () => {
      // The other half of the guard. An index comparison that is too eager
      // reports every push as a reorder, which floods the document with writes
      // on every keystroke -- the exact failure the echo guard exists to stop.
      const { doc, editor, sync } = seedThree();
      const before = doc.revision;

      editor.set([...editor.elements]);
      expect(sync.push()).toEqual([]);
      expect(doc.revision).toBe(before);
    });

    it("does not report a reorder when a field changed but the order did not", () => {
      const { doc, editor, sync } = seedThree();

      editor.set(
        editor.elements.map((element) =>
          element.type === "stickynote"
            ? { ...element, x: 42, version: 9 }
            : element,
        ),
      );
      const mutations = sync.push();

      expect(mutations.map((m) => m.kind)).toContain("updateElements");
      expect(mutations.map((m) => m.kind)).not.toContain("reorderElements");
    });

    it("does not emit both a reorder and a deletion for one gesture", () => {
      // Deleting is expressed by `deleteElements`, which leaves tombstones
      // behind. Emitting `reorderElements` as well would restate an order that
      // includes ids the document is about to tombstone, and `reorderElements`
      // ignores ids it does not recognise -- so it would be noise at best.
      const { doc, editor, sync } = seedThree();

      const withoutB = editor.elements.filter(
        (element) => element.type !== "stickynote" || element.id !== "b",
      );
      editor.set(reorderNotes(withoutB, ["c", "a"]));
      const mutations = sync.push();

      const kinds = mutations.map((m) => m.kind);
      expect(kinds).toContain("deleteElements");
      expect(kinds).not.toContain("reorderElements");
    });

    it("survives a reorder with no field change at all", () => {
      // Regression guard for the specific comparison added to `isEcho`: without
      // `index` being compared there, this push is classified an echo and the
      // whole feature is inert. `elements.ts` deliberately keeps `index` out of
      // `EDITOR_OWNED_FIELDS`, so the check has to live in the sync.
      const { doc, editor, sync } = seedThree();
      const before = doc.revision;

      editor.set(reorderNotes(editor.elements, ["c", "b", "a"]));
      const mutations = sync.push();

      expect(mutations.length).toBeGreaterThan(0);
      expect(doc.revision).toBeGreaterThan(before);
      expect(notes(doc.read().elements)).toEqual(["c", "b", "a"]);
    });
  });

  describe("document changes from elsewhere", () => {
    it("pushes a note committed directly into the document", () => {
      // The path a future collaborator or a sync server would take.
      const doc = newDoc();
      const editor = fakeEditor();
      const sync = new BoardSync(doc, editor.bridge);
      sync.start();

      doc.commit([{ kind: "createElement", element: note("remote") }]);
      expect(editor.elements.some((e) => e.id === "remote")).toBe(true);
    });

    it("clears the echo baseline it wrote, so the next edit is not mistaken for one", () => {
      const doc = newDoc();
      const editor = fakeEditor();
      const sync = new BoardSync(doc, editor.bridge);
      sync.start();
      doc.commit([{ kind: "createElement", element: note("remote") }]);

      // The user moves it. That differs from what was pushed, so it must commit.
      editor.set(
        editor.elements.map((element) =>
          element.type === "stickynote"
            ? { ...element, x: 11, version: 3 }
            : element,
        ),
      );
      expect(sync.push().length).toBeGreaterThan(0);
    });
  });

  it("keeps working when the editor throws", () => {
    // A `finally` rather than a plain reset: an exception mid-push would
    // otherwise leave the sync deaf, with no symptom except a board that quietly
    // stops saving.
    const doc = newDoc();
    const sync = new BoardSync(doc, {
      read: () => [],
      write: () => {
        throw new Error("editor exploded");
      },
    });

    expect(() => sync.start()).toThrow("editor exploded");
    // Suspended must be false again, so a later push is not silently ignored.
    expect(sync.push()).toEqual([]);
  });
});
