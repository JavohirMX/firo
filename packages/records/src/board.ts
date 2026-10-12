import type { Collection, FiroRecord } from "@firo/schema";

import { groupingColumnFor } from "./types.js";
import { displayValue, valueOf } from "./types.js";
import { reorderMutation } from "./ordering.js";
import { titleColumnKeyFor } from "./table.js";

import type {
  LayoutContext,
  Projection,
  ProjectionElement,
  ProjectionIntent,
  RecordGroup,
  RecordMutation,
} from "./types.js";

/**
 * The board / kanban projection.
 *
 * This is the projection that carries AC-3, and the TRD says so: "If only one
 * projection ships, ship this one."
 *
 * ## What makes AC-3 work
 *
 * Not the layout. A drag produces a `RecordMutation` and nothing else — property 3 of
 * the TRD's contract, and the reason the criterion says "the Status cell reads Done,
 * with no reload and no manual sync step". There is no reload because nothing was
 * re-read: the table cell for that record renders from the same record, and the record
 * changed. A projection that wrote to the record directly would make the two views two
 * writers and would need a sync step between them.
 *
 * ## Grouping is derived, not configured
 *
 * `groupingColumnFor` takes the first `singleSelect` column in column order. A board
 * with two single-selects has no correct answer, and the alternative — making the
 * facilitator choose — is a setting that does not exist yet. The first one is a
 * decision rather than an accident, and it is recorded here so that changing it later
 * is a visible change.
 *
 * ## Ordering within a column, and the compromise
 *
 * The TRD's property 4 warns that a record ordered second in a table and second in a
 * kanban is a coincidence, and that order belongs to the projection.
 *
 * For v1 both read `record.order`, so **reordering inside a kanban column also moves the
 * row in the table.** That is a real compromise, taken deliberately: per-projection
 * order would need a second order key per record per projection in the schema, and
 * `FiroRecord.order` is documented as "the default; a projection may override it". The
 * override hook is where that lands when the schema grows, and until then a facilitator
 * who reorders a column and then opens the table sees the same order — which is
 * confusing rather than wrong, and one schema field away from being right.
 */

/** Width of a kanban column. */
const COLUMN_WIDTH = 280;

/** Height of a column's header. */
const HEADER_HEIGHT = 72;

/** Height of one card. */
const CARD_HEIGHT = 120;

/** Gap between cards in a column. */
const CARD_GAP = 16;

/** Gap between columns. */
const COLUMN_GAP = 24;

/** How far right a card sits inside its column. */
const CARD_INSET = CARD_GAP / 2;

const UNGROUPED = { id: null, name: "No status" };

/**
 * The groups, in the order the column declares them.
 *
 * The ungrouped group is last and always present. Records with no value for the
 * grouping column have to go *somewhere* — dropping them would be data loss on screen,
 * and putting them first would put an empty column above every real one.
 */
export const groupsOf = (
  collection: Collection,
  records: readonly FiroRecord[],
): readonly RecordGroup[] => {
  const column = groupingColumnFor(collection);

  if (!column) {
    /*
     * No single-select to group by. One group containing everything, which is a column
     * of cards rather than a board — honest, and better than refusing to lay out a
     * collection that exists.
     */
    return [
      {
        ...UNGROUPED,
        records: [...records].sort((a, b) =>
          a.order < b.order ? -1 : a.order > b.order ? 1 : 0,
        ),
      },
    ];
  }

  const options = column.options ?? [];
  const byGroup = new Map<string | null, FiroRecord[]>();
  for (const option of options) {
    byGroup.set(option.id, []);
  }
  byGroup.set(null, []);

  for (const record of records) {
    const value = valueOf(record, column.key);
    const key =
      value !== null && value.type === "singleSelect" && value.value !== null
        ? value.value
        : null;

    /*
     * A value naming an option the column no longer declares goes to ungrouped rather
     * than vanishing. The record still exists and still has a value; the column lost
     * the option, and that is not the record's fault. It also means a deleted option
     * cannot make a card vanish from the board, which is the kind of silent data loss
     * this whole layer exists to prevent.
     */
    const bucket = byGroup.has(key) ? key : null;
    byGroup.get(bucket)!.push(record);
  }

  const byOrder = (a: FiroRecord, b: FiroRecord) =>
    a.order < b.order ? -1 : a.order > b.order ? 1 : 0;

  return [
    ...options.map((option) => ({
      id: option.id,
      name: option.name,
      records: byGroup.get(option.id)!.sort(byOrder),
    })),
    { ...UNGROUPED, records: byGroup.get(null)! },
  ];
};

