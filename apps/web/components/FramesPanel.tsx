/**
 * The frames panel (parity matrix row 26): the board's frames as a list —
 * order, a name, and the actions a frame earns (jump to it, rename it,
 * remove it). The list logic lives in `board/frames.ts`; this component is
 * only its surface, docked in the same right-hand slot as the voting panel.
 *
 * Empty state says how a frame is made rather than showing a dead panel:
 * the frame tool on the toolbar is the only entry today.
 */

import React, { useEffect, useMemo, useState } from "react";

import { CaptureUpdateAction } from "@firo/editor";

import { SidePanel } from "@firo/ui";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import { boardDoc } from "../board/board";
import {
  deleteFrame,
  frameLabel,
  listFrames,
  renameFrame,
} from "../board/frames";
import { focusFrame, getPresentation } from "../board/presentation";
import { canDriveSession, subscribeToFacilitation } from "../board/facilitator";

import "./FramesPanel.scss";

export const FramesPanel = ({
  isOpen,
  onClose,
  excalidrawAPI,
  readOnlyRole = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  readOnlyRole?: string | null;
}) => {
  // Bumped after every mutation so the memo re-reads the document; the
  // document itself does not announce element edits to React.
  const [revision, setRevision] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const mayEdit = readOnlyRole !== "viewer" && readOnlyRole !== "commenter";
  useEffect(() => {
    if (!mayEdit) {
      setEditingId(null);
    }
  }, [mayEdit]);
  const [presentation, setPresentation] = useState(() =>
    getPresentation(boardDoc),
  );
  useEffect(() => {
    const refresh = () => setPresentation(getPresentation(boardDoc));
    refresh();
    return subscribeToFacilitation(boardDoc, refresh);
  }, []);
  const activeFrameId = presentation.active
    ? presentation.slideIds[presentation.index]
    : undefined;

  // The document absorbs scene changes asynchronously (a delete committed
  // through updateScene is not in `read()` on the same tick), so a manual
  // bump alone can render one stale list and then never refresh. Subscribing
  // is what the voting panel and the vote badges do; the revision bump stays
  // as the same-tick fast path.
  useEffect(() => boardDoc().subscribe(() => setRevision((n) => n + 1)), []);

  const rows = useMemo(
    () => listFrames(boardDoc().read().elements),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, isOpen],
  );

  if (!isOpen) {
    return null;
  }

  const applyElements = (elements: ReturnType<typeof deleteFrame>) => {
    if (!mayEdit || !canDriveSession()) {
      return;
    }
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
    if (!mayEdit || !canDriveSession()) {
      setEditingId(null);
      return;
    }
    const name = draftName.trim();
    applyElements(renameFrame(boardDoc().read().elements, id, name || null));
    setEditingId(null);
  };

  return (
    // The dock shell (ADR-0035 section 1) owns the landmark, the geometry,
    // the header and the close control; this component is only the list.
    <SidePanel title="Frames" onClose={onClose} closeLabel="Close frames panel">
      {rows.length === 0 ? (
        <p className="frames-panel__empty">
          No frames yet. Pick the frame tool on the toolbar and drag one out.
        </p>
      ) : (
        <ol className="frames-panel__list">
          {rows.map((row) => (
            <li key={row.id} className="frames-panel__row">
              {mayEdit && editingId === row.id ? (
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
                  aria-current={row.id === activeFrameId ? "step" : undefined}
                  onClick={() =>
                    excalidrawAPI && focusFrame(excalidrawAPI, boardDoc, row.id)
                  }
                >
                  <span className="frames-panel__position">{row.position}</span>
                  {frameLabel(row)}
                  {row.id === activeFrameId && (
                    <span className="frames-panel__current">Presenting</span>
                  )}
                </button>
              )}
              {mayEdit && (
                <button
                  type="button"
                  className="frames-panel__action"
                  aria-label={`Rename ${frameLabel(row)}`}
                  onClick={() => {
                    if (!canDriveSession()) {
                      return;
                    }
                    setEditingId(row.id);
                    setDraftName(row.name ?? "");
                  }}
                >
                  ✎
                </button>
              )}
              {mayEdit && (
                <button
                  type="button"
                  className="frames-panel__action"
                  aria-label={`Delete ${frameLabel(row)}`}
                  onClick={() => {
                    if (!canDriveSession()) {
                      return;
                    }
                    applyElements(
                      deleteFrame(boardDoc().read().elements, row.id),
                    );
                  }}
                >
                  🗑
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </SidePanel>
  );
};
