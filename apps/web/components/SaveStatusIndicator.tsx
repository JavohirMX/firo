import React, { useEffect, useState } from "react";

import {
  getSaveStatus,
  subscribeSaveStatus,
  type SaveStatus,
} from "../board/storage";

import "./SaveStatusIndicator.scss";

export interface SaveStatusIndicatorProps {
  collabStatus?: string | null;
  onClick?: () => void;
  compact?: boolean;
}

const CloudIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
  </svg>
);

const DeviceIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

/**
 * Visual indicator for the board save state (AC-10).
 *
 * Displays local/server sync status. Interactive pill opens Version History.
 * Never silent on storage failures.
 */
export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({
  collabStatus,
  onClick,
  compact = false,
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!detailsOpen) {
      return;
    }
    const close = (event: PointerEvent) => {
      if (!detailsRef.current?.contains(event.target as Node)) {
        setDetailsOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailsOpen(false);
        detailsRef.current?.querySelector("button")?.focus();
      }
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape, true);
    };
  }, [detailsOpen]);
  const [status, setStatus] = useState<SaveStatus>(() => getSaveStatus());

  useEffect(() => {
    return subscribeSaveStatus((nextStatus) => {
      setStatus(nextStatus);
    });
  }, []);

  if (status === "idle" && !compact) {
    return null;
  }

  const isConnected = collabStatus === "connected";
  const isOfflineOrLocal =
    collabStatus !== undefined &&
    collabStatus !== null &&
    collabStatus !== "connected";

  // The "saved" state means the board was written to this browser's local
  // storage. The server's acknowledgement of the latest update is not part of
  // this signal, so the text never claims a sync. Connection state has its own
  // badge next to this one.
  let statusText = "";
  if (status === "saving") {
    statusText = "Saving...";
  } else if (status === "saved") {
    statusText =
      isConnected || isOfflineOrLocal ? "Saved on this device" : "Saved";
  } else if (status === "error") {
    statusText = "Error saving";
  }

  if (compact) {
    const connectionText = isConnected
      ? "Connected to server"
      : collabStatus === "connecting"
      ? "Connecting to server"
      : "Offline or local-only";
    const localText = statusText || "No local save yet";
    return (
      <div className="firo-status-control" ref={detailsRef}>
        <button
          type="button"
          className={`firo-save-status firo-save-status--${status} firo-save-status--compact firo-save-status--interactive`}
          data-testid="firo-save-status"
          data-connection={collabStatus ?? "local"}
          aria-label={`Board status: ${localText}. ${connectionText}`}
          aria-expanded={detailsOpen}
          aria-controls="firo-status-details"
          title="Board status"
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <span className="firo-save-status__dot" aria-hidden="true" />
          <DeviceIcon size={14} />
          {status === "error" && <span>Save failed</span>}
        </button>
        {detailsOpen && (
          <div
            className="firo-status-details"
            id="firo-status-details"
            role="dialog"
            aria-label="Board status details"
          >
            <strong>Board status</strong>
            <p role="status" aria-live="polite">
              {localText}
            </p>
            <p>{connectionText}</p>
            <p className="firo-status-details__hint">
              Saving on this device and connecting to the server are separate. A
              connection does not confirm the latest edit was saved on the
              server.
            </p>
            {onClick && (
              <button
                type="button"
                onClick={() => {
                  setDetailsOpen(false);
                  onClick();
                }}
              >
                Version history and storage
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`firo-save-status firo-save-status--${status} ${
        onClick ? "firo-save-status--interactive" : ""
      }`}
      data-testid="firo-save-status"
      role="status"
      aria-live="polite"
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      tabIndex={onClick ? 0 : undefined}
      title="Version history & storage status"
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <span className="firo-save-status__dot" />
      {isConnected && (
        <span className="firo-save-status__icon">
          <CloudIcon size={12} />
        </span>
      )}
      {isOfflineOrLocal && status !== "error" && (
        <span className="firo-save-status__icon">
          <DeviceIcon size={12} />
        </span>
      )}
      <span className="firo-save-status__text">{statusText}</span>
    </div>
  );
};

export default SaveStatusIndicator;
