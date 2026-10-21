/**
 * Capturing a selection as a template fragment, and placing one back.
 *
 * ## What a fragment is
 *
 * The selection, plus the parts that cannot meaningfully be left behind:
 * every descendant of a selected frame (recursively — a frame's contents are
 * what the frame *is*), and the bound text of every included container
 * (a rectangle without its label is not what the author saved). Groups are
 * already fully selected by the editor's selection model, so they need no
 * special handling here. Comments, records, board settings, theme, grid and
 * view state are deliberately not captured: a template is drawn content,
 * not a slice of the board's state ([`ADR-0038`] §4).
 *
 * ## Self-containment
 *
 * A fragment must still make sense after the source board is gone. An
 * element whose frame was not part of the selection is captured *without*
 * frame membership — keeping a dangling `frameId` would make the inserted
 * copy belong to a frame that is not there. Arrow bindings to elements
 * outside the selection are left alone here and dropped by the identity
 * remap at insert time, which is the one place that knows the whole
 * fragment. Image binaries are copied into the fragment itself: the board's
 * file store deletes file ids that the *current* board does not reference,
 * so a template that merely pointed at them would lose its images the next
 * time another board opened.
 *
 * [`ADR-0038`]: ../../../docs/adr/0038-templates-are-content.md
 */

import type { ExcalidrawElement } from "@firo/element/types";
import type { BinaryFiles } from "@firo/editor/types";

import type { TemplateFileRecord } from "./templateStore";

export interface CapturedFragment {
  /** Scene order preserved: z-order is part of what the author saved. */
  elements: readonly ExcalidrawElement[];
  /** The image binaries the fragment references, keyed by editor file id. */
  files: Record<string, TemplateFileRecord>;
}

export type CaptureResult =
  | { ok: true; fragment: CapturedFragment }
  | { ok: false; reason: "empty-selection" | "missing-image-data" };

interface CaptureInput {
  /** The scene's non-deleted elements. */
  elements: readonly ExcalidrawElement[];
  selectedElementIds: Readonly<Record<string, true>>;
  /** The editor's runtime files (`excalidrawAPI.getFiles()`). */
  files: BinaryFiles;
}

/**
 * Snapshot the current selection as a self-contained fragment.
 *
 * The snapshot is taken when the caller asks — the save dialog captures on
 * open, so remote edits while it is open cannot change what will be saved.
 */
export const captureTemplateFragment = ({
  elements,
  selectedElementIds,
  files,
}: CaptureInput): CaptureResult => {
  const live = elements.filter((element) => !element.isDeleted);
  const selected = live.filter((element) => selectedElementIds[element.id]);
  if (selected.length === 0) {
    return { ok: false, reason: "empty-selection" };
  }

  const included = new Map<string, ExcalidrawElement>();
  for (const element of selected) {
    included.set(element.id, element);
  }

  // Frame descendants, recursively: scanning to a fixpoint covers frames
  // nested inside frames without a depth counter.
  let grew = true;
  while (grew) {
    grew = false;
    for (const element of live) {
      if (
        !included.has(element.id) &&
        element.frameId &&
        included.has(element.frameId)
      ) {
        included.set(element.id, element);
        grew = true;
      }
    }
  }

  // The bound text of every included container. `boundElements` is the
  // container's own record of the relationship, so it is the authority;
  // the text's `containerId` back-reference is checked by the editor on
  // restore and is not needed to find the text.
  for (const element of live) {
    if (included.has(element.id)) {
      continue;
    }
    if (element.type !== "text" || !element.containerId) {
      continue;
    }
    if (included.has(element.containerId)) {
      included.set(element.id, element);
    }
  }

  // Strip frame membership that points outside the fragment.
  const fragmentElements: ExcalidrawElement[] = [];
  for (const element of live) {
    if (!included.has(element.id)) {
      continue;
    }
    if (element.frameId && !included.has(element.frameId)) {
      fragmentElements.push({ ...element, frameId: null });
    } else {
      fragmentElements.push(element);
    }
  }

  // Embed the image binaries the fragment references. A selected image
  // whose binary is missing fails the whole save: a template is never
  // written with a broken image.
  const fragmentFiles: Record<string, TemplateFileRecord> = {};
  for (const element of fragmentElements) {
    if (element.type !== "image" || !element.fileId) {
      continue;
    }
    const file = files[element.fileId];
    if (!file || typeof file.dataURL !== "string" || !file.dataURL) {
      return { ok: false, reason: "missing-image-data" };
    }
    fragmentFiles[element.fileId] = {
      dataURL: file.dataURL,
      mimeType: file.mimeType,
      created: file.created,
    };
  }

  return {
    ok: true,
    fragment: { elements: fragmentElements, files: fragmentFiles },
  };
};

/**
 * The translation that puts a fragment's bounding-box centre at the
 * viewport's centre — the existing placement rule for inserted content.
 */
export const fragmentPlacementDelta = (
  elements: readonly Pick<ExcalidrawElement, "x" | "y" | "width" | "height">[],
  viewportCenterX: number,
  viewportCenterY: number,
): { dx: number; dy: number } | null => {
  if (elements.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const element of elements) {
    minX = Math.min(minX, element.x);
    minY = Math.min(minY, element.y);
    maxX = Math.max(maxX, element.x + element.width);
    maxY = Math.max(maxY, element.y + element.height);
  }
  return {
    dx: viewportCenterX - (minX + (maxX - minX) / 2),
    dy: viewportCenterY - (minY + (maxY - minY) / 2),
  };
};

/**
 * The ids to select after an insert: the top-level elements, not bound text
 * and not frame children. A single inserted frame selects the frame, which
 * this rule produces on its own.
 */
export const insertedSelectionIds = (
  elements: readonly ExcalidrawElement[],
): Record<string, true> => {
  const ids: Record<string, true> = {};
  for (const element of elements) {
    if (element.isDeleted) {
      continue;
    }
    if (element.frameId) {
      continue;
    }
    if (element.type === "text" && element.containerId) {
      continue;
    }
    ids[element.id] = true;
  }
  return ids;
};
