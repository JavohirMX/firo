import { describe, expect, it, vi } from "vitest";

import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";

import {
  getReveal,
  getTimer,
  resetFacilitationCache,
  subscribeToFacilitation,
  timerControls,
  toggleRevealMode,
} from "../facilitator";

/*
 * The facilitator's seam to the document.
 *
 * The dangerous property here is not that the timer works. It is that a vote and a
 * clock live *in the document* rather than in a component: a facilitator's vote
 * must be in the file that gets exported, and the clock must be the same number
 * for everyone watching it. A `useState` copy would be a second source of truth
 * that disagrees the moment a collaborator's change arrived.
 *
 * So these tests drive the document and read the document, with no React and no
 * DOM.
 */

const setup = () => {
  resetFacilitationCache();
  const document = new FiroDoc(new Y.Doc());
  const get = () => document;
  return { document, get };
};

describe("the timer", () => {
  it("starts from an anchor, not a countdown", () => {
    // The property that matters: the document holds one number of truth. Two
    // clients derive the same reading from it rather than each decrementing a
    // local copy and drifting.
    const { get } = setup();
    timerControls(get).start(1_700_000_000_000);

    const timer = getTimer(get);
    expect(timer?.startedAt).toBe(1_700_000_000_000);
    expect(timer?.durationMs).toBeGreaterThan(0);
  });

  it("holds nothing that changes on a tick", () => {
    const { get } = setup();
    timerControls(get).start(1_700_000_000_000);

    // Three fields, and no countdown among them. If a `remaining` that a UI
    // mutated per tick ever appeared here, every second would be a document
    // write -- which is the failure this design exists to prevent.
    expect(Object.keys(getTimer(get) ?? {}).sort()).toEqual([
      "durationMs",
      "remainingMs",
      "startedAt",
    ]);
  });

  it("pauses where it stood and resumes from there", () => {
    const { get } = setup();
    const controls = timerControls(get);
    controls.start(1_700_000_000_000);
    controls.pause(1_700_000_030_000);

    const paused = getTimer(get);
    expect(paused?.startedAt).toBeNull();

    controls.start(1_700_000_060_000);
    // Resumed from 30s elapsed, not from the beginning.
    expect(getTimer(get)?.remainingMs).toBe(paused?.remainingMs);
  });

  it("resets to the full duration", () => {
    const { get } = setup();
    const controls = timerControls(get);
    controls.start(1_700_000_000_000);
    controls.pause(1_700_000_030_000);
    controls.reset();

    const timer = getTimer(get);
    expect(timer?.remainingMs).toBe(timer?.durationMs);
    expect(timer?.startedAt).toBeNull();
  });

  it("adds a minute without restarting a running clock", () => {
    const { get } = setup();
    const controls = timerControls(get);
    const start = 1_700_000_000_000;
    controls.start(start);
    const before = getTimer(get)?.durationMs ?? 0;

    // No argument: an adjustment takes a delta, not a clock reading. Passing a
    // timestamp here was the bug this test was written for.
    controls.addMinute();

    const after = getTimer(get);
    expect(after?.durationMs).toBe(before + 60_000);
    // The anchor is preserved, so the clock did not jump back to zero.
    expect(after?.startedAt).toBe(start);
  });

  it("takes a minute away without going negative", () => {
    const { get } = setup();
    const controls = timerControls(get);
    controls.reset();

    // Five minutes on the clock, so subtracting six minutes must clamp rather
    // than report negative time. The first version of this test subtracted
    // twice and expected zero, which is simply the arithmetic wrong -- 300s
    // less 120s is 180s, and the assertion was failing for the right reason at
    // the wrong threshold.
    for (let i = 0; i < 6; i++) {
      controls.subtractMinute();
    }

    expect(getTimer(get)?.remainingMs).toBe(0);
  });

  it("produces zero document updates, not one per tick", () => {
    // The Phase 5 exit criterion, verbatim: a five-minute timer must not
    // produce a single Yjs document update.
    //
    // The first version of this test asserted `toHaveLength(1)` and failed,
    // having reasoned that "start" should cost one write. It costs *none*,
    // because the timer is ephemeral: it goes to awareness, which is relayed
    // rather than stored. Zero is the correct answer and the stronger one --
    // a durable write per start would put the clock in the file.
    const { get } = setup();
    const updates: unknown[] = [];
    get().ydoc.on("update", (update: unknown) => updates.push(update));

    const controls = timerControls(get);
    controls.start(1_700_000_000_000);
    for (let i = 1; i <= 15; i++) {
      // Fifteen "ticks" that read the clock and write nothing.
      getTimer(get);
    }
    controls.pause(1_700_000_030_000);
    controls.addMinute();
    controls.reset();

    expect(updates).toEqual([]);
  });

  it("still reaches awareness, so it is not simply lost", () => {
    // Zero document updates is only correct if the state went *somewhere*.
    // Awareness, not the document -- and this is the half that would otherwise
    // pass by doing nothing at all.
    const { get } = setup();
    timerControls(get).start(1_700_000_000_000);

    expect(get().awareness.getLocalState()?.firo).toMatchObject({
      timer: { startedAt: 1_700_000_000_000 },
    });
  });
});

