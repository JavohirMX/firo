import { describe, expect, it } from "vitest";
import { asFractionalIndex } from "@firo/schema";

import type { Collection, FiroRecord } from "@firo/schema";

import {
  dateColumnFor,
  durationColumnFor,
  formatDateIso,
  getTimelineBaseDate,
  parseDateValue,
  timelineProjection,
  DAY_WIDTH,
  HEADER_HEIGHT,
  SIDEBAR_WIDTH,
} from "../src/timeline.js";

import { record } from "./fixtures.js";

const dateTasks = (over: Partial<Collection> = {}): Collection => ({
  id: "col-timeline-tasks",
  boardId: "b-1",
  name: "Timeline Tasks",
  order: asFractionalIndex("a0"),
  version: 1,
  columns: [
    { id: "col-title", key: "title", name: "Title", type: "text" },
    { id: "col-due", key: "dueDate", name: "Due Date", type: "date" },
    { id: "col-duration", key: "duration", name: "Duration", type: "number" },
  ],
  ...over,
});

const sampleRecords = (): FiroRecord[] => [
  record({
    id: "rec-1",
    values: {
      title: { type: "text", value: "Design Spec" },
      dueDate: { type: "date", value: "2026-10-10" },
      duration: { type: "number", value: 4 },
    },
    order: asFractionalIndex("a0"),
  }),
  record({
    id: "rec-2",
    values: {
      title: { type: "text", value: "Implementation" },
      dueDate: { type: "date", value: "2026-10-15" },
      duration: { type: "number", value: 5 },
    },
    order: asFractionalIndex("a1"),
  }),
];

describe("timeline projection", () => {
  describe("identification and metadata", () => {
    it("has the expected id and name", () => {
      expect(timelineProjection.id).toBe("timeline");
      expect(timelineProjection.name).toBe("Timeline");
    });

    it("advertises reorder and edit support", () => {
      expect(timelineProjection.supports).toContain("edit");
      expect(timelineProjection.supports).toContain("reorder");
    });
  });

  describe("column detection and parsing", () => {
    it("detects typed date columns and duration columns", () => {
      const col = dateTasks();
      expect(dateColumnFor(col)?.key).toBe("dueDate");
      expect(durationColumnFor(col)?.key).toBe("duration");
    });

    it("detects date column by name or key when type is not date", () => {
      const col: Collection = {
        ...dateTasks(),
        columns: [
          { id: "col-1", key: "start_date", name: "Start", type: "text" },
        ],
      };
      expect(dateColumnFor(col)?.key).toBe("start_date");
    });

    it("parses date string and field value safely", () => {
      expect(parseDateValue("2026-10-15")).toBe(Date.parse("2026-10-15"));
      expect(parseDateValue({ type: "date", value: "2026-10-15" })).toBe(
        Date.parse("2026-10-15"),
      );
      expect(parseDateValue(null)).toBeNull();
      expect(parseDateValue("invalid-date")).toBeNull();
    });

    it("formats dates to ISO string", () => {
      const ts = Date.UTC(2026, 9, 15);
      expect(formatDateIso(ts)).toBe("2026-10-15");
    });
  });

  describe("layout", () => {
    it("generates time headers, row labels, and bars", () => {
      const col = dateTasks();
      const recs = sampleRecords();
      const elements = timelineProjection.layout(col, recs, {
        originX: 100,
        originY: 50,
      });

      // Headers exist
      const headers = elements.filter((e) => e.type === "header");
      expect(headers.length).toBeGreaterThan(0);
      expect(headers[0].y).toBe(50);
      expect(headers[0].x).toBe(100 + SIDEBAR_WIDTH);

      // Labels exist
      const labels = elements.filter((e) => e.type === "cell");
      expect(labels).toHaveLength(2);
      expect(labels[0].recordId).toBe("rec-1");
      expect(labels[0].text).toBe("Design Spec");
      expect(labels[0].x).toBe(100);
      expect(labels[0].y).toBe(50 + HEADER_HEIGHT);

      // Bars exist
      const bars = elements.filter((e) => e.type === "card");
      expect(bars).toHaveLength(2);
      expect(bars[0].recordId).toBe("rec-1");
      expect(bars[0].width).toBe(4 * DAY_WIDTH); // 4 days duration
      expect(bars[1].recordId).toBe("rec-2");
      expect(bars[1].width).toBe(5 * DAY_WIDTH); // 5 days duration

      // rec-2 starts 5 days after rec-1 (10-15 vs 10-10)
      expect(bars[1].x - bars[0].x).toBe(5 * DAY_WIDTH);
    });

    it("lays out records without dates using index offsets", () => {
      const col: Collection = {
        ...dateTasks(),
        columns: [{ id: "col-1", key: "title", name: "Title", type: "text" }],
      };
      const recs = [
        record({ id: "r1", values: { title: { type: "text", value: "One" } } }),
        record({ id: "r2", values: { title: { type: "text", value: "Two" } } }),
      ];

      const elements = timelineProjection.layout(col, recs, {
        originX: 0,
        originY: 0,
      });
      const bars = elements.filter((e) => e.type === "card");
      expect(bars).toHaveLength(2);
      expect(bars[1].x).toBeGreaterThan(bars[0].x);
    });
  });

  describe("interpret", () => {
    it("handles edit intent", () => {
      const col = dateTasks();
      const recs = sampleRecords();

      const mutation = timelineProjection.interpret(col, recs, {
        kind: "edit",
        recordId: "rec-1",
        columnKey: "title",
        value: "Updated Title",
      });

      expect(mutation).toEqual({
        kind: "setField",
        recordId: "rec-1",
        columnKey: "title",
        value: { type: "text", value: "Updated Title" },
      });
    });

    it("handles reorder intent", () => {
      const col = dateTasks();
      const recs = sampleRecords();

      const mutation = timelineProjection.interpret(col, recs, {
        kind: "reorder",
        recordId: "rec-2",
        beforeId: "rec-1",
      });

      expect(mutation).not.toBeNull();
      expect(mutation?.kind).toBe("setOrder");
    });

    it("converts horizontal move into date mutation", () => {
      const col = dateTasks();
      const recs = sampleRecords();
      const baseDate = getTimelineBaseDate(recs, "dueDate");

      // Drop 10 days out
      const dropX = SIDEBAR_WIDTH + 10 * DAY_WIDTH;
      const mutation = timelineProjection.interpret(col, recs, {
        kind: "move",
        recordId: "rec-1",
        x: dropX,
        y: 100,
      });

      expect(mutation).not.toBeNull();
      expect(mutation?.kind).toBe("setField");
      if (mutation?.kind === "setField") {
        expect(mutation.columnKey).toBe("dueDate");
        expect(mutation.value).toEqual({
          type: "date",
          value: formatDateIso(baseDate + 10 * 86_400_000),
        });
      }
    });

    it("refuses move if record is dropped on same date", () => {
      const col = dateTasks();
      const recs = sampleRecords();

      // rec-1 is at 2026-10-10, which is baseDate (offset 0)
      const dropX = SIDEBAR_WIDTH;
      const mutation = timelineProjection.interpret(col, recs, {
        kind: "move",
        recordId: "rec-1",
        x: dropX,
        y: 100,
      });

      expect(mutation).toBeNull();
    });

    it("returns null on missing record", () => {
      const col = dateTasks();
      const recs = sampleRecords();

      expect(
        timelineProjection.interpret(col, recs, {
          kind: "move",
          recordId: "nonexistent",
          x: 200,
          y: 200,
        }),
      ).toBeNull();
    });
  });
});