/** Which group a record is in, as this projection sees it. */
export const groupOf = (
  collection: Collection,
  record: FiroRecord,
): string | null => {
  const column = groupingColumnFor(collection);
  if (!column) {
    return null;
  }
  const value = valueOf(record, column.key);
  return value !== null && value.type === "singleSelect" ? value.value : null;
};

/**
 * The group at a point, or `undefined` when the point is outside every column.
 *
 * The layout's own geometry, read from the same constants `layout` uses. A second copy
 * of these numbers is a second answer to "which column is that", and they would
 * disagree the first time a constant changed.
 */
export const groupAt = (
  collection: Collection,
  x: number,
  y: number,
): string | null | undefined => {
  if (y < 0) {
    return undefined;
  }

  const columnIndex = Math.floor(Math.max(0, x) / (COLUMN_WIDTH + COLUMN_GAP));
  const group = groupsOf(collection, [])[columnIndex];

  return group ? group.id : undefined;
};

export const boardProjection: Projection = {
  id: "board",
  name: "Board",
  /*
   * `filter` was advertised and not implemented — see the note on `tableProjection`.
   * `group` is here because `groupsOf` is real and wired below.
   */
  supports: ["reorder", "group", "edit"],

  group: groupsOf,

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

    const elements: ProjectionElement[] = [];

    groupsOf(collection, records).forEach((group, columnIndex) => {
      const x = originX + columnIndex * (COLUMN_WIDTH + COLUMN_GAP);

      elements.push({
        id: `group:${group.id ?? "none"}`,
        recordId: "",
        type: "frame" as const,
        x,
        y: originY,
        width: COLUMN_WIDTH,
        height: HEADER_HEIGHT,
        groupId: group.id ?? undefined,
        text: group.name,
      });

      group.records.forEach((record, rowIndex) => {
        elements.push({
          id: `card:${record.id}`,
          recordId: record.id,
          type: "card" as const,
          x: x + CARD_INSET,
          y: originY + HEADER_HEIGHT + rowIndex * (CARD_HEIGHT + CARD_GAP),
          width: COLUMN_WIDTH - CARD_GAP,
          height: CARD_HEIGHT,
          groupId: group.id ?? undefined,
          text: titleColumn ? displayValue(record, titleColumn) : record.id,
        });
      });
    });

    return elements;
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
      // A record that has gone between the hit-test and the drop. See `reorderMutation`
      // for why this returns null rather than throwing.
      return null;
    }

    const column = groupingColumnFor(collection);

    switch (intent.kind) {
      case "move": {
        /*
         * The whole point of the projection, and the reason AC-3 is satisfiable.
         *
         * A drop at (x, y) is meaningless without the column geometry, so `groupAt`
         * reads the layout's own numbers. A drop outside every column is refused rather
         * than snapped to the nearest: guessing would move a card somewhere the
         * facilitator did not point, on the one gesture that is supposed to be
         * unambiguous.
         */
        if (!column) {
          return null;
        }

        const target = groupAt(collection, intent.x, intent.y);
        if (target === undefined) {
          return null;
        }

        const current = valueOf(record, column.key);

        if (current?.type === "singleSelect" && current.value === target) {
          /*
           * Dropping a card where it already is.
           *
           * Returning the mutation anyway would be a durable write that changes
           * nothing — an undo step labelled "move" that moves nothing, and a
           * collaborator's board that repaints for no reason.
           */
          return null;
        }

        return {
          kind: "setField",
          recordId: record.id,
          columnKey: column.key,
          value: { type: "singleSelect", value: target },
        };
      }

      case "edit": {
        const target = collection.columns.find(
          (candidate) => candidate.key === intent.columnKey,
        );
        if (!target) {
          // A column that no longer exists. Writing the value anyway would store it
          // under a key nothing reads.
          return null;
        }
        return {
          kind: "setField",
          recordId: record.id,
          columnKey: target.key,
          value: { type: "text", value: intent.value },
        };
      }

      case "reorder":
        return reorderMutation(records, record.id, intent.beforeId);

      default:
        return null;
    }
  },
};
