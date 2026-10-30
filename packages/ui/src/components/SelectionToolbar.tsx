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
  /**
   * A popover anchored under this item. The host owns both the content and the
   * open state; the rail shell only positions it.
   */
  popover?: React.ReactNode;
  /** Whether `popover` is showing, for `aria-expanded`. */
  expanded?: boolean;
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
  children?: React.ReactNode;
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
  children,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [left, setLeft] = React.useState(x);
  const hasContent = items.length > 0 || Boolean(children);

  // The anchor is the selection's top-centre, so a selection near the right or
  // left edge pushed half the toolbar off screen and clipped its last buttons.
  // Measure it against the overlay and slide it back inside. The anchor itself
  // is untouched, so it still follows pan and zoom.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    const node = ref.current;
    const parent = node?.offsetParent as HTMLElement | null;
    if (!node || !parent || !parent.clientWidth) {
      setLeft(x);
      return;
    }
    const margin = 8;
    const half = node.offsetWidth / 2;
    const min = half + margin;
    // Stay clear of the docked Properties panel when it is open, so the
    // toolbar never sits on top of its title and first controls.
    const parentLeft = parent.getBoundingClientRect().left;
    const inspector = document.querySelector(".firo-inspector");
    const inspectorLeft = inspector
      ? inspector.getBoundingClientRect().left - parentLeft
      : parent.clientWidth;
    const right = Math.min(parent.clientWidth, inspectorLeft);
    const max = right - half - margin;
    setLeft(
      max < min ? parent.clientWidth / 2 : Math.min(Math.max(x, min), max),
    );
    // Runs after every render on purpose: the panel opening or closing changes
    // the bound without changing any prop here. setLeft bails on equal values.
  });

  if (!hasContent) {
    return null;
  }

  return (
    <div
      ref={ref}
      className="firo-selection-toolbar"
      role="toolbar"
      aria-label="Selection actions"
      style={{ left: `${left}px`, top: `${y}px` }}
    >
      {items.map((item) => (
        <div className="firo-selection-toolbar__slot" key={item.id}>
          <button
            type="button"
            className="firo-selection-toolbar__item"
            onClick={item.onClick}
            disabled={item.disabled}
            title={item.label}
            aria-label={item.label}
            aria-pressed={item.pressed}
            aria-haspopup={item.popover ? "menu" : undefined}
            aria-expanded={item.popover ? Boolean(item.expanded) : undefined}
          >
            {item.icon}
          </button>
          {item.popover && item.expanded ? (
            <div className="firo-selection-toolbar__popover">
              {item.popover}
            </div>
          ) : null}
        </div>
      ))}
      {children}
    </div>
  );
};