describe("the reveal toggle", () => {
  it("starts revealed, so a board is never private by accident", () => {
    const { get } = setup();
    expect(getReveal(get).mode).toBe("revealed");
  });

  it("flips to private and back", () => {
    const { get } = setup();
    expect(toggleRevealMode(get).mode).toBe("private");
    expect(getReveal(get).mode).toBe("private");
    expect(toggleRevealMode(get).mode).toBe("revealed");
  });

  it("is ephemeral -- a new board is not private", () => {
    // The half of the split that stops a board reopening stuck.
    const { get } = setup();
    toggleRevealMode(get);

    const fresh = new FiroDoc(new Y.Doc());
    expect(fresh.getEphemeral().reveal.mode).toBe("revealed");
  });
});

describe("subscribers", () => {
  it("are told when the timer changes", () => {
    const { get } = setup();
    const listener = vi.fn();
    const unsubscribe = subscribeToFacilitation(get, listener);

    timerControls(get).start(1_700_000_000_000);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("are not told when nothing changed", () => {
    // A timer chip re-rendering on every keystroke is its own small bug, and the
    // only defence is that an unchanged value publishes nothing.
    const { get } = setup();
    const listener = vi.fn();
    subscribeToFacilitation(get, listener);

    timerControls(get).start(1_700_000_000_000);
    const afterStart = listener.mock.calls.length;

    timerControls(get).start(1_700_000_000_000);
    expect(listener.mock.calls.length).toBe(afterStart);
  });

  it("are not told about an unrelated element edit", () => {
    const { get, document } = setup();
    const listener = vi.fn();
    subscribeToFacilitation(get, listener);

    document.commit([
      {
        kind: "createElement",
        element: {
          id: "note-a",
          type: "stickynote",
        } as never,
      },
    ]);

    expect(listener).not.toHaveBeenCalled();
  });

  it("stop being called after unsubscribing", () => {
    const { get } = setup();
    const listener = vi.fn();
    const unsubscribe = subscribeToFacilitation(get, listener);
    unsubscribe();

    timerControls(get).start(1_700_000_000_000);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("caching", () => {
  it("reports the first read as no change", () => {
    // Priming, not a change. Without this the very first subscriber would be
    // woken for a value that had been there all along.
    const { get } = setup();
    const listener = vi.fn();
    subscribeToFacilitation(get, listener);

    getTimer(get);
    getReveal(get);
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not carry state across documents", () => {
    const { get } = setup();
    timerControls(get).start(1_700_000_000_000);

    resetFacilitationCache();
    const other = new FiroDoc(new Y.Doc());
    expect(getTimer(() => other)).toBeNull();
  });
});
