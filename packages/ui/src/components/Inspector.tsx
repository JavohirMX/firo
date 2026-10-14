import React from "react";

import { CloseIcon } from "../icons";

import "./Inspector.scss";

export interface InspectorProps {
  /**
   * The panel's heading. Defaults to "Properties" so the panel always has an
   * accessible name; a host may pass something selection-specific (e.g.
   * "2 objects selected") instead.
   */
  title?: string;
  /** When provided, a close control renders in the header. */
  onClose?: () => void;
  /** The panel's content — for Firo, the editor's shape actions. */
  children: React.ReactNode;
}

/**
 * The right-side inspector: a chrome shell for object properties
 * ([ADR-0021](../../../../docs/adr/0021-miro-style-shell-and-clean-aesthetic.md)).
 *
 * It is a *shell* on purpose. The property controls themselves stay in
 * `@firo/editor` and are passed in as `children`, so there is exactly one
 * implementation of them; this component owns only the panel's placement and
 * its chrome. That split is recorded in
 * [ADR-0025](../../../../docs/adr/0025-the-host-reuses-the-editors-property-controls.md).
 */
export const Inspector: React.FC<InspectorProps> = ({
  title = "Properties",
  onClose,
  children,
}) => {
  return (
    <aside className="firo-inspector" aria-label={title}>
      <header className="firo-inspector__header">
        <h2 className="firo-inspector__title">{title}</h2>
        {onClose && (
          <button
            type="button"
            className="firo-inspector__close"
            onClick={onClose}
            aria-label="Close properties"
          >
            <CloseIcon />
          </button>
        )}
      </header>
      <div className="firo-inspector__body">{children}</div>
    </aside>
  );
};
