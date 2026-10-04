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
import type { Collection, FieldValue, FiroRecord } from "@firo/schema";

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
export const voteCollection = (boardId: string, order: string): Collection =>
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
  } as unknown as Collection);

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
  /*
   * Own properties only, and each of the three reads needs it.
   *
   * A bare `values[key]` walks the prototype chain, so a record with no `target`
   * column of its own can still answer one -- from a `__proto__` entry, or from
   * whatever else the object's prototype carries. The result is a vote attributed
   * to an element its author never voted on, forged entirely from a file. Once
   * records load from disk (ADR-0018) that file is untrusted input.
   *
   * `hasOwn` is the check, and it is applied to all three keys rather than just
   * the first: `voterId` and `placedAt` are read the same way and are forgeable
   * the same way.
   */
  const own = (key: string): FieldValue | undefined =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;

  const target = own(VOTE_TARGET_KEY);
  if (!target || target.type !== "text" || !target.value) {
    return null;
  }
  const voter = own(VOTER_KEY);
  const placedAt = own(PLACED_AT_KEY);
  return {
    recordId: record.id,
    elementId: target.value,
    voterId: voter && voter.type === "text" && voter.value ? voter.value : "",
    placedAt: placedAt && placedAt.type === "number" ? placedAt.value : 0,
  };
};

/**
 * Every vote in a set of records, skipping archived ones.
 *
 * Archived rather than deleted, so an un-archive brings a vote back; counting
 * them here would make withdrawal silently fail.
 */
export const votesFromRecords = (records: readonly FiroRecord[]): Vote[] =>
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
  } as unknown as FiroRecord);

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
 * Why a board's existing votes may not be added to.
 *
 * Returns a message when the votes collection in this document belongs to a
 * *different* board, and null when it is fine.
 *
 * ## Why this is checked at all, given it cannot fire in v1
 *
 * Import refuses a non-empty board and the autosave is a single record, so one
 * document holds one board at a time and two boards' votes cannot meet through the
 * product today. So this guard has no failing case yet, and writing it now is a
 * choice about which bug is cheaper.
 *
 * The alternative is to leave `boardId` as the constant it has been, on the reasoning
 * that a collision would then be "detectable". It is not detectable: the votes
 * collection has a fixed id, so a second board's dots land in the first board's
 * collection and `boardId` sits there asserting nothing. The failure the constant was
 * meant to prevent is a **silent merge** -- two sessions' dots in one tally, each
 * participant's vote landing among strangers', with no error anywhere.
 *
 * A guard written after the first merge ships has been written by someone who has
 * already seen the data it would have rejected, and the temptation at that point is
 * to log-and-continue. So: written now, while the case is hypothetical, and returning
 * a *message* rather than a boolean so the refusal can be shown to a person.
 *
 * ## Why an absent board id is not a conflict
 *
 * A board whose votes predate board identity has no `boardId` to disagree with.
 * Refusing would strand those votes with no way forward except deleting them, which is
 * a far worse outcome than accepting them. The mismatch that matters is one id against
 * a *different* id.
 */
export const boardIdConflict = (
  collections: readonly { id: string; boardId?: string }[],
  collectionId: string,
  board: string,
): string | null => {
  const existing = collections.find(
    (collection) => collection.id === collectionId,
  );

  if (!existing || existing.boardId == null || existing.boardId === board) {
    return null;
  }

  return (
    `This board already holds votes from a different board ` +
    `(recorded as "${existing.boardId}", this board is "${board}"). Adding to them ` +
    `would merge two sessions' dots into one tally, so it has not been done. ` +
    `Export this board, start a new one, and import the other if you need both.`
  );
};

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
  //
  // Anonymous votes are excluded, and that exclusion is the whole subtlety. An
  // empty `voterId` matches every other empty `voterId`, so without this a third
  // anonymous participant voting would archive the first two participants' dots --
  // destroying two people's votes to record one. They are indistinguishable by
  // construction; treating them as one identity is what makes "remove my vote"
  // impossible for exactly the people who need it.
  //
  // So an anonymous dot accumulates on its element and is withdrawn by
  // `removeVote`, and only a *named* voter gets one dot moved for them.
  const previous =
    vote.voterId === ""
      ? []
      : votes.filter(
          (candidate) =>
            candidate.voterId === vote.voterId &&
            candidate.recordId !== ids.record,
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
 * Compare two ids by code unit.
 *
 * Not `localeCompare`, which takes the runtime's default locale: two clients in
 * the same room with different browser locales order tied elements differently,
 * so "the top three" flickers between two options that are level -- on a
 * projector, in front of the people who voted. It is also ICU collation rather
 * than code-unit order, so it is not the stable ordering it looks like.
 *
 * Code units are the one comparison that is identical on every machine, which is
 * the property being bought.
 */
const compareIds = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * The ids with the most votes, best first.
 *
 * Ties break on id so the ordering is total and stable. An unstable sort here
 * would make "the top three" flicker between two elements that are level, which
 * on a projector looks like a bug in the tool.
 */
export const leaders = (votes: readonly Vote[], limit: number): string[] =>
  [...tally(votes).entries()]
    .sort((a, b) => b[1] - a[1] || compareIds(a[0], b[0]))
    .slice(0, limit)
    .map(([id]) => id);
