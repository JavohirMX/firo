/**
 * The frames panel's document logic (parity matrix row 26).
 *
 * Frames already exist as first-class elements — the presentation mode
 * navigates between them — but the board had no place to *see* them: no
 * list, no order, no per-frame action short of finding one on the canvas.
 * This module is that list's logic, kept pure so the panel component is
 * only its surface (the same split as VotingPanel over `@firo/facilitation`).
 *
 * ## Order
 *
 * The list order is the document's element order, which is also the order
 * `getPresentation` walks when stepping slides. One order for both surfaces
 * means a facilitator never watches the panel and the presenter disagree
 * about which frame is next.
 */

import type { FiroElement, FrameElement } from "@firo/schema";

/** One row of the frames panel. */
export interface FrameRow {
  readonly id: string;
  /** The frame's own name, or null when it was never given one. */
  readonly name: string | null;
  /** 1-based position in document order, stable for the current list. */
  readonly position: number;
}

const isLiveFrame = (element: FiroElement): element is FrameElement =>
  element.type === "frame" && !element.isDeleted;

/**
 * The board's frames in document order. Deleted and non-frame elements are
 * skipped; positions are assigned after filtering so the numbers the panel
 * shows have no gaps.
 */
export const listFrames = (elements: readonly FiroElement[]): FrameRow[] =>
  elements.filter(isLiveFrame).map((frame, index) => ({
    id: frame.id,
    name: frame.name,
    position: index + 1,
  }));

/**
 * Returns a new element array with the named frame renamed, or the same
 * array reference when the id is not a live frame — callers pass the result
 * straight to `updateScene`, and a no-op must not create an undo step.
 * `null` clears the name back to the canvas default ("Frame N").
 */
export const renameFrame = (
  elements: readonly FiroElement[],
  frameId: string,
  name: string | null,
): FiroElement[] => {
  const target = elements.find(
    (element) => element.id === frameId && isLiveFrame(element),
  );
  if (!target) {
    return elements as FiroElement[];
  }
  return elements.map((element) =>
    element.id === frameId ? { ...element, name } : element,
  );
};

/**
 * Returns a new element array with the frame soft-deleted — the same
 * `isDeleted` convention the rest of the board uses, so undo, sync, and the
 * presentation walker all treat it as gone without a special case. Same
 * no-op contract as `renameFrame`.
 */
export const deleteFrame = (
  elements: readonly FiroElement[],
  frameId: string,
): FiroElement[] => {
  const target = elements.find(
    (element) => element.id === frameId && isLiveFrame(element),
  );
  if (!target) {
    return elements as FiroElement[];
  }
  return elements.map((element) =>
    element.id === frameId ? { ...element, isDeleted: true } : element,
  );
};

/** Display label: the frame's name, or the canvas default for unnamed ones. */
export const frameLabel = (row: FrameRow): string =>
  row.name ?? `Frame ${row.position}`;
