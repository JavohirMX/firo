import {
  CaptureUpdateAction,
  isStickyNoteElement,
  updateStickyNoteLayout,
} from "@firo/element";

import type {
  ExcalidrawElement,
  ExcalidrawStickyNoteElement,
} from "@firo/element/types";

import { getSelectedElements } from "../scene";

import { register } from "./register";

/**
 * The three sticky-note presets. The numbers are Firo's, chosen in
 * [`ADR-0040`](../../../docs/adr/0040-formats-are-record-views.md): M is the
 * existing 250 px default, so a fresh note does not move.
 *
 * These are geometry, not a stored field: a preset sets `width`, `height` and
 * `baseHeight` in one element mutation, and a later resize is just another
 * geometry edit. No migration is owed.
 */
export const STICKY_NOTE_SIZE_PRESETS = {
  s: 180,
  m: 250,
  l: 340,
} as const;

export type StickyNoteSizePreset = keyof typeof STICKY_NOTE_SIZE_PRESETS;

export type StickyNoteSizeLabel = "S" | "M" | "L" | "—";

const PRESET_KEYS = Object.keys(
  STICKY_NOTE_SIZE_PRESETS,
) as StickyNoteSizePreset[];

/**
 * Which preset a note currently matches, or `null` when it has been resized to
 * something else. Width and the *base* height both have to match: a note whose
 * text made it grow is still M, because the user's chosen height is `baseHeight`
 * and `height` is the content-driven result.
 */
export const getStickyNoteSizePreset = (
  note: Pick<ExcalidrawStickyNoteElement, "width" | "height" | "baseHeight">,
): StickyNoteSizePreset | null => {
  const baseHeight = note.baseHeight || note.height;
  if (Math.abs(note.width - baseHeight) > 1) {
    return null;
  }
  return (
    PRESET_KEYS.find(
      (key) => Math.abs(baseHeight - STICKY_NOTE_SIZE_PRESETS[key]) <= 1,
    ) ?? null
  );
};

/**
 * The label the selection lane shows for a selection: a letter when every
 * selected note agrees on a preset, an em dash when they do not, and `null`
 * when the selection is not all sticky notes (so the control is absent).
 */
export const getSelectionStickyNoteSize = (
  elements: readonly ExcalidrawElement[],
): StickyNoteSizeLabel | null => {
  if (!elements.length || !elements.every(isStickyNoteElement)) {
    return null;
  }
  const presets = elements.map(getStickyNoteSizePreset);
  const [first] = presets;
  return first && presets.every((preset) => preset === first)
    ? (first.toUpperCase() as StickyNoteSizeLabel)
    : "—";
};

/**
 * Apply one preset to every selected sticky note.
 *
 * The mutation goes through `updateStickyNoteLayout`, the same geometry engine
 * a resize uses, so the label is re-wrapped and the font refitted instead of
 * the text being clipped. `simultaneouslyUpdated` tells the bound-arrow pass
 * that the notes moved together, not one after another.
 *
 * The whole loop is one action result, so undo restores every note in one step.
 */
export const actionChangeStickyNoteSize = register<StickyNoteSizePreset>({
  name: "changeStickyNoteSize",
  label: "labels.stickyNoteSize",
  trackEvent: { category: "element", action: "changeStickyNoteSize" },
  predicate: (elements, appState) => {
    const selected = getSelectedElements(elements, appState);
    return (
      selected.length > 0 &&
      selected.every((el) => isStickyNoteElement(el) && !el.locked)
    );
  },
  perform: (elements, appState, preset, app) => {
    if (!preset || !(preset in STICKY_NOTE_SIZE_PRESETS)) {
      return { elements, appState, captureUpdate: CaptureUpdateAction.NEVER };
    }
    const side = STICKY_NOTE_SIZE_PRESETS[preset];

    const notes = app.scene
      .getSelectedElements(appState)
      .filter(isStickyNoteElement)
      .filter((note) => !note.locked);

    if (!notes.length) {
      return { elements, appState, captureUpdate: CaptureUpdateAction.NEVER };
    }

    for (const note of notes) {
      // `getStickyNoteLayout` derives the base width from the container, so the
      // width has to land before the layout pass; the engine then sets
      // `baseHeight`, `height` and the label in one go.
      app.scene.mutateElement(note, { width: side });
      updateStickyNoteLayout(note, app.scene, {
        baseHeight: side,
        bindings: { simultaneouslyUpdated: notes },
      });
    }

    return {
      elements,
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});
