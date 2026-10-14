import React from "react";

import "./SelectionToolbar.scss";

export interface SelectionToolbarItem {
  id: string;
  /** Tooltip and accessible name. */
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** For toggles such as lock. */
  pressed?: boolean;
}

export interface SelectionToolbarProps {
  /**
   * Anchor in **container coordinates** — the selection's top-centre projected
   * onto the overlay, i.e. `(scene + scroll) * zoom`, with no viewport offset.
   * The overlay and the canvas share an origin, so this needs no conversion.
   */
  x: number;
  y: number;
  items: SelectionToolbarItem[];
}

/**
 * The floating toolbar that appears above a selection
 * ([ADR-0021](../../../../docs/adr/0021-miro-style-shell-and-clean-aesthetic.md)).
 *
 * It is deliberately dumb: the host computes the anchor and supplies the
 * actions, so this component knows nothing about the scene. Anchoring to the
 * selection rather than docking to a side is the Miro behaviour the shell is
 * copying.
 */
export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  x,
  y,
  items,
}) => {
  if (!items.length) {
    return null;
  }

  return (
    <div
      className="firo-selection-toolbar"
      role="toolbar"
      aria-label="Selection actions"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="firo-selection-toolbar__item"
          onClick={item.onClick}
          disabled={item.disabled}
          title={item.label}
          aria-label={item.label}
          aria-pressed={item.pressed}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
};
