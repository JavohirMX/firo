import * as Y from "yjs";

import { generateKeyBetween } from "@firo/fractional-indexing";
import {
  endRound,
  isVotingOpen,
  startRound,
  voteToRecord,
  votesFromRecords,
  DEFAULT_VOTING_SETTINGS,
} from "@firo/facilitation";
import { AWARENESS_KEY, FiroDoc } from "@firo/doc";

import type { EphemeralState } from "@firo/doc";
import type { FiroRecord } from "@firo/schema";

import {
  ballotKeyFor,
  countableVotes,
  endVotingRound,
  planCast,
  readSession,
  startVotingRound,
  withdrawDots,
} from "../votingSession";

/*
 * The app-side voting session seam.
 *
 * The rules themselves - who may place a dot, when a round is open, which
 * claim drives the room - live in `@firo/facilitation` and are tested there
 * (votes.test.ts). What only this module does, and what these tests pin
 * down:
 *
 * 1. **Reading the room.** The driver comes from awareness, a claim with no
 *    live state is ignored, and an ended round stays readable for display
 *    even though it no longer drives.
 * 2. **The ballot key.** One opaque key per tab per board per round, kept in
 *    sessionStorage, so a reload keeps its dots and a new round never
 *    inherits them.
 * 3. **The round lifecycle.** Start archives the previous round's dots in
 *    one commit; End closes the ballot box early without archiving.
 * 4. **Casting and withdrawing.** planCast wires the ballot, board id and
 *    fractional orders into the package rules; withdrawDots removes only
 *    this tab's dots.
 */

const newBoard = () => {
  const doc = new FiroDoc(new Y.Doc());
  return { doc, getDocument: () => doc };
};

/** A minimal live-free ephemeral state, overridable per test. */
const ephemeral = (patch: Partial<EphemeralState> = {}): EphemeralState =>
  ({
    timer: null,
    reveal: { mode: "revealed" },
    presentation: { active: false },
    session: null,
    voting: null,
    ...patch,
  } as unknown as EphemeralState);

/** Inject a remote peer's awareness state, as a connected client would. */
const injectPeer = (doc: FiroDoc, clientID: number, state: EphemeralState) => {
  doc.awareness.getStates().set(clientID, { [AWARENESS_KEY]: state });
};

/** Seed a cast dot the way a committed plan would have written it. */
const seedVote = (
  doc: FiroDoc,
  elementId: string,
  voterId: string,
): FiroRecord => {
  const record = voteToRecord(
    { elementId, voterId, placedAt: 1000 },
    `vote-${elementId}-${voterId}`,
    generateKeyBetween(null, null),
  );
  doc.commit([{ kind: "createRecord", record }]);
  return record;
};

beforeEach(() => {
  sessionStorage.clear();
});

describe("readSession", () => {
  it("finds no session on a fresh board", () => {
    const { doc, getDocument } = newBoard();
    const session = readSession(getDocument);
    expect(session.driver).toBeNull();
    expect(session.round).toBeNull();
    expect(session.isDriver).toBe(false);
    expect(session.self).toBe(doc.awareness.clientID);
  });

  it("drives its own live round on a local-only board", () => {
    const { doc, getDocument } = newBoard();
    const round = startRound(DEFAULT_VOTING_SETTINGS, Date.now());
    doc.setEphemeral({
      session: { leader: doc.awareness.clientID },
      voting: round,
    });
    const session = readSession(getDocument);
    expect(session.driver).toBe(doc.awareness.clientID);
    expect(session.isDriver).toBe(true);
    expect(session.round).toEqual(round);
  });

  it("ignores a claim with no live state behind it", () => {
    const { doc, getDocument } = newBoard();
    doc.setEphemeral({ session: { leader: doc.awareness.clientID } });
    expect(readSession(getDocument).driver).toBeNull();
  });

  it("keeps an ended round readable for display without a driver", () => {
    const { doc, getDocument } = newBoard();
    const ended = endRound(startRound(DEFAULT_VOTING_SETTINGS, Date.now()));
    doc.setEphemeral({
      session: { leader: doc.awareness.clientID },
      voting: ended,
    });
    const session = readSession(getDocument);
    expect(session.driver).toBeNull();
    expect(session.round).toEqual(ended);
  });

  it("reads the round from a driving peer, not from itself", () => {
    const { doc, getDocument } = newBoard();
    const peerId = doc.awareness.clientID + 1000;
    const peerRound = startRound(DEFAULT_VOTING_SETTINGS, Date.now());
    injectPeer(
      doc,
      peerId,
      ephemeral({ session: { leader: peerId }, voting: peerRound }),
    );
    const session = readSession(getDocument);
    expect(session.driver).toBe(peerId);
    expect(session.isDriver).toBe(false);
    expect(session.round).toEqual(peerRound);
  });

  it("breaks a simultaneous claim toward the lower clientID", () => {
    const { doc, getDocument } = newBoard();
    const self = doc.awareness.clientID;
    const peerId = self + 500;
    doc.setEphemeral({
      session: { leader: self },
      voting: startRound(DEFAULT_VOTING_SETTINGS, Date.now()),
    });
    injectPeer(
      doc,
      peerId,
      ephemeral({
        session: { leader: peerId },
        voting: startRound(DEFAULT_VOTING_SETTINGS, Date.now()),
      }),
    );
    expect(readSession(getDocument).driver).toBe(Math.min(self, peerId));
  });
});

