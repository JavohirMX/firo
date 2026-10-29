/**
 * The projection contract, enforced.
 *
 * [`docs/trd/06-records-and-projections.md`](../../../docs/trd/06-records-and-projections.md)
 * lists four properties and says each "will be violated by accident if it is not
 * enforced". Three are testable against the code as it stands and are tested here.
 *
 * The fourth — `applyChange` being O(changed records) — has nothing to test, because no
 * projection has an `applyChange`. That is a real gap in the contract rather than a
 * gap in this file, and it is deliberately visible: a test that cannot fail is worse
 * than a missing test, because it reads as coverage. Adding `applyChange` means
 * deciding what a projection does with an element it no longer projects, which is a
 * schema question and not a test question.
 *
 * `order` is absent for a related and already-documented reason: both projections read
 * `record.order`, so reordering a column also moves the table row. See the header of
 * `src/ordering.ts` and `src/board.ts`, which both record it as a deliberate v1
 * compromise rather than an oversight.
 */
import { describe, expect, it } from "vitest";

import { COLUMN_TYPES } from "@firo/schema";

import type { Collection, FiroRecord } from "@firo/schema";

import {
  boardProjection,
  displayValue,
  gridProjection,
  PROJECTIONS,
  projectionFor,
  tableProjection,
  timelineProjection,
} from "../src/index.js";

import { record, snapshot, tasks, textColumn, withStatus } from "./fixtures.js";

import type { Projection } from "../src/types.js";

const all = [
  tableProjection,
  boardProjection,
  gridProjection,
  timelineProjection,
];

const sample = (): readonly FiroRecord[] => [
  withStatus("rec-1", "Interview five teams", "Todo", "a0"),
  withStatus("rec-2", "Write the spec", "Doing", "a1"),
  withStatus("rec-3", "Ship it", "Done", "a2"),
];

describe("property 1: layout is pure", () => {
  it("returns the same result for the same inputs", () => {
    for (const projection of all) {
      const collection = tasks();
      const records = sample();

      const first = projection.layout(collection, records);
      const second = projection.layout(collection, records);

      expect(
        second,
        `${projection.id} is not a function of its inputs`,
      ).toEqual(first);
    }
  });

  it("does not mutate the collection it was given", () => {
    for (const projection of all) {
      const collection = tasks();
      const before = snapshot(collection);

      projection.layout(collection, sample());

      expect(collection, `${projection.id} mutated the collection`).toEqual(
        before,
      );
    }
  });

  it("does not mutate the records it was given", () => {
    // The failure this catches is a sort in place. `orderedRecords` copies before
    // sorting precisely so that a caller's array is not reordered underneath it, and
    // nothing about that is visible from the return value alone — a projection that
    // sorted in place would produce a correct layout and a reordered caller's array.
    for (const projection of all) {
      const records = sample();
      const before = snapshot(records);

      projection.layout(tasks(), records);

      expect(records, `${projection.id} mutated the records`).toEqual(before);
    }
  });

  it("returns a fresh array rather than a shared one", () => {
    // A cached array handed to two callers is a mutation that happens to nobody until
    // somebody sorts it in place, which is the bug above arriving late.
    for (const projection of all) {
      const first = projection.layout(tasks(), sample());
      const second = projection.layout(tasks(), sample());

      expect(second).not.toBe(first);
    }
  });
});

