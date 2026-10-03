/*
 * The durable facilitation flags across the board <-> editor boundary.
 *
 * ## Why this needs its own file
 *
 * The flags are in `@firo/schema` and the editor has never heard of them. Excalidraw's
 * element has no `hiddenUntilRevealed` and no `hideInPresentation`, so there is
 * nowhere to put them on the way out and nothing to read them on the way back --
 * which is why they travel in `customData` under `firo.` keys, exactly as
 * `containerId` does.
 *
 * And the failure mode is the one that hides. `customData` is preserved verbatim
 * through the whole round trip, so a flag left sitting in it is still *there* when
 * the element comes back. Every test that says "it survived" passes. What is gone
 * is the *field*: `element.hiddenUntilRevealed` is `undefined` from the first fold
 * onward, and the value survives in a place nothing reads. That is the
 * `containerId` bug again, one level down -- the value never destroyed, the field
 * never set -- and it is why the assertions below read the typed field and check
 * that `customData` has been *cleaned*, rather than checking that something
 * survived.
 *
 * ## One case per fold branch
 *
 * The fold has a branch per element family, and each one builds its document
 * element by hand. A flag added to six of seven branches loses the seventh, and a
 * board's shapes stop hiding while its notes keep hiding -- which reads as a
 * rendering bug. So this is table-driven over the branches.
 */
import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";

import type { ExcalidrawElement } from "@firo/element/types";
import type { FiroElement, ShapeElement } from "@firo/schema";

import { fromEditorElements, toEditorElements } from "../src/elements.js";
import { BoardSync, type EditorBridge } from "../src/sync.js";

const HIDDEN_KEY = "firo.hiddenUntilRevealed";
const HIDE_KEY = "firo.hideInPresentation";

/** The smallest editor element each fold branch will accept. */
const editorFor = (type: string): ExcalidrawElement => {
  const base = {
    id: `el-${type}`,
    x: 10,
    y: 20,
    width: 120,
    height: 80,
    angle: 0,
    seed: 1,
    version: 1,
    versionNonce: 7,
    index: "a0",
    isDeleted: false,
    groupIds: [],
    frameId: null,
    link: null,
    locked: false,
    created: 1000,
    updated: 2000,
    customData: { [HIDDEN_KEY]: true, [HIDE_KEY]: true },
  };

  switch (type) {
    case "stickynote":
      return { ...base, type: "stickynote", text: "", height: 150 } as never;
    case "arrow":
    case "line":
      return {
        ...base,
        type,
        points: [
          [0, 0],
          [10, 10],
        ],
        startArrowhead: null,
        endArrowhead: null,
        elbowed: false,
        startBinding: null,
        endBinding: null,
      } as never;
    case "freedraw":
      return {
        ...base,
        type,
        points: [
          [0, 0],
          [5, 5],
        ],
        pressures: [0.5, 0.5],
        simulatePressure: true,
        strokeOptions: { variability: "variable", streamline: 0.4 },
      } as never;
    case "text":
      return {
        ...base,
        type,
        text: "an annotation",
        originalText: "an annotation",
        fontSize: 20,
        fontFamily: 1,
        textAlign: "left",
        verticalAlign: "top",
        autoResize: true,
        lineHeight: 1.25,
        containerId: null,
        baseFontSize: null,
      } as never;
    case "frame":
      return { ...base, type: "frame", name: "Discovery" } as never;
    case "image":
      return {
        ...base,
        type,
        fileId: "abc123",
        status: "saved",
        scale: [1, 1],
        crop: null,
      } as never;
    default:
      return { ...base, type } as never;
  }
};

/** Every family the fold branches on. */
const FOLD_BRANCHES = [
  "stickynote",
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "frame",
  "image",
] as const;

const documentShape = (over: Record<string, unknown> = {}): ShapeElement =>
  ({
    id: "s1",
    type: "rectangle",
    x: 10,
    y: 20,
    width: 120,
    height: 80,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "#ffffff",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    version: 1,
    versionNonce: 7,
    index: "a0",
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
  } as unknown as ShapeElement);

describe("the fold lifts the flags out of customData, on every branch", () => {
  it.each(FOLD_BRANCHES)("%s", (type) => {
    const [folded] = fromEditorElements([editorFor(type)]);

    expect(folded).toMatchObject({
      hiddenUntilRevealed: true,
      hideInPresentation: true,
    });

    // The half that catches the bug. The value riding along inside `customData`
    // would keep every "it survived" assertion passing while the field stayed
    // absent, so the duplicate has to be *removed*, not merely duplicated.
    expect(folded.customData).toBeUndefined();
  });
});

