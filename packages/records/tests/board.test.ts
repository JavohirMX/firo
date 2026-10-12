/**
 * The board projection, and AC-3 with it.
 *
 * [`docs/prd/04-acceptance-criteria.md`](../../../docs/prd/04-acceptance-criteria.md)
 * AC-3: drag a card from "Doing" to "Done", switch to table, the Status cell reads
 * "Done", with no reload and no manual sync step.
 *
 * Half of that is this file: the drag produces the right mutation, and produces
 * *nothing else*. The other half — a table that renders the same record, and an
 * application that applies the mutation — is not here, because no projection is wired
 * to anything yet. What is testable is that the two halves this file does cover cannot
 * be the thing that breaks: a drag cannot write to the record directly, and a card
 * cannot vanish because a column lost an option.
 */
import { describe, expect, it } from "vitest";

import type { Collection } from "@firo/schema";

import { boardProjection, groupAt, groupOf, groupsOf } from "../src/index.js";

import {
  record,
  selectColumn,
  snapshot,
  tasks,
  textColumn,
  withStatus,
} from "./fixtures.js";

const collection = tasks();

const rows = () => [
  withStatus("rec-1", "Interview five teams", "Todo", "a0"),
  withStatus("rec-2", "Write the spec", "Doing", "a1"),
  withStatus("rec-3", "Ship it", "Done", "a2"),
];

/**
 * A point inside the nth column, read from the layout rather than hard-coded.
 *
 * The layout is the only thing that knows where a column is, and a test that hard-codes
 * `x: 600` is a second copy of the geometry that would disagree the first time
 * `COLUMN_WIDTH` changed — in the test, rather than in the product, which is the worst
 * place for it to disagree.
 */
const centreOfColumn = (
  records: ReturnType<typeof rows>,
  columnIndex: number,
): { x: number; y: number } => {
  const element = boardProjection
    .layout(collection, records)
    .find(
      (candidate) =>
        candidate.type === "card" &&
        candidate.groupId === columnIdAt(columnIndex),
    );

  expect(element, `column ${columnIndex} has no card to aim at`).toBeDefined();

  return {
    x: element!.x + element!.width / 2,
    y: element!.y + element!.height / 2,
  };
};

const columnIdAt = (index: number): string =>
  groupsOf(collection, [])[index]?.id ?? `missing-${index}`;

describe("AC-3: a drag between columns is a request, and only a request", () => {
  it("dragging a card to another column asks for that column's key to change", () => {
    const records = rows();
    const { x, y } = centreOfColumn(
      records,
      groupsOf(collection, []).findIndex((group) => group.name === "Done")!,
    );

    const mutation = boardProjection.interpret(collection, records, {
      kind: "move",
      recordId: "rec-2",
      x,
      y,
    });

    expect(mutation).toEqual({
      kind: "setField",
      recordId: "rec-2",
      columnKey: "status",
      value: { type: "singleSelect", value: "opt-Done" },
    });
  });

  it("the record is not changed by asking", () => {
    // The whole criterion in one assertion. If `interpret` wrote to the record, the
    // table would have nothing left to re-read and "no reload and no manual sync step"
    // would be true for the wrong reason.
    const records = rows();
    const before = snapshot(records);

    const { x, y } = centreOfColumn(records, 2);
    boardProjection.interpret(collection, records, {
      kind: "move",
      recordId: "rec-2",
      x,
      y,
    });

    expect(records).toEqual(before);
  });

  it("the status a record would have after the drag is what a table would read", () => {
    // Stated as a two-step rather than as a projection swap, because that is the shape
    // AC-3 describes: the mutation is applied, and *then* the other view is asked. The
    // apply step is a `FiroDoc.commit` and belongs in an integration test; what is
    // checked here is that the value the board asks for is the value the table reads.
    const records = rows();
    const { x, y } = centreOfColumn(records, 2);

    const asked = boardProjection.interpret(collection, records, {
      kind: "move",
      recordId: "rec-2",
      x,
      y,
    });

    expect(asked?.kind).toBe("setField");

    // Narrowed rather than cast: a mutation of another kind here would mean the drag
    // asked for something other than a field write, and the test should say so.
    const mutation = asked as Extract<
      NonNullable<typeof asked>,
      { kind: "setField" }
    >;

    const applied = records.map((candidate) =>
      candidate.id === mutation.recordId
        ? {
            ...candidate,
            values: {
              ...candidate.values,
              [mutation.columnKey]: mutation.value,
            },
          }
        : candidate,
    );

    const status = applied.find((candidate) => candidate.id === "rec-2")!.values
      .status;

    expect(status).toEqual({ type: "singleSelect", value: "opt-Done" });
  });
});

