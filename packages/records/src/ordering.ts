import { generateKeyBetween } from "@firo/fractional-indexing";

import type { FiroRecord } from "@firo/schema";

import type { RecordMutation } from "./types.js";

/**
 * Ordering, shared by every projection.
 *
 * ## Why this is one module and not a copy per projection
 *
 * The TRD's property 4 says order belongs to the projection, and warns that a record
 * ordered second in a table and second in a kanban is a coincidence. Fine — but "the
 * projection owns the ordering **it uses**" is not "each projection invents its own
 * ordering". A `setOrder` mutation computed two ways is two answers to "where does
 * this row go", and they would disagree the first time a comparison changed from `<` to
 * `<=` or a key generation gained an edge case. Both projections asked this question
 * and both wanted the same answer, so there is one function.
 *
 * ## What is *not* shared, and is the compromise
 *
 * Both projections read `record.order`. So reordering inside a kanban column also
 * moves the row in the table. That is deliberate for v1: per-projection order needs a
 * second order key per record per projection in the schema, and `FiroRecord.order` is
 * documented as "the default; a projection may override it". The override hook is
 * where that lands when the schema grows. Until then the behaviour is confusing rather
 * than wrong, and it is recorded in `board.ts` at the point a facilitator would see it.
 */

/** Records in `order`, ascending. */
export const orderedRecords = (
  records: readonly FiroRecord[],
): readonly FiroRecord[] =>
  [...records].sort((a, b) =>
    a.order < b.order ? -1 : a.order > b.order ? 1 : 0,
  );

/**
 * A fractional index, typed.
 *
 * `generateKeyBetween` returns `string` and `FractionalIndex` is a branded string, so
 * the cast is where the two meet. `asFractionalIndex` in `@firo/schema` is the
 * validating version; this one is not, because a key that `generateKeyBetween` just
 * produced cannot be invalid and validating it would be theatre.
 */
export const asOrder = (key: string): FiroRecord["order"] =>
  key as FiroRecord["order"];

/**
 * Where `recordId` should sit so that it comes immediately before `beforeId`.
 *
 * `beforeId: null` means last. The result is a `setOrder` mutation and **nothing
 * else** — no record is touched, no key is generated against the document, and a
 * projection that computed this and then applied it would be two writers.
 *
 * Returns null for a record that has gone, or a `beforeId` that is not in the list.
 * Both are ordinary in a pointer-up handler: a collaborator can delete a row between
 * the hit-test and the drop, and a throw there is an unhandled rejection with no toast.
 */
export const reorderMutation = (
  records: readonly FiroRecord[],
  recordId: string,
  beforeId: string | null,
): RecordMutation | null => {
  const record = records.find((candidate) => candidate.id === recordId);
  if (!record) {
    return null;
  }

  const others = orderedRecords(records).filter(
    (candidate) => candidate.id !== recordId,
  );

  const at =
    beforeId === null
      ? others.length
      : others.findIndex((candidate) => candidate.id === beforeId);

  if (at < 0) {
    // `beforeId` is this record's own id, or names a record that is gone. Reordering
    // against yourself is a no-op by definition, and it is what a renderer sends when
    // a row is dropped on itself.
    return null;
  }

  /*
   * The key to insert between, read off the list *without* the record being moved.
   *
   * Inserting at index `at` of `others` puts the record between `others[at - 1]` and
   * `others[at]` — and `others[at]` is `beforeId` itself, which is why the upper bound
   * is `others[at]` and not `others[at + 1]`.
   *
   * That off-by-one is not cosmetic. Fractional keys are dense integers (`a0`, `a1`,
   * `a2`, …), so `generateKeyBetween(others[at - 1], others[at + 1])` asks for an
   * integer *two* apart and gets the one in between — which is a key some other record
   * already holds. Dropping `d` before `b` in `[a0, a1, a2, a3]` generates `a1`, ties
   * with `b`, and the two rows then sort by insertion order instead of by where the
   * facilitator put them. The bug is invisible in the mutation and visible only in the
   * arrangement, which is why the tests assert on the order and not on the key.
   */
  const before = at === 0 ? null : others[at - 1].order;
  const after = at >= others.length ? null : others[at].order;

  return {
    kind: "setOrder",
    recordId,
    order: asOrder(generateKeyBetween(before, after)),
  };
};

/**
 * The order a record dropped at the end of `records` should take.
 *
 * Separate from `reorderMutation` because "last" is not expressible as "before some
 * record" when the list is empty, and a caller that wants the end should not have to
 * know that.
 */
export const orderForLast = (
  records: readonly FiroRecord[],
  recordId: string,
): FiroRecord["order"] => {
  const others = orderedRecords(records).filter(
    (candidate) => candidate.id !== recordId,
  );
  const last = others[others.length - 1];
  return asOrder(generateKeyBetween(last ? last.order : null, null));
};
