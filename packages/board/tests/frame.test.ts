import { API } from "@firo/editor/tests/helpers/api";

import type { FrameElement } from "@firo/schema";

import { fromEditorElements, toEditorElements } from "../src/elements.js";

/*
 * Frames in the bridge.
 *
 * A frame is one editor element in and one out, like a shape, and it adds one field
 * over the base. So this file is short, and what it is really pinning is the *absence*
 * of things:
 *
 * - No `children` array, on either side. Membership travels the other way — the
 *   elements inside a frame carry its id in `frameId` — and a frame that also listed
 *   its children would hold one relation twice. The two copies would disagree the
 *   first time a shape was dragged from one frame to another, and the disagreement
 *   would be invisible: both would render, and the frame's own list would be the one
 *   nothing checks.
 *
 * - No label, unlike a note. A frame's `name` is its own field rather than a bound
 *   text element, because the renderer draws it at the frame's top-left and Excalidraw
 *   treats it as the frame's own property. A frame that projected to two elements
 *   would leave a stray text box on the canvas for the fold to trip over next change.
 */

const documentFrame = (over: Record<string, unknown> = {}) =>
  ({
    id: "fr1",
    type: "frame",
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    angle: 0,
    name: "Discovery",
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
  } as unknown as FrameElement);

const editorFrame = (over: Record<string, unknown> = {}) =>
  ({
    ...API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    } as never),
    type: "frame",
    name: "Discovery",
    ...over,
  } as unknown as Record<string, unknown>);

describe("frame projection", () => {
  it("projects a frame as a single editor element", () => {
    // One, not two. A frame has no label element, so there is nothing to fold back.
    expect(toEditorElements(documentFrame())).toHaveLength(1);
  });

  it("keeps the discriminant and the name", () => {
    const [projected] = toEditorElements(documentFrame());
    expect(projected.type).toBe("frame");
    expect((projected as unknown as { name: string | null }).name).toBe(
      "Discovery",
    );
  });

  it("passes an unnamed frame through as unnamed", () => {
    // `null` included. The renderer draws a label for a string and nothing for null,
    // so collapsing them puts an empty label on every frame nobody named.
    const [projected] = toEditorElements(documentFrame({ name: null }));
    expect((projected as unknown as { name: string | null }).name).toBeNull();
  });

  it("carries no children list in either direction", () => {
    const [projected] = toEditorElements(documentFrame());
    expect(projected).not.toHaveProperty("children");

    const [folded] = fromEditorElements([projected] as never);
    expect(folded).not.toHaveProperty("children");
  });

  it("is the regression: a drawn frame reaches the document", () => {
    /*
     * The whole reason this branch exists. A frame drawn in the app reached the
     * document as nothing: the editor held it, the canvas drew it, and no file, no
     * autosave and no sync update ever mentioned it. Nothing looked wrong, because
     * the canvas never asks the document.
     */
    const folded = fromEditorElements([editorFrame()] as never);
    expect(folded).toHaveLength(1);
    expect(folded[0].type).toBe("frame");
  });

  it("folds the name, so a rename reaches the document", () => {
    expect(
      fromEditorElements([editorFrame({ name: "Synthesis" })] as never)[0],
    ).toMatchObject({ name: "Synthesis" });
  });

  it("folds an unnamed frame as unnamed", () => {
    expect(
      fromEditorElements([editorFrame({ name: null })] as never)[0],
    ).toMatchObject({ name: null });
  });

  it("preserves geometry and identity through a round trip", () => {
    const original = documentFrame({ x: 77, y: 88 });
    const [projected] = toEditorElements(original);
    const [folded] = fromEditorElements([projected] as never);
    expect(folded).toMatchObject({
      id: original.id,
      x: 77,
      y: 88,
      width: 400,
      height: 300,
    });
  });

  it("preserves a tombstone", () => {
    const [projected] = toEditorElements(documentFrame({ isDeleted: true }));
    const [folded] = fromEditorElements([projected] as never);
    expect(folded.isDeleted).toBe(true);
  });

  it("keeps a frame inside another frame, which is what nestable means", () => {
    // `frameId` on the inner frame. Nothing else is needed, which is why this type has
    // one field rather than a containment structure of its own.
    const [projected] = toEditorElements(
      documentFrame({ id: "fr-inner", frameId: "fr-outer" }),
    );
    const [folded] = fromEditorElements([projected] as never);
    expect(folded.frameId).toBe("fr-outer");
  });

  it("keeps a frame inside a section, through `containerId`", () => {
    // The general nesting case, ADR-0007. A frame is a container like any other, so
    // the projection carries `containerId` in `customData` for the fold to find.
    const [projected] = toEditorElements(
      documentFrame({ containerId: "sec1" }),
    );
    const [folded] = fromEditorElements([projected] as never);
    expect(folded.containerId).toBe("sec1");
  });
});