describe("a drop that changes nothing is refused rather than written", () => {
  it("dropping a card in the column it is already in returns null", () => {
    // Returning the mutation anyway would be a durable write that changes nothing: an
    // undo step labelled "move" that moves nothing, and a collaborator's board
    // repainting for no reason.
    const records = rows();
    const { x, y } = centreOfColumn(records, 1); // "Doing", where rec-2 already is

    expect(
      boardProjection.interpret(collection, records, {
        kind: "move",
        recordId: "rec-2",
        x,
        y,
      }),
    ).toBeNull();
  });

  it("a drop above every column is refused rather than snapped to the nearest", () => {
    // Guessing would move a card somewhere the facilitator did not point, on the one
    // gesture that is supposed to be unambiguous.
    const records = rows();

    expect(
      boardProjection.interpret(collection, records, {
        kind: "move",
        recordId: "rec-2",
        x: 10,
        y: -50,
      }),
    ).toBeNull();
  });

  it("a drop past the last column is refused", () => {
    const records = rows();

    expect(
      boardProjection.interpret(collection, records, {
        kind: "move",
        recordId: "rec-2",
        x: 100_000,
        y: 100,
      }),
    ).toBeNull();
  });

  it("a collection with no single-select column refuses a move outright", () => {
    // There is no column to move it between. Inventing one would be a board that
    // regroups itself when somebody adds a column.
    const flat: Collection = {
      ...collection,
      columns: [textColumn("title"), textColumn("owner")],
    };
    const records = rows();

    expect(
      boardProjection.interpret(flat, records, {
        kind: "move",
        recordId: "rec-2",
        x: 10,
        y: 100,
      }),
    ).toBeNull();
  });
});

describe("grouping is derived, and a record cannot fall out of the board", () => {
  it("takes the first single-select column, in column order", () => {
    // Two single-selects have no correct answer between them, so the first one is a
    // decision rather than an accident.
    const twoSelects: Collection = {
      ...collection,
      columns: [
        textColumn("title"),
        selectColumn("status", ["Todo", "Done"]),
        selectColumn("team", ["Design", "Eng"]),
      ],
    };

    const records = [
      withStatus("rec-1", "Ship it", "Todo", "a0"),
      {
        ...withStatus("rec-2", "Design it", null, "a1"),
        values: {
          title: { type: "text" as const, value: "Design it" },
          status: { type: "singleSelect" as const, value: null },
          team: { type: "singleSelect" as const, value: "opt-Design" },
        },
      },
    ];

    // Grouped by `status`, so the record that *does* have a `team` value is still
    // ungrouped. Using the second column would have grouped it.
    const groups = groupsOf(twoSelects, records);
    expect(groups.map((group) => group.name)).toEqual([
      "Todo",
      "Done",
      "No status",
    ]);
    expect(groups[2].records.map((r) => r.id)).toEqual(["rec-2"]);
  });

  it("orders groups as the column declares them, with the ungrouped last", () => {
    // Dropping the ungrouped records would be data loss on screen; putting them first
    // would float an empty column above every real one.
    const groups = groupsOf(collection, rows());

    expect(groups.map((group) => group.name)).toEqual([
      "Todo",
      "Doing",
      "Done",
      "No status",
    ]);
  });

  it("a record whose option the column no longer declares is ungrouped, not vanished", () => {
    // The column lost the option; the record still has a value and still exists. This
    // is the case that makes a deleted option unable to delete a card.
    const orphan = withStatus("rec-4", "Orphaned task", "Deleted-option", "a3");

    const groups = groupsOf(collection, [...rows(), orphan]);
    const everyId = groups.flatMap((group) => group.records.map((r) => r.id));

    expect(everyId).toContain("rec-4");
    expect(
      groups
        .find((group) => group.name === "No status")!
        .records.map((r) => r.id),
    ).toEqual(["rec-4"]);
  });

  it("a collection with no single-select is one column, not an error", () => {
    const flat: Collection = { ...collection, columns: [textColumn("title")] };
    const records = rows();

    const groups = groupsOf(flat, records);

    expect(groups).toHaveLength(1);
    expect(groups[0].records).toHaveLength(3);
  });

  it("records within a column are ordered by record.order", () => {
    const outOfOrder = [
      withStatus("rec-2", "Second", "Todo", "a1"),
      withStatus("rec-1", "First", "Todo", "a0"),
    ];

    const todo = groupsOf(collection, outOfOrder)[0];

    expect(todo.records.map((r) => r.id)).toEqual(["rec-1", "rec-2"]);
  });

  it("groupOf agrees with the group a record is actually placed in", () => {
    // `groupOf` and `groupsOf` answer the same question two ways. If they disagreed,
    // a highlight would land on the wrong column.
    for (const candidate of rows()) {
      const placed = groupsOf(collection, [candidate])
        .flatMap((group) =>
          group.records.some((r) => r.id === candidate.id) ? [group.id] : [],
        )
        .at(0);

      expect(groupOf(collection, candidate)).toBe(placed ?? null);
    }
  });
});

