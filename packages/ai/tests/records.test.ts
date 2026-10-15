/**
 * Tests for Text-to-Records.
 */
import { describe, expect, test, vi } from "vitest";

import { generateKeyBetween } from "@firo/fractional-indexing";

import { asFractionalIndex } from "@firo/schema";

import type { Collection } from "@firo/schema";

import { createLlmClient } from "../src/client.js";
import { textToRecords } from "../src/operations/records.js";

describe("Text-to-Records", () => {
  const collection: Collection = {
    id: "col-bugs",
    boardId: "board-1",
    name: "Bug Tracker",
    order: asFractionalIndex(generateKeyBetween(null, null)),
    version: 1,
    columns: [
      { id: "c1", key: "title", name: "Title", type: "text" },
      { id: "c2", key: "points", name: "Story Points", type: "number" },
      { id: "c3", key: "critical", name: "Critical", type: "boolean" },
      { id: "c4", key: "dueDate", name: "Due Date", type: "date" },
      {
        id: "c5",
        key: "status",
        name: "Status",
        type: "singleSelect",
        options: [
          { id: "o1", name: "To Do", color: "#gray" },
          { id: "o2", name: "In Progress", color: "#blue" },
          { id: "o3", name: "Done", color: "#green" },
        ],
      },
    ],
  };

  test("converts meeting notes into typed records matching collection schema", async () => {
    const rawNotes =
      "- Fix memory leak in Yjs provider, 5 story points, critical bug, due 2026-11-01, status In Progress.\n" +
      "- Update font licenses doc, 1 point, not critical, due 2026-11-05, status To Do.";

    const mockResponse = {
      records: [
        {
          title: "Fix memory leak in Yjs provider",
          points: 5,
          critical: true,
          dueDate: "2026-11-01",
          status: "in progress",
        },
        {
          title: "Update font licenses doc",
          points: 1,
          critical: false,
          dueDate: "2026-11-05",
          status: "To Do",
        },
      ],
    };

    const mockClient = createLlmClient({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        }),
      }) as any,
    });

    const result = await textToRecords(
      { collection, text: rawNotes },
      mockClient,
    );

    expect(result.collectionId).toBe("col-bugs");
    expect(result.records).toHaveLength(2);

    const rec1 = result.records[0];
    expect(rec1.collectionId).toBe("col-bugs");
    expect(rec1.values.title).toEqual({
      type: "text",
      value: "Fix memory leak in Yjs provider",
    });
    expect(rec1.values.points).toEqual({ type: "number", value: 5 });
    expect(rec1.values.critical).toEqual({ type: "boolean", value: true });
    expect(rec1.values.dueDate).toEqual({
      type: "date",
      value: "2026-11-01",
    });
    expect(rec1.values.status).toEqual({
      type: "singleSelect",
      value: "In Progress", // coerced to canonical option name
    });
    expect(rec1.order).toBeDefined();

    expect(result.mutations).toHaveLength(1);
    expect(result.mutations[0].kind).toBe("createRecords");
  });
});
