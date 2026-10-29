import { proseMirrorToPlainText } from "@firo/schema";

import type { Collection, FiroRecord, SelectOption } from "@firo/schema";

/**
 * The projection contract.
 *
 * Copied from [`docs/trd/06-records-and-projections.md`](../../../docs/trd/06-records-and-projections.md)
 * rather than paraphrased, because the four properties below are the whole design and
 * a paraphrase is where they would drift.
 */

/** One thing a projection can do, so a UI can hide what it cannot offer. */
export type ProjectionFeature =
  | "reorder"
  | "group"
  | "sort"
  | "filter"
  | "edit"
  | "freePlacement";

/**
 * A projected thing on the canvas.
 *
 * **Not an element.** A `ProjectionElement` is a *description* of something to draw,
 * and it carries the `recordId` it came from so an interaction on it can be turned
 * back into a change to that record. Nothing here is persisted, and nothing here is an
 * element type — that is rule 4 in `AGENTS.md`, and the reason a projection can be
 * swapped without the board noticing.
 */
export type ProjectionElement = Readonly<{
  /** Unique within one projection's layout. Not a document id. */
  id: string;
  /** The record this is a view of. */
  recordId: string;
  /*
   * `edge` is a connector between two node elements (ADR-0040 section 4): its
   * `recordId` is the CHILD record whose relation produced it, so a click on
   * the line still resolves to one record. `fromId`/`toId` name node element
   * ids within the same layout, and `x`/`y`/`width`/`height` are the
   * connector's bounding box, not a line equation - the renderer owns the
   * curve.
   */
  type: "cell" | "card" | "header" | "frame" | "edge";
  x: number;
  y: number;
  width: number;
  height: number;
  /** The column this element renders, where that means anything. */
  columnKey?: string;
  /** The group this element is in, for a board projection. */
  groupId?: string;
  /** What to draw. Read by the renderer, never by the projection. */
  text?: string;
  /** Edge endpoints: node element ids within this layout. Edges only. */
  fromId?: string;
  toId?: string;
}>;

/** What a projection needs to know about the world to lay itself out. */
export type LayoutContext = Readonly<{
  /** Where the layout starts on the canvas. */
  originX?: number;
  originY?: number;
  /** Rows or columns to skip, for a virtualised table. */
  offset?: number;
  limit?: number;
}>;

/**
 * Something a person did to a projected element.
 *
 * Deliberately expressed in terms the *product* understands rather than in terms of
 * pointer coordinates, because the projection is what knows what a drop at (x, y)
 * means. A hit-test in the renderer produces one of these; only the projection may
 * turn it into a change.
 */
export type ProjectionIntent =
  | Readonly<{
      kind: "move";
      recordId: string;
      /** Where it was dropped, in the projection's own coordinates. */
      x: number;
      y: number;
    }>
  | Readonly<{
      kind: "edit";
      recordId: string;
      columnKey: string;
      value: string;
    }>
  | Readonly<{ kind: "reorder"; recordId: string; beforeId: string | null }>
  | Readonly<{
      /*
       * Re-parent a record in a relation hierarchy (ADR-0040 section 4).
       * `newParentId: null` roots it. The projection validates the drop -
       * not-self, in-collection, not-a-descendant - and returns null for a
       * drop it rejects; it never breaks a cycle by rewriting other records.
       */
      kind: "reparent";
      recordId: string;
      newParentId: string | null;
    }>;

/**
 * A requested change to a record.
 *
 * **A request, not an application.** `interpret` returns one of these and the record
 * store applies it. The projection never writes to a record directly, and that is
 * property 3 of the TRD's contract and the reason AC-3 is satisfiable at all: a drag
 * in one view and a cell in another are two readers of one value, not two writers.
 */
export type RecordMutation =
  | Readonly<{
      kind: "setField";
      recordId: string;
      columnKey: string;
      value: FiroRecord["values"][string];
    }>
  | Readonly<{
      kind: "setOrder";
      recordId: string;
      order: FiroRecord["order"];
    }>
  | Readonly<{
      kind: "setPosition";
      recordId: string;
      x: number;
      y: number;
    }>;

/** One group of a board projection: a select option, or the ungrouped remainder. */
export type RecordGroup = Readonly<{
  /** The `SelectOption.id`, or `null` for records with no value. */
  id: string | null;
  name: string;
  records: readonly FiroRecord[];
}>;

