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
}) => {
  const [status, setStatus] = useState<SaveStatus>(() => getSaveStatus());

  useEffect(() => {
    return subscribeSaveStatus((nextStatus) => {
      setStatus(nextStatus);
    });
  }, []);

  if (status === "idle") {
    return null;
  }

  const isConnected = collabStatus === "connected";
  const isOfflineOrLocal =
    collabStatus !== undefined &&
    collabStatus !== null &&
    collabStatus !== "connected";

  let statusText = "";
  if (status === "saving") {
    if (isConnected) {
      statusText = "Syncing...";
    } else if (isOfflineOrLocal) {
      statusText = "Saving locally...";
    } else {
      statusText = "Saving...";
    }
  } else if (status === "saved") {
    if (isConnected) {
      statusText = "Synced to server";
    } else if (isOfflineOrLocal) {
      statusText = "Saved locally";
    } else {
      statusText = "Saved";
    }
  } else if (status === "error") {
    statusText = "Error saving";
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
