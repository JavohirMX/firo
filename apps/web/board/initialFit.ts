/**
 * Initial view fitting. A board opens at scroll 0,0, which hides content near
 * the origin behind the chrome or off a phone screen. These helpers are pure
 * so the guards and the maths can be tested without a canvas.
 */

export const INITIAL_FIT_WINDOW_MS = 4000;

type Box = { x: number; y: number; width: number; height: number };

export type FitViewState = {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  newElement?: unknown;
  editingTextElement?: unknown;
};

/**
 * Whether the view may still be fitted automatically. False once the user has
 * moved the view or started drawing or typing, and after the opening window
 * (the window is a heuristic: a very slow first sync can miss it).
 */
export const canAutoFit = (state: FitViewState, elapsedMs: number): boolean =>
  elapsedMs <= INITIAL_FIT_WINDOW_MS &&
  state.scrollX === 0 &&
  state.scrollY === 0 &&
  state.zoom.value === 1 &&
  !state.newElement &&
  !state.editingTextElement;

/** Scroll and zoom that frame `elements` clear of the board chrome. */
export const computeFitView = (
  view: Pick<FitViewState, "width" | "height">,
  elements: readonly Box[],
): { zoom: number; scrollX: number; scrollY: number } | null => {
  if (elements.length === 0) {
    return null;
  }
  const minX = Math.min(...elements.map((el) => el.x));
  const minY = Math.min(...elements.map((el) => el.y));
  const maxX = Math.max(...elements.map((el) => el.x + el.width));
  const maxY = Math.max(...elements.map((el) => el.y + el.height));
  const left = 96;
  const top = 88;
  const availW = Math.max(120, view.width - left - 40);
  const availH = Math.max(120, view.height - top - 96);
  const boundsW = Math.max(1, maxX - minX);
  const boundsH = Math.max(1, maxY - minY);
  const zoom = Math.min(
    1,
    Math.max(0.1, Math.min(availW / boundsW, availH / boundsH)),
  );
  return {
    zoom,
    scrollX: (left + availW / 2) / zoom - (minX + maxX) / 2,
    scrollY: (top + availH / 2) / zoom - (minY + maxY) / 2,
  };
};

type Rect = { left: number; top: number; right: number; bottom: number };

/**
 * How far to scroll (in scene units, to add to scrollX) so a selection that
 * sits under a docked panel ends up beside it. Returns 0 when the selection
 * does not overlap the panel, or when moving it would push it under the left
 * chrome. Pure so the guard is testable without a canvas.
 */
export const selectionRevealScrollX = (
  selection: Rect,
  panel: Rect,
  zoom: number,
  options: { margin?: number; minLeft?: number } = {},
): number => {
  const margin = options.margin ?? 16;
  const minLeft = options.minLeft ?? 80;
  const overlapsX =
    selection.right > panel.left - margin && selection.left < panel.right;
  const overlapsY =
    selection.bottom > panel.top && selection.top < panel.bottom;
  if (!overlapsX || !overlapsY || zoom <= 0) {
    return 0;
  }
  const needed = selection.right - (panel.left - margin);
  // Never push the selection under the left rail.
  const room = selection.left - minLeft;
  const px = Math.min(needed, room);
  return px > 0 ? -px / zoom : 0;
};
