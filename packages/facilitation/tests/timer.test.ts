import { describe, expect, it } from "vitest";

import {
  adjustTimer,
  formatRemaining,
  IDLE_TIMER,
  isFinished,
  isRunning,
  pauseTimer,
  remainingMs,
  resetTimer,
  setDuration,
  startTimer,
  TIMER_PRESETS,
} from "../src/timer.js";

const T0 = 1_700_000_000_000;

describe("the workshop timer", () => {
  describe("as an anchor rather than a countdown", () => {
    it("derives the same remaining time for two clients with different clocks", () => {
      // The property that matters. If this fails, five people watching one clock
      // watch five different clocks.
      const started = startTimer(
        setDuration(IDLE_TIMER, TIMER_PRESETS["5m"]),
        T0,
      );

      const early = remainingMs(started, T0 + 60_000);
      const late = remainingMs(started, T0 + 61_500);

      expect(early).toBe(240_000);
      expect(late).toBe(238_500);
      // One source of truth, two derivations -- they differ only by elapsed time.
      expect(early - late).toBe(1_500);
    });

    it("holds no per-tick state, so a long run costs the same as a short one", () => {
      const started = startTimer(IDLE_TIMER, T0);
      const keys = Object.keys(started).sort();

      // Three fields, none of which is a countdown. A ticking implementation
      // needs a mutable field here, and its absence is the design.
      expect(keys).toEqual(["durationMs", "remainingMs", "startedAt"]);
      expect(JSON.stringify(started)).toBe(
        JSON.stringify(startTimer(IDLE_TIMER, T0)),
      );
    });

    it("never reports negative time", () => {
      const started = startTimer(setDuration(IDLE_TIMER, 1_000), T0);
      expect(remainingMs(started, T0 + 10_000)).toBe(0);
      expect(isFinished(started, T0 + 10_000)).toBe(true);
    });
  });

  describe("start, pause, reset", () => {
    it("counts down while running", () => {
      const timer = startTimer(IDLE_TIMER, T0);
      expect(isRunning(timer)).toBe(true);
      expect(remainingMs(timer, T0)).toBe(IDLE_TIMER.durationMs);
      expect(remainingMs(timer, T0 + 1_000)).toBe(
        IDLE_TIMER.durationMs - 1_000,
      );
    });

    it("freezes where it was paused", () => {
      // The reason `pause` returns a timer rather than setting a flag: there is
      // no boolean that could disagree with the anchor.
      const running = startTimer(IDLE_TIMER, T0);
      const paused = pauseTimer(running, T0 + 30_000);

      expect(isRunning(paused)).toBe(false);
      expect(remainingMs(paused, T0 + 30_000)).toBe(
        IDLE_TIMER.durationMs - 30_000,
      );
      // Time passing while paused must not consume the clock.
      expect(remainingMs(paused, T0 + 999_999)).toBe(
        IDLE_TIMER.durationMs - 30_000,
      );
    });

    it("resumes from where it stopped, not from the beginning", () => {
      const paused = pauseTimer(startTimer(IDLE_TIMER, T0), T0 + 30_000);
      const resumed = startTimer(paused, T0 + 60_000);

      expect(remainingMs(resumed, T0 + 60_000)).toBe(
        IDLE_TIMER.durationMs - 30_000,
      );
    });

    it("returns to the full duration on reset", () => {
      const paused = pauseTimer(startTimer(IDLE_TIMER, T0), T0 + 30_000);
      const reset = resetTimer(paused);

      expect(remainingMs(reset, T0)).toBe(IDLE_TIMER.durationMs);
      expect(isRunning(reset)).toBe(false);
    });

    it("restarts a finished timer from the beginning", () => {
      const short = setDuration(IDLE_TIMER, 1_000);
      const finished = startTimer(short, T0);
      expect(isFinished(finished, T0 + 5_000)).toBe(true);

      // Starting a finished timer gives a full run, not a zero-length one.
      const restarted = startTimer(finished, T0 + 5_000);
      expect(remainingMs(restarted, T0 + 5_000)).toBe(1_000);
    });
  });

  describe("adjusting the duration", () => {
    it("adds time to a paused timer without starting it", () => {
      const longer = adjustTimer(IDLE_TIMER, 60_000);
      expect(remainingMs(longer, T0)).toBe(IDLE_TIMER.durationMs + 60_000);
      expect(isRunning(longer)).toBe(false);
    });

    it("extends the end of a running timer rather than restarting it", () => {
      // The subtle one, and the reason this test exists at all. The end is
      // `startedAt + durationMs`, so while running, adding to `durationMs` is
      // correct. A version that also added to `remainingMs` passes every check
      // above -- the anchor is preserved, and `remainingMs` is never read while
      // `startedAt` is set -- so it looks right and is wrong.
      //
      // What it does is make the *stored* remaining time disagree with the
      // derived one, by exactly the amount just added. The day the anchor is
      // paused, the clock jumps forward by a whole minute that was never run.
      // That is why this asserts on the stored field and not only on the
      // derived reading.
      const running = startTimer(IDLE_TIMER, T0);
      const longer = adjustTimer(running, 60_000);

      expect(longer.startedAt).toBe(T0);
      expect(remainingMs(longer, T0)).toBe(IDLE_TIMER.durationMs + 60_000);
      expect(remainingMs(longer, T0 + 10_000)).toBe(
        IDLE_TIMER.durationMs + 50_000,
      );

      // The stored field must not have drifted from the derived one.
      expect(longer.remainingMs).toBe(running.remainingMs);
    });

    it("does not lose a minute when a lengthened timer is paused", () => {
      // The consequence of the above, stated as the user would meet it: add a
      // minute to a running timer, pause it, and the minute is still there.
      const running = startTimer(IDLE_TIMER, T0);
      const lengthened = adjustTimer(running, 60_000);
      const paused = pauseTimer(lengthened, T0 + 10_000);

      expect(remainingMs(paused, T0 + 10_000)).toBe(
        IDLE_TIMER.durationMs + 50_000,
      );
    });

    it("removes time without going negative", () => {
      const short = adjustTimer(IDLE_TIMER, -IDLE_TIMER.durationMs - 60_000);
      expect(remainingMs(short, T0)).toBe(0);
    });

    it("replaces the duration when a preset is chosen", () => {
      const ten = setDuration(IDLE_TIMER, TIMER_PRESETS["10m"]);
      expect(remainingMs(ten, T0)).toBe(600_000);
    });

    it("keeps a running timer's anchor when the duration is replaced", () => {
      const running = startTimer(IDLE_TIMER, T0);
      const changed = setDuration(running, TIMER_PRESETS["1m"]);

      expect(changed.startedAt).toBe(T0);
      expect(remainingMs(changed, T0)).toBe(60_000);
    });
  });

  describe("formatting", () => {
    it("renders m:ss, padded", () => {
      expect(formatRemaining(0)).toBe("0:00");
      expect(formatRemaining(1_000)).toBe("0:01");
      expect(formatRemaining(61_000)).toBe("1:01");
      expect(formatRemaining(600_000)).toBe("10:00");
    });

    it("rounds up, so a timer never shows 0:00 while time remains", () => {
      // The last moment before zero should read 0:01. Truncating would show
      // "0:00" for a full second while the clock was still running, which reads
      // as finished.
      expect(formatRemaining(1)).toBe("0:01");
      expect(formatRemaining(999)).toBe("0:01");
      expect(formatRemaining(1_000)).toBe("0:01");
      expect(formatRemaining(1_001)).toBe("0:02");
    });

    it("drops hours rather than showing 60:00", () => {
      expect(formatRemaining(3_600_000)).toBe("60:00");
    });

    it("never renders a negative clock", () => {
      expect(formatRemaining(-5_000)).toBe("0:00");
    });

    it("never renders NaN, however it arrives", () => {
      // `Math.max(0, NaN)` is `NaN`, so a clamp does not make a non-finite input
      // safe. This is a rendering function a facilitator reads at the back of a
      // room, and `"NaN:NaN"` reads as a bug in the tool rather than as a
      // disagreement about the time -- so the guarantee belongs here.
      expect(formatRemaining(NaN)).toBe("0:00");
      expect(formatRemaining(Infinity)).toBe("0:00");
      expect(formatRemaining(-Infinity)).toBe("0:00");
    });
  });

  describe("state arriving from the wire", () => {
    /*
     * `TimerState` travels in the document's ephemeral state, which is awareness,
     * and awareness is whatever a peer sent. `remainingMs` is therefore the
     * boundary where untrusted numbers enter, and these are the values a peer
     * running an older build -- or a hand-crafted frame -- can send.
     */

    it("reports zero rather than NaN for a non-finite anchor", () => {
      const fromPeer = {
        startedAt: Number.NaN,
        durationMs: 300_000,
        remainingMs: 300_000,
      };
      expect(remainingMs(fromPeer, T0)).toBe(0);
      expect(formatRemaining(remainingMs(fromPeer, T0))).toBe("0:00");
    });

    it("reports zero rather than Infinity for a non-finite duration", () => {
      const fromPeer = {
        startedAt: T0,
        durationMs: Number.POSITIVE_INFINITY,
        remainingMs: 300_000,
      };
      expect(remainingMs(fromPeer, T0)).toBe(0);
    });

    it("reports zero rather than NaN when `now` is not a number", () => {
      const running = startTimer(IDLE_TIMER, T0);
      expect(remainingMs(running, Number.NaN)).toBe(0);
      expect(remainingMs(running, Number.POSITIVE_INFINITY)).toBe(0);
    });

    it("does not go negative for a peer whose clock is behind", () => {
      // The benign case, and the reason zero is the right answer for a time we
      // cannot compute: a peer whose clock lags reports a longer timer, never a
      // negative one.
      const running = startTimer(IDLE_TIMER, T0);
      expect(remainingMs(running, T0 - 10_000)).toBeGreaterThan(0);
    });
  });

  describe("presets", () => {
    it("offers whole minutes, ascending", () => {
      const values = Object.values(TIMER_PRESETS);
      expect(values.every((ms) => ms % 60_000 === 0)).toBe(true);
      expect([...values].sort((a, b) => a - b)).toEqual(values);
    });

    it("includes the five-minute workshop slot", () => {
      expect(TIMER_PRESETS["5m"]).toBe(300_000);
    });
  });
});
