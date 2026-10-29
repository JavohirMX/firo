/**
 * The migration entry points.
 *
 * Everything that loads a board goes through here. There is deliberately no
 * other way in: a load path that skips the chain is how a format rots, because
 * the skipping path is the one nobody tests.
 */
import { FIELD_TYPE_FOR_COLUMN } from "./types.js";
import {
  allKnownFields,
  knownFieldsFor,
  requireElementSpec,
  runElementMigrations,
} from "./registry.js";
import {
  CURRENT_ELEMENT_VERSION,
  CURRENT_RECORD_VERSION,
  ForwardVersionError,
} from "./version.js";
import {
  RepairLog,
  isFiniteNumber,
  oneOf,
  preserveUnknownFields,
  string,
  number,
  boolean,
  plainObject,
} from "./validate.js";
import { isProseMirrorDoc, parseProseMirrorDoc } from "./prosemirror.js";

import type {
  Collection,
  ColumnType,
  CommentEntry,
  CommentThread,
  ElementId,
  FiroElement,
  FiroRecord,
  FieldValue,
} from "./types.js";

export type LoadResult<T> = {
  value: T;
  /** Non-empty if anything had to be repaired. */
  log: RepairLog;
  /** The version the input was stored at, before migration. */
  loadedFromVersion: number;
};

/* -------------------------------------------------------------------------- */
/* Elements                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Migrate and validate one element.
 *
 * `storedVersion` is the version the *enclosing board* was written at, passed in
 * by the caller. It is not read from the element.
 *
 * ## Why the version is not a per-element field
 *
 * A board is written by one writer at one version. Per-element versions would
 * mean a board whose notes are v1 and whose cards are v2, which the migration
 * chain cannot act on coherently, and which would be a second place for a
 * version to be recorded and therefore a second place to get it wrong. The
 * board header is the single source of truth; this is an argument, not a lookup.
 *
 * The one-time exceptions are a bare element arriving from somewhere with no
 * board around it (a share API, a clipboard paste). Those pass their own
 * version, and defaulting to 1 there is correct: everything written before the
 * field existed is v1, including every Excalidraw file.
 */
export const migrateElement = (
  input: unknown,
  log: RepairLog,
  storedVersion = 1,
): { element: FiroElement; loadedFromVersion: number } => {
  if (!plainObject(input)) {
    throw new TypeError(
      `An element must be an object, got ${
        input === null ? "null" : typeof input
      }.`,
    );
  }

  const raw = input as Record<string, unknown>;
  const type = string(raw.type, "", log, "type");
  if (!type) {
    throw new TypeError("An element must have a non-empty `type`.");
  }

  const spec = requireElementSpec(type);

  const migrated = runElementMigrations(
    spec,
    raw,
    storedVersion,
    CURRENT_ELEMENT_VERSION,
    log,
  );

  const element = spec.validate(migrated, log);

  return { element, loadedFromVersion: storedVersion };
};

/* -------------------------------------------------------------------------- */
/* Records                                                                    */
/* -------------------------------------------------------------------------- */

const KNOWN_RECORD_FIELDS = [
  "id",
  "collectionId",
  "values",
  "created",
  "updated",
  "order",
  "archived",
] as const;

const KNOWN_COLLECTION_FIELDS = [
  "id",
  "boardId",
  "name",
  "columns",
  "order",
  "version",
] as const;

/**
 * Coerce a stored field value to a well-formed `FieldValue` for its column.
 *
 * ## Why this returns an object, and why the return type is widened
 *
 * A known column with a value of the wrong `type` is a bug we can *see* -- it
 * came from a hand-edited file, a bad import, or a bug we shipped. So it is
 * repaired to a null-valued `FieldValue` and reported, rather than carried.
 *
 * That is the opposite of what happens to a value whose *column* is unknown
 * (retained verbatim), and the asymmetry is the point: we overwrite what we
 * understand and preserve what we do not.
 *
 * The inner value is checked too, not just the tag. `{ type: "number",
 * value: "7" }` has the right tag and the wrong payload, and a renderer that
 * trusted the tag would draw NaN. A wrong payload is repaired the same way.
 *
 * `expected` is narrowed to `ColumnType` so the `FIELD_TYPE_FOR_COLUMN` lookup
 * is checked rather than `any`-shaped, and the return is widened to
 * `FieldValue | null` because which union member `expected` selects is only
 * known at the call site.
 */
