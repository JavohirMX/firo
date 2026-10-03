/**
 * `@firo/facilitation` — the loop a facilitator runs a workshop with.
 *
 * Three features, and the shape they share is the reason this is one package
 * rather than three: **every one of them is a pure function over plain data,
 * returning mutations or a new state rather than touching a document.** Nothing
 * here holds a timer handle, reads a clock without being given one, or commits
 * anything.
 *
 * That is not tidiness. It is what makes the parts that *are* subtle testable
 * without a browser or a Yjs document, and the parts that are subtle are exactly
 * the ones that would otherwise be verified by clicking:
 *
 * - **The timer** ([`timer.ts`](./timer.ts)) is stored as an anchor, not a
 *   countdown, so five people watching one clock cannot drift apart and a tick
 *   is a repaint rather than a write. Getting that wrong means a five-minute
 *   timer produces 300 durable updates.
 * - **Voting** ([`voting.ts`](./voting.ts)) is one record per vote rather than a
 *   counter per element, which is what makes "change my vote" and "anonymous"
 *   possible at all — and keeps a board's file growing with its content rather
 *   than with the history of its meetings.
 * - **Reveal** ([`reveal.ts`](./reveal.ts)) splits a session toggle (ephemeral)
 *   from the per-element flags (durable), and exposes one `visibleElements` for
 *   the canvas and the exporter to share, because the leak that matters is the
 *   hidden note inside the exported PNG.
 */

export {
  TIMER_PRESETS,
  IDLE_TIMER,
  remainingMs,
  isFinished,
  isRunning,
  startTimer,
  pauseTimer,
  resetTimer,
  adjustTimer,
  setDuration,
  formatRemaining,
  type TimerState,
  type TimerPreset,
} from "./timer.js";

export {
  VOTE_COLLECTION_ID,
  VOTE_TARGET_KEY,
  VOTER_KEY,
  PLACED_AT_KEY,
  voteCollection,
  voteFromRecord,
  votesFromRecords,
  voteToRecord,
  findVote,
  placeVote,
  removeVote,
  tally,
  leaders,
  type Vote,
} from "./voting.js";

export {
  DEFAULT_REVEAL_STATE,
  setRevealMode,
  toggleReveal,
  isVisible,
  visibleElements,
  hasHidden,
  type RevealState,
  type RevealMode,
} from "./reveal.js";
