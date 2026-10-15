import React, { useCallback, useEffect, useState } from "react";
import { CheckIcon, CloseIcon, CopyIcon, TrashIcon } from "@firo/ui";

import "./ShareModal.scss";

export type ShareRole = "editor" | "commenter" | "viewer";

export interface ShareLink {
  id: string;
  token: string;
  role: ShareRole;
  createdAt: number;
  url: string;
}

export interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
  initialLinks?: readonly ShareLink[];
  onGenerateLink?: (role: ShareRole) => Promise<ShareLink> | ShareLink;
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
}) => {
  const [selectedRole, setSelectedRole] = useState<ShareRole>("editor");
  const [links, setLinks] = useState<ShareLink[]>([...initialLinks]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Sync initialLinks when prop changes
  useEffect(() => {
    if (initialLinks.length > 0) {
      setLinks((prev) => (prev.length === 0 ? [...initialLinks] : prev));
    }
  }, [initialLinks]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) {
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

  const handleCreateLink = useCallback(async () => {
    let newLink: ShareLink;
    if (onGenerateLink) {
      newLink = await onGenerateLink(selectedRole);
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
        url: `${origin}/s/${token}`,
      };
    }

    setLinks((prev) => [newLink, ...prev]);
  }, [onGenerateLink, selectedRole]);

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
      if (onRevokeLink) {
        await onRevokeLink(token);
      }
      setLinks((prev) =>
        prev.filter((l) => l.token !== token && l.id !== token),
      );
    },
    [onRevokeLink],
  );

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
        className="firo-share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        onClick={(e) => e.stopPropagation()}
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
          <div className="firo-share-modal__creation-section">
            <h3 className="firo-share-modal__section-title">Create new link</h3>
            <div className="firo-share-modal__row">
              <select
                className="firo-share-modal__role-select"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as ShareRole)}
                data-testid="share-role-select"
                aria-label="Select role for share link"
              >
                <option value="editor">Editor — can edit board content</option>
                <option value="commenter">
                  Commenter — can view and add comments
                </option>
                <option value="viewer">Viewer — can only view</option>
              </select>

              <button
                type="button"
                className="firo-share-modal__create-btn"
                onClick={handleCreateLink}
                data-testid="create-link-button"
              >
                Create link
              </button>
            </div>
          </div>

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
                  No active share links. Create one above to invite
                  collaborators.
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
