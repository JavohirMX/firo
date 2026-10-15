import type { Collection, FiroRecord } from "@firo/schema";

import { displayValue, valueOf } from "./types.js";
import { orderedRecords, reorderMutation } from "./ordering.js";
import { titleColumnKeyFor } from "./table.js";

import type {
  LayoutContext,
  Projection,
  ProjectionElement,
  ProjectionIntent,
  RecordMutation,
} from "./types.js";

/**
 * The timeline projection (Task 8.5 / Gantt view).
 *
 * ## The Fourth Projection
 *
 * From ADR-0003 and Phase 8 plan:
 * "A Gantt-style view from a date column and an optional duration column.
 * This is the test of whether the projection interface was right.
 * If adding a fourth projection requires touching the record store or the renderer,
 * the interface in Phase 6 was wrong and the fix is more valuable than the timeline."
 *
 * This implementation touches ONLY this file and exports in index.ts — zero
 * modifications to @firo/records core abstractions and zero modifications to
 * @firo/render.
 */

export const SIDEBAR_WIDTH = 200;
export const HEADER_HEIGHT = 44;
export const ROW_HEIGHT = 44;
export const DAY_WIDTH = 48;
export const DEFAULT_DURATION_DAYS = 3;
export const MS_PER_DAY = 86_400_000;

/** Finds the date column to project against. */
export const dateColumnFor = (
  collection: Collection,
): Collection["columns"][number] | null => {
  const dateType = collection.columns.find((col) => col.type === "date");
  if (dateType) {
    return dateType;
  }
  return (
    collection.columns.find(
      (col) =>
        col.key.toLowerCase().includes("date") ||
        col.name.toLowerCase().includes("date") ||
        col.name.toLowerCase().includes("due") ||
        col.name.toLowerCase().includes("start"),
    ) ?? null
  );
};

/** Finds the duration column if present. */
export const durationColumnFor = (
  collection: Collection,
): Collection["columns"][number] | null => {
  return (
    collection.columns.find(
      (col) =>
        col.type === "number" &&
        (col.key.toLowerCase().includes("duration") ||
          col.name.toLowerCase().includes("duration") ||
          col.name.toLowerCase().includes("days")),
    ) ?? null
  );
};

