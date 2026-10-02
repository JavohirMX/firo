import { API } from "@firo/editor/tests/helpers/api";

import { isElementType } from "@firo/schema";

import type { FiroElement, ImageElement } from "@firo/schema";

import { fromEditorElements, toEditorElements } from "../src/elements.js";

/*
 * Images in the bridge.
 *
 * An image is one editor element in and one out, and it adds four fields over the
 * base. So this file is short, and what it pins is that all four survive the trip —
 * because each one fails *quietly* if it does not. The picture still renders; it just
 * renders as something else:
 *
 * - `fileId` lost: a placeholder pointing at nothing.
 * - `status` lost: a slow-loading image either never appears, or appears as a
 *   permanent error.
 * - `scale` reduced to its first axis: a mirrored image comes back the right way
 *   round, and nothing says so.
 * - `crop` lost: an uncropped picture where there was a window onto part of one.
 *
 * The file is also the honest answer to a question this gap raised. The `.firo` format
 * carries an image's reference and not its bytes, so the export refuses a board with
 * an image rather than writing a file that opens with the picture missing —
 * `apps/web/board/tests/files.test.ts` covers that half. This file covers the half
 * that was silently broken before: the element never reached the document at all.
 */

const documentImage = (over: Record<string, unknown> = {}) =>
  ({
    id: "im1",
    type: "image",
    x: 0,
    y: 0,
    width: 320,
    height: 240,
    angle: 0,
    fileId: "abc123",
    status: "saved",
    scale: [1, 1],
    crop: null,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    version: 1,
    versionNonce: 3,
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
  } as unknown as ImageElement);

const editorImage = (over: Record<string, unknown> = {}) =>
  ({
    ...API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 320,
      height: 240,
    } as never),
    type: "image",
    fileId: "abc123",
    status: "saved",
    scale: [1, 1],
    crop: null,
    ...over,
  } as unknown as Record<string, unknown>);

/**
 * Narrow a folded element to an image.
 *
 * Through the schema's own helper rather than a cast, so a fold that returned the
 * wrong type would fail here as a type error instead of reading `undefined` off a
 * union member that does not have the field — which is how a broken fold produces a
 * test that passes.
 */
const asImage = (element: FiroElement | undefined): ImageElement => {
  if (!element || !isElementType(element, "image")) {
    throw new Error(
      `expected a folded image, got ${element?.type ?? "nothing"}`,
    );
  }
  return element;
};

