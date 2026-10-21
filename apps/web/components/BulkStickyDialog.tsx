import React, { useEffect, useState } from "react";
import { useFocusTrap } from "@firo/editor";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import {
  BULK_STICKY_LIMIT,
  createBulkStickyNotes,
  parseBulkStickyLines,
} from "../board/stickyBulk";

import "./BulkStickyDialog.scss";

export interface BulkStickyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

/**
 * Bulk sticky creation: one line of text, one note.
 *
 * Parity matrix row 20 (Miro's sticky flyout carries "Bulk mode"). The parse
 * and the layout live in `board/stickyBulk.ts` and are tested there; this
 * component is the keystroke surface over them.
 *
 * ## Why create-and-select, not create-and-fit
 *
 * After the batch lands, the notes are selected so the facilitator can move
 * or recolour the whole batch at once. The view deliberately does not jump:
 * the grid is already centred on what they were looking at, so a fit would
 * only add motion.
 */
export const BulkStickyDialog: React.FC<BulkStickyDialogProps> = ({
  isOpen,
  onClose,
  excalidrawAPI,
}) => {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);
  const [text, setText] = useState("");

  useEffect(() => {
    if (isOpen) {
      setText("");
    }
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

  const parsed = parseBulkStickyLines(text);
  const count = parsed.lines.length;

  const create = () => {
    if (!excalidrawAPI || count === 0) {
      return;
    }
    createBulkStickyNotes(excalidrawAPI, parsed.lines);
    onCloseRef.current();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="firo-bulk-sticky__overlay"
      onClick={onClose}
      data-testid="bulk-sticky-overlay"
    >
      <div
        ref={focusTrapRef}
        className="firo-bulk-sticky"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-sticky-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="bulk-sticky-dialog"
      >
        <h2 id="bulk-sticky-title" className="firo-bulk-sticky__title">
          Bulk create sticky notes
        </h2>
        <p className="firo-bulk-sticky__hint">
          One note per line. Size and colour follow the sticky tool&apos;s
          current settings.
        </p>
        <textarea
          className="firo-bulk-sticky__input"
          rows={10}
          placeholder={"First idea\nSecond idea\nThird idea"}
          value={text}
          onChange={(event) => setText(event.target.value)}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog's only
          // job is this field; focus belongs in it.
          autoFocus
          data-testid="bulk-sticky-input"
        />
        <div className="firo-bulk-sticky__footer">
          <span
            className="firo-bulk-sticky__count"
            data-testid="bulk-sticky-count"
          >
            {count} note{count === 1 ? "" : "s"}
            {parsed.overflow > 0
              ? ` — ${parsed.overflow} over the ${BULK_STICKY_LIMIT}-note limit will be skipped`
              : ""}
          </span>
          <div className="firo-bulk-sticky__actions">
            <button
              type="button"
              className="firo-bulk-sticky__cancel"
              onClick={onClose}
              data-testid="bulk-sticky-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              className="firo-bulk-sticky__create"
              onClick={create}
              disabled={count === 0}
              data-testid="bulk-sticky-create"
            >
              Create {count > 0 ? count : ""} note{count === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkStickyDialog;
