import React, { useEffect, useState } from "react";
import { useFocusTrap } from "@firo/editor";
import { CloseIcon } from "@firo/ui";

import { SyncApiError } from "../sync/api";

import "./AuthDialog.scss";

export type AuthMode = "signIn" | "register";

export interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
}

const messageFor = (error: unknown): string => {
  if (error instanceof SyncApiError) {
    return error.message;
  }
  return "Could not reach the sync server.";
};

export const AuthDialog: React.FC<AuthDialogProps> = ({
  isOpen,
  onClose,
  onSignIn,
  onRegister,
}) => {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPassword("");
      setError(null);
      setBusy(false);
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const isRegister = mode === "register";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isRegister) {
        await onRegister(username.trim(), password);
      } else {
        await onSignIn(username.trim(), password);
      }
      onClose();
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(isRegister ? "signIn" : "register");
    setError(null);
  };

  return (
    <div
      className="firo-auth-dialog__overlay"
      onClick={onClose}
      data-testid="auth-dialog-overlay"
    >
      <div
        ref={focusTrapRef}
        className="firo-auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        onClick={(event) => event.stopPropagation()}
        data-testid="auth-dialog"
      >
        <div className="firo-auth-dialog__header">
          <h2 id="auth-dialog-title" className="firo-auth-dialog__title">
            {isRegister ? "Create account" : "Sign in"}
          </h2>
          <button
            type="button"
            className="firo-auth-dialog__close"
            onClick={onClose}
            aria-label="Close"
            data-testid="auth-dialog-close"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <form className="firo-auth-dialog__form" onSubmit={handleSubmit}>
          <p className="firo-auth-dialog__hint">
            An account is only needed to share boards through your Firo server.
            Your boards stay on this device either way.
          </p>

          <label className="firo-auth-dialog__field">
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              required
              minLength={3}
              maxLength={50}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              data-testid="auth-username"
            />
          </label>

          <label className="firo-auth-dialog__field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={isRegister ? 6 : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              data-testid="auth-password"
            />
          </label>

          {error && (
            <div
              className="firo-auth-dialog__error"
              role="alert"
              data-testid="auth-error"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="firo-auth-dialog__submit"
            disabled={busy}
            data-testid="auth-submit"
          >
            {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          </button>

          <button
            type="button"
            className="firo-auth-dialog__switch"
            onClick={switchMode}
            data-testid="auth-switch-mode"
          >
            {isRegister
              ? "Have an account? Sign in"
              : "No account yet? Create one"}
          </button>
        </form>
      </div>
    </div>
  );
};
