import React from "react";

import {
  DEFAULT_TREE_WINDOW,
  buildAccessibilityNodes,
  resolveTabNavigation,
  resolveTreeNavigation,
  treeWindowStart,
} from "../accessibility";

import "./AccessibilityTree.scss";

import type { AccessibilityTreeItem } from "../accessibility";

export interface AccessibilityTreeProps {
  /** The board's elements, in reading order. */
  items: readonly AccessibilityTreeItem[];
  /** How many tree nodes are rendered at once. */
  windowSize?: number;
  /** The board's name, announced as the region's label. */
  boardLabel?: string;
  /** The element the canvas has selected, if any. */
  selectedId?: string | null;
  /**
   * A message for the polite live region — save state, errors, mode changes.
   * Never assertive: a board that interrupts on every keystroke is unusable
   * with a screen reader.
   */
  liveMessage?: string;
  /** Enter, Space, or a click: act on the element. */
  onActivate: (id: string) => void;
  /**
   * Focus landed on an element. The host is expected to select it, so the
   * keyboard user gets the *visible* focus indicator the canvas draws — the
   * clipped tree itself shows nothing
   * ([`docs/trd/09-accessibility.md`](../../../../docs/trd/09-accessibility.md)).
   */
  onFocusElement?: (id: string) => void;
  /** Escape: deselect. */
  onEscape?: () => void;
}

/**
 * The parallel DOM tree that makes the board navigable.
 *
 * ## Why a parallel tree at all
 *
 * The canvas is a bitmap. A screen reader sees one `<canvas>` element and
 * nothing inside it. This component renders the scene as a real, focusable
 * list beside the bitmap, which is the only way the canvas can be operated
 * without sight ([`docs/trd/09-accessibility.md`](../../../../docs/trd/09-accessibility.md)).
 *
 * ## Why it is clipped rather than hidden
 *
 * `display: none` and `visibility: hidden` both remove a subtree from the
 * accessibility tree, which is the opposite of the point. It is instead
 * clipped to a single, off-screen pixel — present to assistive technology and
 * to the keyboard, invisible to everyone else. See `AccessibilityTree.scss`.
 *
 * ## The keyboard model
 *
 * One tab stop, moved by roving `tabindex`, so a 10,000-element board does not
 * become 10,000 tab stops:
 *
 * - `Tab` / `Shift+Tab` move to the next / previous element. At the ends the
 *   key is not consumed, so the user can leave the board.
 * - `Arrow Down` / `Arrow Up` do the same, and `Home` / `End` jump to the ends
 *   — the WAI-ARIA list pattern.
 * - `Enter` / `Space` activate, `Escape` deselects.
 *
 * Focus is never moved on a timer and never lost to `body`: the roving index is
 * clamped when the board shrinks, so removing the focused element moves focus
 * to a neighbour rather than nowhere.
 */
export const AccessibilityTree: React.FC<AccessibilityTreeProps> = ({
  items,
  windowSize = DEFAULT_TREE_WINDOW,
  boardLabel = "Board",
  selectedId = null,
  liveMessage,
  onActivate,
  onFocusElement,
  onEscape,
}) => {
  const nodes = React.useMemo(() => buildAccessibilityNodes(items), [items]);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  const selectedIndex = selectedId
    ? nodes.findIndex((node) => node.id === selectedId)
    : -1;

  const [activeIndex, setActiveIndex] = React.useState(
    selectedIndex >= 0 ? selectedIndex : 0,
  );

  const windowStart = treeWindowStart(activeIndex, nodes.length, windowSize);
  const visible = React.useMemo(
    () => nodes.slice(windowStart, windowStart + windowSize),
    [nodes, windowStart, windowSize],
  );

  const pendingFocusRef = React.useRef<number | null>(null);

  // `focusIndex` changes the active index, which can move the window, so the
  // node to focus may not exist until after this render.
  React.useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null) {
      return;
    }
    const element = itemRefs.current[pending];
    if (element) {
      element.focus();
      pendingFocusRef.current = null;
    }
  }, [windowStart, activeIndex]);

  // Follow an external selection — a click on the canvas, or the document
  // changing under us — so the tree and the picture agree.
  React.useEffect(() => {
    if (selectedIndex >= 0) {
      setActiveIndex(selectedIndex);
    }
  }, [selectedIndex]);

  // Clamp when the board shrinks, so focus is never left on a removed node.
  React.useEffect(() => {
    if (activeIndex > nodes.length - 1) {
      setActiveIndex(Math.max(0, nodes.length - 1));
    }
  }, [nodes.length, activeIndex, windowStart]);

  const focusIndex = (index: number) => {
    setActiveIndex(index);
    pendingFocusRef.current = index;
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    index: number,
  ) => {
    const node = nodes[index];
    if (!node) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(node.id);
      return;
    }

    if (event.key === "Escape") {
      onEscape?.();
      return;
    }

    if (event.key === "Tab") {
      const { index: next, consumed } = resolveTabNavigation(
        event.shiftKey,
        index,
        nodes.length,
      );
      if (consumed) {
        event.preventDefault();
        focusIndex(next);
      }
      return;
    }

    const move = resolveTreeNavigation(event.key, index, nodes.length);
    if (!move) {
      return;
    }

    event.preventDefault();
    if (move === "next") {
      focusIndex(index + 1);
    } else if (move === "previous") {
      focusIndex(index - 1);
    } else if (move === "first") {
      focusIndex(0);
    } else {
      focusIndex(nodes.length - 1);
    }
  };

  return (
    <div
      className="firo-a11y"
      role="application"
      aria-label={boardLabel}
      aria-roledescription="whiteboard"
    >
      {/*
       * `role="list"` is not redundant here: `list-style: none` (see the
       * stylesheet) makes Safari drop a list's implicit list semantics, so the
       * role has to be stated. Same reason the position lives on the `li`.
       */}
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ul className="firo-a11y__list" role="list" aria-label="Board contents">
        {visible.map((node, offset) => {
          const index = windowStart + offset;
          return (
            <li
              key={node.id}
              aria-posinset={node.posinset}
              aria-setsize={node.setsize}
            >
              <div
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                className="firo-a11y__item"
                role="button"
                tabIndex={index === activeIndex ? 0 : -1}
                aria-label={node.label}
                aria-pressed={node.id === selectedId ? true : undefined}
                onClick={() => onActivate(node.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onFocus={() => {
                  setActiveIndex(index);
                  onFocusElement?.(node.id);
                }}
              />
            </li>
          );
        })}
      </ul>
      <div
        className="firo-a11y__live"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveMessage}
      </div>
    </div>
  );
};
