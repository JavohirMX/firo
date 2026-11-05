import * as Y from "yjs";

import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";

import { FiroDoc } from "@firo/doc";

import { afterEach, describe, expect, it } from "vitest";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import {
  timerControls,
  toggleRevealMode,
  getTimer,
  getReveal,
  setSessionShareRole,
  subscribeToFacilitation,
} from "../facilitator";
import {
  getPresentation,
  stepPresentation,
  stopPresenting,
} from "../presentation";
import {
  startVotingRound,
  endVotingRound,
  readSession,
} from "../votingSession";
import { facilitatorActions } from "../facilitatorActions";

import {
  getSession,
  mayChangeSession,
  writeSession,
  yieldLosingClaim,
} from "../sharedSession";

const docs: FiroDoc[] = [];
const make = () => {
  const doc = new FiroDoc(new Y.Doc());
  docs.push(doc);
  return doc;
};
const relay = (from: FiroDoc, to: FiroDoc) =>
  applyAwarenessUpdate(
    to.awareness,
    encodeAwarenessUpdate(from.awareness, [from.awareness.clientID]),
    "fixture",
  );
const timer = { startedAt: 1000, durationMs: 60000, remainingMs: 60000 };
afterEach(() => {
  setSessionShareRole(null);
  for (const doc of docs.splice(0)) {
    doc.destroy();
  }
});
describe("one shared room session", () => {
  it("reads a driver's timer/reveal/deck without copying into follower awareness", () => {
    const a = make();
    const b = make();
    const before = b.getEphemeral();
    writeSession(() => a, {
      timer,
      reveal: { mode: "private" },
      presentation: { active: true, slideIds: ["f"], index: 0 },
    });
    relay(a, b);
    expect(getSession(() => b).state).toMatchObject({
      timer,
      reveal: { mode: "private" },
      presentation: { active: true },
    });
    expect(b.getEphemeral()).toBe(before);
    expect(a.durableUpdates + b.durableUpdates).toBe(0);
  });
  it("refuses every follower field write", () => {
    const a = make();
    const b = make();
    writeSession(() => a, { timer });
    relay(a, b);
    const before = b.getEphemeral();
    expect(mayChangeSession(() => b)).toBe(false);
    expect(writeSession(() => b, { reveal: { mode: "private" } })).toBe(false);
    expect(b.getEphemeral()).toBe(before);
  });
  it("resolves simultaneous claims by lower ID and clears losing fields", () => {
    const a = make();
    const b = make();
    writeSession(() => a, { timer });
    writeSession(() => b, { reveal: { mode: "private" } });
    relay(a, b);
    relay(b, a);
    const winner = a.awareness.clientID < b.awareness.clientID ? a : b;
    const loser = winner === a ? b : a;
    expect(getSession(() => a).driver).toBe(winner.awareness.clientID);
    expect(getSession(() => b).driver).toBe(winner.awareness.clientID);
    expect(yieldLosingClaim(() => loser)).toBe(true);
    expect(loser.getEphemeral()).toMatchObject({
      session: null,
      timer: null,
      reveal: { mode: "revealed" },
      presentation: { active: false },
      voting: null,
    });
    expect(yieldLosingClaim(() => loser)).toBe(false);
  });
  it("returns ordinary editing state when the driver disconnects", () => {
    const a = make();
    const b = make();
    writeSession(() => a, { timer, reveal: { mode: "private" } });
    relay(a, b);
    removeAwarenessStates(b.awareness, [a.awareness.clientID], "disconnect");
    expect(getSession(() => b)).toMatchObject({
      driver: null,
      state: {
        timer: null,
        reveal: { mode: "revealed" },
        presentation: { active: false },
      },
    });
    expect(mayChangeSession(() => b)).toBe(true);
  });
  it("ignores unclaimed legacy fields and invalid claims", () => {
    const a = make();
    const b = make();
    a.setEphemeral({ timer });
    relay(a, b);
    expect(getSession(() => b).driver).toBeNull();
    a.setEphemeral({ session: { leader: a.awareness.clientID + 1 } });
    relay(a, b);
    expect(getSession(() => b).driver).toBeNull();
  });
  it("releases an ended voting-only session without clearing its final local display", () => {
    const a = make();
    const voting = {
      startsAt: 1,
      endsAt: 2,
      endedEarly: true,
      settings: {
        votesPerPerson: 3,
        minutes: 2,
        oneVotePerObject: false,
        showResults: true,
        eligibleTypes: null,
      },
    };
    writeSession(() => a, { voting });
    expect(a.getEphemeral().session).toBeNull();
    expect(a.getEphemeral().voting).toBe(voting);
    expect(getSession(() => a).driver).toBeNull();
  });
});