describe("the layout and the hit-test read the same geometry", () => {
  it("groupAt names the column a laid-out card sits in", () => {
    // The claim `board.ts` makes about `groupAt` — that it reads the layout's own
    // numbers rather than a second copy of them — is only worth something if a test
    // would fail if it were false.
    const records = rows();
    const layout = boardProjection.layout(collection, records);

    for (const card of layout.filter((element) => element.type === "card")) {
      const centreX = card.x + card.width / 2;
      const centreY = card.y + card.height / 2;

      expect(
        groupAt(collection, centreX, centreY),
        `a card laid out in ${card.groupId} is not in that column at its own centre`,
      ).toBe(card.groupId);
    }
  });

  it("every declared option gets a column, whether or not it holds anything", () => {
    // An empty column still has to be droppable. A board where "Done" only appears once
    // something reaches it cannot be finished.
    const layout = boardProjection.layout(collection, [
      withStatus("rec-1", "Only a todo", "Todo", "a0"),
    ]);
    const headers = layout.filter((element) => element.type === "frame");

    expect(headers.map((header) => header.text)).toEqual([
      "Todo",
      "Doing",
      "Done",
      "No status",
    ]);
  });

  it("a card carries the title column's value, and falls back to its id", () => {
    const titled = boardProjection
      .layout(collection, rows())
      .filter((element) => element.type === "card");

    expect(titled.map((card) => card.text)).toEqual([
      "Interview five teams",
      "Write the spec",
      "Ship it",
    ]);

    const untitled = boardProjection.layout({ ...collection, columns: [] }, [
      record({ id: "rec-only" }),
    ]);

    expect(untitled.find((element) => element.type === "card")!.text).toBe(
      "rec-only",
    );
  });

  it("an element in the layout names the record it is a view of", () => {
    // The `recordId` is what turns a pointer gesture back into a change to a record.
    // A card without one is a picture of a task rather than a view of it.
    for (const card of boardProjection
      .layout(collection, rows())
      .filter((element) => element.type === "card")) {
      expect(card.recordId).not.toBe("");
    }

    // Headers are not views of a record, and must not claim to be.
    for (const header of boardProjection
      .layout(collection, rows())
      .filter((element) => element.type === "frame")) {
      expect(header.recordId).toBe("");
    }
  });

  it("laying out twice gives every element the same id", () => {
    // Ids are what a renderer diffs on. A layout that regenerated them would repaint
    // the whole board on every keystroke.
    const first = boardProjection.layout(collection, rows());
    const second = boardProjection.layout(collection, rows());

    expect(second.map((element) => element.id)).toEqual(
      first.map((element) => element.id),
    );
    expect(new Set(first.map((element) => element.id)).size).toBe(first.length);
  });
});

describe("editing from the board", () => {
  it("writes to the column the intent names, and refuses one that has gone", () => {
    const records = rows();

    expect(
      boardProjection.interpret(collection, records, {
        kind: "edit",
        recordId: "rec-1",
        columnKey: "title",
        value: "Interview six teams",
      }),
    ).toEqual({
      kind: "setField",
      recordId: "rec-1",
      columnKey: "title",
      value: { type: "text", value: "Interview six teams" },
    });

    // Storing under a key nothing reads is the "value survives in a place nothing
    // reads it" bug that `customData` already caused once in this codebase.
    expect(
      boardProjection.interpret(collection, records, {
        kind: "edit",
        recordId: "rec-1",
        columnKey: "no-such-column",
        value: "x",
      }),
    ).toBeNull();
  });
});
