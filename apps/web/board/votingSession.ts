/**
 * The voting session seam: the live round, the ballot, and the room.
 *
 * ## Why this is separate from `facilitator.ts`
 *
 * `facilitator.ts` reads and writes *this* client's ephemeral state. A voting
 * round is the first feature whose rules live in *everybody's* awareness: the
 * driver publishes the round, every client reads it to know whether a press is
 * allowed, and the driver claim has a tie-break. One more cache in
 * `facilitator.ts` would bury that contract under the timer's, so the session
 * gets its own seam with the same shape: pure rules from `@firo/facilitation`,
 * no React state, a subscribe for re-render.
 *
 * ## What lives where (ADR-0039)
 *
 * - **The dots** are records in the document. Nothing here changes that.
 * - **The round** (settings, start, deadline) is the driver's awareness entry.
 *   It never enters the document, `localStorage`, or the file.
 * - **The ballot key** is a random opaque string in `sessionStorage`, keyed by
 *   board and round, so a reloaded tab keeps its dots and a new round never
 *   inherits them. It is written into each vote's `voter` column; it is not an
 *   account id and is never displayed as one.
 * - **The driver** is resolved from awareness by `resolveDriver`: lowest
 *   claiming clientID wins, and a claim with no live state is ignored.
 */

import {
  endRound,
  filterLiveVotes,
  isVotingOpen,
  mintBallotKey,
  planPlacement,
  removeVote,
  resolveDriver,
  roundId,
  startRound,
  votesFromRecords,
  VOTE_COLLECTION_ID,
} from "@firo/facilitation";

import { randomId } from "@firo/common";
import { generateKeyBetween } from "@firo/fractional-indexing";
import { isFractionalIndex } from "@firo/schema";

import type {
  PlacementPlan,
  VotingRound,
  VotingSettings,
  Vote,
} from "@firo/facilitation";
import type { FiroRecord } from "@firo/schema";
import type { EphemeralState, FiroDoc } from "@firo/doc";

/** A round is live state for the claim check, as are the other three. */
const hasLiveState = (state: EphemeralState): boolean =>
  state.timer !== null ||
  state.reveal.mode === "private" ||
  state.presentation.active ||
  (state.voting !== null && isVotingOpen(state.voting, Date.now()));

export type VotingSession = Readonly<{
  /** The driving clientID, or null when no session exists. */
  driver: number | null;
  /** This client's own clientID. */
  self: number;
  /** The round the driver publishes, or null. */
  round: VotingRound | null;
  /** Whether this client drives. */
  isDriver: boolean;
}>;

/**
 * Read the room's session from awareness.
 *
 * `peersEphemeral` includes this client's own entry (awareness states include
 * the local one), so a local-only board resolves exactly the same way as a
 * full room: one client, one valid claim, itself.
 */
export const readSession = (getDocument: () => FiroDoc): VotingSession => {
  const doc = getDocument();
  const peers = doc.peersEphemeral();
  const entries = [...peers.entries()].map(([clientID, state]) => ({
    clientID,
    session: state.session ?? null,
    live: hasLiveState(state),
  }));
  const driver = resolveDriver(entries);
  /*
   * With a live claim the round is the driver's. Without one, the only round
   * still worth reading is this client's own: an ended or expired round keeps
   * its final state in its driver's panel for display (ADR-0039 section 1),
   * and a closed round still refuses new dots -- the next Start is the only
   * boundary that makes voting free again.
   */
  const round =
    driver !== null
      ? peers.get(driver)?.voting ?? null
      : doc.getEphemeral().voting ?? null;
  return {
    driver,
    self: doc.awareness.clientID,
    round,
    isDriver: driver !== null && driver === doc.awareness.clientID,
  };
};

/* -------------------------------------------------------------------------- */
/* The ballot                                                                 */
/* -------------------------------------------------------------------------- */

const ballotStorageKey = (board: string, round: string): string =>
  `firo-ballot:${board}:${round}`;

/**
 * This client's ballot key for a round, minted on first use.
 *
 * `sessionStorage`, not `localStorage`: the key is per tab per round, so two
 * tabs are two voters and a closed tab's identity never leaks into a later
 * session. Outside a round the key is per board and reused, so free dots
 * remain withdrawable by the tab that placed them.
 */
