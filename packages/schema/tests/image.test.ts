/**
 * The `image` validator.
 *
 * ## The gap this type closed
 *
 * The fold in `@firo/board` skipped every editor type the document had no schema
 * for. `image` was one of them, so an image placed on a board was drawn, was saved
 * by the editor's own redundant copy, and reached neither the document, nor the
 * autosave, nor any `.firo` file. The canvas never asks the document, so nothing
 * looked wrong — which is the whole failure class this project keeps finding.
 *
 * ## What these tests are actually about
 *
 * Four fields, and each one fails *quietly* if it is wrong — the picture still
 * renders, just differently, or not at all:
 *
 * - `fileId` is a reference, not bytes. Its absence is meaningful (`null` is the
 *   renderer's pending case) and inventing an id for it would produce an element
 *   pointing at bytes that do not exist.
 * - `scale` is a *pair*, because the axes are independent: a mirrored image is
 *   `[-1, 1]` and one number could not say that.
 * - `crop` carries the natural size as well as the window, and the natural size is
 *   not derivable — the asset is keyed by hash and knows nothing about placement.
 * - `status` is inherited and describes the editor's own blob store, not the
 *   document's. It is stored because the field sets have to match (see
 *   `conformance.test.ts`), not because the document has an opinion about it.
 */
import { describe, expect, it } from "vitest";

import { migrateElement, RepairLog } from "../src/index.js";

import type { ImageElement } from "../src/index.js";

const image = (overrides: Record<string, unknown> = {}) => {
  const log = new RepairLog();
  const { element } = migrateElement(
    {
      id: "im-1",
      type: "image",
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      fileId: "a1b2c3d4e5f6",
      status: "saved",
      scale: [1, 1],
      crop: null,
      ...overrides,
    },
    log,
  );
  return { element: element as ImageElement, log };
};

describe("an image element", () => {
  it("keeps the reference to its bytes", () => {
    expect(image().element.fileId).toBe("a1b2c3d4e5f6");
  });

  it("keeps a null reference as null rather than inventing one", () => {
    // `null` is the renderer's pending case: placed on the board, file not read yet.
    // A made-up id would be an element claiming to reference bytes that do not exist,
    // which is the state the file writer refuses to export.
    expect(image({ fileId: null }).element.fileId).toBeNull();
    expect(image({ fileId: undefined }).element.fileId).toBeNull();
  });

  it("keeps both axes of `scale`, which is a pair and not a number", () => {
    // A mirrored image is [-1, 1]. A validator that read only the first component --
    // or coerced the whole thing to one -- would flip a picture that was stored the
    // right way round, and nothing would say so.
    expect(image({ scale: [-1, 1] }).element.scale).toEqual([-1, 1]);
    expect(image({ scale: [1, -1] }).element.scale).toEqual([1, -1]);
  });

  it("does not clamp `scale` into the renderer's documented range", () => {
    // The renderer's comment says <-1, 1>. A file carrying exactly 1 is not flipped,
    // and one carrying 1.0000001 from a float round trip is not corrupt either.
    // Repairing either would silently change how the picture looks, which is worse
    // than drawing what the file asked for.
    expect(image({ scale: [1, 1] }).element.scale).toEqual([1, 1]);
    expect(image({ scale: [1.0000001, 1] }).element.scale).toEqual([
      1.0000001, 1,
    ]);
  });

  it("repairs a `scale` that is not a pair", () => {
    // Identity rather than a guess. Flipping a picture by accident is not a repair.
    expect(image({ scale: 2 }).element.scale).toEqual([1, 1]);
    expect(image({ scale: [1] }).element.scale).toEqual([1, 1]);
  });

  it("drops a third component on `scale`", () => {
    // Nothing reads it, so keeping it means files accumulate numbers that look
    // meaningful and are not. Same rule as a third component on a point.
    expect(image({ scale: [1, 1, 0.5] }).element.scale).toEqual([1, 1]);
  });

  it("keeps a crop, including the natural size", () => {
    // The natural size is the part that looks derivable and is not. The asset is
    // addressed by hash and knows nothing about how it was placed, so without these
    // two numbers a cropped image cannot be re-cropped to a different window after a
    // reload without decoding the original first.
    const crop = {
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      naturalWidth: 640,
      naturalHeight: 480,
    };
    expect(image({ crop }).element.crop).toEqual(crop);
  });

  it("drops a partial crop whole rather than filling in the gaps", () => {
    // A crop with no `naturalWidth` is not a crop with a default natural width; it is
    // a window that cannot be expressed against any image. Dropping the whole crop
    // leaves an uncropped picture that draws correctly, where filling it in would
    // crop to the wrong place with nothing in the file to say so.
    const { element, log } = image({
      crop: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(element.crop).toBeNull();
    expect(log.hasRepairs).toBe(true);
  });

  it("keeps a null crop as null", () => {
    // The ordinary case: most images are not cropped, and `null` says so.
    expect(image({ crop: null }).element.crop).toBeNull();
  });

  it("keeps all three statuses", () => {
    // The union is a switch the renderer branches on, and coercing everything to one
    // value would make a slow-loading image either never appear or appear as a
    // permanent error.
    for (const status of ["pending", "saved", "error"] as const) {
      expect(image({ status }).element.status).toBe(status);
    }
  });

  it("repairs an unreadable status", () => {
    // Defaulted to `saved`, which is the renderer's own notion of "the file is here
    // and needs no waiting". Anything else would make a healthy image look pending
    // forever.
    expect(image({ status: "uploading" }).element.status).toBe("saved");
  });

  it("defaults the background to transparent, not to the shape default", () => {
    // Not a style anyone picks, and not the same as a shape's. An opaque fill behind
    // an image draws a visible rectangle around the picture's own edges.
    expect(image().element.backgroundColor).toBe("transparent");
  });

  it("keeps the width and height of the box positive", () => {
    // An image is resized by dragging a handle outwards and inwards alike.
    expect(image({ width: -320, height: -240 }).element.width).toBe(320);
    expect(image({ width: -320, height: -240 }).element.height).toBe(240);
  });

  it("preserves a field it does not recognise", () => {
    // Migration rule 1: `link`, `locked` and `customData` all round-trip, and so does
    // anything a host application added.
    const { element } = image({ hostOnly: { attribution: "Ada" } });
    expect((element as { hostOnly?: unknown }).hostOnly).toEqual({
      attribution: "Ada",
    });
  });

  it("round-trips through the file format unchanged", () => {
    // A cropped, mirrored, named-status image, because the interesting cases are the
    // ones with something set on every field.
    const original = image({
      scale: [-1, 1],
      status: "pending",
      crop: {
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        naturalWidth: 5,
        naturalHeight: 6,
      },
    }).element;

    const reloaded = migrateElement(
      JSON.parse(JSON.stringify(original)) as Record<string, unknown>,
      new RepairLog(),
    ).element as ImageElement;

    expect(reloaded).toEqual(original);
  });

  it("round-trips an image with no file and no crop", () => {
    // The pending case, which is the one most likely to be normalised away by a
    // writer that assumes every field is present.
    const original = image({ fileId: null, crop: null }).element;
    const reloaded = migrateElement(
      JSON.parse(JSON.stringify(original)) as Record<string, unknown>,
      new RepairLog(),
    ).element as ImageElement;

    expect(reloaded).toEqual(original);
    expect(reloaded.fileId).toBeNull();
  });
});
