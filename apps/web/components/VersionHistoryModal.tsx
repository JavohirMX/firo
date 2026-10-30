import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  CloseIcon,
  RestoreIcon,
  DownloadIcon,
  ClockIcon,
  CheckIcon,
  PlusIcon,
} from "@firo/ui";

import type { FiroDoc } from "@firo/doc";

import {
  getBoardRevisions,
  restoreBoardRevision,
  saveBoardRevision,
  isStoragePersisted,
  getStorageEstimate,
  type BoardRevision,
  getActiveBoardId,
} from "../board/storage";
import { boardDoc, refreshBoard } from "../board/board";

import "./VersionHistoryModal.scss";

export interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
  doc?: FiroDoc;
  collabStatus?: string | null;
  onRestore?: () => void;
}

export const formatBytes = (bytes?: number): string => {
  if (bytes === undefined || bytes === null || isNaN(bytes)) {
    return "0 B";
  }
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  const formatted = val.toFixed(1).replace(/\.0$/, "");
  return `${formatted} ${units[i]}`;
};

export const formatRelativeTime = (timestamp: number): string => {
  const elapsedSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (elapsedSeconds < 30) {
    return "Just now";
  }
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds} seconds ago`;
  }
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  boardId,
  doc,
  collabStatus,
  onRestore,
}) => {
  const [revisions, setRevisions] = useState<BoardRevision[]>([]);
  const [isPersisted, setIsPersisted] = useState(false);
  const [storageUsage, setStorageUsage] = useState<number | undefined>(
    undefined,
  );
  const [storageQuota, setStorageQuota] = useState<number | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const targetBoardId = boardId ?? getActiveBoardId();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [revs, persisted, estimate] = await Promise.all([
        getBoardRevisions(targetBoardId),
        isStoragePersisted(),
        getStorageEstimate(),
      ]);
      setRevisions([...revs].sort((a, b) => b.timestamp - a.timestamp));
      setIsPersisted(persisted);
      setStorageUsage(estimate.usage);
      setStorageQuota(estimate.quota);
    } catch {
      // Non-fatal if query fails
    } finally {
      setIsLoading(false);
    }
  }, [targetBoardId]);

  useEffect(() => {
    if (isOpen) {
      void loadData();
      setNotification(null);
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
    }
  }, [isOpen, loadData]);

  /* Keep the latest onClose without detaching the listener on every
     render: an inline onClose prop changes identity per render, which
     tore the Escape listener down and rebuilt it in passive effects,
     dropping Escape presses that landed in between. */
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleRestore = async (rev: BoardRevision) => {
    try {
      setRestoringId(rev.id);
      const targetDoc = doc ?? boardDoc();
      const res = await restoreBoardRevision(targetDoc, rev.id, targetBoardId);
      if (res.status === "restored") {
        refreshBoard();
        onRestore?.();
        setNotification({
          message: `Successfully restored version from ${formatRelativeTime(
            rev.timestamp,
          )}`,
          type: "success",
        });
        const updated = await getBoardRevisions(targetBoardId);
        setRevisions([...updated].sort((a, b) => b.timestamp - a.timestamp));
      } else {
        const detail = res.status === "failed" ? res.detail : "Empty document";
        setNotification({
          message: `Failed to restore: ${detail}`,
          type: "error",
        });
      }
    } catch (err) {
      setNotification({
        message:
          err instanceof Error ? err.message : "Failed to restore version",
        type: "error",
      });
    } finally {
      setRestoringId(null);
    }
  };

  const handleDownload = (rev: BoardRevision) => {
    try {
      const blob = new Blob([rev.payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date(rev.timestamp)
        .toISOString()
        .replace(/[:.]/g, "-");
      a.download = `board-${targetBoardId}-${dateStr}.firo`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setNotification({
        message: "Failed to download snapshot",
        type: "error",
      });
    }
  };

  const handleCreateSnapshot = async () => {
    try {
      const targetDoc = doc ?? boardDoc();
      const newRev = await saveBoardRevision(
        targetDoc,
        targetBoardId,
        "Manual snapshot",
      );
      if (newRev) {
        setNotification({
          message: "New version snapshot created",
          type: "success",
        });
        const updated = await getBoardRevisions(targetBoardId);
        setRevisions([...updated].sort((a, b) => b.timestamp - a.timestamp));
      }
    } catch {
      setNotification({
        message: "Failed to create snapshot",
        type: "error",
      });
    }
  };

  return (
    <div
      className="firo-version-history-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="firo-version-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-history-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="firo-version-history-modal__header">
          <div className="firo-version-history-modal__title-group">
            <h2
              id="version-history-modal-title"
              className="firo-version-history-modal__title"
            >
              Version History &amp; Storage
            </h2>
            <p className="firo-version-history-modal__subtitle">
              Inspect storage health and restore previous snapshot revisions.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="firo-version-history-modal__close-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div
            className={`firo-version-history-modal__notification firo-version-history-modal__notification--${notification.type}`}
            role="status"
            aria-live="polite"
          >
            {notification.type === "success" && <CheckIcon size={16} />}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Storage Health Card */}
        <div className="firo-version-history__storage-card">
          <div className="firo-version-history__storage-metrics">
            <div className="firo-version-history__metric">
              <span className="firo-version-history__metric-label">
                Storage Status
              </span>
              <span
                className={`firo-version-history__pill ${
                  isPersisted
                    ? "firo-version-history__pill--persisted"
                    : "firo-version-history__pill--standard"
                }`}
                data-testid="storage-persisted-pill"
              >
                {isPersisted
                  ? "Persistent Storage: Active"
                  : "Standard Browser Storage"}
              </span>
            </div>

            {storageUsage !== undefined && (
              <div className="firo-version-history__metric">
                <span className="firo-version-history__metric-label">
                  Estimated Usage
                </span>
                <span
                  className="firo-version-history__usage-value"
                  data-testid="storage-usage-text"
                >
                  {storageQuota && storageQuota > 0
                    ? `Usage: ${formatBytes(
                        storageUsage,
                      )} / Quota: ${formatBytes(storageQuota)}`
                    : `Usage: ${formatBytes(storageUsage)}`}
                </span>
              </div>
            )}

            <div className="firo-version-history__metric">
              <span className="firo-version-history__metric-label">
                Sync Status
              </span>
              <span
                className={`firo-version-history__connection-status ${
                  collabStatus === "connected"
                    ? "firo-version-history__connection-status--connected"
                    : "firo-version-history__connection-status--local"
                }`}
                data-testid="sync-connection-info"
              >
                {collabStatus === "connected"
                  ? "Sync: Connected to Self-Hosted Server"
                  : "Sync: Local Browser Only (Offline)"}
              </span>
            </div>
          </div>
        </div>

        {/* Revisions Section */}
        <div className="firo-version-history__content">
          <div className="firo-version-history__content-header">
            <h3 className="firo-version-history__content-title">
              Available Revisions
            </h3>
            <button
              type="button"
              className="firo-version-history__create-btn"
              onClick={handleCreateSnapshot}
              title="Create a snapshot of current board state"
            >
              <PlusIcon size={14} />
              <span>Create snapshot</span>
            </button>
          </div>

          {isLoading ? (
            <div className="firo-version-history__loading">
              Loading version history...
            </div>
          ) : revisions.length === 0 ? (
            <div
              className="firo-version-history__empty"
              data-testid="version-history-empty"
            >
              <div className="firo-version-history__empty-icon">
                <ClockIcon size={32} />
              </div>
              <p className="firo-version-history__empty-title">
                No previous snapshots yet
              </p>
              <p className="firo-version-history__empty-desc">
                Edits to your board are automatically preserved in rolling
                snapshots, or you can capture a snapshot manually anytime.
              </p>
            </div>
          ) : (
            <div
              className="firo-version-history__list"
              role="list"
              data-testid="version-history-list"
            >
              {revisions.map((rev) => (
                <div
                  key={rev.id}
                  className="firo-version-history__item"
                  role="listitem"
                  data-testid={`revision-item-${rev.id}`}
                >
                  <div className="firo-version-history__item-info">
                    <div className="firo-version-history__item-header">
                      <span className="firo-version-history__item-time">
                        {formatRelativeTime(rev.timestamp)}
                      </span>
                      {rev.label && (
                        <span className="firo-version-history__item-label">
                          {rev.label}
                        </span>
                      )}
                    </div>
                    <div className="firo-version-history__item-meta">
                      <span className="firo-version-history__item-count">
                        {rev.elementCount}{" "}
                        {rev.elementCount === 1 ? "element" : "elements"}
                      </span>
                      <span className="firo-version-history__item-dot">•</span>
                      <span className="firo-version-history__item-date">
                        {new Date(rev.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="firo-version-history__item-actions">
                    <button
                      type="button"
                      className="firo-version-history__action-btn firo-version-history__action-btn--restore"
                      onClick={() => handleRestore(rev)}
                      disabled={restoringId === rev.id}
                    >
                      <RestoreIcon size={14} />
                      <span>
                        {restoringId === rev.id
                          ? "Restoring..."
                          : "Restore this version"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="firo-version-history__action-btn firo-version-history__action-btn--download"
                      onClick={() => handleDownload(rev)}
                      title="Download snapshot JSON"
                    >
                      <DownloadIcon size={14} />
                      <span>Download snapshot</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VersionHistoryModal;
