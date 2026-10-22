/**
 * Sticky Stack: a pile of blank notes to pull from.
 *
 * Miro's help describes the behaviour: pick Stack in the sticky flyout, place
 * it on the board, then drag stickies off the stack instead of making each
 * one from the toolbar or a shortcut. Firo's version is a pile of ordinary,
 * separate blank notes, each a little offset from the one under it. Nothing
 * is grouped, so dragging the top note moves only that note and leaves the
 * rest of the pile where it was. It lands at the middle of the current view
 * (the phone has no way to point at a spot before placing), as one undo step.
 */

import { stickyNoteSizeForKey } from "@firo/editor";
import { CaptureUpdateAction, newStickyNoteElement } from "@firo/element";

import type { ExcalidrawStickyNoteElement } from "@firo/element/types";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import { viewportCenter } from "./stickyBulk";

/** How many notes one stack holds. */
export const STICKY_STACK_COUNT = 6;

/** Offset in scene px between neighbouring notes in the pile. */
export const STICKY_STACK_STEP = 8;

/** Top-left positions for the pile, bottom note first, centred on `center`. */
export const layoutStickyStack = (
  count: number,
  size: number,
  center: { x: number; y: number },
  step: number = STICKY_STACK_STEP,
): { x: number; y: number }[] => {
  if (count <= 0 || size <= 0) {
    return [];
  }
  const spread = (count - 1) * step;
  const originX = center.x - (size + spread) / 2;
  const originY = center.y - (size + spread) / 2;
  return Array.from({ length: count }, (_, index) => ({
    x: originX + index * step,
    y: originY + index * step,
  }));
};

/**
 * Put a stack on the board and select its top note. Colour and size follow
 * the sticky tool's current defaults, the same as every other new note.
 */
export const createStickyStack = (
  api: ExcalidrawImperativeAPI,
  count: number = STICKY_STACK_COUNT,
): ExcalidrawStickyNoteElement[] => {
  const state = api.getAppState();
  const size = stickyNoteSizeForKey(state.currentItemStickynoteSize);
  const placements = layoutStickyStack(count, size, viewportCenter(api));

  const notes = placements.map(
    ({ x, y }) =>
      newStickyNoteElement({
        type: "stickynote",
        x,
        y,
        width: size,
        height: size,
        baseHeight: size,
        strokeColor: state.currentItemStickynoteStrokeColor,
        backgroundColor: state.currentItemStickynoteBackgroundColor,
        fillStyle: state.currentItemFillStyle,
        strokeWidth: 1,
        strokeStyle: state.currentItemStrokeStyle,
        roughness: state.currentItemRoughness,
        opacity: state.currentItemOpacity,
        roundness: null,
        locked: false,
        frameId: null,
      }) as ExcalidrawStickyNoteElement,
  );
  if (notes.length === 0) {
    return [];
  }

  api.updateScene({
    elements: [...api.getSceneElements(), ...notes],
    appState: { selectedElementIds: { [notes[notes.length - 1].id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return notes;
};