const coerceFieldValue = (
  raw: unknown,
  expected: ColumnType,
  log: RepairLog,
  field: string,
): FieldValue | null => {
  if (!plainObject(raw)) {
    log.coerced(field, raw, null);
    return null;
  }
  const value = raw as { type?: unknown; value?: unknown };
  if (value.type !== expected) {
    log.coerced(field, value.type, expected);
    return null;
  }
  /*
   * Relation payloads name a record by id, so anything that is not a string
   * or null cannot point at a node. Repaired to null (a root) rather than
   * carried: a number here would otherwise render as a dangling edge to
   * nothing. ADR-0040 section 4.
   */
  if (
    expected === "relation" &&
    value.value !== null &&
    typeof value.value !== "string"
  ) {
    log.coerced(field, value.value, null);
    return null;
  }
  return { type: expected, value: value.value } as FieldValue;
};

/**
 * Migrate one record.
 *
 * The `values` pass is the interesting part: every value is checked against its
 * column, and a value whose column is *absent from the collection* is retained
 * untouched. That is what makes a deleted column recoverable.
 */
export const migrateRecord = (
  input: unknown,
  collections: readonly Collection[],
  log: RepairLog,
  storedVersion = 1,
): { record: FiroRecord; loadedFromVersion: number } => {
  if (!plainObject(input)) {
    throw new TypeError(
      `A record must be an object, got ${
        input === null ? "null" : typeof input
      }.`,
    );
  }

  const raw = input as Record<string, unknown>;

  // Passed in by `loadBoard` from the board header; a bare record defaults to 1.
  // See `migrateElement` for why the version is not a per-object field.

  if (storedVersion > CURRENT_RECORD_VERSION) {
    throw new ForwardVersionError(
      "record",
      storedVersion,
      CURRENT_RECORD_VERSION,
      typeof raw.id === "string" ? raw.id : undefined,
    );
  }

  const collectionId = string(raw.collectionId, "", log, "collectionId");
  const collection = collections.find((c) => c.id === collectionId);
  if (!collection) {
    log.coerced("collectionId", collectionId, null);
  }

  const base = preserveUnknownFields(raw, KNOWN_RECORD_FIELDS, log);

  const rawValues = plainObject(raw.values) ? raw.values : {};
  const values: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawValues)) {
    const column = collection?.columns.find((c) => c.key === key);
    if (!column) {
      /*
       * The column is gone (or the collection is). Retain the value verbatim.
       *
       * This is the single most important line in the record code: deleting a
       * column must *hide* its data, not destroy it, or restoring the column
       * cannot bring the values back. Pruning here is a one-line optimisation
       * that makes a restore impossible.
       */
      values[key] = value;
      log.keptUnknown(`values.${key}`);
      continue;
    }
    values[key] = coerceFieldValue(
      value,
      FIELD_TYPE_FOR_COLUMN[column.type],
      log,
      `values.${key}`,
    );
  }

  const record = {
    ...base,
    id: string(raw.id, "", log, "id"),
    collectionId,
    values,
    created: number(raw.created, 0, log, "created"),
    updated: number(raw.updated, 0, log, "updated"),
    order: (raw.order as FiroRecord["order"]) ?? null,
    archived: boolean(raw.archived, false, log, "archived"),
  } as FiroRecord;

  return { record, loadedFromVersion: storedVersion };
};

const KNOWN_COLUMN_FIELDS = [
  "id",
  "key",
  "name",
  "type",
  "options",
  "color",
] as const;

