import React, { useCallback, useEffect, useState } from "react";
import { useFocusTrap } from "@firo/editor";
import { CheckIcon, CloseIcon, CopyIcon, TrashIcon } from "@firo/ui";

import "./ShareModal.scss";

export type ShareRole = "editor" | "commenter" | "viewer";

export interface ShareLink {
  id: string;
  token: string;
  role: ShareRole;
  createdAt: number;
  /** Epoch ms after which the link stops working. Null or absent: never. */
  expiresAt?: number | null;
  url: string;
}

export interface ShareLinkOptions {
  expiresAt: number | null;
}

const HOUR_MS = 60 * 60 * 1000;

/** The expiry choices offered when creating a link. */
export const SHARE_EXPIRY_CHOICES = [
  { id: "never", label: "Never expires", ms: null },
  { id: "1h", label: "Expires in 1 hour", ms: HOUR_MS },
  { id: "1d", label: "Expires in 1 day", ms: 24 * HOUR_MS },
  { id: "7d", label: "Expires in 7 days", ms: 7 * 24 * HOUR_MS },
  { id: "30d", label: "Expires in 30 days", ms: 30 * 24 * HOUR_MS },
] as const;

export const formatShareExpiry = (
  expiresAt: number | null | undefined,
): string => {
  if (!expiresAt) {
    return "Never expires";
  }
  return `Expires ${new Date(expiresAt).toLocaleString()}`;
};

export interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
  initialLinks?: readonly ShareLink[];
  onGenerateLink?: (
    role: ShareRole,
    options: ShareLinkOptions,
  ) => Promise<ShareLink> | ShareLink;
  /**
   * When set, links cannot be created and this is shown instead, for example
   * when the user is signed out or no sync server is reachable.
   */
  unavailableMessage?: string;
  /** Optional action shown under `unavailableMessage`. */
  unavailableAction?: { label: string; onSelect: () => void };
  onRevokeLink?: (tokenId: string) => Promise<void> | void;
}

/**
 * Generate a cryptographically secure 128-bit (16-byte) capability token.
 */
