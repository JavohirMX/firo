import { STICKY_NOTE_SIZE_PRESETS } from "@firo/editor";
import { getSelectedElements, isStickyNoteElement } from "@firo/element";

import type {
  useApp,
  useExcalidrawActionManager,
  useExcalidrawSetAppState,
} from "@firo/editor";

export const STICKY_SIZE_PRESET_KEYS = ["s", "m", "l"] as const;

export type StickySizePresetKey = typeof STICKY_SIZE_PRESET_KEYS[number];

export { STICKY_NOTE_SIZE_PRESETS };

/**
 * The three things the sticky tool's options can change, shared by the
 * desktop rail flyout and the mobile options dialog so the two surfaces can
 * never drift: each picks the same colour through the same action, sets the
 * same size default (and resizes selected stickies through the selection
 * toolbar's own action), and opens the same bulk dialog.
 */

export interface StickyOptionChoice {
  id: string;
  /** Present on colour swatches. */
  color?: string;
}

export interface StickyOptionDeps {
  actionManager: ReturnType<typeof useExcalidrawActionManager>;
  setAppState: ReturnType<typeof useExcalidrawSetAppState>;
  app: ReturnType<typeof useApp>;
  onOpenBulkSticky?: () => void;
  onCreateStickyStack?: () => void;
}

/**
 * Apply one options choice. Returns true when the choice was consumed; an
 * unknown id leaves everything untouched, matching the rail's previous
 * early-returns.
 */
export const applyStickyOption = (
  option: StickyOptionChoice,
  {
    actionManager,
    setAppState,
    app,
    onOpenBulkSticky,
    onCreateStickyStack,
  }: StickyOptionDeps,
): boolean => {
  if (option.color) {
    // The picker writes the sticky domain's default, which is exactly what a
    // sticky placed next will read (`changeBackgroundColor` resolves the
    // domain from the active tool). ADR-0031 row 19.
    actionManager.executeAction(
      actionManager.actions.changeBackgroundColor,
      "ui",
      { color: option.color },
    );
    return true;
  }
  if (option.id === "stack-create") {
    onCreateStickyStack?.();
    return true;
  }
  if (option.id === "bulk-create") {
    onOpenBulkSticky?.();
    return true;
  }
  if (option.id.startsWith("size-")) {
    const key = option.id.slice("size-".length);
    if (!STICKY_SIZE_PRESET_KEYS.includes(key as never)) {
      return false;
    }
    // Always the default for the next note…
    setAppState({
      currentItemStickynoteSize: key as StickySizePresetKey,
    });
    // …and, when sticky notes are selected, their size too — the same preset
    // through the same action the selection toolbar uses, so the two paths
    // cannot drift (one undo step, layout refit).
    const selectedStickies = getSelectedElements(
      app.scene.getNonDeletedElements(),
      app.state,
    ).filter(isStickyNoteElement);
    if (
      selectedStickies.length > 0 &&
      actionManager.actions.changeStickyNoteSize
    ) {
      actionManager.executeAction(
        actionManager.actions.changeStickyNoteSize,
        "ui",
        key,
      );
    }
    return true;
  }
  return false;
};
