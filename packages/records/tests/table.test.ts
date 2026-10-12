/**
 * The table projection.
 *
 * A table is the projection most likely to be trusted with 10,000 rows, and the two
 * things that go wrong at that size are both here: a layout that materialises every
 * row when the renderer asked for a window, and a header that drifts out of line with
 * its cells. Both are checked against the geometry rather than against a screenshot,
 * because a projection has no renderer — that separation is what
 * `src/index.ts` says makes these unit-testable at all.
 */
import { describe, expect, it } from "vitest";

import { asFractionalIndex } from "@firo/schema";

import type { Collection } from "@firo/schema";

import {
  editableValueOf,
  tableProjection,
  titleColumnKeyFor,
} from "../src/index.js";

import { keys, record, selectColumn, tasks, textColumn } from "./fixtures.js";

import type { ProjectionElement } from "../src/types.js";

const collection = tasks();

const rows = () => [
  {
    ...record({ id: "rec-1", order: asFractionalIndex("a0") }),
    values: {
      title: { type: "text" as const, value: "Interview five teams" },
      status: { type: "singleSelect" as const, value: "opt-Todo" },
      estimate: { type: "number" as const, value: 8 },
    },
  },
  {
    ...record({ id: "rec-2", order: asFractionalIndex("a1") }),
    values: {
      title: { type: "text" as const, value: "Write the spec" },
      status: { type: "singleSelect" as const, value: "opt-Doing" },
      estimate: { type: "number" as const, value: 3 },
    },
  },
  {
    ...record({ id: "rec-3", order: asFractionalIndex("a2") }),
    values: {
      title: { type: "text" as const, value: "Ship it" },
      status: { type: "singleSelect" as const, value: "opt-Done" },
      estimate: { type: "number" as const, value: 13 },
    },
  },
];

const cells = (elements: readonly ProjectionElement[]) =>
  elements.filter((element) => element.type === "cell");

const headers = (elements: readonly ProjectionElement[]) =>
  elements.filter((element) => element.type === "header");

describe("a table lays out one row per record, one cell per column", () => {
  it("emits every header and every cell", () => {
    const records = rows();
    const elements = tableProjection.layout(collection, records);

    expect(headers(elements)).toHaveLength(collection.columns.length);
    expect(cells(elements)).toHaveLength(
      records.length * collection.columns.length,
    );
  });

  it("names each header after its column and gives it that column's key", () => {
    const laid = headers(tableProjection.layout(collection, rows()));

    expect(laid.map((header) => header.text)).toEqual([
      "Title",
      "Status",
      "Estimate",
    ]);
    expect(laid.map((header) => header.columnKey)).toEqual([
      "title",
      "status",
      "estimate",
    ]);
  });

  it("a cell knows its record and its column, which is what makes it addressable", () => {
    // `interpret` receives a `recordId` and a `columnKey` rather than a point, and
    // this is where they come from. A cell missing either is a cell nobody can edit.
    for (const cell of cells(tableProjection.layout(collection, rows()))) {
      expect(cell.recordId).toMatch(/^rec-\d$/);
      expect(cell.columnKey).toBeTruthy();
    }
  });

  it("renders each value through displayValue", () => {
    const laid = cells(tableProjection.layout(collection, rows()));
    const cellFor = (recordId: string, columnKey: string) =>
      laid.find(
        (cell) => cell.recordId === recordId && cell.columnKey === columnKey,
      )!.text;

    expect(cellFor("rec-1", "title")).toBe("Interview five teams");
    expect(cellFor("rec-2", "estimate")).toBe("3");
    // A select cell shows the option's id, because that is what the value stores. The
    // *name* is the renderer's job — a projection that resolved ids to names would be
    // doing layout's job, and would break the moment an option is renamed.
    expect(cellFor("rec-3", "status")).toBe("opt-Done");
  });

  it("orders rows by record.order, whatever order they arrive in", () => {
    const shuffled = rows().reverse();
    const laid = tableProjection.layout(collection, shuffled);
    const titleColumn = titleColumnKeyFor(collection);

    const sequence = cells(laid)
      .filter((cell) => cell.columnKey === titleColumn)
      .map((cell) => cell.text);

    expect(sequence).toEqual([
      "Interview five teams",
      "Write the spec",
      "Ship it",
    ]);
  });
});