describe("the projection writes them into customData", () => {
  it("namespaces both, so a host application's keys cannot collide", () => {
    const [projected] = toEditorElements(
      documentShape({
        hiddenUntilRevealed: true,
        hideInPresentation: true,
      }),
    );
    expect(projected.customData).toEqual({
      [HIDDEN_KEY]: true,
      [HIDE_KEY]: true,
    });
  });

  it("leaves a host application's own keys alone", () => {
    const [projected] = toEditorElements(
      documentShape({
        hiddenUntilRevealed: true,
        customData: { "acme.sprint": 7 },
      }),
    );
    expect(projected.customData).toEqual({
      "acme.sprint": 7,
      [HIDDEN_KEY]: true,
    });
  });

  it("writes nothing at all for an element with neither flag", () => {
    // `false` and absent are one answer, so writing `false` would put two keys on
    // every element of every board nobody hid anything on.
    for (const over of [{}, { hiddenUntilRevealed: false }]) {
      const [projected] = toEditorElements(documentShape(over));
      expect(projected.customData).toBeUndefined();
    }
  });
});

describe("a value that is not a boolean is dropped rather than promoted", () => {
  // Read defensively and without coercion, and that is the same treatment
  // `containerId` has always had: the key is in *our* namespace, so we own what is
  // under it, and a string where a flag belongs is a value no version of Firo ever
  // wrote. Nothing here can throw either -- this runs over the whole scene on every
  // editor change, so throwing would take the board's sync down rather than lose
  // one value.
  //
  // The repair belongs to the schema, which coerces it and records it in the log.
  // By the time an element reaches the editor it has been through `loadBoard`.
  it.each([HIDDEN_KEY, HIDE_KEY])(
    "`%s` as a string does not become a flag",
    (key) => {
      const field =
        key === HIDDEN_KEY ? "hiddenUntilRevealed" : "hideInPresentation";

      expect(() =>
        fromEditorElements([
          { ...editorFor("rectangle"), customData: { [key]: "yes" } } as never,
        ]),
      ).not.toThrow();

      const [folded] = fromEditorElements([
        { ...editorFor("rectangle"), customData: { [key]: "yes" } } as never,
      ]);
      expect(folded).not.toHaveProperty(field);
      expect(folded.customData).toBeUndefined();
    },
  );
});

/*
 * The sync round trip, which is the version of the bug that reaches a user.
 *
 * Projection -> fold is what the unit tests above cover. This is the loop: the
 * document holds a hidden note, the editor is handed the scene, and every editor
 * change folds the whole scene back. A flag the fold drops is not lost once -- it
 * is lost on the first push, and the document then disagrees with what the
 * facilitator set, with no error anywhere.
 */
describe("a hidden note stays hidden across a full sync cycle", () => {
  const started = (element: FiroElement) => {
    const doc = new FiroDoc(new Y.Doc());
    let elements: Record<string, unknown>[] = [];
    const bridge: EditorBridge = {
      read: () => elements,
      write: (next) => {
        elements = [...next];
      },
    };

    const sync = new BoardSync(doc, bridge);
    sync.start();
    doc.commit([{ kind: "createElement", element }]);

    return { doc, sync, editor: () => elements };
  };

  it("the document keeps both flags after a pull and a push", () => {
    const { doc, sync } = started(
      documentShape({ hiddenUntilRevealed: true, hideInPresentation: true }),
    );

    sync.pull();
    sync.push();
    // A second cycle, because the first push's baseline is the state *before* the
    // commit and the interesting comparison is against the state after it.
    sync.pull();
    sync.push();

    expect(doc.read().elements[0]).toMatchObject({
      hiddenUntilRevealed: true,
      hideInPresentation: true,
    });
    doc.destroy();
  });

  it("an ordinary edit does not clear them either", () => {
    // The version of this bug that looks like a lost property rather than a lost
    // feature: the note stays on the board, it just stops being hidden, and
    // nothing in the file says a facilitator ever asked.
    const { doc, sync, editor } = started(
      documentShape({ hiddenUntilRevealed: true, hideInPresentation: true }),
    );

    sync.pull();
    editor().forEach((element) => {
      Object.assign(element, { x: 999 });
    });
    sync.push();

    expect(doc.read().elements[0]).toMatchObject({
      x: 999,
      hiddenUntilRevealed: true,
      hideInPresentation: true,
    });
    doc.destroy();
  });

  it("the flags are not on the echo-detection list", () => {
    // Stated as a test rather than left in a comment, because the two directions
    // read very differently to whoever trips over this next: listing them is not
    // "harmless belt and braces", it is a comparison that can never differ.
    const { doc, sync } = started(
      documentShape({ hiddenUntilRevealed: true, hideInPresentation: true }),
    );

    sync.pull();
    // No mutation is committed: the push is recognised as the editor handing back
    // exactly what it was given, including the flags it never understood.
    expect(sync.push()).toEqual([]);
    doc.destroy();
  });
});
