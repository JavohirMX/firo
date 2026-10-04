/**
 * The facilitator's side of the board: the shared clock, the reveal toggle, and
 * the votes.
 *
 * ## Why this file is a module and not React state
 *
 * All three features are already implemented as pure functions in
 * [`@firo/facilitation`](../../../facilitation/src/index.ts) — `startTimer`,
 * `toggleReveal`, `placeVote` — and all three *persist through the document*.
 * The timer and the reveal toggle ride in the document's **ephemeral** state
 * (awareness, never persisted), and a vote is a **record** in the record store.
 *
 * So none of them belongs in a React state hook. A `useState` copy would be a
 * second source of truth that disagrees with the document the moment a
 * collaborator's change arrived, and it would put a vote in a component instead
 * of in the file the person is about to export.
 *
 * This module is the seam: it reads and writes the document, and it exposes a
 * `subscribe` so a component can re-render. It holds no state of its own beyond
 * the last value it published, which exists only to avoid waking subscribers for
 * a change that did not happen.
 *
 * ## The timer never ticks here
 *
 * `setEphemeral` writes the anchor once, at the moment the facilitator presses
 * start. Nothing in this file runs on a one-second interval, and nothing writes
 * per tick — see the reasoning in
 * [`@firo/facilitation/src/timer.ts`](../../../facilitation/src/timer.ts). A
 * component that wants the seconds on screen re-renders from its own interval and
 * reads `remainingMs(timer, Date.now())`, which is a pure derivation from the one
 * number the document holds.
 */

import {
  adjustTimer,
  pauseTimer,
  resetTimer,
  startTimer,
  toggleReveal,
} from "@firo/facilitation";

import { EMPTY_EPHEMERAL_STATE } from "@firo/doc";

import type { FiroDoc } from "@firo/doc";
import type {
  EphemeralPresentation,
  EphemeralReveal,
  EphemeralTimer,
} from "@firo/doc";
import type { RevealState, Vote } from "@firo/facilitation";
import type { FiroRecord } from "@firo/schema";

/** The duration a timer starts at when the facilitator has not chosen one. */
const DEFAULT_TIMER_MS = 5 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const TIMER_DEFAULT: EphemeralTimer = {
  startedAt: null,
  durationMs: DEFAULT_TIMER_MS,
  remainingMs: DEFAULT_TIMER_MS,
};

/**
 * Whether two timers are the same clock reading.
 *
 * By value, not by identity: `startTimer` and friends return fresh objects, so
 * pressing start twice on a paused timer produces two equal timers and an
 * identity check would call that a change and wake every subscriber for nothing.
 */
const sameTimer = (
  a: EphemeralTimer | null,
  b: EphemeralTimer | null,
): boolean => {
  if (a === b) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return (
    a.startedAt === b.startedAt &&
    a.durationMs === b.durationMs &&
    a.remainingMs === b.remainingMs
  );
};

/**
 * Whether two presentation states mean the same thing to a facilitator.
 *
 * By value, and only over the three fields that travel. `PresentationState` also
 * carries an optional `frameOf` **function** that the board seam rebuilds per pull;
 * comparing it would call a freshly-allocated closure a change on every repaint.
 */
const samePresentation = (
  a: EphemeralPresentation,
  b: EphemeralPresentation,
): boolean => {
  if (a === b) {
    return true;
  }
  return (
    a.active === b.active &&
    a.index === b.index &&
    a.slideIds.length === b.slideIds.length &&
    a.slideIds.every((id, i) => id === b.slideIds[i])
  );
};

/** Called whenever the facilitator's state changes. */
export type FacilitatorListener = () => void;

const listeners = new Set<FacilitatorListener>();

/**
 * The last timer and reveal published, so an unrelated document change does not
 * wake a facilitator's UI.
 *
 * Held here rather than read back from the document because `getEphemeral()`
 * allocates nothing but the comparison is by value on two small objects, and a
 * re-render of a timer chip on every keystroke would be its own small bug.
 */
let lastTimer: EphemeralTimer | null = null;
let lastReveal: EphemeralReveal = { mode: "revealed" };
/**
 * The cached presentation, primed from the document.
 *
 * Read off `EMPTY_EPHEMERAL_STATE` rather than spelled out again, because a second
 * literal here is a second thing to keep in step with the document's own default —
 * and a stale "not presenting" default in the cache would suppress the very first
 * change after a board switch, which is the bug `resetFacilitationCache` exists for.
 */
