import { useEffect, useState } from "react";

import {
  getSaveStatus,
  subscribeSaveStatus,
  type SaveStatus,
} from "../board/storage";

/**
 * Visual indicator for the board save state (AC-10).
 *
 * Displays Saving..., Saved, or Error saving.
 * Never silent on storage failures.
 */
export const SaveStatusIndicator = (): React.JSX.Element | null => {
  const [status, setStatus] = useState<SaveStatus>(() => getSaveStatus());

  useEffect(() => {
    return subscribeSaveStatus((nextStatus) => {
      setStatus(nextStatus);
    });
  }, []);

  if (status === "idle") {
    return null;
  }

  return (
    <div
      className={`firo-save-status firo-save-status--${status}`}
      data-testid="firo-save-status"
      role="status"
      aria-live="polite"
    >
      <span className="firo-save-status__dot" />
      <span className="firo-save-status__text">
        {status === "saving" && "Saving..."}
        {status === "saved" && "Saved"}
        {status === "error" && "Error saving"}
      </span>
    </div>
  );
};

export default SaveStatusIndicator;
