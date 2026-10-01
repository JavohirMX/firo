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

      const [, label] = editor.elements;
      editor.set(
        editor.elements.map((element) =>
          element.id === label.id
            ? { ...element, text: "edited", version: 99 }
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
