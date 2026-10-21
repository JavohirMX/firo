import React, { useEffect } from "react";
import { useFocusTrap } from "@firo/editor";
import { CloseIcon, TemplateIcon } from "@firo/ui";

import { BOARD_TEMPLATES } from "../board/templates";

import "./TemplateModal.scss";

import type { BoardTemplate } from "../board/templates";

export interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertTemplate: (template: BoardTemplate) => void;
}

export const TemplateModal: React.FC<TemplateModalProps> = ({
  isOpen,
  onClose,
  onInsertTemplate,
}) => {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);

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

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="firo-template-modal__overlay"
      onClick={onClose}
      data-testid="template-modal-overlay"
    >
      <div
        ref={focusTrapRef}
        className="firo-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-modal-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="template-modal"
      >
        <div className="firo-template-modal__header">
          <div className="firo-template-modal__title-group">
            <span className="firo-template-modal__icon">
              <TemplateIcon size={20} />
            </span>
            <h2
              id="template-modal-title"
              className="firo-template-modal__title"
            >
              Templates
            </h2>
          </div>
          <button
            type="button"
            className="firo-template-modal__close-btn"
            onClick={onClose}
            aria-label="Close"
            data-testid="template-modal-close"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="firo-template-modal__grid">
          {BOARD_TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.id}
              className="firo-template-card"
              data-testid={`template-card-${tmpl.id}`}
            >
              <div
                className="firo-template-card__accent"
                style={{ backgroundColor: tmpl.color }}
              />
              <div className="firo-template-card__body">
                <h3 className="firo-template-card__name">{tmpl.name}</h3>
                <p className="firo-template-card__desc">{tmpl.description}</p>
                <div className="firo-template-card__tags">
                  {tmpl.tags.map((tag) => (
                    <span key={tag} className="firo-template-card__tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="firo-template-card__footer">
                <button
                  type="button"
                  className="firo-template-card__btn"
                  onClick={() => onInsertTemplate(tmpl)}
                  data-testid={`template-use-${tmpl.id}`}
                >
                  Use template
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