const migrateCollection = (input: unknown, log: RepairLog): Collection => {
  if (!plainObject(input)) {
    throw new TypeError(
      `A collection must be an object, got ${
        input === null ? "null" : typeof input
      }.`,
    );
  }
  const raw = input as Record<string, unknown>;
  const base = preserveUnknownFields(raw, KNOWN_COLLECTION_FIELDS, log);

  const columns = Array.isArray(raw.columns) ? raw.columns : [];
  if (!Array.isArray(raw.columns)) {
    log.coerced("columns", raw.columns, []);
  }

  const seenKeys = new Set<string>();
  return {
    ...base,
    id: string(raw.id, "", log, "id"),
    boardId: string(raw.boardId, "", log, "boardId"),
    name: string(raw.name, "Untitled", log, "name"),
    version: number(raw.version, 1, log, "version"),
    order: (raw.order as Collection["order"]) ?? null,
    columns: columns.flatMap((column, index) => {
      if (!plainObject(column)) {
        log.dropped(`columns[${index}]`, "not an object");
        return [];
      }
      const c = column as Record<string, unknown>;
      const key = string(c.key, "", log, `columns[${index}].key`);
      if (!key) {
        log.dropped(`columns[${index}].key`, "a column needs a stable key");
        return [];
      }
      /*
       * Duplicate keys are a data-loss bug waiting to happen: two columns
       * sharing a key means their values are indistinguishable, and the second
       * silently wins on every read. Drop the later one and say so.
       */
      if (seenKeys.has(key)) {
        log.dropped(
          `columns[${index}].key`,
          `duplicate key "${key}" — values would be ambiguous`,
        );
        return [];
      }
      seenKeys.add(key);

      return [
        {
          ...preserveUnknownFields(c, KNOWN_COLUMN_FIELDS, log),
          id: string(c.id, "", log, `columns[${index}].id`),
          key,
          name: string(c.name, key, log, `columns[${index}].name`),
          type: oneOf(
            c.type,
            Object.keys(
              FIELD_TYPE_FOR_COLUMN,
            ) as readonly (keyof typeof FIELD_TYPE_FOR_COLUMN)[],
            "text",
            log,
            `columns[${index}].type`,
          ),
          ...(Array.isArray(c.options) ? { options: c.options as never } : {}),
          ...(typeof c.color === "string" ? { color: c.color } : {}),
        },
      ];
    }),
  } as Collection;
};

export { migrateCollection };

/* -------------------------------------------------------------------------- */
/* Comments                                                                   */
/* -------------------------------------------------------------------------- */

const KNOWN_COMMENT_ENTRY_FIELDS = [
  "id",
  "body",
  "author",
  "createdAt",
] as const;

const KNOWN_COMMENT_THREAD_FIELDS = [
  "id",
  "elementId",
  "anchor",
  "comments",
  "resolved",
  "author",
  "createdAt",
  "updatedAt",
] as const;

const KNOWN_COMMENT_ANCHOR_FIELDS = ["x", "y"] as const;

/**
 * Migrate and validate one message.
 *
 * Same shape as every other validator in this file: spread the original object
 * first so a field a newer build wrote survives, then overlay the fields this
 * build knows how to type. A message that is not an object at all is dropped by
 * the caller, not here — a thread with one malformed message should lose the
 * message, not the conversation.
 */
const migrateCommentEntry = (
  input: Record<string, unknown>,
  log: RepairLog,
  at: string,
): CommentEntry =>
  ({
    ...preserveUnknownFields(input, KNOWN_COMMENT_ENTRY_FIELDS, log),
    id: string(input.id, "", log, `${at}.id`),
    body: string(input.body, "", log, `${at}.body`),
    author: string(input.author, "", log, `${at}.author`),
    createdAt: number(input.createdAt, 0, log, `${at}.createdAt`),
  } as CommentEntry);

/**
 * Migrate and validate one comment thread.
 *
 * ## Why this is not `migrateElement` with a version
 *
 * A thread has no schema version of its own. The board header's
 * `recordSchemaVersion` governs the non-element durable lanes (see
 * [`./version.ts`](./version.ts)), so a board from a newer record version is
 * refused once, at the board boundary, rather than re-checked per thread. That is
 * the same reason `migrateCollection` takes no version.
 *
 * ## Why a malformed thread is repaired and not dropped
 *
 * A thread is a conversation, and a load path that answers "some of your comments
 * are gone" is worse than one that answers "one comment was blank". Every
 * individual field is repaired to a safe value and reported; only a thread that
 * is not an object at all is subject to the caller's drop policy. The one field a
 * repair cannot invent is `id`, so an empty id is reported and kept as the empty
 * string — the caller sees it in the log and in the board rather than losing the
 * thread silently.
 */
