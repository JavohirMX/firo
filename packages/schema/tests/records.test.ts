/**
 * Rule 4 tests: records are not elements.
 *
 * The two behaviours here that look like over-engineering and are not:
 * `values` is keyed by `Column.key` rather than `Column.id`, and the values of a
 * deleted column are retained. Both exist because the alternative loses data in
 * a way nobody notices until it is gone.
 */
import { describe, expect, test } from "vitest";

import {
  asFractionalIndex,
  loadBoard,
  migrateRecord,
  RepairLog,
  serializeBoard,
} from "@firo/schema";

import type { Collection } from "@firo/schema";

const collection: Collection = {
  id: "col-1",
  boardId: "b-1",
  name: "Tasks",
  order: asFractionalIndex("a0"),
  version: 1,
  columns: [
    { id: "c-1", key: "title", name: "Title", type: "text" },
    { id: "c-2", key: "done", name: "Done", type: "boolean" },
    {
      id: "c-3",
      key: "status",
      name: "Status",
      type: "singleSelect",
      options: [{ id: "o1", name: "Doing", color: "#f00" }],
    },
  ],
};

const record = (over: Record<string, unknown> = {}) => ({
  id: "rec-1",
  collectionId: "col-1",
  values: {
    title: { type: "text", value: "Interview five teams" },
    done: { type: "boolean", value: false },
    status: { type: "singleSelect", value: "Doing" },
  },
  created: 1,
  updated: 1,
  order: "a0",
  archived: false,
  ...over,
});

describe("values are keyed by Column.key, not Column.id", () => {
  test("a value keyed by the column's key is read", () => {
    const { record: r } = migrateRecord(
      record(),
      [collection],
      new RepairLog(),
    );
    expect(r.values.title).toEqual({
      type: "text",
      value: "Interview five teams",
    });
  });

  test("a value keyed by the column's *id* is not recognised as known", () => {
    // This is the case the design is for. A file keyed by id happens when a
    // column is deleted and re-created: the new column has a new id, and every
    // value written against the old id is now orphaned. Keying by key means the
    // value follows the column through a rename and a re-create.
    const log = new RepairLog();
    const { record: r } = migrateRecord(
      record({
        values: { "c-1": { type: "text", value: "orphan" } },
      }),
      [collection],
      log,
    );
    // It is retained, not validated against `title`.
    expect(r.values["c-1"]).toEqual({ type: "text", value: "orphan" });
    expect(r.values.title).toBeUndefined();
    expect(log.all.some((entry) => entry.field === "values.c-1")).toBe(true);
  });

  test("renaming a column does not orphan its values", () => {
    const renamed: Collection = {
      ...collection,
      columns: collection.columns.map((c) =>
        c.key === "title" ? { ...c, name: "Task name" } : c,
      ),
    };
    const { record: r } = migrateRecord(record(), [renamed], new RepairLog());
    expect(r.values.title).toEqual({
      type: "text",
      value: "Interview five teams",
    });
  });
});

describe("deleting a column hides its data rather than destroying it", () => {
  test("a value whose column is gone is retained verbatim", () => {
    // Pruning here is a one-line optimisation that makes a restore impossible.
    const withoutStatus: Collection = {
      ...collection,
      columns: collection.columns.filter((c) => c.key !== "status"),
    };
    const log = new RepairLog();
    const { record: r } = migrateRecord(record(), [withoutStatus], log);
    expect(r.values.status).toEqual({ type: "singleSelect", value: "Doing" });
    expect(log.all.some((entry) => entry.kind === "keptUnknown")).toBe(true);
  });

  test("restoring the column brings the value back, validated again", () => {
    const withoutStatus: Collection = {
      ...collection,
      columns: collection.columns.filter((c) => c.key !== "status"),
    };
    const hidden = migrateRecord(
      record(),
      [withoutStatus],
      new RepairLog(),
    ).record;

    // Re-adding the column and re-loading the same record: the value is now
    // known, so it is type-checked instead of merely carried.
    const restored = migrateRecord(hidden, [collection], new RepairLog());
    expect(restored.record.values.status).toEqual({
      type: "singleSelect",
      value: "Doing",
    });
  });

  test("every value is retained when the whole collection is missing", () => {
    const { record: r } = migrateRecord(record(), [], new RepairLog());
    expect(r.values).toEqual(record().values);
  });
});

