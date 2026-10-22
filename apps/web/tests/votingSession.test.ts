/**
 * The voting session seam over a real in-memory document: the round is
 * awareness, the ballot is per board+round, and placement follows the round's
 * rules end to end.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { openBoardMemory } from "@firo/doc";

import { DEFAULT_VOTING_SETTINGS } from "@firo/facilitation";

import type { FiroDoc } from "@firo/doc";

import {
  ballotKeyFor,
  planCast,
  readSession,
  startVotingRound,
  endVotingRound,
  withdrawDots,
} from "../board/votingSession";

let doc: FiroDoc;
const getDocument = () => doc;

const addSticky = (id: string) => {
  doc.commit([
    {
      kind: "createElement",
      element: {
        id,
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      } as never,
    },
  ]);
};

beforeEach(() => {
  sessionStorage.clear();
  doc = openBoardMemory();
});

describe("readSession", () => {
  it("is driverless before any claim", () => {
    const session = readSession(getDocument);
    expect(session.driver).toBeNull();
    expect(session.round).toBeNull();
    expect(session.isDriver).toBe(false);
  });

  it("resolves this client as driver once it starts a round", () => {
    startVotingRound(getDocument, DEFAULT_VOTING_SETTINGS);
    const session = readSession(getDocument);
    expect(session.driver).toBe(doc.awareness.clientID);
    expect(session.isDriver).toBe(true);
    expect(session.round?.settings.votesPerPerson).toBe(3);
  });
});

describe("startVotingRound", () => {
  it("archives the previous round's dots in one commit", () => {
    addSticky("note-1");
    const first = planCast(
      getDocument,
      [{ id: "note-1", type: "rectangle" }],
      "board-1",
      false,
    );
    expect(first.ok).toBe(true);
    if (first.ok) {
      doc.commit(first.mutations);
    }
    expect(doc.read().records.filter((r) => !r.archived)).toHaveLength(1);

    const archived = startVotingRound(
      getDocument,
      DEFAULT_VOTING_SETTINGS,
      1_000_000,
    );
    expect(archived).toBe(1);
    expect(
      doc.read().records.filter((r) => !r.archived && r.values),
    ).toHaveLength(0);
  });
});

describe("ballots", () => {
  it("mints one key per board and round, reused within it", () => {
    const a = ballotKeyFor("board-1", null);
    expect(ballotKeyFor("board-1", null)).toBe(a);
    expect(ballotKeyFor("board-2", null)).not.toBe(a);
    expect(ballotKeyFor("board-1", "round-5")).not.toBe(a);
  });
});

describe("planCast inside a round", () => {
  it("refuses the press that would exceed the allowance", () => {
    addSticky("note-1");
    addSticky("note-2");
    addSticky("note-3");
    addSticky("note-4");
    startVotingRound(getDocument, DEFAULT_VOTING_SETTINGS);
    const plan = planCast(
      getDocument,
      [
        { id: "note-1", type: "rectangle" },
        { id: "note-2", type: "rectangle" },
        { id: "note-3", type: "rectangle" },
        { id: "note-4", type: "rectangle" },
      ],
      "board-1",
      false,
    );
    expect(plan.ok).toBe(false);
  });

  it("places and withdraws dots with the session ballot", () => {
    addSticky("note-1");
    startVotingRound(getDocument, DEFAULT_VOTING_SETTINGS);
    const plan = planCast(
      getDocument,
      [{ id: "note-1", type: "rectangle" }],
      "board-1",
      false,
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      doc.commit(plan.mutations);
    }
    const votes = doc.read().records.filter((r) => !r.archived);
    expect(votes).toHaveLength(1);

    expect(withdrawDots(getDocument, ["note-1"], "board-1")).toBe(1);
    expect(doc.read().records.filter((r) => !r.archived)).toHaveLength(0);
  });

  it("refuses after End session", () => {
    addSticky("note-1");
    startVotingRound(getDocument, DEFAULT_VOTING_SETTINGS);
    endVotingRound(getDocument);
    const plan = planCast(
      getDocument,
      [{ id: "note-1", type: "rectangle" }],
      "board-1",
      true,
    );
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toContain("ended");
    }
  });
});