describe("headers stay over their own cells", () => {
  it("the first header's left edge is the first cell's left edge", () => {
    // `cellX` deliberately excludes the running column's own width. Including it is a
    // one-character change that shifts every cell one column right of its header, and
    // nothing about the return value says so — only the geometry does.
    const laid = tableProjection.layout(collection, rows());
    const laid_headers = headers(laid);

    for (const [index, column] of collection.columns.entries()) {
      const header = laid_headers[index];
      const cell = cells(laid).find(
        (candidate) => candidate.columnKey === column.key,
      );

      expect(cell!.x, `cell "${column.key}" is not under its header`).toBe(
        header.x,
      );
    }
  });

  it("columns do not overlap, and the last one ends past the start of the table", () => {
    const laid_headers = headers(tableProjection.layout(collection, rows()));

    for (const [index, header] of laid_headers.entries()) {
      expect(header.width).toBeGreaterThan(0);

      const next = laid_headers[index + 1];
      if (next) {
        expect(
          header.x + header.width,
          `"${header.columnKey}" overlaps "${next.columnKey}"`,
        ).toBeLessThanOrEqual(next.x);
      }
    }
  });

  it("the title column is wider than the rest, because a row is read by its title", () => {
    const laid_headers = headers(tableProjection.layout(collection, rows()));
    const [first, ...rest] = laid_headers;

    expect(first.width).toBeGreaterThan(rest[0].width);
  });

  it("an origin moves the whole table, header and body together", () => {
    const plain = tableProjection.layout(collection, rows());
    const moved = tableProjection.layout(collection, rows(), {
      originX: 1000,
      originY: 500,
    });

    for (const [index, element] of plain.entries()) {
      expect(moved[index].x).toBe(element.x + 1000);
      expect(moved[index].y).toBe(element.y + 500);
    }
  });
});

describe("which column is the title", () => {
  it("is the first text column", () => {
    expect(titleColumnKeyFor(collection)).toBe("title");
  });

  it("is the first column at all when nothing is text", () => {
    // A table of numbers is a legitimate thing to have, and calling the first column
    // the title is what makes it readable rather than a grid of anonymous cells.
    const numbers: Collection = {
      ...collection,
      columns: [
        { id: "col-a", key: "a", name: "A", type: "number" },
        { id: "col-b", key: "b", name: "B", type: "number" },
      ],
    };

    expect(titleColumnKeyFor(numbers)).toBe("a");
  });

  it("does not throw on a collection with no columns", () => {
    expect(titleColumnKeyFor({ ...collection, columns: [] })).toBe("title");
  });

  it("is found even when a text column comes after a select", () => {
    const reordered: Collection = {
      ...collection,
      columns: [selectColumn("status", ["Todo"]), textColumn("owner", "Owner")],
    };

    expect(titleColumnKeyFor(reordered)).toBe("owner");
  });
});

