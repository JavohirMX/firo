import React, { useEffect, useState } from "react";
import {
  useApp,
  useExcalidrawActionManager,
  useExcalidrawSetAppState,
  useFocusTrap,
} from "@firo/editor";
import { capitalizeString, MIRO_STICKY_NOTE_COLORS } from "@firo/common";

import {
  applyStickyOption,
  STICKY_NOTE_SIZE_PRESETS,
  STICKY_SIZE_PRESET_KEYS,
  type StickySizePresetKey,
} from "../board/stickyNoteOptions";

import "./StickyNoteOptionsDialog.scss";

export interface StickyNoteOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBulkSticky: () => void;
}

/**
 * Sticky note options for touch: the desktop rail carries them in a flyout
 * off the sticky slot, but the creation rail does not render on phones, so
 * colour, size and bulk create had no touch route at all. This dialog shows
 * the same three groups and applies every choice through `applyStickyOption`,
 * the exact code path the rail's flyout uses — one place to fix, not two.
 *
 * Mounted inside the editor tree so the same hooks the rail uses are in
 * scope. The values it shows are the tool defaults for the *next* note.
 */
export const StickyNoteOptionsDialog: React.FC<
  StickyNoteOptionsDialogProps
> = ({ isOpen, onClose, onOpenBulkSticky }) => {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);
  const app = useApp();
  const actionManager = useExcalidrawActionManager();
  const setAppState = useExcalidrawSetAppState();

  // `useApp` hands over the App instance, not a subscription, so echo the two
  // values this dialog reads locally; re-snapshotted every time it opens.
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<StickySizePresetKey>("m");
  useEffect(() => {
    if (isOpen) {
      setSelectedColor(app.state.currentItemStickynoteBackgroundColor);
      setSelectedSize(
        (app.state.currentItemStickynoteSize as StickySizePresetKey) || "m",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot on open only
  }, [isOpen]);

  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    // Capture phase: the editor's own Escape handlers (tool switching) must
    // not fire while the dialog is open.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const pick = (option: { id: string; color?: string }) => {
    applyStickyOption(option, {
      actionManager,
      setAppState,
      app,
      onOpenBulkSticky: () => {
        onCloseRef.current();
        onOpenBulkSticky();
      },
    });
    if (option.color) {
      setSelectedColor(option.color);
    } else if (option.id.startsWith("size-")) {
      setSelectedSize(option.id.slice("size-".length) as StickySizePresetKey);
    }
  };

  return (
    <div
      className="firo-sticky-options__overlay"
      onClick={onClose}
      data-testid="sticky-options-overlay"
    >
      <div
        ref={focusTrapRef}
        className="firo-sticky-options"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sticky-options-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="sticky-options-dialog"
      >
        <h2 id="sticky-options-title" className="firo-sticky-options__title">
          Sticky note options
        </h2>
        <h3 className="firo-sticky-options__heading">Colour</h3>
        <div
          className="firo-sticky-options__swatches"
          role="group"
          aria-label="Sticky note colour"
        >
          {Object.entries(MIRO_STICKY_NOTE_COLORS).map(([name, color]) => (
            <button
              key={name}
              type="button"
              className="firo-sticky-options__swatch"
              style={{ backgroundColor: color }}
              aria-label={capitalizeString(
                name.replace(/([A-Z])/g, " $1").toLowerCase(),
              )}
              aria-pressed={selectedColor === color}
              onClick={() => pick({ id: `colour-${name}`, color })}
            />
          ))}
        </div>
        <h3 className="firo-sticky-options__heading">Size</h3>
        <div
          className="firo-sticky-options__sizes"
          role="radiogroup"
          aria-label="Sticky note size"
        >
          {STICKY_SIZE_PRESET_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selectedSize === key}
              className="firo-sticky-options__size"
              onClick={() => pick({ id: `size-${key}` })}
            >
              {`${key.toUpperCase()} — ${STICKY_NOTE_SIZE_PRESETS[key]} px`}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="firo-sticky-options__bulk"
          onClick={() => pick({ id: "bulk-create" })}
        >
          Bulk create…
        </button>
      </div>
    </div>
  );
};