describe("property 3: interpret asks, it does not write", () => {
  it("mutates neither the collection nor the records, for any intent", () => {
    const intents = [
      { kind: "move", recordId: "rec-1", x: 600, y: 100 },
      { kind: "edit", recordId: "rec-1", columnKey: "title", value: "Renamed" },
      { kind: "reorder", recordId: "rec-1", beforeId: "rec-2" },
      { kind: "reorder", recordId: "rec-1", beforeId: null },
    ] as const;

    for (const projection of all) {
      for (const intent of intents) {
        const collection = tasks();
        const records = sample();
        const collectionBefore = snapshot(collection);
        const recordsBefore = snapshot(records);

        projection.interpret(collection, records, intent);

        expect(
          collection,
          `${projection.id} mutated the collection on ${intent.kind}`,
        ).toEqual(collectionBefore);
        expect(
          records,
          `${projection.id} mutated the records on ${intent.kind}`,
        ).toEqual(recordsBefore);
      }
    }
  });

  it("returns a mutation that carries the record id it is about", () => {
    // A mutation naming a record the projection was not asked about is the one shape
    // of wrong answer that would write to somebody else's row.
    for (const projection of all) {
      const mutation = projection.interpret(tasks(), sample(), {
        kind: "edit",
        recordId: "rec-2",
        columnKey: "title",
        value: "Renamed",
      });

      expect(
        mutation,
        `${projection.id} refused a plain cell edit`,
      ).not.toBeNull();
      expect(mutation!.recordId).toBe("rec-2");
    }
  });

  it("returns null for a record that has gone, and does not throw", () => {
    // A pointer-up handler that throws produces an unhandled rejection with no toast:
    // the key appears to have done nothing and the person presses it again, harder.
    // A collaborator can delete a row between the hit-test and the drop, so this is an
    // ordinary race rather than a malformed input.
    for (const projection of all) {
      for (const intent of [
        { kind: "move", recordId: "gone", x: 0, y: 0 },
        { kind: "edit", recordId: "gone", columnKey: "title", value: "x" },
        { kind: "reorder", recordId: "gone", beforeId: null },
      ] as const) {
        expect(
          projection.interpret(tasks(), sample(), intent),
          `${projection.id} did not refuse ${intent.kind} on a gone record`,
        ).toBeNull();
      }
    }
  });
});

describe("every registered projection honours the contract", () => {
  it("PROJECTIONS contains the four the package documents", () => {
    expect(Object.keys(PROJECTIONS).sort()).toEqual([
      "board",
      "grid",
      "table",
      "timeline",
    ]);
  });

  it("each projection's id is the key it is registered under", () => {
    // Otherwise `projectionFor("board")` returns something that lays out as a table,
    // which is the kind of bug that only shows up on a facilitator's screen.
    for (const [key, projection] of Object.entries(PROJECTIONS)) {
      expect(projection.id).toBe(key);
    }
  });

  it("each projection has an id, a name and at least one supported feature", () => {
    for (const projection of all) {
      expect(projection.id).toBeTruthy();
      expect(projection.name).toBeTruthy();
      expect(projection.supports.length).toBeGreaterThan(0);
    }
  });

  it("an unknown id falls back to the table rather than to nothing", () => {
    // A stored projection id from a newer version of Firo must not leave the board
    // with nothing to draw.
    expect(projectionFor("unknown-view").id).toBe("table");
    expect(projectionFor("").id).toBe("table");
  });

  it("a projection only advertises features it can actually service", () => {
    // `supports` is what a UI reads to decide whether to show a control, so an
    // advertised feature that `interpret` refuses is a button that does nothing. Two of
    // these lists used to claim `sort`, `filter` and `group` with nothing behind them.
    for (const projection of all) {
      const records = sample();
      const collection = tasks();

      if (projection.supports.includes("edit")) {
        expect(
          projection.interpret(collection, records, {
            kind: "edit",
            recordId: "rec-1",
            columnKey: "title",
            value: "x",
          }),
          `${projection.id} advertises edit but refuses one`,
        ).not.toBeNull();
      }

      if (projection.supports.includes("reorder")) {
        expect(
          projection.interpret(collection, records, {
            kind: "reorder",
            recordId: "rec-1",
            beforeId: "rec-3",
          }),
          `${projection.id} advertises reorder but refuses one`,
        ).not.toBeNull();
      }

      if (projection.supports.includes("group")) {
        expect(
          typeof projection.group,
          `${projection.id} advertises group but has no grouping`,
        ).toBe("function");
      }

      /*
       * `freePlacement` is the one feature a projection can only have by storing a
       * position, so it is checked against the one projection that must not claim it.
       * Every other unimplemented feature — sort, filter — is caught by the two
       * assertions above failing to be listed at all, which is a decision a test cannot
       * make on its own; what this pins is that `freePlacement` stays off the grid.
       */
      if (projection.id === "grid") {
        expect(projection.supports).not.toContain("freePlacement");
      }
    }
  });

  it("no projection advertises sort or filter, because none implements them", () => {
    // Phase 6.3 work. When sort or filter lands, this test is the thing that has to be
    // deleted in the same commit — which is the point: it makes claiming a feature a
    // deliberate act rather than a list edit.
    for (const projection of all) {
      expect(projection.supports, `${projection.id} claims sort`).not.toContain(
        "sort",
      );
      expect(
        projection.supports,
        `${projection.id} claims filter`,
      ).not.toContain("filter");
    }
  });

  it("group, where a projection offers it, returns every record exactly once", () => {
    // The one invariant a grouped projection can get wrong that is not obvious: a
    // record in two columns, or in none, is either duplicated on the board or lost
    // from it.
    const grouped = all.filter(
      (
        projection,
      ): projection is Projection & {
        group: NonNullable<Projection["group"]>;
      } => typeof projection.group === "function",
    );

    expect(grouped.length).toBeGreaterThan(0);

    for (const projection of grouped) {
      const groups = projection.group(tasks(), sample());
      const ids = groups.flatMap((group) => group.records.map((r) => r.id));

      expect(
        ids.slice().sort(),
        `${projection.id} lost or duplicated a record`,
      ).toEqual(["rec-1", "rec-2", "rec-3"]);
    }
  });
});