describe("the window is how a table of 10,000 rows stays affordable", () => {
  const many = (count: number) =>
    keys(count).map((order, index) =>
      record({
        id: `rec-${index}`,
        order,
        values: { title: { type: "text", value: `Task ${index}` } },
      }),
    );

  it("lays out everything by default, because silent truncation loses rows", () => {
    const laid = tableProjection.layout(collection, many(50));
    // One cell per record *per column*, so the count is rows x columns.
    expect(cells(laid)).toHaveLength(50 * collection.columns.length);
  });

  it("lays out only the window it was asked for", () => {
    const laid = tableProjection.layout(collection, many(1000), {
      offset: 10,
      limit: 5,
    });

    expect(cells(laid)).toHaveLength(5 * collection.columns.length);
  });

  it("a window selects whole rows, never part of one", () => {
    // `limit` counts records. A window that cut mid-row would show half a record, which
    // is a rendering bug that looks like a data bug.
    const laid = tableProjection.layout(collection, many(100), {
      offset: 3,
      limit: 2,
    });
    const ids = new Set(cells(laid).map((cell) => cell.recordId));

    expect([...ids]).toEqual(["rec-3", "rec-4"]);
    expect(cells(laid)).toHaveLength(2 * collection.columns.length);
  });

  it("a windowed row is positioned as if the rows before it existed", () => {
    // A virtualised table that re-based row 0 to y = header height would scroll to the
    // wrong place. Row 10 of a window starting at 10 is at row 10's y, not row 0's.
    const all = many(20);
    const windowed = tableProjection.layout(collection, all, {
      offset: 10,
      limit: 1,
    });
    const full = tableProjection.layout(collection, all);

    const windowedCell = cells(windowed)[0];
    const fullCell = cells(full).find(
      (candidate) => candidate.recordId === windowedCell.recordId,
    )!;

    expect(windowedCell.y).toBe(fullCell.y);
    expect(windowedCell.y).toBeGreaterThan(cells(full)[0].y);
  });

  it("headers are laid out whether or not a window is given", () => {
    // A scrolled table still has its header row drawn, so a window that dropped it
    // would blank the top of the projection on the first scroll.
    expect(
      headers(
        tableProjection.layout(collection, many(10), { offset: 0, limit: 1 }),
      ),
    ).toHaveLength(collection.columns.length);
  });

  it("an offset past the end is empty rather than throwing", () => {
    expect(
      cells(tableProjection.layout(collection, many(5), { offset: 500 })),
    ).toHaveLength(0);
  });

  it("a negative offset is clamped rather than slicing from the end", () => {
    // `[5, 8].slice(-3, -1)` is a two-element tail of the array, which is a plausible
    // looking answer from a viewport that briefly reports a negative scroll position.
    const laid = tableProjection.layout(collection, many(5), {
      offset: -3,
      limit: 2,
    });

    expect([...new Set(cells(laid).map((cell) => cell.recordId))]).toEqual([
      "rec-0",
      "rec-1",
    ]);
  });

  it("lays out 10,000 rows without dropping any", () => {
    // AC-5's number, asserted as a count rather than as a frame time. The timing
    // budget is Phase 6.8's and needs a benchmark; what is checkable here is the
    // property that makes the budget reachable — the layout is complete and correct.
    const laid = tableProjection.layout(collection, many(10_000));

    expect(cells(laid)).toHaveLength(10_000 * collection.columns.length);
    expect(new Set(laid.map((element) => element.id)).size).toBe(laid.length);
  });
});

describe("editing from the table", () => {
  it("writes to the column the intent names", () => {
    expect(
      tableProjection.interpret(collection, rows(), {
        kind: "edit",
        recordId: "rec-2",
        columnKey: "title",
        value: "Write the spec, properly",
      }),
    ).toEqual({
      kind: "setField",
      recordId: "rec-2",
      columnKey: "title",
      value: { type: "text", value: "Write the spec, properly" },
    });
  });

  it("refuses a column that no longer exists", () => {
    expect(
      tableProjection.interpret(collection, rows(), {
        kind: "edit",
        recordId: "rec-2",
        columnKey: "dropped",
        value: "x",
      }),
    ).toBeNull();
  });

  it("refuses a bare move, because a drag in a table is a reorder", () => {
    // `x`/`y` are the projection's own coordinates and mean nothing without the row
    // geometry, so a bare move cannot place a row. The renderer hit-tests and sends
    // `reorder` instead, which does.
    expect(
      tableProjection.interpret(collection, rows(), {
        kind: "move",
        recordId: "rec-2",
        x: 100,
        y: 100,
      }),
    ).toBeNull();
  });

  it("hands an editor the stored value rather than the display string", () => {
    // A cell editor handed "Yes" for a boolean and saving it back would store the
    // string "Yes" into a boolean column. `displayValue` and `editableValueOf` answer
    // different questions and a renderer needs both.
    const [r] = rows();

    expect(editableValueOf(r, "estimate")).toEqual({
      type: "number",
      value: 8,
    });
    expect(editableValueOf(r, "status")).toEqual({
      type: "singleSelect",
      value: "opt-Todo",
    });
    expect(editableValueOf(r, "nothing")).toBeNull();
  });
});
