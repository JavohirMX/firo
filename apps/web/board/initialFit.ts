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
