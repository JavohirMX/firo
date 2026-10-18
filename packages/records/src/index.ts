/**
 * `@firo/records` — projections over a record store.
 *
 * ## What this package is
 *
 * Three views over one data set: a table, a board and a grid. Switching between them
 * is free because there is nothing to switch — they are functions of the same records.
 *
 * That is AC-3's whole requirement, and the TRD's second row of
 * ["Why not five widgets"](../../../docs/trd/06-records-and-projections.md):
 *
 * | Approach | Outcome |
 * | --- | --- |
 * | Five separate element types | A task moved from a kanban to a table becomes two objects that drift. No switching. Every cross-view feature is a sync problem. |
 * | One record store, four projections | One identity. Switching is free. Cross-view features are queries. |
 *
 * ## What is *not* in here
 *
 * **No elements.** A `ProjectionElement` is a description of something to draw, and
 * it is never persisted and never an element type. That is rule 4 in `AGENTS.md`, and
 * it is the reason a projection can be swapped without the board noticing. If you find
 * yourself wanting to write a projection element into the document, you want a
 * `containerId` on the record instead.
 *
 * **No writes.** Every projection returns a `RecordMutation` and nothing else. A
 * projection that applied its own change would make the views two writers, and the
 * sync step between them is exactly what AC-3 says must not exist.
 *
 * **No rendering.** Layout returns positions and text; a renderer turns them into
 * pixels. Keeping them apart is what lets a projection be tested without a canvas,
 * which is why the three projections here are covered by unit tests rather than
 * screenshot comparisons.
 */

import { boardProjection } from "./board.js";
import { gridProjection } from "./grid.js";
import { tableProjection } from "./table.js";
import { timelineProjection } from "./timeline.js";

import type { Projection } from "./types.js";

export {
  applyDocBlockChange,
  createDefaultDocBlockNode,
  createDocBlockRecord,
  docBlockProjection,
  docBlockRecordFromFiroRecord,
  docBlockRecordToFiroRecord,
  docBlockSchema,
  docBlockToPlainText,
  isDocBlockRecord,
  layoutDocBlockElement,
  parseDocBlockJson,
  serializeDocBlockNode,
  DOC_BLOCK_COLLECTION_ID,
  DOC_BLOCK_LAYOUT,
} from "./docBlock.js";
export { boardProjection, groupAt, groupOf, groupsOf } from "./board.js";
export { gridProjection, positionOf } from "./grid.js";
export {
  asOrder,
  orderForLast,
  orderedRecords,
  reorderMutation,
} from "./ordering.js";
export {
  editableValueOf,
  tableProjection,
  titleColumnKeyFor,
} from "./table.js";
export {
  dateColumnFor,
  durationColumnFor,
  formatDateIso,
  getTimelineBaseDate,
  parseDateValue,
  timelineProjection,
  DAY_WIDTH,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  SIDEBAR_WIDTH,
} from "./timeline.js";
export {
  displayValue,
  groupingColumnFor,
  optionsOf,
  valueOf,
  type LayoutContext,
  type Projection,
  type ProjectionElement,
  type ProjectionFeature,
  type ProjectionIntent,
  type RecordGroup,
  type RecordMutation,
} from "./types.js";

/**
 * Every projection, by id.
 *
 * A lookup rather than a branch, so that "switch to the board" is a table access and
 * adding a fourth projection is one line here rather than an edit to a `switch` that
 * somebody will forget.
 */
export const PROJECTIONS: Readonly<Record<string, Projection>> = {
  board: boardProjection,
  grid: gridProjection,
  table: tableProjection,
  timeline: timelineProjection,
};

/**
 * The projection with this id, or the table.
 *
 * Falling back rather than returning null: a stored projection id from a newer version
 * of Firo must not leave the board with nothing to draw, and the table is the most
 * universally renderable of the three.
 */
export const projectionFor = (id: string): Projection =>
  PROJECTIONS[id] ?? tableProjection;