let lastPresentation: EphemeralPresentation =
  EMPTY_EPHEMERAL_STATE.presentation;
/** Whether the cached halves have been primed from the document yet. */
let primed = false;

const notify = (): void => {
  for (const listener of [...listeners]) {
    listener();
  }
};

/**
 * Read the document's facilitator state, publishing if it has changed.
 *
 * @returns whether anything changed
 */
const sync = (getDocument: () => FiroDoc): boolean => {
  const ephemeral = getDocument().getEphemeral();

  if (!primed) {
    primed = true;
    lastTimer = ephemeral.timer;
    lastReveal = ephemeral.reveal;
    lastPresentation = ephemeral.presentation;
    return false;
  }

  /*
   * The presentation half is compared by value rather than by identity, for the
   * reason `sameTimer` exists: a facilitator stepping through a deck with a held
   * arrow key reaches the last slide and stops, and `stepSlide` hands back an equal
   * state. An identity check calls that a change and re-renders the slide readout on
   * every keypress at the end of a deck.
   */
  const changed =
    lastTimer !== ephemeral.timer ||
    lastReveal !== ephemeral.reveal ||
    !samePresentation(lastPresentation, ephemeral.presentation);

  if (changed) {
    lastTimer = ephemeral.timer;
    lastReveal = ephemeral.reveal;
    lastPresentation = ephemeral.presentation;
  }
  return changed;
};

/**
 * Announce that facilitator state has changed.
 *
 * For a seam that writes ephemeral state directly rather than through a function in
 * this module — currently `presentation.ts`, which also has to move the viewport and
 * so cannot live here.
 *
 * ## Why this exists at all
 *
 * Ephemeral state is awareness, so it produces no document update and therefore no
 * `onUpdate`: `FacilitatorBar` was listening to `boardDoc().onUpdate` and repainting
 * on durable changes only, which meant a facilitator who started the timer with
 * `Alt+T` got no clock until some *other* edit happened to reach the document. The
 * reveal toggle escaped the bug only because its button re-read the state inline,
 * which is the kind of accidental immunity that stops being accidental the moment
 * somebody moves the control to the keyboard.
 *
 * Exported rather than folded into `sync`, because `sync` answers "has this changed?"
 * and the caller here has already changed it — asking again would compare the cache
 * against a state it was just updated from and report no change, so nothing would be
 * announced. The cache is refreshed by the next `getTimer`/`getReveal`/`sync` call,
 * which every subscriber makes as its first act.
 *
 * @internal Called from `presentation.ts`; not a public API.
 */
export const announceFacilitationChange = (): void => {
  notify();
};

/**
 * Subscribe to facilitator changes.
 *
 * The document is the only thing that changes this state — there is no local
 * mutation to miss — so this is driven from the document's own update signal
 * rather than from anything a caller does.
 */