export const migrateCommentThread = (
  input: unknown,
  log: RepairLog,
  at = "comment",
): CommentThread => {
  if (!plainObject(input)) {
    throw new TypeError(
      `A comment thread must be an object, got ${
        input === null ? "null" : typeof input
      }.`,
    );
  }

  const raw = input as Record<string, unknown>;

  const anchorRaw = plainObject(raw.anchor) ? raw.anchor : {};
  if (raw.anchor !== undefined && !plainObject(raw.anchor)) {
    log.coerced(`${at}.anchor`, raw.anchor, { x: 0, y: 0 });
  }

  const rawComments = Array.isArray(raw.comments) ? raw.comments : [];
  if (raw.comments !== undefined && !Array.isArray(raw.comments)) {
    log.coerced(`${at}.comments`, raw.comments, []);
  }

  const comments = rawComments.flatMap((entry, index) => {
    if (!plainObject(entry)) {
      log.dropped(`${at}.comments[${index}]`, "not an object");
      return [];
    }
    return [migrateCommentEntry(entry, log, `${at}.comments[${index}]`)];
  });

  return {
    ...preserveUnknownFields(raw, KNOWN_COMMENT_THREAD_FIELDS, log),
    id: string(raw.id, "", log, `${at}.id`),
    elementId: string(raw.elementId, "", log, `${at}.elementId`),
    anchor: {
      ...preserveUnknownFields(anchorRaw, KNOWN_COMMENT_ANCHOR_FIELDS, log),
      x: number(anchorRaw.x, 0, log, `${at}.anchor.x`),
      y: number(anchorRaw.y, 0, log, `${at}.anchor.y`),
    },
    comments,
    resolved: boolean(raw.resolved, false, log, `${at}.resolved`),
    author: string(raw.author, "", log, `${at}.author`),
    createdAt: number(raw.createdAt, 0, log, `${at}.createdAt`),
    updatedAt: number(
      raw.updatedAt,
      number(raw.createdAt, 0, log, `${at}.createdAt`),
      log,
      `${at}.updatedAt`,
    ),
  } as CommentThread;
};

/* -------------------------------------------------------------------------- */
/* Whole boards                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The on-disk / on-wire shape of a board. This is what a `.firo` file holds.
 *
 * ## Why `elementOrder` is a field and not implied by array position
 *
 * Elements are stored in a map keyed by id, so their position in `elements`
 * carries no meaning -- and a reader that used it as z-order would be guessing.
 * The order has to be stated, exactly as `Y.Array` states it in the document
 * ([`03-crdt-and-sync.md`](../../trd/03-crdt-and-sync.md)).
 *
 * Omitting it is not a safe default that degrades to "array order": a board
 * whose notes were moved would reopen with them stacked in creation order, and
 * nothing would look wrong. It is required.
 */
export type SerializedBoard = {
  elementSchemaVersion: number;
  recordSchemaVersion: number;
  /** z-order, front to back. Every id in `elements` appears here. */
  elementOrder: string[];
  elements: unknown[];
  collections: unknown[];
  records: unknown[];
  /**
   * Comment threads.
   *
   * ## Why this field is optional, and absent when there is nothing to say
   *
   * Every other lane is an array that is always present. This one is omitted when
   * it is empty, and that is a deliberate choice with a consequence worth naming:
   * a board written before comments existed has no `comments` key at all, so
   * loading and re-saving it must not *gain* one. `roundTripFixture` compares the
   * whole structure, so materialising `[]` would fail the v1 and v2 fixtures —
   * which is exactly the whole-file churn the canonical writer exists to prevent,
   * caught mechanically rather than by review.
   *
   * Absence and `[]` therefore mean the same thing on load, and `serializeBoard`
   * is the one place that decides to write neither.
   */
  comments?: unknown[];
  meta: Record<string, unknown>;
};

export type LoadedBoard = {
  /** In z-order. */
  elements: FiroElement[];
  /**
   * The same order, as ids.
   *
   * Branded, and one-to-one with `elements`. An id in the file that matched no
   * element is dropped from here and reported, so every entry refers to
   * something that exists -- which is the property a caller actually relies on
   * when it indexes `elements` by this list.
   */
  elementOrder: ElementId[];
  collections: Collection[];
  records: FiroRecord[];
  comments: CommentThread[];
  meta: Record<string, unknown>;
  log: RepairLog;
};

