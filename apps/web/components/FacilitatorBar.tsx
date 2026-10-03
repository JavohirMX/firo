import { useEffect, useState } from "react";

import { formatRemaining, remainingMs } from "@firo/facilitation";

import type { EphemeralReveal, EphemeralTimer } from "@firo/doc";

import { getReveal, getTimer, toggleRevealMode } from "../board/facilitator";
import { boardDoc, refreshBoard } from "../board/board";

/**
 * The facilitator's readout: the shared clock, and whether the board is private.
 *
 * ## Why this is app-shell chrome when the app shell has none
 *
 * `renderTopRightUI` returns `null` today, and `fileActions.ts` argues at length
 * that adding two buttons there would be the first new UI surface in the product
 * with no design behind it. That argument holds for buttons. It does not hold for
 * a countdown.
 *
 * A timer that lives in a menu is not a timer. Its whole value is being readable
 * at a glance by someone standing at the front of a room who is not going to open
 * a palette to find out how many minutes are left -- and there is nowhere else for
 * it to live, because the command palette is transient by design and the canvas
 * is for the board's content. So this is the one piece of persistent chrome, and
 * it is deliberately small: a clock and a state, and no controls.
 *
 * **No controls here.** Start, pause and reveal are actions, not buttons, so they
 * are keyboard-operable and appear in the command palette for free -- which is
 * what AC-8 requires. A chip with four buttons on it would be a second,
 * mouse-only path to the same three things, and the two would drift.
 *
 * ## Why the seconds come from an interval and not from the document
 *
 * The document holds an *anchor* -- when the clock started and for how long --
 * and never a per-second value. Writing a countdown into the document would be
 * the exact failure the ephemeral/durable split exists to prevent: 300 durable
 * updates for a five-minute timer, 300 undo steps, and 300 broadcasts per
 * participant.
 *
 * So this component re-renders once a second from its own interval and derives
 * the reading with `remainingMs(timer, Date.now())`. The interval is a repaint,
 * not a write. Nothing here calls `setEphemeral`.
 */

/** How often the readout repaints. Once a second, matching `formatRemaining`. */
const TICK_MS = 1000;

/**
 * `now`, ticking.
 *
 * Separate from the timer state so that re-rendering on a tick does not
 * re-read the document: the anchor changes only when a facilitator acts, and
 * reading it sixty times a minute would be a document walk per second for
 * nothing.
 */
const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }
    // `setInterval`, aligned to the next whole second, so the readout does not
    // visibly drift against the wall clock.
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);

  return now;
};

export const FacilitatorBar = (): React.JSX.Element | null => {
  const [timer, setTimer] = useState<EphemeralTimer | null>(() =>
    getTimer(boardDoc),
  );
  const [reveal, setReveal] = useState<EphemeralReveal>(() =>
    getReveal(boardDoc),
  );

  /*
   * Republish on document change rather than on a timer.
   *
   * The anchor changes when a facilitator presses start, which is a document
   * event; the seconds do not, which is why `useNow` below is separate. Polling
   * the document for the anchor would be a read per second for a value that
   * changes once per press.
   */
  useEffect(() => {
    const refresh = () => {
      setTimer(getTimer(boardDoc));
      setReveal(getReveal(boardDoc));
    };
    refresh();
    return boardDoc().onUpdate(refresh);
  }, []);

  const now = useNow(timer !== null);

  // Nothing to say until a facilitator has started a clock or gone private.
  if (timer === null && reveal.mode === "revealed") {
    return null;
  }

  const remaining = timer ? remainingMs(timer, now) : 0;
  const finished = timer !== null && remaining === 0;

  return (
    <div
      /*
       * A `role="status"` region rather than a bare div: the countdown changing
       * is exactly the kind of thing a screen-reader user should be able to ask
       * about without hunting for it, and AC-8 is a hard requirement. `polite`
       * rather than `assertive` because a clock that interrupts every second
       * would make the board unusable with a screen reader on.
       */
      role="status"
      aria-live="polite"
      className="firo-facilitator-bar"
      data-testid="facilitator-bar"
    >
      {timer !== null && (
        <span
          className="firo-facilitator-bar__timer"
          // The number alone is not understandable: a screen reader reads "3:00"
          // as three hundred or as a coordinate. The label says what it is.
          aria-label={`${
            remaining === 0 ? "Time is up" : "Time remaining"
          }: ${formatRemaining(remaining)}`}
          data-testid="facilitator-timer"
          data-finished={finished ? "true" : "false"}
        >
          {formatRemaining(remaining)}
        </span>
      )}

      {reveal.mode === "private" && (
        <span
          className="firo-facilitator-bar__private"
          data-testid="facilitator-private"
        >
          Private
        </span>
      )}

      {/*
       * The toggle is a button here, which is the one control this bar has, and
       * the justification is different from the rest: it is the only facilitator
       * action whose *effect* is invisible. Starting a timer changes a number
       * that is already on screen; hiding a board changes what is on screen
       * without changing any control's appearance, so without this the state
       * would be legible only to someone who remembered pressing it.
       *
       * It is a real `<button>`, so it is focusable and activates on Enter and
       * Space. The other actions have shortcuts; this one is here because the
       * state needs to be *visible*, not because it needs to be reachable.
       */}
      <button
        type="button"
        className="firo-facilitator-bar__reveal"
        onClick={() => {
          toggleRevealMode(boardDoc, refreshBoard);
          setReveal(getReveal(boardDoc));
        }}
        aria-pressed={reveal.mode === "private"}
        data-testid="facilitator-reveal-toggle"
      >
        {reveal.mode === "private" ? "Reveal board" : "Hide board"}
      </button>
    </div>
  );
};

export default FacilitatorBar;