describe("a value whose type does not match its column is repaired, not kept", () => {
  // The asymmetry with the previous describe is deliberate. A *known* column
  // with a *mismatched* value is a bug we can see and fix, so it is coerced to
  // null and reported. An *unknown* column might belong to a future version, so
  // its value is carried untouched.
  test("a text value in a boolean column becomes null and is reported", () => {
    const log = new RepairLog();
    const { record: r } = migrateRecord(
      record({ values: { done: { type: "text", value: "yes" } } }),
      [collection],
      log,
    );
    expect(r.values.done).toBeNull();
    expect(log.all.some((entry) => entry.field === "values.done")).toBe(true);
  });

  test("a value of a field type a future version added becomes null", () => {
    const log = new RepairLog();
    const { record: r } = migrateRecord(
      record({ values: { title: { type: "sql", value: "SELECT 1" } } }),
      [collection],
      log,
    );
    expect(r.values.title).toBeNull();
    expect(log.summary()).toContain("coerced");
  });

  test("a malformed value object becomes null rather than crashing", () => {
    const { record: r } = migrateRecord(
      record({ values: { title: "just a string" } }),
      [collection],
      new RepairLog(),
    );
    expect(r.values.title).toBeNull();
  });
});

describe("column integrity", () => {
  const withColumns = (columns: unknown[]) => ({
    ...collection,
    columns,
  });

  test("a column with no key is dropped -- a record cannot address it", () => {
    const { collections, log } = loadBoard({
      meta: {},
      collections: [
        withColumns([
          { id: "c-1", key: "title", name: "Title", type: "text" },
          { id: "c-2", name: "No key", type: "text" },
        ]),
      ],
      elements: [],
      records: [],
    });
    expect(collections[0].columns).toHaveLength(1);
    expect(log.all.some((entry) => entry.kind === "dropped")).toBe(true);
  });

  test("a duplicate key drops the later column and says why", () => {
    // Two columns sharing a key means their values are indistinguishable, and
    // the second silently wins on every read.
    const { collections, log } = loadBoard({
      meta: {},
      collections: [
        withColumns([
          { id: "c-1", key: "title", name: "A", type: "text" },
          { id: "c-2", key: "title", name: "B", type: "number" },
        ]),
      ],
      elements: [],
      records: [],
    });
    expect(collections[0].columns).toHaveLength(1);
    expect(collections[0].columns[0].id).toBe("c-1");
    const dropped = log.all.find((entry) => entry.kind === "dropped");
    expect(dropped?.reason).toMatch(/duplicate key/);
  });

  test("an unknown column type falls back to text rather than vanishing", () => {
    const { collections, log } = loadBoard({
      meta: {},
      collections: [
        withColumns([{ id: "c-1", key: "x", name: "X", type: "quantum" }]),
      ],
      elements: [],
      records: [],
    });
    expect(collections[0].columns[0].type).toBe("text");
    expect(log.hasAny).toBe(true);
  });

  test("an unknown field on a column is preserved", () => {
    const { collections } = loadBoard({
      meta: {},
      collections: [
        withColumns([
          { id: "c-1", key: "x", name: "X", type: "text", width: 240 },
        ]),
      ],
      elements: [],
      records: [],
    });
    expect(collections[0].columns[0]).toHaveProperty("width", 240);
  });
});

describe("a record is not an element", () => {
  test("records carry no geometry and no element id branding", () => {
    // The distinction is the one most easily blurred (rule 4). Assert the
    // absence rather than trusting a convention.
    const { record: r } = migrateRecord(
      record(),
      [collection],
      new RepairLog(),
    );
    for (const forbidden of [
      "x",
      "y",
      "width",
      "height",
      "angle",
      "strokeColor",
      "type",
    ]) {
      expect(r).not.toHaveProperty(forbidden);
    }
  });

  test("an element carrying recordId is still an element, and links to a record", () => {
    // The direction that *is* allowed: a card on the canvas is a projection.
    const board = loadBoard({
      meta: {},
      collections: [collection],
      elements: [
        {
          id: "card-1",
          type: "stickynote",
          text: "Interview five teams",
          recordId: "rec-1",
        },
      ],
      records: [record()],
    });
    expect(board.elements[0]).toHaveProperty("recordId", "rec-1");
    expect(board.records[0].id).toBe("rec-1");
    // Same string, two different things: the element is not the record.
    expect(board.elements[0]).not.toHaveProperty("values");
  });

  test("a record survives a full board round trip with its unknown-column value", () => {
    const withoutStatus: Collection = {
      ...collection,
      columns: collection.columns.filter((c) => c.key !== "status"),
    };
    const loaded = loadBoard({
      meta: {},
      collections: [withoutStatus],
      elements: [],
      records: [record()],
    });
    const out = serializeBoard(loaded);
    const roundTripped = loadBoard(out);
    expect(roundTripped.records[0].values.status).toEqual({
      type: "singleSelect",
      value: "Doing",
    });
  });
});