describe("ballotKeyFor", () => {
  it("mints once and reuses the key for the same board and round", () => {
    const first = ballotKeyFor("board-1", "round-1");
    expect(first).not.toBe("");
    expect(ballotKeyFor("board-1", "round-1")).toBe(first);
  });

  it("never reuses a key across rounds, boards, or the free bucket", () => {
    const free = ballotKeyFor("board-1", null);
    const round1 = ballotKeyFor("board-1", "round-1");
    const round2 = ballotKeyFor("board-1", "round-2");
    const otherBoard = ballotKeyFor("board-2", "round-1");
    expect(new Set([free, round1, round2, otherBoard]).size).toBe(4);
  });

  it("mints a fresh key when the tab storage is gone", () => {
    const first = ballotKeyFor("board-1", "round-1");
    sessionStorage.clear();
    expect(ballotKeyFor("board-1", "round-1")).not.toBe(first);
  });
});

describe("startVotingRound", () => {
  it("archives the previous round's dots and returns the count", () => {
    const { doc, getDocument } = newBoard();
    seedVote(doc, "e1", "someone");
    seedVote(doc, "e2", "someone-else");
    const archived = startVotingRound(
      getDocument,
      DEFAULT_VOTING_SETTINGS,
      Date.now(),
    );
    expect(archived).toBe(2);
    expect(votesFromRecords(doc.read().records)).toEqual([]);
    const state = doc.getEphemeral();
    expect(state.session?.leader).toBe(doc.awareness.clientID);
    expect(state.voting && isVotingOpen(state.voting, Date.now())).toBe(true);
  });

  it("starts cleanly when there is nothing to archive", () => {
    const { doc, getDocument } = newBoard();
    expect(startVotingRound(getDocument, DEFAULT_VOTING_SETTINGS)).toBe(0);
    expect(doc.getEphemeral().voting).not.toBeNull();
  });
});

describe("endVotingRound", () => {
  it("closes the ballot box early and keeps the dots", () => {
    const { doc, getDocument } = newBoard();
    startVotingRound(getDocument, DEFAULT_VOTING_SETTINGS, 50_000);
    seedVote(doc, "e1", "someone");
    endVotingRound(getDocument);
    const round = doc.getEphemeral().voting;
    expect(round).not.toBeNull();
    expect(round!.endedEarly).toBe(true);
    expect(isVotingOpen(round!, 51_000)).toBe(false);
    // End does not archive: the results stay readable.
    expect(votesFromRecords(doc.read().records)).toHaveLength(1);
  });

  it("does nothing when no round is live", () => {
    const { doc, getDocument } = newBoard();
    endVotingRound(getDocument);
    expect(doc.getEphemeral().voting).toBeNull();
  });
});

describe("planCast / withdrawDots", () => {
  it("plans a dot this tab can later withdraw", () => {
    const { doc, getDocument } = newBoard();
    const plan = planCast(
      getDocument,
      [{ id: "e1", type: "rectangle" }],
      "board-1",
      true,
      60_000,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    doc.commit(plan.mutations);
    const ballot = ballotKeyFor("board-1", null);
    const votes = countableVotes(getDocument, new Set(["e1"]));
    expect(votes).toHaveLength(1);
    expect(votes[0].elementId).toBe("e1");
    expect(votes[0].voterId).toBe(ballot);

    expect(withdrawDots(getDocument, ["e1"], "board-1")).toBe(1);
    expect(countableVotes(getDocument, new Set(["e1"]))).toEqual([]);
  });

  it("withdraws nothing when only other ballots hold dots", () => {
    const { doc, getDocument } = newBoard();
    seedVote(doc, "e1", "another-tab");
    expect(withdrawDots(getDocument, ["e1"], "board-1")).toBe(0);
    expect(countableVotes(getDocument, new Set(["e1"]))).toHaveLength(1);
  });

  it("refuses a cast after the round's deadline and writes nothing", () => {
    const { doc, getDocument } = newBoard();
    startVotingRound(getDocument, DEFAULT_VOTING_SETTINGS, 0);
    const before = doc.read().records.length;
    const plan = planCast(
      getDocument,
      [{ id: "e1", type: "rectangle" }],
      "board-1",
      true,
      Number.MAX_SAFE_INTEGER,
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) {
      return;
    }
    expect(plan.reason).toContain("ended");
    expect(doc.read().records.length).toBe(before);
  });
});

describe("countableVotes", () => {
  it("counts only votes on live elements", () => {
    const { doc, getDocument } = newBoard();
    seedVote(doc, "e1", "a");
    seedVote(doc, "e2", "a");
    const votes = countableVotes(getDocument, new Set(["e1"]));
    expect(votes.map((vote) => vote.elementId)).toEqual(["e1"]);
  });
});
