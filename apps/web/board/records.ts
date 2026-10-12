/**
 * Applying a `RecordMutation` to the document.
 *
 * ## Why this file exists
 *
 * A projection *asks*; something has to *act*. `@firo/records` ends at `interpret`,
 * deliberately — `src/index.ts` says "**No writes.** Every projection returns a
 * `RecordMutation` and nothing else", and property 3 of the TRD's contract is that a
 * projection never writes to a record. Correct, and it leaves a hole: with nothing in
 * between, a drag produced a mutation and the record never changed.
 *
 * This is the other half. It reads the record, folds the change into it, and commits —
 * which is the *only* write path, by rule 1 of `AGENTS.md` and
 * [`@firo/doc`](../../../packages/doc/src/doc.ts).
 *
 * ## Why it lives in the app and not in `@firo/records`
 *
 * Because it writes. Putting it in `@firo/records` would make the package's own stated
 * boundary false, and that boundary is the reason a projection can be swapped without
 * the board noticing. The app already does exactly this shape of thing for votes
 * (`facilitatorActions.ts` commits `placeVote`'s mutations), so this is the same
 * arrangement applied to the projection layer.
 *
 * ## Why AC-3 needs this and nothing more
 *
 * AC-3 is "drag a card from Doing to Done, switch to table, the Status cell reads Done,
 * with no reload and no manual sync step". The mutation is what makes the two views
 * agree, and this file is what turns the mutation into a fact. The other half of AC-3 —
 * pixels, and a control to switch views — is a renderer and a UI, neither of which is
 * here.
 */
import type { CommitResult, FiroDoc, Mutation } from "@firo/doc";

import type { FiroRecord } from "@firo/schema";
import type { RecordMutation } from "@firo/records";

/**
 * The live records of one collection, in `order`.
 *
 * Archived records are excluded. An archived record is a withdrawn vote or a deleted
 * row that a projection may bring back, and a projection showing both would render the
 * same task twice. `FiroDoc` has no separate tombstone for records the way elements
 * have one, so `archived` is the whole of "not in a projection right now".
 *
 * Sorted because every projection orders by `order`, and a caller handed them shuffled
 * would have to re-sort per projection to do the one thing they all do.
 */
export const recordsIn = (
  doc: Pick<FiroDoc, "read">,
  collectionId: string,
): readonly FiroRecord[] => {
  const records = doc
    .read()
    .records.filter(
      (record) => record.collectionId === collectionId && !record.archived,
    );

  return [...records].sort((a, b) =>
    a.order < b.order ? -1 : a.order > b.order ? 1 : 0,
  );
};

/**
 * The changes one record needs, folded from every mutation naming it.
 *
 * `null` when nothing in the list touches it.
 *
 * ## Why this folds rather than mapping
 *
 * `values` is *one* key on the record, so writing it replaces the whole map. Mapping
 * each mutation to its own `updateRecords` therefore computes every `values` from the
 * *same* snapshot, and the last one wins: a batch that set a title and a status on one
 * record kept the status and silently lost the title. Both writes are in one commit, so
 * there is no undo step to reveal it and no second attempt to notice — the change is
 * simply gone, and only the column that happened to be written last is correct.
 *
 * So mutations are grouped by record and merged before they are written: one
 * `updateRecords` per record, one `values`, every column in it. That is also fewer Yjs
 * writes than one per mutation.
 */
const foldInto = (
  record: FiroRecord,
  mutations: readonly RecordMutation[],
): Mutation | null => {
  let values: FiroRecord["values"] | null = null;
  let order: FiroRecord["order"] | null = null;

  for (const mutation of mutations) {
    switch (mutation.kind) {
      case "setField":
        values = {
          ...(values ?? record.values),
          [mutation.columnKey]: mutation.value,
        };
        break;

      case "setOrder":
        order = mutation.order;
        break;

      case "setPosition":
        /*
         * Thrown, deliberately, and this is the one place in the file that throws.
         *
         * No projection emits a `setPosition`: the grid derives its positions from
         * `record.order` and refuses a drag rather than inventing a coordinate to write
         * (`src/grid.ts`). So this is unreachable today, and reachable only by a future
         * projection that stores a position — at which point dropping the mutation would
         * be the worst outcome available: the drag would appear to work, the card would
         * spring back, and nothing would say why.
         *
         * It is not a pointer-up race, which is why throwing is right here where
         * returning `null` is right everywhere else in this file.
         */
        throw new Error(
          "A projection asked to store a position, and nothing in the data model has a " +
            "field for one. `FiroRecord` has `order`, which is an ordering rather than a " +
            "coordinate. Either the projection should derive its position, or adding " +
            "positions is a schema change with a migration and a version bump.",
        );
    }
  }

  const changes: Record<string, unknown> = {};
  if (values !== null) {
    changes.values = values;
  }
  if (order !== null) {
    changes.order = order;
  }

  if (Object.keys(changes).length === 0) {
    return null;
  }

  return { kind: "updateRecords", updates: [{ id: record.id, changes }] };
};

/**
 * Fold mutations into document mutations.
 *
 * Accepts one mutation or a batch, because the single case is the batch case with one
 * element and two code paths would be two answers to "how is a field write applied".
 *
 * Returns `null` when there is nothing to apply — which is the ordinary outcome for a
 * drop that changes nothing, and is why a caller must not treat `null` as a failure
 * worth reporting to a person.
 *
 * A mutation naming a record that has gone is skipped rather than failing the batch:
 * the other 99 are real changes, and refusing them because one row was deleted in the
 * same frame is a worse answer than applying 99.
 */
export const toDocMutations = (
  records: readonly FiroRecord[],
  mutations: readonly RecordMutation[] | RecordMutation,
): readonly Mutation[] | null => {
  const list = Array.isArray(mutations) ? mutations : [mutations];

  /*
   * Keyed by `recordId`, then resolved against `records` below — so a mutation for a
   * record this collection does not hold is dropped by the lookup rather than needing
   * its own check.
   */
  const byRecord = new Map<string, RecordMutation[]>();
  for (const mutation of list) {
    const existing = byRecord.get(mutation.recordId);
    if (existing) {
      existing.push(mutation);
    } else {
      byRecord.set(mutation.recordId, [mutation]);
    }
  }

  const folded: Mutation[] = [];

  for (const record of records) {
    const forRecord = byRecord.get(record.id);
    if (!forRecord) {
      continue;
    }

    const mutation = foldInto(record, forRecord);
    if (mutation) {
      folded.push(mutation);
    }
  }

  return folded.length === 0 ? null : folded;
};

/**
 * Apply a projection's mutation, and commit it.
 *
 * Returns the commit result, or `null` when there was nothing to apply.
 */
export const applyRecordMutation = (
  doc: Pick<FiroDoc, "read" | "commit">,
  collectionId: string,
  mutation: RecordMutation,
): CommitResult | null => {
  const mutations = toDocMutations(recordsIn(doc, collectionId), mutation);

  if (mutations === null) {
    return null;
  }

  return doc.commit(mutations);
};

/**
 * Apply several mutations as one commit.
 *
 * The batching is the point. A projection that re-lays-out and produces a hundred
 * mutations should not produce a hundred undo steps, and `FiroDoc.commit` takes a list
 * precisely so a gesture can be atomic.
 */
export const applyRecordMutations = (
  doc: Pick<FiroDoc, "read" | "commit">,
  collectionId: string,
  mutations: readonly RecordMutation[],
): CommitResult | null => {
  const applicable = toDocMutations(recordsIn(doc, collectionId), mutations);

  if (applicable === null) {
    return null;
  }

  return doc.commit(applicable);
};
