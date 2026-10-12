import type { Collection, FiroRecord } from "@firo/schema";

import { orderedRecords, reorderMutation } from "./ordering.js";
import {
  displayValue,
  type LayoutContext,
  type Projection,
  type ProjectionElement,
  type ProjectionIntent,
  type RecordMutation,
  valueOf,
} from "./types.js";

/**
 * The table projection.
 *
 * ## Geometry
 *
 * Fixed cell sizes rather than measured ones. A projection is a pure function of
 * `(collection, records)` — property 1 of the TRD's contract — and a projection that
 * measured its text would be a function of the font as well, which is how a "pure"
 * layout ends up depending on when it ran.
 *
 * ## Ordering is the record's `order`, read as one list
 *
 * The TRD's property 4 says order belongs to the projection, and warns that a record
 * ordered second in a table and second in a kanban is a coincidence. That is true and
 * it is also, for v1, a distinction without a difference in the table: there is one
 * list and it is `record.order`. The board projection is where the distinction bites,
 * and `board.ts` is where that compromise is recorded.
 */

/** Row height, in canvas units. */
const ROW_HEIGHT = 80;

/** Width of the first column, which is the record's title. */
const TITLE_WIDTH = 320;

/** Width of every other column. */
const COLUMN_WIDTH = 200;

/** Width of the row-header gutter. */
const HEADER_WIDTH = 48;

/** Height of the header row. */
const HEADER_HEIGHT = 64;

const DEFAULT_TITLE_COLUMN = "title";

/**
 * Which column is the row's title.
 *
 * The first `text` column, and failing that anything at all. A table with no title
 * column is a legitimate thing to have — every column might be a number — and calling
 * the first column the title is what makes a table readable rather than a grid of
 * equal-width anonymous cells.
 */
export const titleColumnKeyFor = (collection: Collection): string => {
  const text = collection.columns.find((column) => column.type === "text");
  return text?.key ?? collection.columns[0]?.key ?? DEFAULT_TITLE_COLUMN;
};

const columnWidth = (
  column: Collection["columns"][number] | undefined,
  titleKey: string,
): number => (column?.key === titleKey ? TITLE_WIDTH : COLUMN_WIDTH);

/**
 * A column's left edge.
 *
 * The running total deliberately excludes the column's own width: a header and its
 * cells are positioned by *this* function, so including it would shift every cell one
 * column to the right of its header.
 */
const cellX = (
  collection: Collection,
  columnIndex: number,
  titleKey: string,
): number =>
  HEADER_WIDTH +
  collection.columns
    .slice(0, columnIndex)
    .reduce((total, column) => total + columnWidth(column, titleKey), 0);

export const tableProjection: Projection = {
  id: "table",
  name: "Table",

  /*
   * `reorder` and `edit`, and nothing else.
   *
   * This list was `["reorder", "sort", "filter", "edit", "group"]`, and three of those
   * five had no implementation behind them. `supports` exists so a UI can hide what a
   * projection cannot offer — so advertising an unimplemented one does not merely
   * overstate the feature, it produces a dead Sort control on a table that cannot sort.
   *
   * Sort, filter and group are Phase 6.3 work and belong here when they exist. Add the
   * string in the same commit as the code, and the test in
   * `tests/projection.test.ts` ("only advertises features it can actually service")
   * holds the line.
   */
  supports: ["reorder", "edit"],

  layout: (
    collection: Collection,
    records: readonly FiroRecord[],
    context: LayoutContext = {},
  ): readonly ProjectionElement[] => {
    const originX = context.originX ?? 0;
    const originY = context.originY ?? 0;
    const titleKey = titleColumnKeyFor(collection);

    const header: ProjectionElement[] = collection.columns.map(
      (column, index) => ({
        id: `header:${column.key}`,
        recordId: "",
        type: "header" as const,
        x: originX + cellX(collection, index, titleKey),
        y: originY,
        width: columnWidth(column, titleKey),
        height: HEADER_HEIGHT,
        columnKey: column.key,
        text: column.name,
      }),
    );

    /*
     * The window.
     *
     * A table of 10,000 rows laid out in full is 10,000 rows of `ProjectionElement`,
     * most of them off screen, and AC-5 asks for 10,000 rows without dropping frames.
     * `offset`/`limit` are how the renderer asks for a window; the default window is
     * everything, because a projection that silently truncated would be a projection
     * that lost rows.
     */
    const all = orderedRecords(records);
    const start = Math.max(0, context.offset ?? 0);
    const end =
      context.limit === undefined ? all.length : start + context.limit;
    const visible = all.slice(start, end);

    const body: ProjectionElement[] = [];
    for (const [rowIndex, record] of visible.entries()) {
      /*
       * `rowIndex + start`, so a windowed row sits where it would in the full layout.
       *
       * `rowIndex` alone is the index *within the window*, which re-bases the first
       * visible row onto the header — and since a scroll changes `start` on every
       * frame, the whole table would jump up to meet the viewport as you scroll down
       * and back down as you scroll up. The grid projection gets this right for the
       * same reason; the two were written a day apart and only one of them was
       * right.
       */
      const y = originY + HEADER_HEIGHT + (rowIndex + start) * ROW_HEIGHT;

      for (const [columnIndex, column] of collection.columns.entries()) {
        body.push({
          id: `${record.id}:${column.key}`,
          recordId: record.id,
          type: "cell" as const,
          x: originX + cellX(collection, columnIndex, titleKey),
          y,
          width: columnWidth(column, titleKey),
          height: ROW_HEIGHT,
          columnKey: column.key,
          text: displayValue(record, column),
        });
      }
    }

    return [...header, ...body];
  },

  interpret: (
    _collection: Collection,
    records: readonly FiroRecord[],
    intent: ProjectionIntent,
  ): RecordMutation | null => {
    const record = records.find(
      (candidate) => candidate.id === intent.recordId,
    );
    if (!record) {
      /*
       * A record that has gone. The alternative is to throw, which in a pointer-up
       * handler means an unhandled rejection with no toast — the failure
       * `facilitatorActions`' `run` exists to prevent, in its purest form: the key
       * appears to have done nothing and the person presses it again, harder.
       */
      return null;
    }

    switch (intent.kind) {
      case "edit": {
        const column = _collection.columns.find(
          (candidate) => candidate.key === intent.columnKey,
        );
        if (!column) {
          // A column that no longer exists. Writing the value anyway would store it
          // under a key nothing reads, which is the "value survives in a place nothing
          // reads it" bug that `customData` already caused once in this codebase.
          return null;
        }
        const value =
          column.type === "singleSelect"
            ? { type: "singleSelect" as const, value: intent.value || null }
            : { type: "text" as const, value: intent.value };
        return {
          kind: "setField",
          recordId: record.id,
          columnKey: column.key,
          value,
        };
      }

      case "reorder": {
        return reorderMutation(records, record.id, intent.beforeId);
      }

      case "move":
        /*
         * A drag inside a table is a reorder, and the row it lands on is what says
         * where. `x`/`y` are the projection's own coordinates and mean nothing without
         * the row geometry, so a bare move is not enough to place a row -- which is
         * why the renderer hit-tests and sends `reorder` instead.
         */
        return null;

      default:
        return null;
    }
  },
};

/**
 * The value a cell currently holds, for a renderer that wants to edit rather than
 * display.
 *
 * Separate from `displayValue` because the two answer different questions and a cell
 * editor that was handed "Yes" for a boolean cannot save "Yes" back as a boolean.
 */
export const editableValueOf = (
  record: FiroRecord,
  columnKey: string,
): FiroRecord["values"][string] | null => valueOf(record, columnKey);
