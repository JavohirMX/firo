import type { Collection, FiroRecord } from "@firo/schema";

import { displayValue } from "./types.js";
import { orderedRecords } from "./ordering.js";
import { titleColumnKeyFor } from "./table.js";

import type {
  LayoutContext,
  Projection,
  ProjectionElement,
  ProjectionIntent,
  RecordMutation,
} from "./types.js";

/**
 * The grid projection: one card per record, arranged in reading order.
 *
 * ## Where a card's position comes from, and why that is a real limitation
 *
 * The TRD calls this "free-arranged". A freely-arranged card needs a position stored
 * per record per projection, and `FiroRecord` has no field for one — `order` is an
 * ordering, not a coordinate.
 *
 * So v1 derives the position from `order`: record *n* lands in row *n/COLS*, column
 * *n%COLS*. That satisfies AC-3 — "repeat with the grid projection" — because the
 * criterion is about the record having one identity in every view, not about dragging
 * cards around. What it does **not** do is let a facilitator place a card, and that is
 * the gap between this and the TRD's description.
 *
 * The alternative was adding `{gridX, gridY}` to `FiroRecord`, which is schema work
 * with a migration, a version bump and a compatibility question for a file format that
 * shipped three days ago. Worth doing; not worth doing as a side effect of a projection
 * engine. It is recorded here because the next person will read "grid projection" and
 * assume dragging works.
 */

/** Card size. */
const CARD_WIDTH = 260;
const CARD_HEIGHT = 160;

/** Gap between cards. */
const GAP = 24;

/** Cards per row. */
const COLUMNS = 4;

export const gridProjection: Projection = {
  id: "grid",
  name: "Grid",
  /*
   * `edit` only.
   *
   * `filter` was advertised and not implemented (see the note on `tableProjection`), and
   * `freePlacement` would be a lie for a projection whose positions are derived rather
   * than stored — the note at the top of this file is the reason. A control that appears
   * and then refuses is worse than a control that is absent.
   */
  supports: ["edit"],

  layout: (
    collection: Collection,
    records: readonly FiroRecord[],
    context: LayoutContext = {},
  ): readonly ProjectionElement[] => {
    const originX = context.originX ?? 0;
    const originY = context.originY ?? 0;
    const titleKey = titleColumnKeyFor(collection);
    const titleColumn = collection.columns.find(
      (column) => column.key === titleKey,
    );

    /*
     * `orderedRecords`, not the caller's array.
     *
     * The position is derived from a record's index rather than stored, so the one
     * thing that can be wrong is *which* index a record gets. Reading the array as it
     * arrived meant the grid ordered by whatever order the caller happened to hand it —
     * so reordering a row in the table, which writes `record.order`, left the grid
     * showing the old arrangement. A facilitator switching views saw the board
     * rearrange itself, which reads as data loss.
     */
    const ordered = orderedRecords(records);

    const start = Math.max(0, context.offset ?? 0);
    const end =
      context.limit === undefined ? ordered.length : start + context.limit;

    return ordered.slice(start, end).map((record, index) => ({
      id: `grid:${record.id}`,
      recordId: record.id,
      type: "card" as const,
      // `index + start`, so a windowed layout puts the first visible card where it
      // would be in the full layout rather than at the origin.
      x: originX + ((index + start) % COLUMNS) * (CARD_WIDTH + GAP),
      y: originY + Math.floor((index + start) / COLUMNS) * (CARD_HEIGHT + GAP),
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      text: titleColumn ? displayValue(record, titleColumn) : record.id,
    }));
  },

  interpret: (
    collection: Collection,
    records: readonly FiroRecord[],
    intent: ProjectionIntent,
  ): RecordMutation | null => {
    const record = records.find(
      (candidate) => candidate.id === intent.recordId,
    );
    if (!record) {
      return null;
    }

    switch (intent.kind) {
      case "edit": {
        const column = collection.columns.find(
          (candidate) => candidate.key === intent.columnKey,
        );
        if (!column) {
          return null;
        }
        return {
          kind: "setField",
          recordId: record.id,
          columnKey: column.key,
          value: { type: "text", value: intent.value },
        };
      }

      case "move":
        /*
         * Refused, and *visibly* so rather than by doing nothing.
         *
         * The position is derived (see the note at the top of this file), so there is
         * nothing to write and a `setPosition` mutation would be a no-op the record
         * store has to honour. Returning null is the honest answer; a projection that
         * accepted the drag and ignored it would be a card that follows the pointer and
         * springs back, which reads as a bug in the app rather than as an unfinished
         * feature.
         */
        return null;

      default:
        return null;
    }
  },
};

/** The position this projection would give a record, for a hit-test. */
export const positionOf = (
  index: number,
  context: LayoutContext = {},
): { x: number; y: number } => {
  const originX = context.originX ?? 0;
  const originY = context.originY ?? 0;
  return {
    x: originX + (index % COLUMNS) * (CARD_WIDTH + GAP),
    y: originY + Math.floor(index / COLUMNS) * (CARD_HEIGHT + GAP),
  };
};
