/**
 * Dot voting.
 *
 * ## Why votes are records and not element fields
 *
 * The obvious place for a vote is on the element it is attached to: a count, or
 * a list of who voted. It is wrong, and the reason is that a vote is not a
 * property of what it points at.
 *
 * `ElementBase.customData` is the escape hatch for a host application's data,
 * and putting votes there would put a facilitator's session inside the document
 * forever. A board would accumulate every vote from every session it was ever
 * used in, none of them removable, none of them meaningful after the workshop
 * ended — and the file would grow with the history of its meetings rather than
 * with its content. That is the failure AC-7 measures ("grows with content, not
 * with edits").
 *
 * So a vote is a record in the record store
 * ([`@firo/schema`](../../schema/src/types.ts)), which means it is already
 * durable, already survives save/load and export/import through the existing
 * serialisation path, and already has an explicit lifecycle — `archiveRecords`
 * rather than a delete, because a vote can come back.
 *
 * ## One record per vote, not one counter per element
 *
 * The alternative shape is a `number` column on each element, incremented on
 * click. It needs no collection, no queries and no joins. It also cannot answer
 * "remove my vote", which the plan requires, and it cannot be anonymous, which
 * the plan also requires. Both are the same limitation: the counter has thrown
 * away the votes.
 *
 * One record per vote keeps the voter, so a vote can be changed or withdrawn by
 * finding it. It costs a collection and it means tallying rather than reading a
 * field. For a workshop of tens of votes that is free.
 *
 * ## No mutation is applied here
 *
 * Every function returns a `Mutation[]` for the caller to commit. Nothing here
 * touches a document. That is the same contract the TRD sets for projections
 * (`docs/trd/06-records-and-projections.md`), and it is what makes this file
 * testable against plain objects.
 */

import type { Mutation } from "@firo/doc";
import type { Collection, FiroRecord } from "@firo/schema";

/**
 * One dot, as read back out of the record store.
 *
 * `recordId` is carried because withdrawing a vote has to name the *record* to
 * archive, and the element id is not that. Conflating the two is the easy mistake
 * here: `archiveRecords` filters on record ids, so archiving an element id is a
 * silent no-op that looks exactly like "removing my vote does nothing".
 */
export type Vote = Readonly<{
  /** The record this vote is stored as. */
  recordId: string;
  /** The element carrying this dot. */
  elementId: string;
  /** Who placed it. Empty string for an anonymous vote. */
  voterId: string;
  placedAt: number;
}>;

/** Column keys. Named constants so a rename cannot desynchronise them. */
export const VOTE_TARGET_KEY = "target";
export const VOTER_KEY = "voter";
export const PLACED_AT_KEY = "placedAt";

/**
 * The id of the collection votes live in.
 *
 * Namespaced so it cannot collide with a collection a person made, and fixed so
 * that importing two boards' votes into one document is a detectable conflict
 * rather than a silent merge.
 */
export const VOTE_COLLECTION_ID = "firo-votes";

/**
 * The collection votes live in, created on demand.
 *
 * A facilitator never sees this: it is created by the first vote and reused
 * after. `boardId` is a parameter rather than a constant because the same schema
 * serves every board, and a board that exported its votes must not collide with
 * another board's on import.
 */
export const voteCollection = (
  boardId: string,
  order: string,
): Collection =>
  ({
    id: VOTE_COLLECTION_ID,
    boardId,
    name: "Votes",
    version: 1,
    order,
    columns: [
      {
        id: `${VOTE_COLLECTION_ID}-target`,
        key: VOTE_TARGET_KEY,
        name: "Target",
        type: "text",
      },
      {
        id: `${VOTE_COLLECTION_ID}-voter`,
        key: VOTER_KEY,
        name: "Voter",
        type: "text",
      },
      {
        id: `${VOTE_COLLECTION_ID}-placed-at`,
        key: PLACED_AT_KEY,
        name: "Placed",
        type: "number",
      },
    ],
  }) as unknown as Collection;

/**
 * Read a stored record back into a vote, or null if it is not one.
 *
 * Returns null rather than throwing for a record of the wrong shape. A record
 * store holds whatever a person put in it, including a hand-edited file, and one
 * unrecognised row must not take down the tally for every other row.
 */