export const generateCapabilityToken = (): string => {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  boardId,
  initialLinks = [],
  onGenerateLink,
  onRevokeLink,
  unavailableMessage,
  unavailableAction,
}) => {
  const [selectedRole, setSelectedRole] = useState<ShareRole>("editor");
  const [links, setLinks] = useState<ShareLink[]>([...initialLinks]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [expiryId, setExpiryId] = useState<string>("never");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Sync initialLinks when prop changes
  useEffect(() => {
    if (initialLinks.length > 0) {
      setLinks((prev) => (prev.length === 0 ? [...initialLinks] : prev));
    }
  }, [initialLinks]);

  // Handle Escape key to close modal
  /* Keep the latest onClose without detaching the listener on every
     render: an inline onClose prop changes identity per render, which
     tore the Escape listener down and rebuilt it in passive effects,
     dropping Escape presses that landed in between. */
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleCreateLink = useCallback(async () => {
    if (busy) {
      return;
    }
    const choice =
      SHARE_EXPIRY_CHOICES.find((c) => c.id === expiryId) ??
      SHARE_EXPIRY_CHOICES[0];
    const expiresAt = choice.ms === null ? null : Date.now() + choice.ms;

    setBusy(true);
    setError(null);
    try {
      let newLink: ShareLink;
      if (onGenerateLink) {
        newLink = await onGenerateLink(selectedRole, { expiresAt });
      } else {
        const token = generateCapabilityToken();
        const origin =
          typeof window !== "undefined" && window.location?.origin
            ? window.location.origin
            : "https://firo.app";
        newLink = {
          id: token,
          token,
          role: selectedRole,
          createdAt: Date.now(),
          expiresAt,
          url: `${origin}/s/${token}`,
        };
      }
      setLinks((prev) => [newLink, ...prev]);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not create the link.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, expiryId, onGenerateLink, selectedRole]);

  const handleCopyLink = useCallback(async (link: ShareLink) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link.url);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = link.url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedToken(link.token);
      setTimeout(() => {
        setCopiedToken((curr) => (curr === link.token ? null : curr));
      }, 2000);
    } catch {
      // Clipboard write failure
    }
  }, []);

  const handleRevokeLink = useCallback(
    async (token: string) => {
      setError(null);
      try {
        if (onRevokeLink) {
          await onRevokeLink(token);
        }
      } catch (err) {
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Could not revoke the link.",
        );
        return;
      }
      setLinks((prev) =>
        prev.filter((l) => l.token !== token && l.id !== token),
      );
    },
    [onRevokeLink],
  );

  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="firo-share-modal-backdrop"
      onClick={onClose}
      data-testid="share-modal-backdrop"
    >
      <div
        ref={focusTrapRef}
        className="firo-share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
        data-testid="share-modal"
      >
        <div className="firo-share-modal__header">
          <h2 id="share-modal-title">Share board</h2>
          <button
            type="button"
            className="firo-share-modal__close-btn"
            onClick={onClose}
            aria-label="Close"
            data-testid="share-modal-close"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="firo-share-modal__content">
          <div className="firo-share-modal__notice">
            <strong>Capability links:</strong> Anyone with a link can access
            this board according to their assigned role. You can revoke any link
            at any time.
          </div>

          {/* Create Link Section */}
          {unavailableMessage ? (
            <div
              className="firo-share-modal__unavailable"
              data-testid="share-unavailable"
            >
              <p>{unavailableMessage}</p>
              {unavailableAction && (
                <button
                  type="button"
                  className="firo-share-modal__create-btn"
                  onClick={unavailableAction.onSelect}
                  data-testid="share-unavailable-action"
                >
                  {unavailableAction.label}
                </button>
              )}
            </div>
          ) : (
            <div className="firo-share-modal__creation-section">
              <h3 className="firo-share-modal__section-title">
                Create new link
              </h3>
              <div className="firo-share-modal__row">
                <select
                  className="firo-share-modal__role-select"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as ShareRole)}
                  data-testid="share-role-select"
                  aria-label="Select role for share link"
                >
                  <option value="editor">
                    Editor — can edit board content
                  </option>
                  <option value="commenter">
                    Commenter — can view and add comments
                  </option>
                  <option value="viewer">Viewer — can only view</option>
                </select>

                <select
                  className="firo-share-modal__role-select"
                  value={expiryId}
                  onChange={(e) => setExpiryId(e.target.value)}
                  data-testid="share-expiry-select"
                  aria-label="Link expiry"
                >
                  {SHARE_EXPIRY_CHOICES.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="firo-share-modal__create-btn"
                  onClick={handleCreateLink}
                  disabled={busy}
                  data-testid="create-link-button"
                >
                  Create link
                </button>
              </div>
            </div>
          )}

          {error && (
            <div
              className="firo-share-modal__error"
              role="alert"
              data-testid="share-error"
            >
              {error}
            </div>
          )}

          {/* Active Links List */}
          <div className="firo-share-modal__links-section">
            <h3 className="firo-share-modal__section-title">
              Active share links ({links.length})
            </h3>
            <div
              className="firo-share-modal__links-list"
              data-testid="active-share-links"
            >
              {links.length === 0 ? (
                <div
                  className="firo-share-modal__empty"
                  data-testid="no-share-links"
                >
                  {unavailableMessage
                    ? "No active share links."
                    : "No active share links. Create one above to invite collaborators."}
                </div>
              ) : (
                links.map((link) => {
                  const isCopied = copiedToken === link.token;
                  return (
                    <div
                      key={link.token}
                      className="firo-share-modal__link-item"
                      data-testid={`share-link-item-${link.token}`}
                    >
                      <div className="firo-share-modal__link-meta">
                        <span
                          className={`firo-share-modal__role-badge firo-share-modal__role-badge--${link.role}`}
                          data-testid={`share-link-role-${link.token}`}
                        >
                          {link.role}
                        </span>
                        <span
                          className="firo-share-modal__link-url"
                          data-testid={`share-link-url-${link.token}`}
                          title={link.url}
                        >
                          /s/{link.token.slice(0, 10)}...
                        </span>
                        <span
                          className="firo-share-modal__link-expiry"
                          data-testid={`share-link-expiry-${link.token}`}
                        >
                          {formatShareExpiry(link.expiresAt)}
                        </span>
                      </div>

                      <div className="firo-share-modal__link-actions">
                        <button
                          type="button"
                          className={`firo-share-modal__copy-btn ${
                            isCopied ? "is-copied" : ""
                          }`}
                          onClick={() => handleCopyLink(link)}
                          data-testid={`copy-link-${link.token}`}
                          title="Copy link to clipboard"
                        >
                          {isCopied ? (
                            <>
                              <CheckIcon size={14} />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <CopyIcon size={14} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          className="firo-share-modal__revoke-btn"
                          onClick={() => handleRevokeLink(link.token)}
                          data-testid={`revoke-link-${link.token}`}
                          title="Revoke share link"
                        >
                          <TrashIcon size={14} />
                          <span>Revoke</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
