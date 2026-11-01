import React, { useState } from "react";

import { claimSharePassword, storeShareProof } from "../board/collabProvider";

/* Full-screen gate, not a modal: there is nothing behind it to dismiss to.
   Reuses the auth dialog's styles so the prompt looks like the rest of the
   sync UI without a stylesheet of its own. */
import "./AuthDialog.scss";

export interface SharePasswordGateProps {
  token: string;
  onUnlocked: () => void;
}

export const SharePasswordGate: React.FC<SharePasswordGateProps> = ({
  token,
  onUnlocked,
}) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await claimSharePassword(token, password);
    if ("error" in result) {
      setError(result.error);
      setBusy(false);
      return;
    }
    if (result.proof) {
      storeShareProof(token, result.proof);
    }
    onUnlocked();
  };

  return (
    <div className="firo-auth-dialog__overlay">
      <div
        className="firo-auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-password-title"
      >
        <div className="firo-auth-dialog__header">
          <h2 id="share-password-title" className="firo-auth-dialog__title">
            Password required
          </h2>
        </div>
        <form className="firo-auth-dialog__form" onSubmit={handleSubmit}>
          <p className="firo-auth-dialog__hint">
            The owner of this board shared it with a password. Enter it to open
            the board.
          </p>
          <label className="firo-auth-dialog__field">
            <span>Share password</span>
            <input
              type="password"
              autoComplete="off"
              autoFocus
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              data-testid="share-password-input"
            />
          </label>
          {error ? (
            <p className="firo-auth-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="firo-auth-dialog__submit"
            disabled={busy}
            data-testid="share-password-submit"
          >
            {busy ? "Checking..." : "Open board"}
          </button>
        </form>
      </div>
    </div>
  );
};
