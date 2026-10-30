import React, { useEffect, useRef, useState } from "react";

import { CloseIcon } from "../icons";

import "./EmbedDialog.scss";

export interface EmbedValidation {
  /** True only for an https URL on the provider allow-list. */
  ok: boolean;
  /** Provider display name when the URL is supported. */
  provider?: string | null;
  /** Human-readable reason the URL cannot be embedded. */
  reason?: string | null;
  /** True when the input is a well-formed http(s) URL, embedded or not. */
  isWebUrl?: boolean;
}

export interface EmbedDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Host-fed validation: the dialog itself is pure `@firo/ui` and carries no
   * dependency on the element package, so the host wires
   * `embeddableURLValidator` + `getEmbedLink` in here.
   */
  validateUrl: (url: string) => EmbedValidation;
  /** Called with the validated URL; the host inserts the element. */
  onAdd: (url: string) => void;
}

/**
 * The in-app affordance for embeds (ADR-0036 §3): one URL field, live
 * validation against the provider allow-list, and an Add action. An
 * unsupported URL earns the reason and an "Open link" escape; raw HTML is
 * never accepted - the paste path owns snippet extraction.
 */
export const EmbedDialog: React.FC<EmbedDialogProps> = ({
  isOpen,
  onClose,
  validateUrl,
  onAdd,
}) => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue("");
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        // minimal trap: keep Tab cycling the dialog's own controls
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'input, button, a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    // capture phase: the editor's own Escape handlers must not fire while
    // the dialog is open
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const trimmed = value.trim();
  const validation: EmbedValidation = trimmed
    ? validateUrl(trimmed)
    : { ok: false };

  const submit = () => {
    if (!validation.ok) {
      return;
    }
    onAdd(trimmed);
    onCloseRef.current();
  };

  return (
    <div
      className="firo-embed-dialog__overlay"
      onClick={onClose}
      data-testid="embed-dialog-overlay"
    >
      <div
        ref={dialogRef}
        className="firo-embed-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="embed-dialog-title"
        onClick={(event) => event.stopPropagation()}
        data-testid="embed-dialog"
      >
        <div className="firo-embed-dialog__header">
          <h2 id="embed-dialog-title" className="firo-embed-dialog__title">
            Add embed
          </h2>
          <button
            type="button"
            className="firo-embed-dialog__close"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon size={16} aria-hidden />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            type="url"
            className="firo-embed-dialog__input"
            placeholder="https://…"
            aria-label="Embed URL"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            data-testid="embed-dialog-input"
            spellCheck={false}
            autoComplete="off"
          />
          {trimmed && validation.ok && validation.provider ? (
            <p className="firo-embed-dialog__hint" data-testid="embed-provider">
              Provider: {validation.provider}
            </p>
          ) : null}
          {trimmed && !validation.ok && validation.reason ? (
            <p
              className="firo-embed-dialog__hint firo-embed-dialog__hint--error"
              data-testid="embed-error"
            >
              {validation.reason}{" "}
              {validation.isWebUrl ? (
                <a href={trimmed} target="_blank" rel="noopener noreferrer">
                  Open link
                </a>
              ) : null}
            </p>
          ) : null}
          <div className="firo-embed-dialog__actions">
            <button
              type="submit"
              className="firo-embed-dialog__add"
              disabled={!validation.ok}
              data-testid="embed-dialog-add"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
