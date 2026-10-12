/**
 * Ordering, which every projection shares.
 *
 * There is one implementation rather than one per projection, and
 * [`src/ordering.ts`](../src/ordering.ts) argues why: two implementations of "where
 * does this row go" would be two answers, and they would disagree the first time a
 * comparison changed from `<` to `<=` or key generation gained an edge case.
 *
 * That argument only holds if the shared function is the one being used, and the
 * property that makes the result *correct* — that a reordered record lands where it
 * was dropped — is a property of the keys, not of the arrangement. So these tests check
 * the resulting order after applying the mutation, never the mutation's literal value.
 */
import { describe, expect, it } from "vitest";

import { asFractionalIndex } from "@firo/schema";

import type { FiroRecord } from "@firo/schema";

import {
  asOrder,
  orderForLast,
  orderedRecords,
  reorderMutation,
} from "../src/index.js";

import { keys, record } from "./fixtures.js";

const row = (id: string, order: string): FiroRecord =>
  record({ id, order: asFractionalIndex(order) });

/**
 * Apply a `setOrder` mutation to a list, because that is what a record store does and
 * the assertion is about where the record ends up.
 *
 * A test asserting `mutation.order === "a0v"` would break every time key generation
 * changed, while saying nothing about whether the row moved to where it was dropped.
 */
const applyOrder = (
  records: readonly FiroRecord[],
  recordId: string,
  beforeId: string | null,
): readonly FiroRecord[] => {
  const mutation = reorderMutation(records, recordId, beforeId);
  expect(mutation).not.toBeNull();
  expect(mutation!.kind).toBe("setOrder");

  const { order } = mutation as Extract<typeof mutation, { kind: "setOrder" }>;

  return orderedRecords(
    records.map((candidate) =>
      candidate.id === recordId ? { ...candidate, order } : candidate,
    ),
  );
};

const ids = (records: readonly FiroRecord[]) => records.map((r) => r.id);

describe("orderedRecords", () => {
  it("sorts ascending by order", () => {
    expect(
      ids(orderedRecords([row("c", "a2"), row("a", "a0"), row("b", "a1")])),
    ).toEqual(["a", "b", "c"]);
  });

  it("does not reorder the caller's array", () => {
    // A sort in place is invisible from the return value — it produces a correct answer
    // and corrupts the caller's data. This is why the function copies.
    const original = [row("c", "a2"), row("a", "a0"), row("b", "a1")];
    const before = ids(original);

    orderedRecords(original);

    expect(ids(original)).toEqual(before);
  });

  it("handles an empty list and a single record", () => {
    expect(orderedRecords([])).toEqual([]);
    expect(ids(orderedRecords([row("only", "a0")]))).toEqual(["only"]);
  });
});

describe("reorderMutation places a record where it was dropped", () => {
  const list = () => [
    row("a", "a0"),
    row("b", "a1"),
    row("c", "a2"),
    row("d", "a3"),
  ];

  it("immediately before another record", () => {
    expect(ids(applyOrder(list(), "d", "b"))).toEqual(["a", "d", "b", "c"]);
  });

  it("at the front", () => {
    expect(ids(applyOrder(list(), "d", "a"))).toEqual(["d", "a", "b", "c"]);
  });

  it("at the end, when asked for last", () => {
    expect(ids(applyOrder(list(), "a", null))).toEqual(["b", "c", "d", "a"]);
  });

  it("a single-record list, asked for last", () => {
    // Not the empty list: `reorderMutation` requires the record to be in the list,
    // because it is a *move*, and a record that is not there is the guard at the top.
    // The genuinely-empty case belongs to `orderForLast`, which is a different question.
    expect(ids(applyOrder([row("a", "a0")], "a", null))).toEqual(["a"]);
  });

  it("to a position it already holds, producing no net change", () => {
    // Not refused — a caller may legitimately ask — but the result must be the same
    // arrangement, because a durable write that changes nothing is an undo step that
    // undoes nothing.
    expect(ids(applyOrder(list(), "b", "c"))).toEqual(["a", "b", "c", "d"]);
  });

  it("among 10,000 records, still lands where it was dropped", () => {
    const many = keys(10_000).map((order, index) => ({
      ...row(`rec-${index}`, "a0"),
      order,
    }));

    const moved = applyOrder(many, "rec-9999", "rec-0");

    expect(ids(moved.slice(0, 3))).toEqual(["rec-9999", "rec-0", "rec-1"]);
    expect(moved).toHaveLength(10_000);
  });
});

describe("reorderMutation refuses rather than throwing", () => {
  const list = () => [row("a", "a0"), row("b", "a1"), row("c", "a2")];

  it("a record that has gone", () => {
    // Ordinary in a pointer-up handler: a collaborator can delete a row between the
    // hit-test and the drop.
    expect(reorderMutation(list(), "gone", null)).toBeNull();
  });

  it("a beforeId that has gone", () => {
    expect(reorderMutation(list(), "b", "gone")).toBeNull();
  });

  it("a record dropped on itself", () => {
    // What a renderer sends when a row is dropped on its own position.
    expect(reorderMutation(list(), "b", "b")).toBeNull();
  });

  it("an empty list", () => {
    expect(reorderMutation([], "a", null)).toBeNull();
  });
});

describe("orderForLast", () => {
  it("sorts after everything already there", () => {
    const existing = [row("a", "a0"), row("b", "a1")];

    const last = orderForLast(existing, "new");

    expect(
      ids(orderedRecords([...existing, { ...row("new", "a0"), order: last }])),
    ).toEqual(["a", "b", "new"]);
  });

  it("works on an empty list, which is why it is separate from reorderMutation", () => {
    expect(() => orderForLast([], "first")).not.toThrow();
    expect(
      ids(orderedRecords([row("first", orderForLast([], "first"))])),
    ).toEqual(["first"]);
  });

  it("excludes the record being moved, so moving the last one does not strand it", () => {
    // The bug this guards: generating a key *after* the record's own current key, which
    // for a record already at the end is either its own position or past the list.
    const existing = [row("a", "a0"), row("b", "a1")];
    const b = existing[1];

    const moved = { ...b, order: orderForLast(existing, "b") };

    expect(
      ids(orderedRecords(existing.map((r) => (r.id === "b" ? moved : r)))),
    ).toEqual(["a", "b"]);
  });
});

describe("asOrder", () => {
  it("brands a key that generateKeyBetween just produced", () => {
    // Validating a key the generator just made would be theatre, so this is a cast and
    // not a check. The test exists to say that out loud rather than leave it implied.
    expect(typeof asOrder("a0v")).toBe("string");
    expect(asOrder("a0v")).toBe("a0v");
  });
});
