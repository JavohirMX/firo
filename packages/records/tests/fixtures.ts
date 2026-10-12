/**
 * Fixtures for the projection tests.
 *
 * Deliberately plain object literals rather than something that builds a `Collection`
 * through the schema's own constructors. A projection is a pure function of
 * `(collection, records)`, so the tests want a collection the way a facilitator would
 * have made it — a few columns, a few options, a few rows — and not a document that had
 * to be migrated to produce them. `packages/schema/tests/records.test.ts` covers what
 * the schema makes of a hand-written collection; this file assumes it already did.
 */
import { generateKeyBetween } from "@firo/fractional-indexing";
import { asFractionalIndex } from "@firo/schema";

import type { Collection, FiroRecord } from "@firo/schema";

/**
 * `n` distinct, valid order keys, ascending.
 *
 * Generated rather than formatted. Fractional keys are dense base-62 integers, so
 * `"a0"`, `"a1"`, `"a2"` are valid and `"a00"` is not — a zero-padded counter is the
 * obvious way to write this and it throws. More to the point, `generateKeyBetween` is
 * how the product makes keys, so a fixture that hand-writes them is testing against a
 * format the product never produces.
 */
export const keys = (count: number): readonly FiroRecord["order"][] => {
  const out: FiroRecord["order"][] = [];
  let previous: FiroRecord["order"] | null = null;

  for (let index = 0; index < count; index += 1) {
    previous = asFractionalIndex(generateKeyBetween(previous, null));
    out.push(previous);
  }

  return out;
};

/** A `text` column. */
export const textColumn = (
  key: string,
  name: string = key,
): Collection["columns"][number] => ({
  id: `col-${key}`,
  key,
  name,
  type: "text",
});

/**
 * A `singleSelect` column.
 *
 * Options are given as `name` strings and given ids derived from them, because every
 * test that uses options cares about the *order* they are declared in and about which
 * record sits in which one — and neither is about the id. Where an id matters, the test
 * says so and passes one.
 */
export const selectColumn = (
  key: string,
  options: readonly string[],
  name: string = key,
): Collection["columns"][number] => ({
  id: `col-${key}`,
  key,
  name,
  type: "singleSelect",
  options: options.map((optionName) => ({
    id: `opt-${optionName}`,
    name: optionName,
    color: "#000000",
  })),
});

/**
 * The collection most of these tests use: a title, a status, and a number.
 *
 * The status column is second on purpose. `groupingColumnFor` takes the *first*
 * single-select, and a fixture where it is first would not notice if that changed.
 */
export const tasks = (over: Partial<Collection> = {}): Collection => ({
  id: "col-tasks",
  boardId: "b-1",
  name: "Tasks",
  order: asFractionalIndex("a0"),
  version: 1,
  columns: [
    textColumn("title", "Title"),
    selectColumn("status", ["Todo", "Doing", "Done"], "Status"),
    { id: "col-estimate", key: "estimate", name: "Estimate", type: "number" },
  ],
  ...over,
});

/**
 * A record.
 *
 * `order` goes through `asFractionalIndex` rather than a cast, so a fixture with a
 * malformed key fails here instead of quietly sorting somewhere unexpected.
 */
export const record = (over: Partial<FiroRecord> = {}): FiroRecord => ({
  id: "rec-1",
  collectionId: "col-tasks",
  values: {},
  created: 0,
  updated: 0,
  order: asFractionalIndex("a0"),
  archived: false,
  ...over,
});

/**
 * A record with a status, which is the shape the board projection exists for.
 *
 * The option id is derived from the name the same way `selectColumn` derives it, so
 * `status: "Doing"` in a test and `options: ["Todo", "Doing", "Done"]` in the fixture
 * agree without the test having to repeat `"opt-Doing"`.
 */
export const withStatus = (
  id: string,
  title: string,
  status: string | null,
  order: string,
): FiroRecord =>
  record({
    id,
    values: {
      title: { type: "text", value: title },
      status: {
        type: "singleSelect",
        value: status === null ? null : `opt-${status}`,
      },
    },
    order: asFractionalIndex(order),
  });

/**
 * A structural copy of a record, for the tests that assert nothing was mutated.
 *
 * `JSON` rather than a spread because the assertion is about the whole value and a
 * hand-written deep copy would itself be something that could be wrong. It is only
 * safe because `FiroRecord` is plain JSON data — which is also why the mutation tests
 * can use it at all.
 */
export const snapshot = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;
