/**
 * The frames panel (parity matrix row 26): the board's frames as a list —
 * order, a name, and the actions a frame earns (jump to it, rename it,
 * remove it). The list logic lives in `board/frames.ts`; this component is
 * only its surface, docked in the same right-hand slot as the voting panel.
 *
 * Empty state says how a frame is made rather than showing a dead panel:
 * the frame tool on the toolbar is the only entry today.
 */

import React, { useMemo, useState } from "react";

import { CaptureUpdateAction } from "@firo/editor";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import { boardDoc } from "../board/board";
import {
  deleteFrame,
  frameLabel,
  listFrames,
  renameFrame,
} from "../board/frames";
import { focusFrame } from "../board/presentation";

import "./FramesPanel.scss";

export const FramesPanel = ({
  isOpen,
  onClose,
  excalidrawAPI,
}: {
  isOpen: boolean;
  onClose: () => void;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}) => {
  // Bumped after every mutation so the memo re-reads the document; the
  // document itself does not announce element edits to React.
  const [revision, setRevision] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const rows = useMemo(
    () => listFrames(boardDoc().read().elements),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, isOpen],
  );

  if (!isOpen) {
    return null;
  }

  const applyElements = (elements: ReturnType<typeof deleteFrame>) => {
    excalidrawAPI?.updateScene({
      // The document holds schema FiroElements; the scene takes the editor's
      // ExcalidrawElement. Same bridge cast the template-insert path in
      // App.tsx uses — the runtime shape is identical by construction.
      elements: elements as never,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setRevision((n) => n + 1);
  };

  const commitRename = (id: string) => {
    const name = draftName.trim();
    applyElements(renameFrame(boardDoc().read().elements, id, name || null));
    setEditingId(null);
  };

  return (
    <aside className="frames-panel" aria-label="Frames">
      <div className="frames-panel__header">
        <h2>Frames</h2>
        <button
          type="button"
          className="frames-panel__close"
          aria-label="Close frames panel"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="frames-panel__empty">
          No frames yet. Pick the frame tool on the toolbar and drag one out.
        </p>
      ) : (
        <ol className="frames-panel__list">
          {rows.map((row) => (
            <li key={row.id} className="frames-panel__row">
              {editingId === row.id ? (
                <input
                  className="frames-panel__rename"
                  aria-label="Frame name"
                  autoFocus
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={() => commitRename(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      commitRename(row.id);
                    } else if (event.key === "Escape") {
                      setEditingId(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="frames-panel__jump"
                  title="Jump to frame"
                  onClick={() =>
                    excalidrawAPI && focusFrame(excalidrawAPI, boardDoc, row.id)
                  }
                >
                  <span className="frames-panel__position">{row.position}</span>
                  {frameLabel(row)}
                </button>
              )}
              <button
                type="button"
                className="frames-panel__action"
                aria-label={`Rename ${frameLabel(row)}`}
                onClick={() => {
                  setEditingId(row.id);
                  setDraftName(row.name ?? "");
                }}
              >
                ✎
              </button>
              <button
                type="button"
                className="frames-panel__action"
                aria-label={`Delete ${frameLabel(row)}`}
                onClick={() =>
                  applyElements(deleteFrame(boardDoc().read().elements, row.id))
                }
              >
                🗑
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
};
