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
     * The gap is narrowing: `image` and `frame` are not types yet. Skipping beats
     * throwing -- throwing would freeze the board over something the user can see
     * -- but it is a hole, not a virtue.
     *
     * This named `freedraw` for a long time, which was right when written and
     * quietly wrong once `freedraw` gained a schema. It kept passing: the element
     * was a rectangle relabelled, so the shape branch skipped it for lack of
     * points, and the assertion held for a reason that had nothing to do with the
     * schema. `freedraw.test.ts` covers the type this used to stand in for.
     */
    const image = { ...editorShape("rectangle"), type: "image" };
    expect(fromEditorElements([image] as never)).toHaveLength(0);
  });
});