describe("displayValue renders every column type the schema declares", () => {
  it("a value of each COLUMN_TYPES member reaches its own case", () => {
    // The enforcement for `displayValue` is here rather than in the type system,
    // because the switch has a `default` — a `default` is what lets a new column type
    // compile and render as an empty cell, which is invisible until somebody opens a
    // board with that column. Asserting on `COLUMN_TYPES` makes the gap a red test.
    const column = (key: string, type: Collection["columns"][number]["type"]) =>
      ({
        id: `col-${key}`,
        key,
        name: key,
        type,
      } as Collection["columns"][number]);

    const values: Record<string, FiroRecord["values"][string]> = {
      text: { type: "text", value: "Ship it" },
      number: { type: "number", value: 8 },
      boolean: { type: "boolean", value: true },
      singleSelect: { type: "singleSelect", value: "opt-Doing" },
      multiSelect: { type: "multiSelect", value: ["opt-a", "opt-b"] },
      date: { type: "date", value: "2026-10-04" },
      person: { type: "person", value: "ada" },
      link: { type: "link", value: "https://example.com" },
      richText: {
        type: "richText",
        value: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Interview" }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "five teams" }],
            },
          ],
        },
      },
    };

    for (const type of COLUMN_TYPES) {
      expect(
        values[type],
        `no fixture for column type "${type}"`,
      ).toBeDefined();

      const rendered = displayValue(
        record({ values: { [type]: values[type] } }),
        column(type, type),
      );

      expect(
        rendered,
        `column type "${type}" rendered as an empty cell`,
      ).not.toBe("");
    }
  });

  it("renders a rich-text cell as its plain text, not as JSON", () => {
    // ADR-0004: rich text is a ProseMirror document, so a cell holding one has to
    // extract rather than read. The observable symptom of getting this wrong is a cell
    // containing the string `{"type":"doc",...}`.
    const rendered = displayValue(
      record({
        values: {
          notes: {
            type: "richText",
            value: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "bold", marks: [{ type: "bold" }] },
                  ],
                },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "and plain" }],
                },
              ],
            },
          },
        },
      }),
      textColumn("notes"),
    );

    expect(rendered).toBe("bold\nand plain");
  });

  it("renders an unset optional value as an empty cell, not the epoch", () => {
    // A `date` of `null` is "no date set". Rendering it as something is worse than
    // rendering nothing: it looks like data.
    for (const type of ["date", "singleSelect", "person", "link"] as const) {
      const rendered = displayValue(
        record({ values: { [type]: { type, value: null } } }),
        {
          id: `col-${type}`,
          key: type,
          name: type,
          type,
        } as Collection["columns"][number],
      );

      expect(rendered, `"${type}" with no value rendered as something`).toBe(
        "",
      );
    }
  });

  it("renders a record with no value for the column at all as an empty cell", () => {
    expect(displayValue(record(), textColumn("title"))).toBe("");
  });

  it("reads a value by Column.key and not by Column.id", () => {
    // The same reason `packages/schema/tests/records.test.ts` pins it: a column that is
    // deleted and re-created gets a new id, and a lookup by id would show an empty cell
    // for a row that plainly has a value.
    const column: Collection["columns"][number] = {
      id: "col-fresh",
      key: "title",
      name: "Task name",
      type: "text",
    };

    expect(
      displayValue(
        record({ values: { title: { type: "text", value: "Ship it" } } }),
        column,
      ),
    ).toBe("Ship it");
  });
});
