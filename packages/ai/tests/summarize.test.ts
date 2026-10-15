/**
 * Tests for Board and Comment Summarization.
 */
import { describe, expect, test, vi } from "vitest";

import { generateKeyBetween } from "@firo/fractional-indexing";

import { asElementId, asFractionalIndex } from "@firo/schema";

import type { CommentThread, StickyNoteElement } from "@firo/schema";

import { createLlmClient } from "../src/client.js";
import {
  summarizeBoard,
  summarizeComments,
} from "../src/operations/summarize.js";
import { textToProseMirrorDoc } from "../src/operations/utils.js";

const makeNote = (id: string, text: string): StickyNoteElement => ({
  id: asElementId(id),
  type: "stickynote",
  text,
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  angle: 0 as any,
  strokeColor: "#1e1e1e",
  backgroundColor: "#fff9b1",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roundness: null,
  roughness: 1,
  opacity: 100,
  fontSize: 16,
  fontFamily: 1,
  textAlign: "center",
  verticalAlign: "middle",
  isContainer: false,
  version: 1,
  versionNonce: 12345,
  index: asFractionalIndex(generateKeyBetween(null, null)),
  created: 1000,
  updated: 1000,
  isDeleted: false,
  groupIds: [],
  frameId: null,
  containerId: null,
  bindings: [],
  link: null,
  locked: false,
});

describe("Board Summarization", () => {
  test("handles empty board gracefully without error", async () => {
    const mockClient = createLlmClient({ fetchFn: vi.fn() });
    const result = await summarizeBoard([], mockClient);
    expect(result.title).toBe("Empty Board");
    expect(result.overview).toContain("empty");
    expect(result.themes).toHaveLength(0);
  });

  test("summarizes board content, themes, and unresolved questions", async () => {
    const elements = [
      makeNote("n1", "Migrate server to SQLite WAL mode"),
      makeNote("n2", "Benchmark snapshot compaction latency"),
      {
        id: asElementId("rect-1"),
        type: "rectangle" as const,
        text: textToProseMirrorDoc("Architecture Review Q4"),
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        angle: 0 as any,
        strokeColor: "#000",
        backgroundColor: "#fff",
        fillStyle: "solid" as const,
        strokeWidth: 1,
        strokeStyle: "solid" as const,
        roundness: null,
        roughness: 0,
        opacity: 100,
        version: 1,
        versionNonce: 1,
        index: asFractionalIndex(generateKeyBetween(null, null)),
        created: 100,
        updated: 100,
        isDeleted: false,
        groupIds: [],
        frameId: null,
        containerId: null,
        bindings: [],
        link: null,
        locked: false,
      },
    ];

    const mockResponse = {
      title: "Backend Storage Architecture Review",
      overview:
        "The team discussed transitioning the backend database to SQLite WAL mode to improve read concurrency and measuring snapshot compaction times.",
      themes: [
        {
          name: "Storage Optimization",
          description: "Transitioning to SQLite with WAL mode.",
        },
        {
          name: "Performance Measurement",
          description: "Compaction benchmarks under load.",
        },
      ],
      unresolvedQuestions: [
        "What is the maximum database size before compaction degrades latency?",
      ],
      keyDecisions: ["Adopt SQLite with WAL for Phase 9 sync server."],
    };

    const mockClient = createLlmClient({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: JSON.stringify(mockResponse) },
        }),
      }) as any,
    });

    const result = await summarizeBoard(elements, mockClient);

    expect(result.title).toBe("Backend Storage Architecture Review");
    expect(result.overview).toContain("SQLite WAL mode");
    expect(result.themes).toHaveLength(2);
    expect(result.unresolvedQuestions).toHaveLength(1);
    expect(result.keyDecisions).toHaveLength(1);
    expect(result.markdown).toContain("# Backend Storage Architecture Review");
    expect(result.markdown).toContain("## Key Themes");
    expect(result.markdown).toContain("## Unresolved Questions");
  });
});

describe("Comment Thread Summarization", () => {
  test("handles empty threads gracefully", async () => {
    const mockClient = createLlmClient({ fetchFn: vi.fn() });
    const result = await summarizeComments([], mockClient);
    expect(result.summary).toContain("No comment threads");
    expect(result.actionItems).toHaveLength(0);
  });

  test("summarizes comment discussions and extracts action items", async () => {
    const threads: CommentThread[] = [
      {
        id: "thread-1",
        elementId: "note-1",
        anchor: { x: 10, y: 10 },
        resolved: false,
        author: "Alice",
        createdAt: 1000,
        updatedAt: 1200,
        comments: [
          {
            id: "c1",
            author: "Alice",
            body: "Should we use WebSocket or WebTransport for live cursors?",
            createdAt: 1000,
          },
          {
            id: "c2",
            author: "Bob",
            body: "WebSocket is standard and works everywhere. Bob to prototype by Wednesday.",
            createdAt: 1100,
          },
        ],
      },
      {
        id: "thread-2",
        elementId: "note-2",
        anchor: { x: 50, y: 50 },
        resolved: true,
        author: "Charlie",
        createdAt: 2000,
        updatedAt: 2500,
        comments: [
          {
            id: "c3",
            author: "Charlie",
            body: "Fixed the dark mode contrast ratio.",
            createdAt: 2000,
          },
        ],
      },
    ];

    const mockResponse = {
      summary:
        "Discussions centered on networking transport protocols for live cursor sync and accessibility color contrast verification.",
      actionItems: [
        {
          task: "Prototype WebSocket live cursor implementation",
          assignee: "Bob",
          status: "open",
          threadId: "thread-1",
        },
      ],
      keyDebates: ["WebTransport vs WebSocket support in legacy browsers"],
    };

    const mockClient = createLlmClient({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        }),
      }) as any,
    });

    const result = await summarizeComments(threads, mockClient);

    expect(result.summary).toContain("cursor sync");
    expect(result.actionItems).toHaveLength(1);
    expect(result.actionItems[0]).toEqual({
      task: "Prototype WebSocket live cursor implementation",
      assignee: "Bob",
      status: "open",
      threadId: "thread-1",
    });
    expect(result.keyDebates).toContain(
      "WebTransport vs WebSocket support in legacy browsers",
    );
    expect(result.markdown).toContain("### Comment Threads Summary");
    expect(result.markdown).toContain("Prototype WebSocket live cursor");
    expect(result.markdown).toContain("(@Bob)");
  });
});
