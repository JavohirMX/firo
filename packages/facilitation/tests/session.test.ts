import { describe, expect, it } from "vitest";

import {
  DEFAULT_VOTING_SETTINGS,
  ballotDots,
  clampSettings,
  endRound,
  filterLiveVotes,
  isVotingOpen,
  mintBallotKey,
  planPlacement,
  remainingRoundMs,
  resolveDriver,
  resultsRows,
  roundId,
  startRound,
  type VotingRound,
} from "../src/session.js";

import type { Vote } from "../src/voting.js";

const vote = (over: Partial<Vote> = {}): Vote => ({
  recordId: over.recordId ?? "r1",
  elementId: over.elementId ?? "note-a",
  voterId: over.voterId ?? "b-1",
  placedAt: over.placedAt ?? 1000,
});

const NOW = 1_000_000;
const round = (over: Partial<VotingRound> = {}): VotingRound => ({
  settings: DEFAULT_VOTING_SETTINGS,
  startsAt: NOW,
  endsAt: NOW + 120_000,
  endedEarly: false,
  ...over,
});

let counter = 0;
const ids = () => ({
  record: () => `rec-${++counter}`,
  orders: ["a0", "a1", "a2", "a3"],
  board: "board-1",
});

describe("round lifecycle", () => {
  it("derives the deadline from startsAt + minutes", () => {
    const r = startRound({ ...DEFAULT_VOTING_SETTINGS, minutes: 5 }, NOW);
    expect(r.endsAt).toBe(NOW + 300_000);
    expect(isVotingOpen(r, NOW)).toBe(true);
    expect(isVotingOpen(r, NOW + 299_999)).toBe(true);
    expect(isVotingOpen(r, NOW + 300_000)).toBe(false);
    expect(remainingRoundMs(r, NOW + 400_000)).toBe(0);
  });

  it("ends early on End session", () => {
    const r = endRound(round());
    expect(isVotingOpen(r, NOW + 1000)).toBe(false);
  });

  it("names the round by its start instant", () => {
    expect(roundId(round())).toBe(`round-${NOW}`);
  });

  it("clamps out-of-range settings", () => {
    const s = clampSettings({
      ...DEFAULT_VOTING_SETTINGS,
      votesPerPerson: 99,
      minutes: 0,
    });
    expect(s.votesPerPerson).toBe(9);
    expect(s.minutes).toBe(1);
  });
});

describe("resolveDriver", () => {
  it("returns null with no claims", () => {
    expect(
      resolveDriver([
        { clientID: 1, session: null, live: false },
        { clientID: 2, session: null, live: false },
      ]),
    ).toBeNull();
  });

  it("ignores a claim whose leader is not the publisher", () => {
    expect(
      resolveDriver([{ clientID: 1, session: { leader: 2 }, live: true }]),
    ).toBeNull();
  });

  it("ignores a claim with no live state", () => {
    expect(
      resolveDriver([{ clientID: 1, session: { leader: 1 }, live: false }]),
    ).toBeNull();
  });

  it("breaks a simultaneous tie on the lower clientID", () => {
    expect(
      resolveDriver([
        { clientID: 9, session: { leader: 9 }, live: true },
        { clientID: 4, session: { leader: 4 }, live: true },
      ]),
    ).toBe(4);
  });
});

describe("ballots", () => {
  it("mints an opaque key", () => {
    expect(mintBallotKey(() => "abc")).toBe("ballot-abc");
  });

  it("counts a ballot's dots wherever they point", () => {
    const votes = [
      vote({ recordId: "r1", elementId: "a" }),
      vote({ recordId: "r2", elementId: "b" }),
      vote({ recordId: "r3", elementId: "c", voterId: "other" }),
    ];
    expect(ballotDots(votes, "b-1")).toHaveLength(2);
  });
});

