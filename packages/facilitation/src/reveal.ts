/**
 * Private mode and reveal.
 *
 * ## The two halves, and why they are on opposite sides of the split
 *
 * "Hide the board until everyone has written their ideas" is two different
 * pieces of state that are easy to conflate:
 *
 * - **Whether the reveal has happened** is session state. It belongs to
 *   awareness, next to the timer, for the same reason: a facilitator who closes
 *   the tab should not leave a board stuck in private mode, and no two runs of
 *   the same workshop should share an answer.
 * - **Which elements are hidden** is durable. A note marked "hide until reveal"
 *   must still be hidden when the board is reopened tomorrow with the same
 *   session, and it must survive the export that carries the board to the next
 *   facilitator. Awareness is discarded when a peer disconnects, which is exactly
 *   when this must not be.
 *
 * Getting this backwards in either direction is a real bug: put the toggle in
 * the document and every save carries a stale "still hidden"; put the per-element
 * flags in awareness and the board forgets its own state between sessions.
 *
 * ## The leak this has to prevent
 *
 * The risk that is easy to miss is not the canvas. It is **export**. A
 * facilitator hides a board to collect ideas honestly, then exports a PNG to put
 * on a screen — and the hidden notes are in the file, because the exporter walks
 * the scene rather than asking what is visible. `visibleElements` exists so there
 * is one answer to that question, used by the canvas and by the exporter alike.
 */

/** Whether a session is showing everything or hiding the marked elements. */
export type RevealMode = "private" | "revealed";

/** The board-level toggle, ephemeral. Carried in the document's ephemeral state. */
export type RevealState = Readonly<{
  mode: RevealMode;
}>;

/** The default: nothing hidden, so a board is never private by accident. */
export const DEFAULT_REVEAL_STATE: RevealState = Object.freeze({
  mode: "revealed",
});

/** Switch modes. */
export const setRevealMode = (
  state: RevealState,
  mode: RevealMode,
): RevealState => Object.freeze({ mode });

/** Flip modes. */
export const toggleReveal = (state: RevealState): RevealState =>
  setRevealMode(state, state.mode === "private" ? "revealed" : "private");

/**
 * Whether an element should be drawn.
 *
 * `hiddenUntilRevealed` is durable and defaults to absent, so a board written
 * before private mode existed reads as fully visible with no migration — the
 * `undefined` case and `false` are the same answer, and that is deliberate.
 */
export const isVisible = (
  element: { hiddenUntilRevealed?: boolean | null },
  reveal: RevealState,
): boolean => reveal.mode === "revealed" || !element.hiddenUntilRevealed;

/**
 * The elements that should be drawn, in the order given.
 *
 * One function, called by the renderer and by the exporter. The alternative —
 * each caller filtering for itself — is how "private mode leaked through the
 * PNG" happens: the canvas filters, and something added later does not.
 */
export const visibleElements = <T extends { hiddenUntilRevealed?: boolean | null }>(
  elements: readonly T[],
  reveal: RevealState,
): T[] => elements.filter((element) => isVisible(element, reveal));

/**
 * Whether anything on the board is currently hidden.
 *
 * Used to decide whether "reveal" is worth offering, and to warn before an
 * export that would carry hidden content.
 */
export const hasHidden = (
  elements: readonly { hiddenUntilRevealed?: boolean | null }[],
  reveal: RevealState,
): boolean =>
  reveal.mode === "private" &&
  elements.some((element) => element.hiddenUntilRevealed === true);