describe("image projection", () => {
  it("projects an image as a single editor element", () => {
    expect(toEditorElements(documentImage())).toHaveLength(1);
  });

  it("keeps the discriminant, the reference and the status", () => {
    const [projected] = toEditorElements(documentImage());
    const asRecord = projected as unknown as Record<string, unknown>;

    expect(projected.type).toBe("image");
    expect(asRecord.fileId).toBe("abc123");
    expect(asRecord.status).toBe("saved");
  });

  it("is the regression: a placed image reaches the document", () => {
    /*
     * The whole reason this branch exists. Measured in a browser before it did: an
     * image drawn on a board was drawn, and was saved by the editor's own redundant
     * copy, and reached neither the document, nor the autosave, nor any file. Nothing
     * looked wrong, because the canvas never asks the document.
     */
    const folded = fromEditorElements([editorImage()] as never);
    expect(folded).toHaveLength(1);
    expect(folded[0].type).toBe("image");
  });

  it("keeps both axes of `scale` through a round trip", () => {
    // The one that matters most, because it is the one a careless implementation
    // halves. A mirrored image is [-1, 1]; a single-axis read gives [1, 1] and the
    // picture silently comes back un-mirrored.
    const [projected] = toEditorElements(documentImage({ scale: [-1, 1] }));
    const [folded] = fromEditorElements([projected] as never);

    expect(asImage(folded).scale).toEqual([-1, 1]);
  });

  it("keeps a crop through a round trip, including the natural size", () => {
    const crop = {
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      naturalWidth: 640,
      naturalHeight: 480,
    };
    const [projected] = toEditorElements(documentImage({ crop }));
    const [folded] = fromEditorElements([projected] as never);

    expect(asImage(folded).crop).toEqual(crop);
  });

  it("does not share its `scale` or `crop` with the document", () => {
    /*
     * Copied on both sides, for the stroke's reason. The editor happens to replace
     * these rather than mutate them — current behaviour, not a written-down invariant
     * — and an element handed the document's own object and then written into would
     * change the document with no commit, no diff and no undo entry.
     */
    const original = documentImage({ scale: [-1, 1] });
    const [projected] = toEditorElements(original);
    const [folded] = fromEditorElements([projected] as never);
    const projectedScale = (projected as unknown as { scale: number[] }).scale;

    expect(projectedScale).not.toBe(original.scale);
    expect(asImage(folded).scale).not.toBe(projectedScale);
  });

  it("keeps a pending image pending, with no invented reference", () => {
    // `fileId: null` is the renderer's placed-but-not-read case. A made-up id would be
    // an element claiming to reference bytes that do not exist, and it is the state
    // the file writer refuses to export — so it has to be representable.
    const [folded] = fromEditorElements([
      editorImage({ fileId: null, status: "pending" }),
    ] as never);

    expect(asImage(folded).fileId).toBeNull();
    expect(asImage(folded).status).toBe("pending");
  });

  it("repairs a malformed `scale` rather than throwing mid-sync", () => {
    // The fold runs over the whole scene on every editor change. A spread of a missing
    // `scale` would take the entire board's sync down, which is a far worse outcome
    // than one picture drawing the wrong way round.
    const [folded] = fromEditorElements([editorImage({ scale: 2 })] as never);
    expect(asImage(folded).scale).toEqual([1, 1]);
  });

  it("repairs a partial crop rather than carrying half of one", () => {
    // All six numbers or nothing: a window that cannot be expressed against an image
    // is not a crop with defaults.
    const [folded] = fromEditorElements([
      editorImage({ crop: { x: 0, y: 0, width: 10, height: 10 } }),
    ] as never);

    expect(asImage(folded).crop).toBeNull();
  });

  it("does not share its `crop` with the document", () => {
    const crop = {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      naturalWidth: 5,
      naturalHeight: 6,
    };
    const original = documentImage({ crop });
    const [projected] = toEditorElements(original);

    expect((projected as unknown as { crop: unknown }).crop).not.toBe(crop);
  });

  it("preserves geometry, identity and z-order through a round trip", () => {
    const original = documentImage({ x: 77, y: 88 });
    const [projected] = toEditorElements(original);
    const [folded] = fromEditorElements([projected] as never);

    expect(folded).toMatchObject({
      id: original.id,
      x: 77,
      y: 88,
      width: 320,
      height: 240,
      index: "a0",
    });
  });

  it("preserves a tombstone", () => {
    const [projected] = toEditorElements(documentImage({ isDeleted: true }));
    const [folded] = fromEditorElements([projected] as never);

    expect(folded.isDeleted).toBe(true);
  });

  it("keeps an image inside a frame or a section", () => {
    // Both relations, and they are different: `frameId` is inherited and is how the
    // renderer decides which frame to clip to, `containerId` is Firo's own nesting.
    const [projected] = toEditorElements(
      documentImage({ frameId: "fr1", containerId: "sec1" }),
    );
    const [folded] = fromEditorElements([projected] as never);

    expect(folded.frameId).toBe("fr1");
    expect(folded.containerId).toBe("sec1");
  });

  it("keeps a host application's customData", () => {
    const [projected] = toEditorElements(
      documentImage({ customData: { "app.example": 7 } }),
    );
    const [folded] = fromEditorElements([projected] as never);

    expect((folded.customData as Record<string, unknown>)["app.example"]).toBe(
      7,
    );
  });
});
