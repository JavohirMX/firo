import * as Y from "yjs";

import { API } from "@firo/editor/tests/helpers/api";

import { FiroDoc } from "@firo/doc";

import type { FiroElement } from "@firo/schema";

import type { ExcalidrawElement } from "@firo/element/types";

import {
  EDITOR_OWNED_FIELDS,
  fromEditorElements,
  toEditorElements,
} from "../src/elements.js";
import { BoardSync, type EditorBridge } from "../src/sync.js";

/*
 * A change to an element's `points` must reach the document.
 *
 * ## The bug
 *
 * `EDITOR_OWNED_FIELDS` is the list of fields the editor owns, and the echo check
 * compares exactly those. `points` was not on it. The list held only the scalars it
 * started with — geometry and style — so a push whose *only* difference was the
 * path compared equal on every listed field and was discarded as an echo.
 *
 * The consequence is silent in the worst way. The element exists in the document,
 * so nothing looks missing. It is simply frozen: the canvas draws the new path
 * while the document keeps the old one, with no error and nothing in the file to
 * say which is right. Measured in the app after drawing a stroke — the editor held
 * 16 points, the document held 15, and it stayed at 15 indefinitely, touching
 * nothing and waiting seconds, because the push that would have corrected it was
 * thrown away each time.
 *
 * It surfaced on `freedraw`, but `points` was missing from the moment the connector
 * branch was written, so every bent connector has had it too.
 *
 * ## Why the comparison had to change as well
 *
 * Adding the field alone would have been worse. `isEcho` compared with `===`, which
 * never holds for an array — the fold builds a fresh one every pass — so a stroke's
 * `points` on the list would mean *no* push is ever an echo, the guard does nothing,
 * and the loop it exists to stop becomes possible. The comparison is now by value,
 * via the `sameValue` this file already had.
 *
 * The two halves have to land together, which is why the echo tests below are as
 * much a part of this as the commit tests.
 */
const fakeEditor = (initial: Record<string, unknown>[] = []) => {
  let elements = [...initial];

  const bridge: EditorBridge = {
    read: () => elements,
    write: (next) => {
      elements = [...next];
    },
  };

  return {
    bridge,
    get elements() {
      return elements;
    },
    /** What the user did in the editor. */
    set: (next: Record<string, unknown>[]) => {
      elements = [...next];
    },
  };
};

const newDoc = () => new FiroDoc(new Y.Doc());

/**
 * A connector or a stroke as the editor holds it.
 *
 * Built through `API.createElement` and then given the fields the helper does not
 * carry, because the helper builds a generic element: passing `points` or
 * `pressures` to it is silently ignored and the fixture comes out without them.
 */
const editorPath = (
  type: "line" | "freedraw",
  over: Record<string, unknown> = {},
) =>
  ({
    ...API.createElement({
      type,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    } as never),
    type,
    points: [
      [0, 0],
      [50, 50],
    ],
    ...(type === "freedraw"
      ? {
          pressures: [0.5, 0.5],
          simulatePressure: true,
          strokeOptions: { variability: "variable", streamline: 0.4 },
        }
      : {
          startArrowhead: null,
          endArrowhead: null,
          elbowed: false,
        }),
    ...over,
  } as unknown as Record<string, unknown>);

/**
 * A started sync holding one element, in both the document and the editor.
 *
 * The element is put in the *document* first and then projected into the editor by
 * `pull`. That ordering is the whole point of this helper: a test that seeds only
 * the editor exercises `createElement`, and every one of its assertions would pass
 * whether or not updates worked at all. The bug under test is an update that is
 * dropped, so the element has to already exist.
 */
const started = (type: "line" | "freedraw", id: string) => {
  const doc = newDoc();
  const editor = fakeEditor();
  const sync = new BoardSync(doc, editor.bridge);
  sync.start();

  const element = fromEditorElements([
    editorPath(type, { id }) as unknown as ExcalidrawElement,
  ])[0] as FiroElement;
  doc.commit([{ kind: "createElement", element }]);
  sync.pull();

  return { doc, editor, sync };
};

/** The user changed one field of one editor element, leaving the rest alone. */
const editInEditor = (
  editor: ReturnType<typeof fakeEditor>,
  id: string,
  changes: Record<string, unknown>,
) => {
  editor.set(
    editor.elements.map((element) =>
      element.id === id ? { ...element, ...changes } : element,
    ),
  );
};

