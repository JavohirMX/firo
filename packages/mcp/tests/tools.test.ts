import { beforeEach, describe, expect, it } from "vitest";

import { MemoryBoardStore } from "../src/store";
import { createMcpTools } from "../src/tools";

import type { BoardStore } from "../src/store";
import type { ToolDefinition } from "../src/tools";

describe("MCP Tool Handlers", () => {
  let store: BoardStore;
  let tools: Map<string, ToolDefinition>;

  beforeEach(async () => {
    store = new MemoryBoardStore();
    tools = createMcpTools(store);
  });

  it("board_create creates a new board and registers it in the store", async () => {
    const createTool = tools.get("board_create")!;
    const res = await createTool.execute({
      title: "Architecture Review",
      tags: ["architecture", "backend"],
      elements: [
        {
          id: "note-arch-1",
          type: "stickynote",
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          text: "Decouple storage layer",
        },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.boardId).toBeTruthy();
    expect(res.title).toBe("Architecture Review");
    expect(res.elementCount).toBe(1);

    const doc = await store.getBoard(res.boardId);
    expect(doc).toBeDefined();
    expect(doc!.read().elements.length).toBe(1);
  });

  it("board_search finds boards by title, tags, and element content", async () => {
    const createTool = tools.get("board_create")!;
    const searchTool = tools.get("board_search")!;

    await createTool.execute({
      title: "Frontend Roadmap",
      tags: ["frontend"],
      elements: [
        {
          id: "note-f1",
          type: "stickynote",
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          text: "Migrate to modern CSS variables",
        },
      ],
    });

    await createTool.execute({
      title: "Backend Services",
      tags: ["backend"],
      elements: [
        {
          id: "note-b1",
          type: "stickynote",
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          text: "Postgres connection pooling",
        },
      ],
    });

    // 1. Search by title
    const titleSearch = await searchTool.execute({ query: "Roadmap" });
    expect(titleSearch.matches.length).toBe(1);
    expect(titleSearch.matches[0].boardName).toBe("Frontend Roadmap");
    expect(titleSearch.matches[0].matchType).toBe("title");

    // 2. Search by content in sticky note
    const contentSearch = await searchTool.execute({ query: "pooling" });
    expect(contentSearch.matches.length).toBe(1);
    expect(contentSearch.matches[0].boardName).toBe("Backend Services");
    expect(contentSearch.matches[0].snippet).toContain("pooling");

    // 3. Search with tag filter
    const tagSearch = await searchTool.execute({
      query: "",
      tags: ["frontend"],
    });
    expect(tagSearch.matches.length).toBe(1);
    expect(tagSearch.matches[0].boardName).toBe("Frontend Roadmap");
  });

  it("board_read exports board elements as json, svg, and summary", async () => {
    const createTool = tools.get("board_create")!;
    const readTool = tools.get("board_read")!;

    const { boardId } = await createTool.execute({
      title: "Design System",
      elements: [
        {
          id: "comp-button",
          type: "rectangle",
          x: 50,
          y: 50,
          width: 140,
          height: 44,
          backgroundColor: "#0969da",
        },
        {
          id: "label-button",
          type: "text",
          x: 70,
          y: 60,
          width: 100,
          height: 24,
          text: "Submit",
        },
      ],
    });

    // Format: json (default)
    const jsonRes = await readTool.execute({ boardId });
    expect(jsonRes.id).toBe(boardId);
    expect(jsonRes.title).toBe("Design System");
    expect(jsonRes.elements.length).toBe(2);

    // Format: svg
    const svgRes = await readTool.execute({ boardId, format: "svg" });
    expect(svgRes.svg).toContain("<svg");
    expect(svgRes.svg).toContain('data-firo-id="comp-button"');
    expect(svgRes.svg).toContain('data-firo-id="label-button"');

    // Format: summary
    const summaryRes = await readTool.execute({ boardId, format: "summary" });
    expect(summaryRes.elementCount).toBe(2);
    expect(summaryRes.shapes).toBe(1);
  });

  it("board_apply_diff modifies elements via declarative diffs", async () => {
    const createTool = tools.get("board_create")!;
    const applyDiffTool = tools.get("board_apply_diff")!;
    const readTool = tools.get("board_read")!;

    const { boardId } = await createTool.execute({
      title: "Interactive Canvas",
      elements: [
        {
          id: "card-1",
          type: "stickynote",
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          text: "Initial task",
        },
      ],
    });

    const diffRes = await applyDiffTool.execute({
      boardId,
      diff: {
        elements: {
          update: [
            {
              id: "card-1",
              text: "Updated task description",
              x: 150,
            },
          ],
          insert: [
            {
              id: "card-2",
              type: "stickynote",
              x: 400,
              y: 100,
              width: 200,
              height: 200,
              text: "Subtask",
            },
          ],
        },
      },
    });

    expect(diffRes.success).toBe(true);
    expect(diffRes.changed).toBe(true);

    const board = await readTool.execute({ boardId });
    expect(board.elements.length).toBe(2);
    expect(board.elements.find((e: any) => e.id === "card-1").text).toBe(
      "Updated task description",
    );
    expect(board.elements.find((e: any) => e.id === "card-2").text).toBe(
      "Subtask",
    );
  });

  it("records_update and records_query manage structured collection data", async () => {
    const createTool = tools.get("board_create")!;
    const queryTool = tools.get("records_query")!;
    const updateTool = tools.get("records_update")!;

    const { boardId } = await createTool.execute({
      title: "Project Management",
      collections: [
        {
          id: "col-features",
          name: "Features",
          columns: [
            { id: "c-title", key: "title", name: "Title", type: "text" },
            {
              id: "c-status",
              key: "status",
              name: "Status",
              type: "singleSelect",
            },
            { id: "c-points", key: "points", name: "Points", type: "number" },
          ],
        },
      ],
    });

    // 1. Insert records via records_update
    await updateTool.execute({
      boardId,
      collectionId: "col-features",
      insert: [
        {
          id: "rec-auth",
          values: { title: "Authentication", status: "todo", points: 5 },
        },
        {
          id: "rec-mcp",
          values: { title: "MCP Server", status: "in_progress", points: 8 },
        },
        {
          id: "rec-docs",
          values: { title: "Documentation", status: "done", points: 2 },
        },
      ],
    });

    // 2. Query all records
    const all = await queryTool.execute({
      boardId,
      collectionId: "col-features",
    });
    expect(all.count).toBe(3);

    // 3. Filter by singleSelect equals
    const filteredStatus = await queryTool.execute({
      boardId,
      collectionId: "col-features",
      filter: { field: "status", operator: "equals", value: "in_progress" },
    });
    expect(filteredStatus.count).toBe(1);
    expect(filteredStatus.records[0].id).toBe("rec-mcp");

    // 4. Filter by points > 4
    const filteredPoints = await queryTool.execute({
      boardId,
      collectionId: "col-features",
      filter: { field: "points", operator: "gt", value: 4 },
      sortBy: "points",
      sortDirection: "asc",
    });
    expect(filteredPoints.count).toBe(2);
    expect(filteredPoints.records[0].id).toBe("rec-auth");
    expect(filteredPoints.records[1].id).toBe("rec-mcp");

    // 5. Update record status & delete one record
    await updateTool.execute({
      boardId,
      collectionId: "col-features",
      update: [
        {
          id: "rec-auth",
          values: { status: "done" },
        },
      ],
      delete: ["rec-docs"],
    });

    const afterUpdate = await queryTool.execute({
      boardId,
      collectionId: "col-features",
    });
    expect(afterUpdate.count).toBe(2);
    const authRec = afterUpdate.records.find((r: any) => r.id === "rec-auth");
    expect(authRec.values.status.value).toBe("done");
  });

  it("comment_thread_create and comment_thread_reply anchor discussion threads", async () => {
    const createTool = tools.get("board_create")!;
    const commentCreateTool = tools.get("comment_thread_create")!;
    const commentReplyTool = tools.get("comment_thread_reply")!;
    const readTool = tools.get("board_read")!;

    const { boardId } = await createTool.execute({
      title: "Review Board",
      elements: [
        {
          id: "widget-chart",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 300,
          height: 200,
        },
      ],
    });

    // 1. Create thread anchored to widget-chart
    const threadRes = await commentCreateTool.execute({
      boardId,
      elementId: "widget-chart",
      body: "Should we make this bar chart instead?",
      author: "Designer",
      anchor: { x: 150, y: 0 },
    });

    expect(threadRes.success).toBe(true);
    expect(threadRes.threadId).toBeTruthy();

    // 2. Post reply
    const replyRes = await commentReplyTool.execute({
      boardId,
      threadId: threadRes.threadId,
      body: "Agreed, bar chart is more legible here.",
      author: "Product Manager",
    });

    expect(replyRes.success).toBe(true);

    // 3. Read board and verify threaded comments
    const board = await readTool.execute({ boardId });
    expect(board.comments.length).toBe(1);
    expect(board.comments[0].id).toBe(threadRes.threadId);
    expect(board.comments[0].elementId).toBe("widget-chart");
    expect(board.comments[0].comments.length).toBe(2);
    expect(board.comments[0].comments[0].body).toBe(
      "Should we make this bar chart instead?",
    );
    expect(board.comments[0].comments[1].body).toBe(
      "Agreed, bar chart is more legible here.",
    );
  });
});
