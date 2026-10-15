import clsx from "clsx";
import { useMemo } from "react";
import { createPortal } from "react-dom";

import { KEYS } from "@firo/common";

import { useCreatePortalContainer } from "../hooks/useCreatePortalContainer";
import { useFocusTrap } from "../hooks/useFocusTrap";

import "./Modal.scss";

import type { AppState } from "../types";

export const Modal: React.FC<{
  className?: string;
  children: React.ReactNode;
  maxWidth?: number;
  onCloseRequest(): void;
  labelledBy: string;
  theme?: AppState["theme"];
  closeOnClickOutside?: boolean;
}> = (props) => {
  const { closeOnClickOutside = true } = props;
  const modalRoot = useCreatePortalContainer({
    className: "excalidraw-modal-container",
  });

  // A modal declares `aria-modal="true"`, so it has to actually hold focus:
  // contained while it is open, and returned to the opener when it closes.
  // `Dialog` handles tabbing between its own controls; this is what makes the
  // claim true for the whole dialog, and what restores focus when the dialog is
  // dismissed by state rather than through its own `onClose`.
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true);

  const animationsDisabled = useMemo(
    () =>
      modalRoot?.ownerDocument.body.classList.contains(
        "excalidraw-animations-disabled",
      ) ?? false,
    [modalRoot],
  );

  if (!modalRoot) {
    return null;
  }

  const handleKeydown = (event: React.KeyboardEvent) => {
    if (event.key === KEYS.ESCAPE) {
      event.preventDefault();
      event.nativeEvent.stopImmediatePropagation();
      event.stopPropagation();
      props.onCloseRequest();
    }
  };

  return createPortal(
    <div
      ref={focusTrapRef}
      className={clsx("Modal", props.className, {
        "animations-disabled": animationsDisabled,
      })}
      role="dialog"
      aria-modal="true"
      onKeyDown={handleKeydown}
      aria-labelledby={props.labelledBy}
    >
      <div
        className="Modal__background"
        onClick={closeOnClickOutside ? props.onCloseRequest : undefined}
      />
      <div
        className="Modal__content"
        style={{ "--max-width": `${props.maxWidth}px` }}
        tabIndex={0}
      >
        {props.children}
      </div>
    </div>,
    modalRoot,
  );
};