export const subscribeToFacilitation = (
  getDocument: () => FiroDoc,
  listener: FacilitatorListener,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The shared clock, as the document holds it. Null when none was ever started. */
export const getTimer = (getDocument: () => FiroDoc): EphemeralTimer | null => {
  sync(getDocument);
  return lastTimer;
};

/** The reveal toggle. */
export const getReveal = (getDocument: () => FiroDoc): RevealState => {
  sync(getDocument);
  return lastReveal;
};

/**
 * Every vote on the board, read out of the record store.
 *
 * Filtering to the votes collection is the caller's business, not this
 * function's: `votesFromRecords` already skips records that are not votes, and a
 * board's other records are none of this module's concern.
 */
export const getVotes = (
  getDocument: () => FiroDoc,
  fromRecords: (records: readonly FiroRecord[]) => Vote[],
): Vote[] => fromRecords(getDocument().read().records);

/**
 * Start, pause, reset or adjust the shared clock.
 *
 * Each of these computes the next state with `@firo/facilitation`'s pure
 * functions and writes it once. A tick is never written — see the module header.
 */
export const timerControls = (getDocument: () => FiroDoc) => {
  const document = getDocument;

  /** Read-modify-write against the document's current timer. */
  const withTimer = (
    change: (timer: EphemeralTimer, now: number) => EphemeralTimer,
    now: number = Date.now(),
  ): void => {
    const current = document().getEphemeral().timer ?? {
      startedAt: null,
      durationMs: DEFAULT_TIMER_MS,
      remainingMs: DEFAULT_TIMER_MS,
    };
    /*
     * Compare across the mutation rather than through the module's cache.
     *
     * The cache exists to stop an *unrelated* document change from waking a
     * subscriber, and it has a priming flag because the first read has nothing
     * to compare against. Relying on that flag for change detection meant the
     * first real change after a fresh start was swallowed as "priming" -- so
     * pressing start did not notify anybody, and the timer chip did not appear
     * until the second press.
     *
     * Holding the before-value locally is immune to ordering: it cannot be
     * confused with a first read.
     */
    const before = current;
    const next = change(current, now);
    if (sameTimer(before, next)) {
      return;
    }
    document().setEphemeral({ timer: next });
    sync(document);
    notify();
  };

  return {
    start: (now?: number) => withTimer(startTimer, now),
    pause: (now?: number) => withTimer(pauseTimer, now),

    /*
     * The two adjustments take a *delta*, not a clock reading, so they cannot go
     * through `withTimer`'s `(timer, now)` signature -- passing a timestamp where
     * a delta is expected added sixty thousand milliseconds to a date near the
     * epoch, which is a plausible-looking but completely wrong duration.
     */
    addMinute: () => withTimer((timer) => adjustTimer(timer, MINUTE_MS)),
    subtractMinute: () => withTimer((timer) => adjustTimer(timer, -MINUTE_MS)),
    reset: () => withTimer(() => resetTimer(TIMER_DEFAULT)),
  };
};

/** Flip between private and revealed. */
/**
 * Flip between private and revealed, and repaint the canvas.
 *
 * ## Why this has to call `pull()` itself
 *
 * The reveal mode is ephemeral, so flipping it commits nothing and notifies
 * nobody. `FiroDoc.subscribe` fires on durable changes only, so `BoardSync` never
 * hears about it and never repaints. Without the call below, pressing "reveal"
 * would update the toggle's own UI and nothing else — the canvas would keep
 * showing the notes it was supposed to be hiding, which is the worst possible
 * failure for the feature: it looks like it worked.
 *
 * `pull` is the refresh point precisely because it is public and idempotent.
 * Reading the mode fresh on every call is what makes this correct rather than
 * racy — see `BoardSync.pull` and `withheldIds`.
 *
 * Repainting is deliberately *not* a document change, so it stays out of the
 * undo stack: nobody pressed undo, and an undo entry labelled "reveal" on a board
 * whose file never changed would be a lie.
 */
export const toggleRevealMode = (
  getDocument: () => FiroDoc,
  refresh?: () => void,
): RevealState => {
  const before = getDocument().getEphemeral().reveal;
  const next = toggleReveal(before);
  getDocument().setEphemeral({ reveal: next });
  /*
   * Compared against the value read immediately above rather than through the
   * module cache, for the reason `withTimer` gives: a cache with a priming flag
   * cannot tell a first read from a first change, and the first change after a
   * fresh start was being swallowed.
   */
  lastReveal = next;
  if (next !== before) {
    refresh?.();
    notify();
  }
  return next;
};

/**
 * Reset the module's cached state.
 *
 * @internal For tests. A cached "last published" value outliving the document it
 * described would make the first change after a board switch invisible — the
 * symptom being a timer chip that does not update until the second press.
 */
export const resetFacilitationCache = (): void => {
  primed = false;
  lastTimer = null;
  lastReveal = { mode: "revealed" };
  lastPresentation = EMPTY_EPHEMERAL_STATE.presentation;
  listeners.clear();
};

/*
 * No re-export of `boardDoc`, deliberately.
 *
 * Every function here takes the document as a parameter, so nothing in this module
 * needs it — and re-exporting it made `facilitatorActions.ts` -> `facilitator.ts`
 * -> `board.ts` -> `facilitatorActions.ts`, a cycle. It measured as benign under
 * vitest's ESM, and "benign" is not "sound": `packages/doc/src/ephemeral.ts`
 * refuses to import across a cycle for exactly this reason, and
 * `workspace-wiring.test.ts` exists because a half-wired package is invisible until
 * it is not.
 */