/**
 * Load a board from its serialised form.
 *
 * **Collections are loaded before records, always**, because a record's values
 * are validated against its collection's columns. The reverse order would mean
 * validating against a schema that is not known yet.
 */
export const loadBoard = (input: unknown): LoadedBoard => {
  if (!plainObject(input)) {
    throw new TypeError(
      `A board must be an object, got ${
        input === null ? "null" : typeof input
      }.`,
    );
  }

  const raw = input as Record<string, unknown>;
  const log = new RepairLog();

  const storedElementVersion = isFiniteNumber(raw.elementSchemaVersion)
    ? raw.elementSchemaVersion
    : (log.missing("elementSchemaVersion", undefined), 1);
  if (storedElementVersion > CURRENT_ELEMENT_VERSION) {
    throw new ForwardVersionError(
      "element",
      storedElementVersion,
      CURRENT_ELEMENT_VERSION,
    );
  }

  const storedRecordVersion = isFiniteNumber(raw.recordSchemaVersion)
    ? raw.recordSchemaVersion
    : (log.missing("recordSchemaVersion", undefined), 1);
  if (storedRecordVersion > CURRENT_RECORD_VERSION) {
    throw new ForwardVersionError(
      "record",
      storedRecordVersion,
      CURRENT_RECORD_VERSION,
    );
  }

  const rawElements = Array.isArray(raw.elements) ? raw.elements : [];
  if (!Array.isArray(raw.elements)) {
    log.coerced("elements", raw.elements, []);
  }
  const rawCollections = Array.isArray(raw.collections) ? raw.collections : [];
  if (!Array.isArray(raw.collections)) {
    log.coerced("collections", raw.collections, []);
  }
  const rawRecords = Array.isArray(raw.records) ? raw.records : [];
  if (!Array.isArray(raw.records)) {
    log.coerced("records", raw.records, []);
  }

  const collections = rawCollections.map((c) => migrateCollection(c, log));

  /*
   * A single bad element must not lose the board. An element that throws is
   * dropped and reported; an element that merely needs repair is repaired.
   * Only a *forward version* or an *unknown type* is fatal, and those are
   * checked up front so they abort the whole load rather than dropping one
   * element from a newer board — a partially-loaded newer board is exactly the
   * failure AC-10 forbids.
   */
  const elements: FiroElement[] = [];
  rawElements.forEach((rawElement, index) => {
    try {
      elements.push(
        migrateElement(rawElement, log, storedElementVersion).element,
      );
    } catch (error) {
      if (
        error instanceof ForwardVersionError ||
        (error as Error).name === "UnknownElementTypeError"
      ) {
        throw error;
      }
      log.dropped(`elements[${index}]`, (error as Error).message);
    }
  });

  /*
   * Re-sort the elements into z-order.
   *
   * Every element ends up in the output, whatever the file says: an id in
   * `elementOrder` with no element is reported, and an element missing from
   * `elementOrder` is appended rather than dropped. The invariant is that
   * `loadBoard` never loses an element it was given -- a board that opens with
   * silently fewer notes is the failure that gets reported as data loss.
   */
  const elementOrder: string[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(raw.elementOrder)) {
    for (const [position, id] of raw.elementOrder.entries()) {
      if (typeof id !== "string") {
        log.dropped(`elementOrder[${position}]`, "not a string");
        continue;
      }
      if (seenIds.has(id)) {
        // A duplicate makes the order ambiguous, and the second occurrence would
        // silently win on every read.
        log.dropped(`elementOrder[${position}]`, `duplicate id "${id}"`);
        continue;
      }
      seenIds.add(id);
      elementOrder.push(id);
    }
  } else {
    log.missing("elementOrder", undefined);
  }

  /*
   * Build the final order.
   *
   * Elements named in `elementOrder` take their stated position; anything the
   * file omitted is appended. Built by pushing rather than by `filter`, because a
   * filter can only drop -- and dropping an element is the one outcome that must
   * be impossible in a load path.
   *
   * The ids are branded from the elements that resolved, not from the file. An id
   * in the file is an untrusted string; an id in the *result* refers to an
   * element that exists, which is exactly what `ElementId` claims.
   */
  const byId = new Map<string, FiroElement>(
    elements.map((element) => [element.id, element]),
  );
  const ordered: FiroElement[] = [];
  const order: ElementId[] = [];

  for (const id of elementOrder) {
    const element = byId.get(id);
    if (!element) {
      log.dropped(`elementOrder`, `id "${id}" has no element`);
      continue;
    }
    ordered.push(element);
    order.push(element.id);
    byId.delete(id);
  }
  for (const element of byId.values()) {
    ordered.push(element);
    order.push(element.id);
  }

  const records = rawRecords
    .map((rawRecord) => {
      try {
        return migrateRecord(rawRecord, collections, log, storedRecordVersion)
          .record;
      } catch (error) {
        log.dropped("records[]", (error as Error).message);
        return null;
      }
    })
    .filter((r): r is FiroRecord => r !== null);

  /*
   * Comments.
   *
   * Unlike `elements`/`collections`/`records`, absence is *not* reported: the
   * field is optional by design (`SerializedBoard.comments`) and every board
   * written before comments existed has no such key. Recording a `missing` here
   * would make every committed fixture log a repair and turn "this old file
   * still loads clean" into a statement nobody could assert. A present-but-wrong
   * value is still reported, because that is corruption.
   */
  const comments: CommentThread[] = [];
  if (Array.isArray(raw.comments)) {
    raw.comments.forEach((rawThread, index) => {
      try {
        comments.push(
          migrateCommentThread(rawThread, log, `comments[${index}]`),
        );
      } catch (error) {
        log.dropped(`comments[${index}]`, (error as Error).message);
      }
    });
  } else if (raw.comments !== undefined) {
    log.coerced("comments", raw.comments, []);
  }

  return {
    elements: ordered,
    elementOrder: order,
    collections,
    records,
    comments,
    meta: plainObject(raw.meta) ? raw.meta : {},
    log,
  };
};

