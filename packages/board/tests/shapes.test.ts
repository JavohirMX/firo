import { API } from "@firo/editor/tests/helpers/api";

import type { ShapeElement, ShapeType } from "@firo/schema";

import { fromEditorElements, toEditorElements } from "../src/elements.js";

/*
 * Shapes in the bridge.
 *
 * A note is two editor elements; a shape is one. That asymmetry is why the fold
 * has a branch per family rather than a single path, and the branch for shapes is
 * the one that makes the document the board's source of truth: before it existed
 * the fold skipped every type it did not recognise, so a rectangle drawn in the
 * app reached the document as nothing at all.
 *
 * The regression that is worth remembering: the editor held four elements and
 * the document held zero, with no error anywhere. Nothing was broken, nothing
 * looked wrong, and everything drawn was one reload from gone.
 */

const editorShape = (type: ShapeType, over: Record<string, unknown> = {}) => {
  const element = API.createElement({
    type: type === "rectangle" ? "rectangle" : type,
    x: 10,
    y: 20,
    width: 120,
    height: 80,
    ...over,
  } as never);
  return { ...element, type } as unknown as Record<string, unknown>;
};

const documentShape = (type: ShapeType, over: Record<string, unknown> = {}) =>
  ({
    id: "s1",
    type,
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

describe("shape projection", () => {
  it.each(["rectangle", "diamond", "ellipse"] as const)(
    "projects a %s as a single editor element",
    (type) => {
      // One, not two: a shape has no label, so there is nothing to fold back and
      // no second element to consume.
      expect(toEditorElements(documentShape(type))).toHaveLength(1);
    },
  );

  it.each(["rectangle", "diamond", "ellipse"] as const)(
    "keeps the discriminant, so the canvas draws the right shape",
    (type) => {
      const [projected] = toEditorElements(documentShape(type));
      expect(projected.type).toBe(type);
    },
  );

  it("carries geometry and style across", () => {
    const [projected] = toEditorElements(
      documentShape("rectangle", { x: 5, y: 6, opacity: 40, strokeWidth: 4 }),
    );
    expect(projected).toMatchObject({
      x: 5,
      y: 6,
      opacity: 40,
      strokeWidth: 4,
    });
  });

  it("gives a shape a stable seed derived from its id", () => {
    const [projected] = toEditorElements(documentShape("ellipse"));
    expect(typeof projected.seed).toBe("number");
    expect(toEditorElements(documentShape("ellipse"))).toEqual([
      toEditorElements(documentShape("ellipse"))[0],
    ]);
  });

  it("passes roundness through, because corners are the whole point of it", () => {
    const [projected] = toEditorElements(
      documentShape("rectangle", { roundness: { type: 3 } }),
    );
    expect(projected.roundness).toEqual({ type: 3 });
  });

  it("carries containerId in customData, where Excalidraw has no field for it", () => {
    const [projected] = toEditorElements(
      documentShape("rectangle", { containerId: "frame-7" }),
    );
    expect(
      (projected.customData as Record<string, unknown>)["firo.containerId"],
    ).toBe("frame-7");
  });
});

describe("shape fold", () => {
  it.each(["rectangle", "diamond", "ellipse"] as const)(
    "folds a %s into the document",
    (type) => {
      const folded = fromEditorElements([editorShape(type)] as never);
      expect(folded).toHaveLength(1);
      expect(folded[0].type).toBe(type);
    },
  );

  it("is the regression: a drawn shape reaches the document", () => {
    /*
     * The whole reason this branch exists. Measured in a browser: with the
     * editor holding a rectangle, an ellipse, an arrow and a text element, the
     * document held none of them. No error, nothing visibly wrong, and every
     * shape one reload from gone.
     */
    const folded = fromEditorElements([
      editorShape("rectangle"),
      editorShape("ellipse"),
    ] as never);
    expect(folded.map((e) => e.type)).toEqual(["rectangle", "ellipse"]);
  });

  it("preserves geometry and identity through a round trip", () => {
    const original = documentShape("rectangle", { x: 77, y: 88 });
    const [projected] = toEditorElements(original);
    const [folded] = fromEditorElements([projected] as never);
    expect(folded).toMatchObject({
      id: original.id,
      x: 77,
      y: 88,
      width: 120,
      height: 80,
    });
  });

  it("preserves the fractional index, so z-order survives", () => {
    const [projected] = toEditorElements(documentShape("rectangle"));
    const [folded] = fromEditorElements([projected] as never);
    expect(folded.index).toBe("a0");
  });

  it("preserves a tombstone", () => {
    const [projected] = toEditorElements(
      documentShape("rectangle", { isDeleted: true }),
    );
    const [folded] = fromEditorElements([projected] as never);
    expect(folded.isDeleted).toBe(true);
  });

  it("keeps a host application's customData", () => {
    const [projected] = toEditorElements(
      documentShape("rectangle", { customData: { "app.example": 7 } }),
    );
    const [folded] = fromEditorElements([projected] as never);
    expect((folded.customData as Record<string, unknown>)["app.example"]).toBe(
      7,
    );
  });

  it("does not invent a label for a shape", () => {
    // A shape is one element in and one out. If this ever produced two, the
    // canvas would draw a second, empty text box on top of every shape.
    expect(fromEditorElements([editorShape("diamond")] as never)).toHaveLength(
      1,
    );
  });

  it("still skips a type the document has no schema for", () => {
    /*
     * A hole, not a virtue — but a necessary one. A board may legitimately hold an
     * element type this version does not understand, and skipping beats throwing:
     * throwing would freeze the board's sync over something the user can plainly see.
     *
     * This named `freedraw` for a long time, then `image`, and each was right when
     * written and quietly wrong once that type gained a schema. It kept passing both
     * times: the element was a rectangle relabelled, so the shape branch skipped it
     * for lack of the fields it was pretending to have, and the assertion held for a
     * reason that had nothing to do with the schema. A test that keeps passing after
     * the thing it describes stops being true is worse than one that fails, because
     * it looks like coverage.
     *
     * So it names `selection` now, which is the honest example and will not be given
     * a schema: a rubber-band rectangle is UI state, and rule 1 in AGENTS.md is that
     * ephemeral state never enters the document. `embeddable`, `iframe` and
     * `magicframe` are the other three, and `conformance.test.ts` holds that list.
     */
    const selection = { ...editorShape("rectangle"), type: "selection" };
    expect(fromEditorElements([selection] as never)).toHaveLength(0);
  });

  it("does not skip anything a person can draw with the toolbar", () => {
    /*
     * The assertion that would have caught `image` and `frame` when the fold was
     * skipping them, rather than when somebody exported a board and found the
     * picture missing from the file.
     *
     * Derived rather than hand-written, so a new type cannot be added to the toolbar's
     * reach without this failing. A hand-written list catches a field somebody thought
     * of, which is how four were missed at once in `EDITOR_OWNED_FIELDS`.
     */
    const drawable = [
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

    const skipped = drawable.filter(
      (type) =>
        fromEditorElements([{ ...editorShape("rectangle"), type }] as never)
          .length === 0,
    );

    expect(skipped).toEqual([]);
  });
});
