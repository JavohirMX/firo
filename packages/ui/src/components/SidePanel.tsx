/**
 * The right-dock shell (Miro parity matrix row 16, ADR-0035 section 1): one
 * `<aside>` home for the activity, frames and voting lists.
 *
 * The contract is the ADR's, restated where it is enforced:
 *
 * - **One slot, one panel.** The host decides which panel is open; this
 *   component only knows how to be *a* panel. Exclusivity is host state.
 * - **Own close control, and Escape does not close.** Observed Miro
 *   behaviour, and it keeps the ADR-0032 Escape ladder on the canvas: a
 *   menu opened inside the dock still closes on Escape first. There is
 *   deliberately no Escape handler here.
 * - **Non-modal.** No backdrop, no focus trap, no `aria-modal`; the canvas
 *   stays interactive. Opening moves focus into the panel (the close
 *   control); returning focus to the trigger is the host's job, because
 *   only the host knows which trigger opened it.
 * - **Geometry from tokens.** Anchors are `SPACE.sm` inline-end/block-end
 *   and `SPACE.sm + BAR.height + SPACE.sm` block-start; width is
 *   `PANEL.width`, with `PANEL.widthWide` reserved for voting. The numbers
 *   live in `SidePanel.scss` against the token custom properties.
 *
 * An `<aside>` rather than a `div`: the landmark is the point. Upstream
 * excalidraw hides every aside under `.excalidraw--mobile`, so the scss
 * carries an explicit override with a comment; the dock renders outside
 * the editor root in the host, but the shell does not rely on that.
 */

import React, { useEffect, useRef } from "react";

import { CloseIcon } from "../icons";

import "./SidePanel.scss";

export interface SidePanelTab {
  id: string;
  label: string;
}

export interface SidePanelProps {
  /** The panel's accessible name and visible heading. */
  title: string;
  onClose: () => void;
  /** The 380 dock, reserved for voting (ADR-0035). Never mixed in one panel. */
  wide?: boolean;
  tabs?: readonly SidePanelTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Triggers point here with `aria-controls`. */
  id?: string;
  closeLabel?: string;
  /** Extra controls between the title and the close control (e.g. Clear). */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  title,
  onClose,
  wide = false,
  tabs,
  activeTab,
  onTabChange,
  id,
  closeLabel,
  headerActions,
  children,
}) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Opening moves focus into the panel (ADR-0035): the close control is the
  // one element guaranteed to exist, so it is the landing spot.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <aside
      id={id}
      className={`firo-side-panel${wide ? " firo-side-panel--wide" : ""}`}
      aria-label={title}
    >
      <div className="firo-side-panel__header">
        <h2 className="firo-side-panel__title">{title}</h2>
        {headerActions}
        <button
          ref={closeRef}
          type="button"
          className="firo-side-panel__close"
          aria-label={closeLabel ?? `Close ${title} panel`}
          onClick={onClose}
        >
          <CloseIcon size={16} />
        </button>
      </div>
      {tabs && tabs.length > 0 ? (
        <div className="firo-side-panel__tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === activeTab}
              className={`firo-side-panel__tab${
                tab.id === activeTab ? " firo-side-panel__tab--active" : ""
              }`}
              onClick={() => onTabChange?.(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="firo-side-panel__body">{children}</div>
    </aside>
  );
};