/**
 * Drop a board's tombstones, for writing to a *file*.
 *
 * ## Why this exists and why it is not just "the serialiser"
 *
 * The document keeps a tombstone for every deleted element, and
 * `doc.read()` returns them. That is correct and it is load-bearing: the document is a
 * CRDT, a tombstone is what stops a stale write from resurrecting a deleted element,
 * and it is what lets an undone deletion be restored. **The autosave must keep them**,
 * and nothing in this function should be applied to that path.
 *
 * A *file* is a different thing. It is a snapshot handed to a person, not a replica of
 * a live document, and the two things a tombstone buys are both absent from it:
 *
 * - **Undo history.** Not in the file at all. `serializeBoard` has never carried a
 *   history, so a tombstone in a file restores nothing — there is no stack to push it
 *   onto.
 * - **Resurrection protection.** Only matters when something else holds stale writes
 *   about the same document. A file on disk has no concurrent writer.
 *
 * What a tombstone *costs* in a file is unbounded growth. Measured: create five notes,
 * delete two, and the export carries all five. Every edit-and-undo adds another, and
 * nothing ever removes them, so a board someone worked on for a week is mostly dead
 * elements — and `git diff` on a board nobody touched still churns.
 *
 * ## What is *not* compacted, and why
 *
 * **Archived records.** `archived: true` is a state, not a tombstone: the projection
 * can bring the record back, which is the stated reason for archiving rather than
 * deleting. Dropping it would lose a card someone deliberately removed from a board
 * *view* but not from the board.
 *
 * ## Determinism
 *
 * Pure, order-preserving and idempotent, so an exported board still round-trips
 * byte-identically and compacting an already-compact board changes nothing. `git diff`
 * depends on that as much as it depends on the canonical key order.
 */
