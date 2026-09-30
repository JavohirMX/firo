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

  return {
    elements: ordered,
    elementOrder: order,
    collections,
    records,
    meta: plainObject(raw.meta) ? raw.meta : {},
    log,
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
  /** z-order. Defaults to `elements` order when the caller has none. */
  elementOrder?: readonly string[];
  meta?: Record<string, unknown>;
}): SerializedBoard => {
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