describe("shared ownership at app boundaries", () => {
  it("projects every read and refuses stale direct commands without awareness or durable writes", () => {
    const a = make();
    const b = make();
    const round = {
      startsAt: Date.now(),
      endsAt: Date.now() + 120000,
      endedEarly: false,
      settings: {
        votesPerPerson: 3,
        minutes: 2,
        oneVotePerObject: false,
        showResults: true,
        eligibleTypes: null,
      },
    };
    writeSession(() => a, {
      timer,
      reveal: { mode: "private" },
      presentation: { active: true, slideIds: ["f1", "f2"], index: 0 },
      voting: round,
    });
    relay(a, b);
    const before = b.getEphemeral();
    const revision = b.durableUpdates;
    expect(getTimer(() => b)).toEqual(timer);
    expect(getReveal(() => b).mode).toBe("private");
    expect(getPresentation(() => b).active).toBe(true);
    expect(readSession(() => b).round).toEqual(round);
    const api = {
      getSceneElements: () => [],
      getAppState: () => ({ width: 800, height: 600 }),
      updateScene: () => {},
      setToast: () => {},
    } as unknown as ExcalidrawImperativeAPI;
    timerControls(() => b).start();
    timerControls(() => b).pause();
    timerControls(() => b).reset();
    timerControls(() => b).addMinute();
    toggleRevealMode(
      () => b,
      () => {},
    );
    stepPresentation(
      () => b,
      1,
      api,
      () => {},
    );
    stopPresenting(
      () => b,
      () => {},
    );
    startVotingRound(() => b, round.settings);
    endVotingRound(() => b);
    expect(b.getEphemeral()).toBe(before);
    expect(b.durableUpdates).toBe(revision);
    const actions = facilitatorActions(
      api,
      () => b,
      () => {},
    );
    for (const name of [
      "toggleFacilitatorTimer",
      "toggleBoardReveal",
      "togglePresentation",
      "nextSlide",
    ]) {
      expect(
        actions
          .find((a) => a.name === name)
          ?.predicate?.([], {} as never, {} as never, null as never),
      ).toBe(false);
    }
    // Ballots are durable content, not driver controls: follower editors can vote.
    expect(
      actions
        .find((a) => a.name === "addVoteToSelection")
        ?.predicate?.(
          [{ id: "n", isDeleted: false }] as never,
          { selectedElementIds: { n: true } } as never,
          {} as never,
          null as never,
        ),
    ).toBe(true);
  });
  it("notifies a readout for remote session change and disconnect but not remote cursors", () => {
    const a = make();
    const b = make();
    relay(a, b);
    let calls = 0;
    const stop = subscribeToFacilitation(
      () => b,
      () => {
        calls += 1;
      },
    );
    writeSession(() => a, { timer });
    relay(a, b);
    expect(calls).toBe(1);
    a.setEphemeral({ cursor: { x: 1, y: 2 } });
    relay(a, b);
    expect(calls).toBe(1);
    removeAwarenessStates(b.awareness, [a.awareness.clientID], "disconnect");
    expect(calls).toBe(2);
    expect(getTimer(() => b)).toBeNull();
    stop();
  });
});
