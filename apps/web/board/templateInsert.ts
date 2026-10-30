/**
 * Putting a template fragment onto the board.
 *
 * One path for both sources ([`ADR-0038`] §5): a built-in's `build()` and a
 * saved template's payload both arrive here as editor elements plus files.
 * The saved fragment's stored ids are internal references only — inserting
 * the same template twice with its own ids would collide with the first
 * insertion in the scene — so every insert goes through the editor's
 * `duplicateElements`, which mints fresh element ids, group ids and seeds
 * and remaps containers, arrow bindings and frame membership *inside* the
 * fragment. Bindings that point outside it are dropped, which is exactly
 * what the snapshot promised at capture time.
 *
 * Files go in first: the editor renders images from its runtime file map, so
 * adding the elements before the binaries would paint broken images for a
 * frame. The insert is one `updateScene` with `IMMEDIATELY`, making it a
 * single undo step, and the top-level inserted elements are selected — not
 * bound text, not frame children.
 *
 * [`ADR-0038`]: ../../../docs/adr/0038-templates-are-content.md
 */

import { CaptureUpdateAction } from "@firo/editor";
import { restoreElements } from "@firo/editor/data/restore";
import { duplicateElements } from "@firo/element";

import type { ExcalidrawElement } from "@firo/element/types";

import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
} from "@firo/editor/types";

import {
  fragmentPlacementDelta,
  insertedSelectionIds,
} from "./templateFragment";

import type { CapturedFragment } from "./templateFragment";

export type InsertResult = { ok: true } | { ok: false; reason: "empty" };

/**
 * Restore, re-identify, place and insert a fragment. Returns rather than
 * throws: the gallery stays open on failure and inserts nothing.
 */
export const insertTemplateFragment = (
  api: ExcalidrawImperativeAPI,
  fragment: CapturedFragment,
): InsertResult => {
  if (fragment.elements.length === 0) {
    return { ok: false, reason: "empty" };
  }

  /*
   * Element-field migrations run on read through the editor's own restore
   * path, so a payload written by an older build is upgraded by the same
   * code that upgrades a pasted or imported scene.
   */
  const restored = restoreElements(
    fragment.elements as readonly ExcalidrawElement[],
    null,
    { refreshDimensions: true },
  );

  const { duplicatedElements } = duplicateElements({
    elements: restored,
    type: "everything",
    randomizeSeed: true,
  });
  if (duplicatedElements.length === 0) {
    return { ok: false, reason: "empty" };
  }

  const state = api.getAppState();
  const viewportCenterX = -state.scrollX + state.width / 2 / state.zoom.value;
  const viewportCenterY = -state.scrollY + state.height / 2 / state.zoom.value;
  const delta = fragmentPlacementDelta(
    duplicatedElements,
    viewportCenterX,
    viewportCenterY,
  );
  if (!delta) {
    return { ok: false, reason: "empty" };
  }
  const placed = duplicatedElements.map((element) => ({
    ...element,
    x: element.x + delta.dx,
    y: element.y + delta.dy,
  }));

  // Files before elements: the first paint must already have its images.
  const filesToAdd: BinaryFileData[] = Object.entries(fragment.files).map(
    ([id, file]) => ({
      id: id as BinaryFileData["id"],
      dataURL: file.dataURL as BinaryFileData["dataURL"],
      mimeType: file.mimeType as BinaryFileData["mimeType"],
      created: file.created,
      lastRetrieved: Date.now(),
    }),
  );
  if (filesToAdd.length > 0) {
    api.addFiles(filesToAdd);
  }

  api.updateScene({
    elements: [...api.getSceneElements(), ...placed],
    appState: { selectedElementIds: insertedSelectionIds(placed) },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return { ok: true };
};