export const voteFromRecord = (record: FiroRecord): Vote | null => {
  // A record that carries no `values` at all is a record from another
  // collection, not a corrupt vote, and the record store holds both. Guarding
  // the lookup rather than the shape keeps one foreign row from taking down the
  // tally for every vote on the board.
  const values = record.values;
  if (!values) {
    return null;
  }
  const target = values[VOTE_TARGET_KEY];
  if (!target || target.type !== "text" || !target.value) {
    return null;
  }
  const voter = values[VOTER_KEY];
  const placedAt = values[PLACED_AT_KEY];
  return {
    recordId: record.id,
    elementId: target.value,
    voterId:
      voter && voter.type === "text" && voter.value ? voter.value : "",
    placedAt: placedAt && placedAt.type === "number" ? placedAt.value : 0,
  };
};

/**
 * Every vote in a set of records, skipping archived ones.
 *
 * Archived rather than deleted, so an un-archive brings a vote back; counting
 * them here would make withdrawal silently fail.
 */
export const votesFromRecords = (
  records: readonly FiroRecord[],
): Vote[] =>
  records
    .filter((record) => !record.archived)
    .map(voteFromRecord)
    .filter((vote): vote is Vote => vote !== null);

/** Serialise a vote into the record shape. */
export const voteToRecord = (
  vote: Omit<Vote, "recordId">,
  recordId: string,
  order: string,
): FiroRecord =>
  ({
    id: recordId,
    collectionId: VOTE_COLLECTION_ID,
    values: {
      [VOTE_TARGET_KEY]: { type: "text", value: vote.elementId },
      [VOTER_KEY]: { type: "text", value: vote.voterId },
      [PLACED_AT_KEY]: { type: "number", value: vote.placedAt },
    },
    order,
    archived: false,
  }) as unknown as FiroRecord;

/**
 * Find a voter's existing dot on an element.
 *
 * An empty `voterId` matches only other anonymous votes. Two anonymous
 * participants are not the same person, and collapsing them would make "remove my
 * vote" impossible for exactly the participants who most need it.
 */
export const findVote = (
  votes: readonly Vote[],
  elementId: string,
  voterId: string,
): Vote | undefined =>
  votes.find(
    (vote) => vote.elementId === elementId && vote.voterId === voterId,
  );

/**
 * Place a dot, or move it if this voter already had one elsewhere.
 *
 * Moving rather than accumulating is the behaviour the plan asks for: clicking
 * twice is one vote, not two. The displaced dot is archived rather than
 * retargeted, so the record store's history of a session stays append-only and a
 * tally being read concurrently never sees a dot change sides.
 *
 * `hasCollection` decides whether the collection is created first. It is a
 * parameter rather than something derived from `votes` because an empty session
 * and a missing collection look identical from the votes alone, and the second
 * case needs the collection to exist before a record can reference it.
 */
export const placeVote = (
  votes: readonly Vote[],
  vote: Omit<Vote, "recordId">,
  ids: { record: string; order: string; board: string },
  hasCollection: boolean,
): Mutation[] => {
  const mutations: Mutation[] = [];

  if (!hasCollection) {
    mutations.push({
      kind: "createCollection",
      collection: voteCollection(ids.board, "a0"),
    });
  }

  // The voter's dot *anywhere* is moved, so voting twice on two different
  // elements leaves one dot rather than two. Found by voter rather than by
  // (element, voter) because "one vote per person" is the rule the plan states.
  const previous = votes.filter(
    (candidate) =>
      candidate.voterId === vote.voterId && candidate.recordId !== ids.record,
  );
  if (previous.length) {
    mutations.push({
      kind: "archiveRecords",
      ids: previous.map((candidate) => candidate.recordId),
    });
  }

  mutations.push({
    kind: "createRecord",
    record: voteToRecord(vote, ids.record, ids.order),
  });

  return mutations;
};

/**
 * Withdraw a voter's dot from an element.
 *
 * Archives the *record* id, which is the whole reason `Vote` carries one.
 */
export const removeVote = (
  votes: readonly Vote[],
  elementId: string,
  voterId: string,
): Mutation[] => {
  const existing = findVote(votes, elementId, voterId);
  return existing ? [{ kind: "archiveRecords", ids: [existing.recordId] }] : [];
};

/**
 * Tally the dots on each element.
 *
 * A `Map` rather than an object, because element ids are arbitrary strings and
 * a tally keyed by `__proto__` is a real hazard when the input came from a file.
 */
export const tally = (votes: readonly Vote[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const vote of votes) {
    counts.set(vote.elementId, (counts.get(vote.elementId) ?? 0) + 1);
  }
  return counts;
};

/**
 * The ids with the most votes, best first.
 *
 * Ties break on id so the ordering is total and stable. An unstable sort here
 * would make "the top three" flicker between two elements that are level, which
 * on a projector looks like a bug in the tool.
 */
export const leaders = (votes: readonly Vote[], limit: number): string[] =>
  [...tally(votes).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id]) => id);