const docElement = (doc: FiroDoc, id: string) =>
  doc.read().elements.find((element) => element.id === id) as unknown as Record<
    string,
    unknown
  >;

describe("a change to points reaches the document", () => {
  it("commits a connector's added vertex", () => {
    const { doc, editor, sync } = started("line", "l1");

    editInEditor(editor, "l1", {
      points: [
        [0, 0],
        [50, 50],
        [80, 20],
      ],
    });

    const update = sync.push().find((m) => m.kind === "updateElements");
    expect(update).toBeDefined();
    expect(docElement(doc, "l1").points).toEqual([
      [0, 0],
      [50, 50],
      [80, 20],
    ]);
  });

  it("commits a connector's moved vertex", () => {
    const { doc, editor, sync } = started("line", "l1");

    editInEditor(editor, "l1", {
      points: [
        [0, 0],
        [99, 99],
      ],
    });

    expect(sync.push().find((m) => m.kind === "updateElements")).toBeDefined();
    expect(docElement(doc, "l1").points).toEqual([
      [0, 0],
      [99, 99],
    ]);
  });

  it("commits a stroke's added points", () => {
    const { doc, editor, sync } = started("freedraw", "fd1");

    editInEditor(editor, "fd1", {
      points: [
        [0, 0],
        [10, 10],
        [20, 4],
        [30, 30],
      ],
      pressures: [0.1, 0.4, 0.7, 0.3],
    });

    expect(sync.push().find((m) => m.kind === "updateElements")).toBeDefined();
    expect(docElement(doc, "fd1").points).toHaveLength(4);
  });

  it("commits a stroke's changed pressures, with identical points and geometry", () => {
    // The nastier half: nothing else differs here. A comparison that only looked at
    // scalars would see no change at all, and the stroke would keep its shape and
    // lose its taper — visible only by comparing before with after.
    const { doc, editor, sync } = started("freedraw", "fd1");

    editInEditor(editor, "fd1", { pressures: [0.1, 0.9] });

    expect(sync.push().find((m) => m.kind === "updateElements")).toBeDefined();
    expect(docElement(doc, "fd1").pressures).toEqual([0.1, 0.9]);
  });

  it("commits a stroke's changed stroke options", () => {
    const { doc, editor, sync } = started("freedraw", "fd1");

    editInEditor(editor, "fd1", {
      strokeOptions: { variability: "constant", streamline: 0.1 },
    });

    expect(sync.push().find((m) => m.kind === "updateElements")).toBeDefined();
    expect(docElement(doc, "fd1").strokeOptions).toEqual({
      variability: "constant",
      streamline: 0.1,
    });
  });

  it("still treats an unchanged path as an echo", () => {
    // The other half, and the reason the comparison is by value rather than
    // reference. The editor rebuilds its elements on every change, so an echo
    // arrives as structurally equal but freshly allocated arrays; `sameValue` has
    // to call those the same, or every push looks like an edit.
    const { doc, editor, sync } = started("line", "l1");

    // A new array holding the same points: exactly what the editor hands over.
    editInEditor(editor, "l1", {
      points: [
        [0, 0],
        [50, 50],
      ],
    });

    const before = doc.revision;
    expect(sync.push()).toEqual([]);
    expect(doc.revision).toBe(before);
  });

  it("still treats an unchanged stroke as an echo", () => {
    const { doc, editor, sync } = started("freedraw", "fd1");

    editInEditor(editor, "fd1", {
      pressures: [0.5, 0.5],
      strokeOptions: { variability: "variable", streamline: 0.4 },
    });

    const before = doc.revision;
    expect(sync.push()).toEqual([]);
    expect(doc.revision).toBe(before);
  });

  it("does not loop when a document change comes back through", () => {
    // The end-to-end guard, with a stroke rather than a note. The loop is easiest
    // to provoke with exactly the fields this file was missing, and the symptom it
    // prevents is a board burning a core — which looks like a rendering problem and
    // is not one.
    const { doc, editor, sync } = started("freedraw", "fd1");

    editInEditor(editor, "fd1", {
      points: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
      pressures: [0.2, 0.5, 0.8],
    });

    const start = doc.revision;
    for (let i = 0; i < 5; i++) {
      sync.push();
      sync.pull();
    }

    // Five round trips, at most one commit each. More would be a cycle.
    expect(doc.revision - start).toBeLessThanOrEqual(1);
  });

  it("keeps a stroke's shape, pressures and options through a round trip", () => {
    const { doc, editor, sync } = started("freedraw", "fd1");

    editInEditor(editor, "fd1", {
      points: [
        [0, 0],
        [10, 10],
        [20, 4],
        [30, 30],
      ],
      pressures: [0.1, 0.4, 0.7, 0.3],
      strokeOptions: { variability: "constant", streamline: 0.15 },
    });
    sync.push();
    sync.pull();

    const projected = toEditorElements(doc.read().elements[0] as FiroElement);

    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      type: "freedraw",
      simulatePressure: true,
      strokeOptions: { variability: "constant", streamline: 0.15 },
    });
    expect(
      (projected[0] as unknown as { points: unknown[] }).points,
    ).toHaveLength(4);
  });
});