export const ballotKeyFor = (board: string, round: string | null): string => {
  const key = ballotStorageKey(board, round ?? "free");
  let ballot = sessionStorage.getItem(key);
  if (ballot === null) {
    ballot = mintBallotKey(randomId);
    sessionStorage.setItem(key, ballot);
  }
  return ballot;
};

/* -------------------------------------------------------------------------- */
/* Orders, shared shape with facilitatorActions' voteOrders                   */
/* -------------------------------------------------------------------------- */

const voteOrders = (
  records: readonly FiroRecord[],
  count: number,
): string[] => {
  const keys: string[] = [];
  let last = records
    .filter((record) => record.collectionId === VOTE_COLLECTION_ID)
    .map((record) => record.order)
    .filter(isFractionalIndex)
    .reduce((max, key) => (key > max ? key : max), "");
  for (let i = 0; i < count; i += 1) {
    last = generateKeyBetween(last === "" ? null : last, null);
    keys.push(last);
  }
  return keys;
};

/* -------------------------------------------------------------------------- */
/* Round lifecycle (driver only)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Start a round: archive the previous round's dots and publish the settings.
 *
 * The archive is one commit, so one undo step (ADR-0039 section 2). The round
 * itself is awareness and never enters the document; publishing the claim and
 * the round together is what makes this client the driver.
 *
 * Returns the number of dots archived, so the panel's Start button can name
 * what it cleared.
 */
export const startVotingRound = (
  getDocument: () => FiroDoc,
  settings: VotingSettings,
  now: number = Date.now(),
): number => {
  const doc = getDocument();
  const live = votesFromRecords(doc.read().records);
  if (live.length > 0) {
    doc.commit([
      { kind: "archiveRecords", ids: live.map((vote) => vote.recordId) },
    ]);
  }
  doc.setEphemeral({
    session: { leader: doc.awareness.clientID },
    voting: startRound(settings, now),
  });
  return live.length;
};

/**
 * End the round early. The dots stay readable; the deadline closes the ballot
 * box. Does not archive: Start is the only round boundary (ADR-0039).
 */
export const endVotingRound = (getDocument: () => FiroDoc): void => {
  const doc = getDocument();
  const current = doc.getEphemeral().voting;
  if (current) {
    doc.setEphemeral({ voting: endRound(current) });
  }
};

/* -------------------------------------------------------------------------- */
/* Casting dots                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Plan one press of "add a dot to each selected element" against the live
 * session. The board id and ballot are resolved here; the rules are
 * `planPlacement`'s. The caller commits the returned mutations inside its own
 * board-id/conflict handling, exactly as the existing Alt+D path does.
 */
export const planCast = (
  getDocument: () => FiroDoc,
  targets: readonly { id: string; type: string }[],
  board: string,
  hasCollection: boolean,
  now: number = Date.now(),
): PlacementPlan => {
  const session = readSession(getDocument);
  const round = session.round;
  const doc = getDocument();
  const snapshot = doc.read();
  const ballot = ballotKeyFor(board, round ? roundId(round) : null);
  return planPlacement({
    votes: votesFromRecords(snapshot.records),
    targets,
    ballot,
    placedAt: now,
    ids: {
      record: randomId,
      orders: voteOrders(snapshot.records, targets.length),
      board,
    },
    hasCollection,
    round,
    now,
  });
};

/**
 * Withdraw this client's dot from each given element. One commit, one undo
 * step, as with placing.
 */
export const withdrawDots = (
  getDocument: () => FiroDoc,
  elementIds: readonly string[],
  board: string,
): number => {
  const doc = getDocument();
  const session = readSession(getDocument);
  const ballot = ballotKeyFor(
    board,
    session.round ? roundId(session.round) : null,
  );
  const votes = votesFromRecords(doc.read().records);
  const mutations = elementIds.flatMap((elementId) =>
    removeVote(votes, elementId, ballot),
  );
  if (mutations.length > 0) {
    doc.commit(mutations);
  }
  return mutations.length;
};

/**
 * The votes that count right now: unarchived, on live elements. `liveIds` is
 * the caller's visibility predicate so this seam never imports reveal rules.
 */
export const countableVotes = (
  getDocument: () => FiroDoc,
  liveIds: ReadonlySet<string>,
): Vote[] =>
  filterLiveVotes(votesFromRecords(getDocument().read().records), liveIds);
