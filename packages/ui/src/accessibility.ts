/**
 * The board's accessibility tree, as data.
 *
 * ## Why this is a separate module from the component
 *
 * A screen reader reads a canvas as a single `<canvas>` element and nothing
 * else ([`docs/trd/09-accessibility.md`](../../../docs/trd/09-accessibility.md)).
 * Fixing that means a parallel DOM tree mirroring the scene — and the part that
 * is easy to get wrong is not the markup, it is the *naming*: what noun an
 * element is announced as, whether its text is included, and where it sits in
 * the set ("4 of 12").
 *
 * That naming is pure. It is computed here, with no React and no element
 * knowledge, so it can be tested directly and so this package stays free of a
 * dependency on `@firo/element`. The host maps its own elements into
 * `AccessibilityTreeItem`s; this module turns those into labels and positions.
 *
 * ## The label shape
 *
 * The shape is the one `trd/09` specifies by example:
 *
 * ```
 * Sticky note: Write the RFC. Yellow. Position 4 of 12.
 * ```
 *
 * Type first, then text, then the qualities a sighted user takes from the
 * picture (colour, lock), then position. Colour is named rather than encoded —
 * "never encode state in colour alone" cuts both ways, so a colour a screen
 * reader cannot see is described in words or not at all.
 */

/**
 * One element of the board, reduced to what a screen reader needs.
 *
 * Deliberately structural: `@firo/ui` is dependency-free, so the host does the
 * mapping from its element types into this shape.
 */
export interface AccessibilityTreeItem {
  /** Stable element id — the same id the document uses. */
  id: string;
  /** The noun a screen reader announces: "Sticky note", "Rectangle", "Frame". */
  kind: string;
  /** Text content, if the element has any. Whitespace is normalised. */
  text?: string;
  /** A named colour, e.g. "Yellow". Omitted when no name is known. */
  colorName?: string;
  /** Locked elements are announced, because a locked element refuses edits. */
  locked?: boolean;
}

/** A positioned, named node, ready to render. */
export interface AccessibilityNode {
  id: string;
  /** The full accessible name. */
  label: string;
  /** 1-based position, for `aria-posinset`. */
  posinset: number;
  /** Total elements, for `aria-setsize`. */
  setsize: number;
}

/**
 * Collapse whitespace so a multi-line sticky note is one spoken sentence
 * rather than a run of line breaks.
 */
const normaliseText = (text: string | undefined): string =>
  (text ?? "").replace(/\s+/g, " ").trim();

/**
 * Describe one element for a screen reader.
 *
 * `posinset` and `setsize` are passed rather than derived so a caller that is
 * virtualising the tree can still announce a true position — a window of 50
 * rendered nodes out of 10,000 should say "4 of 10000", not "4 of 50".
 */
export const describeAccessibilityItem = (
  item: AccessibilityTreeItem,
  posinset: number,
  setsize: number,
): string => {
  const text = normaliseText(item.text);
  const segments = [text ? `${item.kind}: ${text}` : item.kind];

  if (item.colorName) {
    segments.push(item.colorName);
  }
  if (item.locked) {
    segments.push("Locked");
  }
  segments.push(`Position ${posinset} of ${setsize}`);

  return `${segments.join(". ")}.`;
};

/**
 * Build the renderable nodes for a list of items.
 *
 * `setsize` is the total list, not a rendered window, so this composes with
 * virtualisation: hand it the full list and slice for render, or hand it a
 * window and set `setsize` yourself with `describeAccessibilityItem`.
 */
export const buildAccessibilityNodes = (
  items: readonly AccessibilityTreeItem[],
): AccessibilityNode[] => {
  const setsize = items.length;
  return items.map((item, index) => ({
    id: item.id,
    label: describeAccessibilityItem(item, index + 1, setsize),
    posinset: index + 1,
    setsize,
  }));
};

/**
 * How many tree nodes are rendered at once.
 *
 * Large enough that a screen reader user navigates without the window chasing
 * them on every arrow key, small enough that a 10,000-element board does not
 * build a 10,000-node DOM on every debounced refresh. The full item list is
 * always held by the component: this bounds the *render*, not the data.
 */
export const DEFAULT_TREE_WINDOW = 100;

/**
 * The first index to render, such that `activeIndex` is inside the window.
 *
 * Clamped at both ends so the window does not start before the first element or
 * run past the last, which would leave blank space at the end of a list a
 * screen reader is reading linearly.
 */
export const treeWindowStart = (
  activeIndex: number,
  length: number,
  windowSize: number,
): number => {
  if (length <= windowSize) {
    return 0;
  }
  const centred = activeIndex - Math.floor(windowSize / 2);
  return Math.max(0, Math.min(centred, length - windowSize));
};

/**
 * The key that moves focus forward within the tree by one element, or `null`
 * at the end of the list.
 *
 * `Tab` and `Shift+Tab` move between elements, and `ArrowDown`/`ArrowUp` do the
 * same thing — the arrow keys are the WAI-ARIA list pattern, and the docs ask
 * for Tab specifically. Both are honoured; when the tree has focus and there is
 * nowhere further to go, nothing is consumed, so Tab leaves the board rather
 * than trapping the user inside it.
 */
export const resolveTreeNavigation = (
  key: string,
  index: number,
  length: number,
): "next" | "previous" | "first" | "last" | null => {
  switch (key) {
    case "ArrowDown":
      if (index < length - 1) {
        return "next";
      }
      return null;
    case "ArrowUp":
      if (index > 0) {
        return "previous";
      }
      return null;
    case "Home":
      return length > 0 ? "first" : null;
    case "End":
      return length > 0 ? "last" : null;
    default:
      return null;
  }
};

/**
 * Where a `Tab`/`Shift+Tab` inside the tree should land, and whether it is
 * consumed.
 *
 * `Tab` is only consumed when it moves to another element *within* the tree. At
 * the ends the browser keeps the key, so the user can leave — a widget that
 * swallows Tab is the trap `trd/09` warns about ("Focus is never lost").
 */
export const resolveTabNavigation = (
  shiftKey: boolean,
  index: number,
  length: number,
): { index: number; consumed: boolean } => {
  const target = shiftKey ? index - 1 : index + 1;
  if (target < 0 || target >= length) {
    return { index, consumed: false };
  }
  return { index: target, consumed: true };
};