/*
 * The tests above each push one named field. That catches a field someone thought
 * of, and misses one they did not — which is exactly how `points`,
 * `pressures`, `simulatePressure` and `strokeOptions` were all left out at once.
 *
 * So this one is derived: it takes every field a stroke and a connector actually
 * have, subtracts the ones that are excluded on purpose, and requires the rest to
 * be on the list. A field added to the schema without being added here fails the
 * test by name.
 */
describe("EDITOR_OWNED_FIELDS covers what the editor owns", () => {
  /**
   * Fields that are legitimately absent, each for a stated reason.
   *
   * Every entry is an exclusion someone chose. A field that is merely *not handled
   * yet* does not belong here — it belongs in the assertion below, which is what
   * makes this test able to fail.
   */
  const EXCLUDED: Record<string, string> = {
    id: "identity, not content",
    type: "the discriminant, never edited",
    version: "assigned by whoever writes last; compared out deliberately",
    versionNonce: "assigned by whoever writes last; compared out deliberately",
    index: "z-order, which the document assigns",
    created: "assigned once, by the creator",
    updated: "moves on every edit, so it would never compare equal",
    isDeleted: "compared separately by the echo check, not as a list member",
    customData:
      "round-tripped untouched, so it belongs to nobody in particular",
    bindings:
      "the connector's copy carries the geometry; a shape's side is a marker",
    /*
     * Derived, not owned.
     *
     * `seed` is Firo's own field, computed from the element id so a stroke renders
     * identically without the value being stored. `boundElements` is the editor's
     * binding marker, which the fold reads to build `bindings`. Neither is written
     * back, and neither is present on a folded element, so comparing them would be
     * comparing `undefined` with `undefined` — a check that always passes and
     * reads as coverage.
     */
    seed: "derived from the id, never stored on a folded element",
    boundElements: "read by the fold to build `bindings`, never written back",
    startBinding: "an input to the fold, which writes the ordered `bindings`",
    endBinding: "an input to the fold, which writes the ordered `bindings`",
    lastCommittedPoint:
      "live gesture state the editor rewrites as the pointer moves; ephemeral by rule",
  };

  const declared = new Set<string>(EDITOR_OWNED_FIELDS);

  it.each([
    ["freedraw", editorPath("freedraw", { id: "x" })],
    ["line", editorPath("line", { id: "x" })],
    ["rectangle", { type: "rectangle" }],
  ])("holds every field a %s has that is not excluded", (name, element) => {
    const missing = Object.keys(element)
      .filter((field) => !(field in EXCLUDED))
      .filter((field) => !declared.has(field));

    // Named, so the failure says which field to add rather than "an array differs".
    expect(missing).toEqual([]);
    expect(name).toBeTruthy();
  });

  it("says why each exclusion is excluded", () => {
    // An exclusion with no stated reason is indistinguishable from a field someone
    // forgot, which is the failure this whole area has.
    for (const reason of Object.values(EXCLUDED)) {
      expect(reason.length).toBeGreaterThan(10);
    }
  });

  it("does not list a field no element has", () => {
    // The other direction. A field on the list that nothing writes is a comparison
    // that always passes, which is dead weight that reads as coverage.
    //
    // Built from one fixture of *each* type. An earlier version built only a
    // freedraw and relabelled it, which reported the connector's own fields as
    // orphans — a test wrong in the direction that looks like a bug in the code.
    const fixtures = [
      editorPath("freedraw", { id: "x" }),
      editorPath("line", { id: "x" }),
      { ...editorPath("freedraw", { id: "x" }), type: "rectangle" },
      // A note's label is the only thing carrying the text fields.
      {
        type: "text",
        text: "",
        fontSize: 20,
        fontFamily: 1,
        textAlign: "center",
        verticalAlign: "middle",
      },
    ];

    const known = new Set(fixtures.flatMap((fixture) => Object.keys(fixture)));

    const orphans = [...declared].filter((field) => !known.has(field));

    expect(orphans).toEqual([]);
  });
});

