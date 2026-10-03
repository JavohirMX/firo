/**
 * The workshop timer.
 *
 * ## Why this file is arithmetic and not a countdown
 *
 * The obvious implementation is a `setInterval` that decrements a number every
 * second and writes it somewhere visible. It is wrong here, and not mainly for
 * performance reasons.
 *
 * A facilitator's timer is *shared*: five people are watching the same clock.
 * If the clock is a stored number that each client decrements locally, the five
 * copies drift apart, and the only way to resynchronise them is for one client
 * to win and overwrite the rest. If instead each client stored a per-second
 * value in the document, every tick would be a durable write — which is the
 * exact failure the ephemeral/durable split exists to prevent, and it would be
 * the loudest one in the project: a five-minute timer producing 300 updates,
 * 300 undo steps, and 300 broadcasts per participant.
 *
 * So the timer stores an *anchor* — when it started, and for how long — and
 * every client derives the remaining time from `Date.now()`. There is one number
 * of truth, it is the same for everyone, and a tick is a repaint rather than a
 * write. Drift is bounded by clock skew between machines rather than by
 * accumulating error, which is a better failure: it cannot grow.
 *
 * The anchor is ephemeral ([`@firo/doc`](../../doc/src/ephemeral.ts)), because
 * a timer is a property of the session, not of the board. Closing the tab
 * should not leave a clock frozen at 3:41 on a board someone reopens tomorrow,
 * and the number was never worth a place in the file.
 *
 * ## Pausing
 *
 * Pause does not stop a shared clock, because the clock is arithmetic. It
 * records a *new anchor* whose end lands where the old one did. That is why
 * `pause` returns a timer rather than a flag: there is no boolean that could be
 * wrong.
 */

/** Milliseconds in a second, named so the conversions read. */
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Durations offered in the UI. Kept here so tests and UI cannot disagree. */
export const TIMER_PRESETS = Object.freeze({
  "1m": 1 * MINUTE,
  "3m": 3 * MINUTE,
  "5m": 5 * MINUTE,
  "10m": 10 * MINUTE,
  "15m": 15 * MINUTE,
  "30m": 30 * MINUTE,
});

export type TimerPreset = keyof typeof TIMER_PRESETS;

/**
 * A shared countdown, stored as an anchor rather than a countdown.
 *
 * `startedAt` is the anchor and the only field that changes while running, which
 * is the point: a running timer holds one number, not one per tick.
 */
export type TimerState = Readonly<{
  /** When the current run began, in epoch ms. Null when not running. */
  startedAt: number | null;
  /** How long the current run lasts, in ms. */
  durationMs: number;
  /**
   * Milliseconds left at the moment the timer was paused or reset.
   *
   * Only meaningful while `startedAt` is null. Kept rather than derived because
   * the alternative — recomputing from `durationMs` — would silently restart a
   * paused timer at full length the moment it was paused.
   */
  remainingMs: number;
}>;

/** The timer as it appears before anyone has started one. */
export const IDLE_TIMER: TimerState = Object.freeze({
  startedAt: null,
  durationMs: 5 * MINUTE,
  remainingMs: 5 * MINUTE,
});

/**
 * Milliseconds left, derived from the anchor.
 *
 * Never negative: a timer that has run past its end reports zero rather than
 * counting up, because a workshop that overran has not gained time.
 */
export const remainingMs = (timer: TimerState, now: number): number => {
  if (timer.startedAt === null) {
    return Math.max(0, timer.remainingMs);
  }
  return Math.max(0, timer.durationMs - (now - timer.startedAt));
};

/** Whether the timer has run out. A paused timer never has. */
export const isFinished = (timer: TimerState, now: number): boolean =>
  remainingMs(timer, now) === 0;

/** Whether the clock is moving. */
export const isRunning = (timer: TimerState): boolean => timer.startedAt !== null;

/** Start, or restart, from the full duration. */
export const startTimer = (timer: TimerState, now: number): TimerState => ({
  startedAt: now,
  durationMs: timer.remainingMs || timer.durationMs,
  remainingMs: timer.remainingMs || timer.durationMs,
});

/**
 * Stop the clock where it stands.
 *
 * Returns a state rather than setting a flag, because with the time held as an
 * anchor there is no running/paused boolean to keep consistent with it. The
 * moment of pausing becomes the new `now` the next run is measured from.
 */
export const pauseTimer = (timer: TimerState, now: number): TimerState => ({
  startedAt: null,
  durationMs: timer.durationMs,
  remainingMs: remainingMs(timer, now),
});

/** Stop and return to the full duration. */
export const resetTimer = (timer: TimerState): TimerState => ({
  startedAt: null,
  durationMs: timer.durationMs,
  remainingMs: timer.durationMs,
});

/**
 * Change the duration without disturbing the anchor.
 *
 * Adding time to a running timer must extend its *end*, which is
 * `startedAt + durationMs` — so adding to `durationMs` while running is
 * correct, and recomputing from `remainingMs` would silently restart the clock.
 */
export const adjustTimer = (
  timer: TimerState,
  deltaMs: number,
): TimerState =>
  timer.startedAt === null
    ? {
        startedAt: null,
        durationMs: Math.max(0, timer.durationMs + deltaMs),
        remainingMs: Math.max(0, timer.remainingMs + deltaMs),
      }
    : {
        startedAt: timer.startedAt,
        durationMs: Math.max(0, timer.durationMs + deltaMs),
        remainingMs: timer.remainingMs,
      };

/** Replace the duration outright, as picking a preset does. */
export const setDuration = (timer: TimerState, durationMs: number): TimerState => {
  const safe = Math.max(0, durationMs);
  return timer.startedAt === null
    ? { startedAt: null, durationMs: safe, remainingMs: safe }
    : { startedAt: timer.startedAt, durationMs: safe, remainingMs: timer.remainingMs };
};

/**
 * Render as `m:ss`, the form a facilitator reads at a glance.
 *
 * Hours are dropped rather than shown: a workshop timer that reaches an hour is
 * misconfigured, and `59:00` is more legible than `1:00:00` at the back of a
 * room.
 */
export const formatRemaining = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / SECOND));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};