/** What a projection is, and what it can be asked to do. */
export type Projection = Readonly<{
  id: string;
  name: string;
  supports: readonly ProjectionFeature[];

  /** Pure. See property 1 of the TRD's contract. */
  layout: (
    collection: Collection,
    records: readonly FiroRecord[],
    context?: LayoutContext,
  ) => readonly ProjectionElement[];

  /** See property 3. Never writes; asks. */
  interpret: (
    collection: Collection,
    records: readonly FiroRecord[],
    intent: ProjectionIntent,
  ) => RecordMutation | null;

  /** The records as this projection wants them: filtered, grouped, ordered. */
  group?: (
    collection: Collection,
    records: readonly FiroRecord[],
  ) => readonly RecordGroup[];
}>;

/**
 * The single-select column a board projection groups by.
 *
 * Found rather than configured, because AC-3 says "drag the card from Todo to Done"
 * without naming a column and a board with two single-selects has no correct answer.
 * So: the first one, in column order, and the reason is stated rather than left as
 * whatever the loop happened to do.
 */
export const groupingColumnFor = (
  collection: Collection,
): Collection["columns"][number] | null => {
  const single = collection.columns.filter(
    (column) => column.type === "singleSelect",
  );

  if (single.length === 0) {
    return null;
  }

  return single[0];
};

/** The options of a single-select column, in the order the column declares them. */
export const optionsOf = (
  column: Collection["columns"][number] | null,
): readonly SelectOption[] => column?.options ?? [];

const DEFAULT_TITLE_COLUMN = "title";

/**
 * Which column is the row's title.
 *
 * The first `text` column, and failing that anything at all. A table with no title
 * column is a legitimate thing to have -- every column might be a number -- and
 * calling the first column the title is what makes a table readable rather than a
 * grid of equal-width anonymous cells.
 *
 * Lives here, not in `table.ts`, because a relation's display text is the
 * target's title and `displayValue` is here; `table.ts` re-exports it.
 */
export const titleColumnKeyFor = (collection: Collection): string => {
  const text = collection.columns.find((column) => column.type === "text");
  return text?.key ?? collection.columns[0]?.key ?? DEFAULT_TITLE_COLUMN;
};

/**
 * A record's value for one column, or `null` when it has none.
 *
 * Read by `column.key` and never by `column.id`, because `Column.key` is the stable
 * thing: renaming a column changes its `name` and a delete-and-recreate changes its
 * `id`, and neither may change what the stored values mean.
 */
export const valueOf = (
  record: FiroRecord,
  columnKey: string,
): FiroRecord["values"][string] | null => record.values[columnKey] ?? null;

/**
 * The display text for a cell, or `""` when there is nothing to show.
 *
 * `context` is needed by exactly one column type: a relation renders its
 * TARGET's title, so it has to be able to find that record. Callers without
 * the collection at hand omit it and get `""` for relations, which is the
 * same "no invented rendering" rule the default case holds.
 */
export const displayValue = (
  record: FiroRecord,
  column: Collection["columns"][number],
  context?: { collection: Collection; records: readonly FiroRecord[] },
): string => {
  const value = valueOf(record, column.key);
  if (value === null) {
    return "";
  }

  switch (value.type) {
    case "text":
      return value.value;

    case "richText":
      /*
       * A rich-text cell holds a ProseMirror document, not a string (ADR-0004, rule 3
       * of `AGENTS.md`). Displaying one is therefore *extraction*, not reading: the
       * marks and the paragraph breaks are dropped here because a cell has no room to
       * render them, and `proseMirrorToPlainText` is the function that owns that
       * decision rather than a `textBetween` call written here for the fourth time.
       */
      return proseMirrorToPlainText(value.value);

    case "number":
      return String(value.value);

    case "boolean":
      return value.value ? "Yes" : "No";

    case "date":
      /*
       * ISO date, not a locale string: a `git diff` of an exported board has to show
       * the same thing twice, and `toLocaleDateString` does not promise that.
       *
       * Null is "no date set", which is an empty cell and not the epoch.
       */
      return value.value ?? "";

    case "singleSelect":
      return value.value ?? "";

    case "multiSelect":
      return value.value.join(", ");

    case "person":
      return value.value ?? "";

    case "link":
      return value.value ?? "";

    case "relation": {
      if (value.value === null || context === undefined) {
        return "";
      }
      const target = context.records.find((r) => r.id === value.value);
      if (
        target === undefined ||
        target.collectionId !== context.collection.id
      ) {
        // Dangling: the parent was deleted. Named, not blank - a blank cell
        // reads as "no parent", and this record HAS one that is gone.
        return "Missing record";
      }
      const title = valueOf(target, titleColumnKeyFor(context.collection));
      return title !== null && title.type === "text" ? title.value : "";
    }

    default:
      /*
       * Unreachable for every type `COLUMN_TYPES` currently declares, and reachable
       * only for a value read out of a document written by a Firo that knew a type we
       * do not. Refusing to invent a rendering for it is the point: an unreadable cell
       * is visible, a plausible wrong one is not.
       */
      return "";
  }
};