export const compactBoard = (board: SerializedBoard): SerializedBoard => {
  const live = board.elements.filter(
    (element) =>
      !plainObject(element) ||
      (element as { isDeleted?: unknown }).isDeleted !== true,
  );

  if (live.length === board.elements.length) {
    // Already compact. Returning the same object rather than a copy keeps
    // idempotence obvious, and avoids rebuilding a large board for nothing.
    return board;
  }

  /*
   * `elementOrder` is filtered to the ids that survived, in the same order.
   *
   * `loadBoard` would cope with a dangling id — it drops one that matched no element
   * and reports it — but it would do so by *reporting*, which means the warning fires
   * on every load of a perfectly valid file. A file this function writes should be one
   * `loadBoard` has nothing to complain about.
   */
  const surviving = new Set(
    live.map((element) => (element as { id?: unknown }).id),
  );

  return {
    ...board,
    elements: live,
    elementOrder: (board.elementOrder ?? []).filter((id) => surviving.has(id)),
  };
};

/**
 * Serialise a board.
 *
 * The inverse of `loadBoard`, and written as its own function rather than as
 * `JSON.stringify` at the call site so that the shape is stated in exactly one
 * place. Adding a field to the serialised form is a deliberate act.
 */
export const serializeBoard = (board: {
  elements: readonly FiroElement[];
  collections: readonly Collection[];
  records: readonly FiroRecord[];
  /**
   * Comment threads.
   *
   * Optional, and written only when there is at least one. An empty board that
   * dropped its last comment must serialise back to the file it came from, which
   * had no `comments` key — see `SerializedBoard.comments` for why absence and
   * `[]` are the same thing here.
   */
  comments?: readonly CommentThread[];
  /** z-order. Defaults to `elements` order when the caller has none. */
  elementOrder?: readonly string[];
  meta?: Record<string, unknown>;
}): SerializedBoard => {
  const comments = board.comments ?? [];
  return {
    elementSchemaVersion: CURRENT_ELEMENT_VERSION,
    recordSchemaVersion: CURRENT_RECORD_VERSION,
    // Elements, collections and records are written as they are. The header
    // carries the version, so stamping it per object as well would be a second
    // copy that a writer has to keep in step -- and a place for the two to
    // disagree without anything noticing.
    elements: [...board.elements],
    collections: [...board.collections],
    records: [...board.records],
    // Omitted when empty; see `SerializedBoard.comments`. Spread rather than
    // assigning `undefined`, so the key is genuinely absent rather than present
    // and undefined -- `JSON.stringify` drops the latter but `Object.keys` and a
    // structural comparison do not.
    ...(comments.length ? { comments: [...comments] } : {}),
    /*
     * Stated rather than inferred. A caller with no order of its own gets the
     * array order it passed, which is the honest reading of "no order given" --
     * as opposed to guessing one from element ids, which would silently reorder
     * a board on every save.
     */
    elementOrder: [...(board.elementOrder ?? board.elements.map((e) => e.id))],
    meta: board.meta ?? {},
  };
};

export { isProseMirrorDoc, parseProseMirrorDoc };

/**
 * The fields a loaded object carries that this build does not understand.
 *
 * ## Why this exists
 *
 * `migrateElement` returns a `FiroElement`, and an element's *type* cannot list
 * fields it does not know about — that is the whole point of the escape hatch.
 * So a preserved field is present at runtime and absent from the type, and
 * `element.someFutureField` does not compile.
 *
 * This is the sanctioned way to read one. It exists for three callers, all of
 * which are real and none of which can be served by an `any`:
 *
 * - A host application reading its own `customData`.
 * - A debug view answering "what did this file carry that we ignored?".
 * - Tests asserting rule 1, which is otherwise untestable without a cast.
 *
 * It returns `unknown`, not a guess. Reading a preserved field requires the
 * caller to narrow it, because this build genuinely does not know what it is.
 *
 * @param object a loaded element, record, or collection
 */
export const preservedFields = (object: unknown): Record<string, unknown> => {
  if (!plainObject(object)) {
    return {};
  }
  const known = new Set(
    typeof object.type === "string" && knownFieldsFor(object.type).length
      ? allKnownFields(object.type)
      : typeof object.collectionId === "string"
      ? [...KNOWN_RECORD_FIELDS, ...KNOWN_COLLECTION_FIELDS]
      : [...KNOWN_COLLECTION_FIELDS],
  );
  const preserved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    if (!known.has(key)) {
      preserved[key] = value;
    }
  }
  return preserved;
};
