import React, { useEffect } from "react";

import { CloseIcon, PlusIcon, RestoreIcon, BoardsIcon } from "../icons";

import "./ImportModal.scss";

export interface ImportFileInfo {
  name: string;
  sizeBytes: number;
  format: "firo" | "rtb" | "excalidraw" | "csv" | "json";
  elementCount?: number;
}

export interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileInfo: ImportFileInfo;
  onInsert: () => void;
  onReplace: () => void;
  onOpenNew: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFormatBadge = (
  format: ImportFileInfo["format"],
): { label: string; color: string } => {
  switch (format) {
    case "rtb":
      return { label: "Miro Backup (.rtb)", color: "#ffcb00" };
    case "firo":
      return { label: "Firo Archive (.firo)", color: "#5b4bff" };
    case "excalidraw":
      return { label: "Excalidraw (.excalidraw)", color: "#e03131" };
    case "csv":
      return { label: "Spreadsheet (.csv)", color: "#2f9e44" };
    case "json":
    default:
      return { label: "Scene JSON", color: "#1971c2" };
  }
};

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  fileInfo,
  onInsert,
  onReplace,
  onOpenNew,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const badge = getFormatBadge(fileInfo.format);

  return (
    <div
      className="firo-import-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="firo-import-modal"
        role="dialog"
        aria-label="Import Options"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="firo-import-modal__header">
          <div className="firo-import-modal__title-group">
            <h2 className="firo-import-modal__title">Import Content</h2>
            <p className="firo-import-modal__subtitle">
              Your board already has elements. Choose how to handle incoming
              content.
            </p>
          </div>
          <button
            type="button"
            className="firo-import-modal__close-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* File summary */}
        <div className="firo-import-modal__file-card">
          <div className="firo-import-modal__file-info">
            <span className="firo-import-modal__file-name">
              {fileInfo.name}
            </span>
            <div className="firo-import-modal__file-meta">
              <span
                className="firo-import-modal__format-badge"
                style={{ borderColor: badge.color, color: badge.color }}
              >
                {badge.label}
              </span>
              <span className="firo-import-modal__size">
                {formatBytes(fileInfo.sizeBytes)}
              </span>
              {typeof fileInfo.elementCount === "number" && (
                <span className="firo-import-modal__elements">
                  {fileInfo.elementCount}{" "}
                  {fileInfo.elementCount === 1 ? "element" : "elements"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="firo-import-modal__options">
          {/* Option 1: Insert */}
          <div
            className="firo-import-option-card firo-import-option-card--recommended"
            onClick={() => {
              onInsert();
              onClose();
            }}
          >
            <div className="firo-import-option-card__icon firo-import-option-card__icon--insert">
              <PlusIcon size={20} />
            </div>
            <div className="firo-import-option-card__body">
              <div className="firo-import-option-card__title-row">
                <span className="firo-import-option-card__title">
                  Insert onto current board
                </span>
                <span className="firo-import-option-card__badge">
                  Recommended
                </span>
              </div>
              <p className="firo-import-option-card__desc">
                Preserve your existing elements and add the imported elements to
                this board. IDs and connector bindings are automatically
                remapped.
              </p>
            </div>
          </div>

          {/* Option 2: Replace */}
          <div
            className="firo-import-option-card firo-import-option-card--danger"
            onClick={() => {
              onReplace();
              onClose();
            }}
          >
            <div className="firo-import-option-card__icon firo-import-option-card__icon--replace">
              <RestoreIcon size={20} />
            </div>
            <div className="firo-import-option-card__body">
              <span className="firo-import-option-card__title">
                Replace board content
              </span>
              <p className="firo-import-option-card__desc">
                Clear all existing elements and replace the board with the
                contents of this file.
              </p>
            </div>
          </div>

          {/* Option 3: Open as new board */}
          <div
            className="firo-import-option-card"
            onClick={() => {
              onOpenNew();
              onClose();
            }}
          >
            <div className="firo-import-option-card__icon firo-import-option-card__icon--new">
              <BoardsIcon size={20} />
            </div>
            <div className="firo-import-option-card__body">
              <span className="firo-import-option-card__title">
                Open as new board
              </span>
              <p className="firo-import-option-card__desc">
                Create a new board in your library and leave this current board
                completely untouched.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="firo-import-modal__footer">
          <button
            type="button"
            className="firo-import-modal__cancel-btn"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
