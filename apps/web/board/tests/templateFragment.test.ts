/*
 * Fragment capture and placement.
 *
 * ## What is actually at stake
 *
 * The capture decides what "the same thing I selected" means a month later
 * on a different board. Get it wrong in either direction and the template is
 * a lie: leave a frame's children behind and the saved frame inserts empty;
 * keep a `frameId` that points off the fragment and the inserted copy is
 * claimed by a frame that is not there; skip the image binary and the card
 * previews and inserts a broken image the day the source board is cleaned
 * up.
 */

import type { ExcalidrawElement } from "@firo/element/types";

import {
  captureTemplateFragment,
  fragmentPlacementDelta,
  insertedSelectionIds,
} from "../templateFragment";

const el = (
  partial: Partial<ExcalidrawElement> & { id: string },
): ExcalidrawElement =>
  ({
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    isDeleted: false,
    frameId: null,
    groupIds: [],
    ...partial,
  } as ExcalidrawElement);

const imageFile = {
  dataURL: "data:image/png;base64,AAAA",
  mimeType: "image/png" as const,
  created: 1,
  id: "file-1",
  lastRetrieved: 1,
};

describe("captureTemplateFragment", () => {
  it("fails an empty selection", () => {
    const result = captureTemplateFragment({
      elements: [el({ id: "a" })],
      selectedElementIds: {},
      files: {},
    });
    expect(result).toEqual({ ok: false, reason: "empty-selection" });
  });

  it("captures the selection and nothing else", () => {
    const result = captureTemplateFragment({
      elements: [el({ id: "a" }), el({ id: "b" })],
      selectedElementIds: { a: true },
      files: {},
    });
    expect(result.ok && result.fragment.elements.map((e) => e.id)).toEqual([
      "a",
    ]);
  });

  it("captures frame descendants recursively", () => {
    const result = captureTemplateFragment({
      elements: [
        el({ id: "frame", type: "frame" }),
        el({ id: "inner-frame", type: "frame", frameId: "frame" }),
        el({ id: "child", frameId: "inner-frame" }),
        el({ id: "outsider" }),
      ],
      selectedElementIds: { frame: true },
      files: {},
    });
    expect(
      result.ok && result.fragment.elements.map((e) => e.id).sort(),
    ).toEqual(["child", "frame", "inner-frame"]);
  });

  it("captures the bound text of an included container", () => {
    const result = captureTemplateFragment({
      elements: [
        el({ id: "box" }),
        el({ id: "label", type: "text", containerId: "box" }),
        el({ id: "loose-text", type: "text" }),
      ],
      selectedElementIds: { box: true },
      files: {},
    });
    expect(
      result.ok && result.fragment.elements.map((e) => e.id).sort(),
    ).toEqual(["box", "label"]);
  });

  it("strips frame membership that points outside the fragment", () => {
    const result = captureTemplateFragment({
      elements: [
        el({ id: "frame", type: "frame" }),
        el({ id: "child", frameId: "frame" }),
      ],
      selectedElementIds: { child: true },
      files: {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fragment.elements[0].id).toBe("child");
      expect(result.fragment.elements[0].frameId).toBeNull();
    }
  });

  it("ignores deleted elements even when selected", () => {
    const result = captureTemplateFragment({
      elements: [el({ id: "a", isDeleted: true }), el({ id: "b" })],
      selectedElementIds: { a: true, b: true },
      files: {},
    });
    expect(result.ok && result.fragment.elements.map((e) => e.id)).toEqual([
      "b",
    ]);
  });

  it("embeds the binaries of referenced images", () => {
    const result = captureTemplateFragment({
      elements: [el({ id: "pic", type: "image", fileId: "file-1" as never })],
      selectedElementIds: { pic: true },
      files: { "file-1": imageFile } as never,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fragment.files["file-1"]).toEqual({
        dataURL: imageFile.dataURL,
        mimeType: imageFile.mimeType,
        created: imageFile.created,
      });
    }
  });

  it("fails the save when a referenced image binary is missing", () => {
    const result = captureTemplateFragment({
      elements: [el({ id: "pic", type: "image", fileId: "file-1" as never })],
      selectedElementIds: { pic: true },
      files: {},
    });
    expect(result).toEqual({ ok: false, reason: "missing-image-data" });
  });
});

describe("fragmentPlacementDelta", () => {
  it("centres the bounding box on the viewport centre", () => {
    const delta = fragmentPlacementDelta(
      [el({ id: "a", x: 0, y: 0, width: 100, height: 50 })],
      500,
      400,
    );
    expect(delta).toEqual({ dx: 450, dy: 375 });
  });

  it("returns null for an empty fragment", () => {
    expect(fragmentPlacementDelta([], 0, 0)).toBeNull();
  });
});

describe("insertedSelectionIds", () => {
  it("selects top-level elements only", () => {
    const ids = insertedSelectionIds([
      el({ id: "frame", type: "frame" }),
      el({ id: "child", frameId: "frame" }),
      el({ id: "box" }),
      el({ id: "label", type: "text", containerId: "box" }),
      el({ id: "loose", type: "text" }),
    ]);
    expect(Object.keys(ids).sort()).toEqual(["box", "frame", "loose"]);
  });
});