describe("planPlacement", () => {
  it("creates the collection once for a multi-target press", () => {
    const plan = planPlacement({
      votes: [],
      targets: [
        { id: "a", type: "sticky" },
        { id: "b", type: "sticky" },
      ],
      ballot: "b-1",
      placedAt: NOW,
      ids: ids(),
      hasCollection: false,
      round: null,
      now: NOW,
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(
        plan.mutations.filter((m) => m.kind === "createCollection"),
      ).toHaveLength(1);
      expect(
        plan.mutations.filter((m) => m.kind === "createRecord"),
      ).toHaveLength(2);
    }
  });

  it("refuses an empty selection", () => {
    const plan = planPlacement({
      votes: [],
      targets: [],
      ballot: "b-1",
      placedAt: NOW,
      ids: ids(),
      hasCollection: true,
      round: null,
      now: NOW,
    });
    expect(plan.ok).toBe(false);
  });

  it("refuses a duplicate dot outside a round", () => {
    const plan = planPlacement({
      votes: [vote({ elementId: "a" })],
      targets: [{ id: "a", type: "sticky" }],
      ballot: "b-1",
      placedAt: NOW,
      ids: ids(),
      hasCollection: true,
      round: null,
      now: NOW,
    });
    expect(plan.ok).toBe(false);
  });

  it("refuses a duplicate inside a round with one-vote-per-object on", () => {
    const plan = planPlacement({
      votes: [vote({ elementId: "a" })],
      targets: [{ id: "a", type: "sticky" }],
      ballot: "b-1",
      placedAt: NOW,
      ids: ids(),
      hasCollection: true,
      round: round({
        settings: { ...DEFAULT_VOTING_SETTINGS, oneVotePerObject: true },
      }),
      now: NOW,
    });
    expect(plan.ok).toBe(false);
  });

  it("allows stacking inside a round with one-vote-per-object off", () => {
    const plan = planPlacement({
      votes: [vote({ elementId: "a" })],
      targets: [{ id: "a", type: "sticky" }],
      ballot: "b-1",
      placedAt: NOW,
      ids: ids(),
      hasCollection: true,
      round: round(),
      now: NOW,
    });
    expect(plan.ok).toBe(true);
  });

  it("refuses the whole press when it would exceed the allowance", () => {
    const plan = planPlacement({
      votes: [
        vote({ recordId: "r1", elementId: "a" }),
        vote({ recordId: "r2", elementId: "b" }),
      ],
      targets: [
        { id: "c", type: "sticky" },
        { id: "d", type: "sticky" },
      ],
      ballot: "b-1",
      placedAt: NOW,
      ids: ids(),
      hasCollection: true,
      round: round(), // allowance 3; 2 placed + 2 new = 4
      now: NOW,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toContain("3");
    }
  });

  it("counts a dot on a deleted target against the allowance", () => {
    // The tally would not show it, but the ballot still holds it (ADR-0039).
    const plan = planPlacement({
      votes: [
        vote({ recordId: "r1", elementId: "gone-1" }),
        vote({ recordId: "r2", elementId: "gone-2" }),
        vote({ recordId: "r3", elementId: "gone-3" }),
      ],
      targets: [{ id: "a", type: "sticky" }],
      ballot: "b-1",
      placedAt: NOW,
      ids: ids(),
      hasCollection: true,
      round: round(),
      now: NOW,
    });
    expect(plan.ok).toBe(false);
  });

  it("refuses an ineligible type and names it", () => {
    const plan = planPlacement({
      votes: [],
      targets: [{ id: "a", type: "rectangle" }],
      ballot: "b-1",
      placedAt: NOW,
      ids: ids(),
      hasCollection: true,
      round: round({
        settings: { ...DEFAULT_VOTING_SETTINGS, eligibleTypes: ["sticky"] },
      }),
      now: NOW,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toContain("rectangle");
    }
  });

  it("refuses a press after the deadline", () => {
    const plan = planPlacement({
      votes: [],
      targets: [{ id: "a", type: "sticky" }],
      ballot: "b-1",
      placedAt: NOW + 200_000,
      ids: ids(),
      hasCollection: true,
      round: round(),
      now: NOW + 200_000,
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toContain("ended");
    }
  });
});

describe("results", () => {
  it("filters dots on non-live targets at read time", () => {
    const votes = [
      vote({ recordId: "r1", elementId: "a" }),
      vote({ recordId: "r2", elementId: "deleted" }),
    ];
    expect(filterLiveVotes(votes, new Set(["a"]))).toHaveLength(1);
  });

  it("sorts by count descending and breaks ties on element id", () => {
    const votes = [
      vote({ recordId: "r1", elementId: "b" }),
      vote({ recordId: "r2", elementId: "a" }),
      vote({ recordId: "r3", elementId: "b", voterId: "b-2" }),
      vote({ recordId: "r4", elementId: "c", voterId: "b-2" }),
    ];
    const rows = resultsRows(votes, [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Gamma" },
    ]);
    expect(rows.map((r) => r.elementId)).toEqual(["b", "a", "c"]);
    expect(rows[0]).toMatchObject({ label: "Beta", count: 2 });
  });

  it("labels a missing element honestly", () => {
    const rows = resultsRows([vote({ elementId: "ghost" })], []);
    expect(rows[0].label).toBe("Deleted element");
  });
});
