/**
 * Durable mutations.
 *
 * A mutation is a *description* of a change, not a Yjs write. The caller states
 * what should be different and `commit()` decides how to express that in the
 * document, including the bookkeeping every mutation needs (version bumps,
 * timestamps, tombstones, order arrays).
 *
 * ## Why callers do not pass versions
 *
 * `version`, `versionNonce` and `updated` are set here, always, from one place.
 * A caller that supplied them would have three ways to get it wrong -- forget,
 * set a lower value, set the same value twice -- and each produces a merge that
 * silently loses an edit. Deriving them in the only write path is the same
 * argument as for having only one write path.
 *
 * ## Why `delete` is a tombstone and not a removal
 *
 * See `ElementBase.isDeleted` in `@firo/schema`. A removal is indistinguishable
 * from never having existed, which breaks undo and lets a concurrent edit
 * resurrect a deleted element.
 */
import type { Collection, FiroElement, FiroRecord } from "@firo/schema";

/** The fields a caller may change on an element. */
export type ElementChanges = Partial<
  Omit<
    FiroElement,
    "id" | "type" | "version" | "versionNonce" | "created" | "updated"
  >
>;

/** The fields a caller may change on a record. */
export type RecordChanges = Partial<Omit<FiroRecord, "id" | "created">>;

export type Mutation =
  /** Insert a new element, at the end of the z-order. */
  | { kind: "createElement"; element: FiroElement }
  /** Insert several elements in one commit, so a paste is one undo step. */
  | { kind: "createElements"; elements: readonly FiroElement[] }
  /**
   * Change fields on existing elements.
   *
   * Only the listed keys are written. This is the per-field merge path: a
   * concurrent edit to a different field of the same element survives, because
   * this key was never touched by the other client.
   */
  | { kind: "updateElements"; updates: readonly ElementUpdate[] }
  /** Tombstone elements. They remain in the document, marked `isDeleted`. */
  | { kind: "deleteElements"; ids: readonly string[] }
  /** Clear the tombstone. The element keeps its identity and its content. */
  | { kind: "restoreElements"; ids: readonly string[] }
  /** Replace the z-order. Ids that are not present are ignored. */
  | { kind: "reorderElements"; ids: readonly string[] }
  | { kind: "createCollection"; collection: Collection }
  | { kind: "updateCollection"; id: string; changes: Partial<Collection> }
  /**
   * Delete a collection.
   *
   * The records that referenced it are *not* deleted. Their values are keyed by
   * `Column.key` and a deleted column retains its data
   * ([`@firo/schema`](../../schema/src/records.test.ts)), so un-deleting the
   * collection brings them back. Cascading here would be the one place the data
   * model promised it could not lose something.
   */
  | { kind: "deleteCollection"; id: string }
  | { kind: "createRecord"; record: FiroRecord }
  | { kind: "createRecords"; records: readonly FiroRecord[] }
  | { kind: "updateRecords"; updates: readonly RecordUpdate[] }
  /** Archive rather than delete: a record in a projection can come back. */
  | { kind: "archiveRecords"; ids: readonly string[] }
  | { kind: "unarchiveRecords"; ids: readonly string[] }

  /** Board-level metadata: name, created, theme, schema versions. */
  | { kind: "setMeta"; entries: Readonly<Record<string, unknown>> }
  /** Register a content-addressed asset reference. The bytes live elsewhere. */
  | { kind: "setAsset"; id: string; reference: AssetReference }
  | { kind: "removeAsset"; id: string };

export type ElementUpdate = {
  id: string;
  changes: ElementChanges;
};

export type RecordUpdate = {
  id: string;
  changes: RecordChanges;
};

/**
 * A pointer to bytes held outside the document.
 *
 * `hash` is content-addressed so two identical images are stored once. `bytes`
 * is recorded because IndexedDB has to be told what to load, and a caller that
 * has to know that is a caller that will get it wrong.
 */
export type AssetReference = Readonly<{
  hash: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
}>;

/**
 * Every mutation kind, derived from the union so the two cannot drift.
 *
 * The point of the list is that it is exhaustive *and* a runtime value: `isMutation`
 * checks against it, so a kind added to the union but not here would be rejected
 * at the boundary despite typechecking.
 */
export const MUTATION_KINDS = [
  "createElement",
  "createElements",
  "updateElements",
  "deleteElements",
  "restoreElements",
  "reorderElements",
  "createCollection",
  "updateCollection",
  "deleteCollection",
  "createRecord",
  "createRecords",
  "updateRecords",
  "archiveRecords",
  "unarchiveRecords",
  "setMeta",
  "setAsset",
  "removeAsset",
] as const;

/**
 * Compile-time exhaustiveness.
 *
 * The annotation on `MUTATION_KINDS` only checks that every listed name *is* a
 * kind -- it cannot notice a kind that was added to the union and not to the
 * list. That gap is silent and consequential: `isMutation` checks against the
 * list, so a new mutation would be rejected at the boundary by a commit that
 * typechecks perfectly.
 *
 * `as const` (rather than `satisfies`) keeps the literal types, and this
 * assertion is what turns them into an error when the two drift.
 */
type KindMissingFromTheList = Exclude<
  Mutation["kind"],
  typeof MUTATION_KINDS[number]
>;

// Fails to compile with the offending kind named in the message.
export const EVERY_KIND_IS_LISTED: KindMissingFromTheList extends never
  ? true
  : [
      "a Mutation kind is missing from MUTATION_KINDS:",
      KindMissingFromTheList,
    ] = true;

/**
 * Whether a value is a mutation.
 *
 * Structural, and checked at the `commit()` boundary rather than trusted from
 * the type. A mutation arriving from a plugin, a URL, or an MCP tool is
 * untrusted input wearing a TypeScript type, and `commit()` is the last place
 * that can still refuse it.
 */
export const isMutation = (value: unknown): value is Mutation => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return (
    typeof kind === "string" &&
    (MUTATION_KINDS as readonly string[]).includes(kind)
  );
};