/*
 * The rest of the fields the missing-list bug ate.
 *
 * Grouping, locking and hyperlinks were absent from `EDITOR_OWNED_FIELDS` for as
 * long as it existed, so a change to any of them was discarded as an echo and the
 * document kept the old value. Each is a feature that would have looked broken in
 * the worst way: the canvas shows the change, so the only symptom is a file that
 * disagrees with the picture, with nothing to say which is right.
 *
 * Grouping and locking are Phase 3 work, so at the time of writing they are latent
 * rather than visible — the features are not reachable in the app yet. The sync
 * path is what is proven here, because that is the part this change fixes and the
 * part a browser test cannot currently reach.
 */
describe("the other editor-owned fields reach the document", () => {
  const shape = (over: Record<string, unknown> = {}) =>
    ({
      ...API.createElement({
        type: "rectangle",
        x: 0,
        y: 0,
        width: 50,
        height: 50,
      } as never),
      type: "rectangle",
      groupIds: [],
      locked: false,
      link: null,
      frameId: null,
      ...over,
    } as unknown as Record<string, unknown>);

  const startWithShape = (id: string, over: Record<string, unknown> = {}) => {
    const doc = newDoc();
    const editor = fakeEditor();
    const sync = new BoardSync(doc, editor.bridge);
    sync.start();
    doc.commit([
      {
        kind: "createElement",
        element: fromEditorElements([
          shape({ id, ...over }) as unknown as ExcalidrawElement,
        ])[0] as FiroElement,
      },
    ]);
    sync.pull();
    return { doc, editor, sync };
  };

  it("commits a shape being added to a group", () => {
    const { doc, editor, sync } = startWithShape("r1");

    editInEditor(editor, "r1", { groupIds: ["group-7"] });

    expect(sync.push().find((m) => m.kind === "updateElements")).toBeDefined();
    expect(docElement(doc, "r1").groupIds).toEqual(["group-7"]);
  });

  it("commits a shape leaving a group", () => {
    const { doc, editor, sync } = startWithShape("r1", { groupIds: ["g1"] });

    editInEditor(editor, "r1", { groupIds: [] });

    expect(sync.push().find((m) => m.kind === "updateElements")).toBeDefined();
    expect(docElement(doc, "r1").groupIds).toEqual([]);
  });

  it("commits a shape being locked", () => {
    const { doc, editor, sync } = startWithShape("r1");

    editInEditor(editor, "r1", { locked: true });

    expect(sync.push().find((m) => m.kind === "updateElements")).toBeDefined();
    expect(docElement(doc, "r1").locked).toBe(true);
  });

  it("commits a hyperlink being set and cleared", () => {
    const { doc, editor, sync } = startWithShape("r1");

    editInEditor(editor, "r1", { link: "https://example.com" });
    expect(sync.push().find((m) => m.kind === "updateElements")).toBeDefined();
    expect(docElement(doc, "r1").link).toBe("https://example.com");

    editInEditor(editor, "r1", { link: null });
    expect(sync.push().find((m) => m.kind === "updateElements")).toBeDefined();
    expect(docElement(doc, "r1").link).toBeNull();
  });

  it("still calls an unchanged grouping an echo", () => {
    const { doc, editor, sync } = startWithShape("r1", { groupIds: ["g1"] });

    // A fresh array with the same contents: what the editor hands over every time.
    editInEditor(editor, "r1", { groupIds: ["g1"] });

    const before = doc.revision;
    expect(sync.push()).toEqual([]);
    expect(doc.revision).toBe(before);
  });
});