/** Parses date value to UTC timestamp in milliseconds. */
export const parseDateValue = (val: unknown): number | null => {
  if (val === null || val === undefined) {
    return null;
  }
  const raw =
    typeof val === "object" && val !== null && "value" in val
      ? (val as { value: unknown }).value
      : val;
  if (typeof raw === "number" && !isNaN(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

/** Normalizes a timestamp to midnight UTC. */
export const startOfDayUtc = (timestamp: number): number => {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

/** Formats timestamp to YYYY-MM-DD. */
export const formatDateIso = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Formats day header label. */
export const formatDayHeader = (timestamp: number): string => {
  const date = new Date(timestamp);
  const month = date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const day = date.getUTCDate();
  return `${month} ${day}`;
};

/**
 * Computes base min date for timeline layout.
 */
export const getTimelineBaseDate = (
  records: readonly FiroRecord[],
  dateColumnKey: string | null,
): number => {
  const timestamps = records
    .map((rec) =>
      dateColumnKey ? parseDateValue(valueOf(rec, dateColumnKey)) : null,
    )
    .filter((ts): ts is number => ts !== null);

  if (timestamps.length > 0) {
    return startOfDayUtc(Math.min(...timestamps));
  }

  // Fallback: start of today UTC
  return startOfDayUtc(Date.now());
};

export const timelineProjection: Projection = {
  id: "timeline",
  name: "Timeline",
  supports: ["reorder", "edit"],

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
    const dateCol = dateColumnFor(collection);
    const durCol = durationColumnFor(collection);

    const ordered = orderedRecords(records);
    const baseDate = getTimelineBaseDate(ordered, dateCol?.key ?? null);

    // Calculate time span
    let maxOffsetDays = 14;
    ordered.forEach((rec, idx) => {
      const rawDate = dateCol ? valueOf(rec, dateCol.key) : null;
      const parsed = parseDateValue(rawDate);
      const startMs = parsed ?? baseDate + idx * MS_PER_DAY;
      const offsetDays = Math.max(
        0,
        Math.round((startMs - baseDate) / MS_PER_DAY),
      );
      const rawDur = durCol ? valueOf(rec, durCol.key) : null;
      const durDays =
        rawDur && rawDur.type === "number"
          ? rawDur.value
          : rawDur && "value" in rawDur
          ? Number(rawDur.value) || DEFAULT_DURATION_DAYS
          : DEFAULT_DURATION_DAYS;
      maxOffsetDays = Math.max(maxOffsetDays, offsetDays + durDays + 2);
    });

    const elements: ProjectionElement[] = [];

    // Header cells for time axis
    for (let day = 0; day < maxOffsetDays; day++) {
      const dayTimestamp = baseDate + day * MS_PER_DAY;
      elements.push({
        id: `timeline:header:${day}`,
        recordId: "",
        type: "header",
        x: originX + SIDEBAR_WIDTH + day * DAY_WIDTH,
        y: originY,
        width: DAY_WIDTH,
        height: HEADER_HEIGHT,
        text: formatDayHeader(dayTimestamp),
      });
    }

    // Rows and bars
    ordered.forEach((record, index) => {
      const y = originY + HEADER_HEIGHT + index * ROW_HEIGHT;
      const labelText = titleColumn
        ? displayValue(record, titleColumn)
        : record.id;

      // Label column cell
      elements.push({
        id: `timeline:label:${record.id}`,
        recordId: record.id,
        type: "cell",
        x: originX,
        y,
        width: SIDEBAR_WIDTH,
        height: ROW_HEIGHT,
        text: labelText,
      });

      // Calculate bar placement
      const rawDate = dateCol ? valueOf(record, dateCol.key) : null;
      const parsed = parseDateValue(rawDate);
      const startMs = parsed ?? baseDate + index * MS_PER_DAY;
      const offsetDays = Math.max(0, (startMs - baseDate) / MS_PER_DAY);
      const rawDur = durCol ? valueOf(record, durCol.key) : null;
      const durDays =
        rawDur && rawDur.type === "number"
          ? rawDur.value
          : rawDur && "value" in rawDur
          ? Number(rawDur.value) || DEFAULT_DURATION_DAYS
          : DEFAULT_DURATION_DAYS;

      const barX = originX + SIDEBAR_WIDTH + offsetDays * DAY_WIDTH;
      const barWidth = Math.max(DAY_WIDTH, durDays * DAY_WIDTH);
      const barY = y + 6;
      const barHeight = ROW_HEIGHT - 12;

      elements.push({
        id: `timeline:bar:${record.id}`,
        recordId: record.id,
        columnKey: dateCol?.key,
        type: "card",
        x: barX,
        y: barY,
        width: barWidth,
        height: barHeight,
        text: labelText,
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
        const value =
          column.type === "date"
            ? { type: "date" as const, value: intent.value || null }
            : column.type === "singleSelect"
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

      case "move": {
        const dateCol = dateColumnFor(collection);
        if (!dateCol) {
          return null;
        }

        const ordered = orderedRecords(records);
        const baseDate = getTimelineBaseDate(ordered, dateCol.key);

        // Compute dropped date from x coordinate
        const daysFromOrigin = Math.max(
          0,
          Math.round((intent.x - SIDEBAR_WIDTH) / DAY_WIDTH),
        );
        const droppedTimestamp = baseDate + daysFromOrigin * MS_PER_DAY;
        const isoDate = formatDateIso(droppedTimestamp);

        const currentVal = valueOf(record, dateCol.key);
        if (currentVal?.type === "date" && currentVal.value === isoDate) {
          return null;
        }

        return {
          kind: "setField",
          recordId: record.id,
          columnKey: dateCol.key,
          value: { type: "date", value: isoDate },
        };
      }

      default:
        return null;
    }
  },
};
