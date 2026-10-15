import { describe, expect, it, beforeEach } from "vitest";
import { clear } from "idb-keyval";

import { clearActivity, listActivity, recordActivity } from "../activity";
import { boardStore } from "../storage";

describe("activity feed (Task 8.4)", () => {
  beforeEach(async () => {
    await clear(boardStore);
  });

  it("records an activity entry and persists to storage", async () => {
    const entry = await recordActivity({
      boardId: "board-1",
      boardName: "Architecture",
      kind: "create",
      summary: "Created board 'Architecture'",
    });

    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.kind).toBe("create");

    const list = await listActivity();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(entry.id);
    expect(list[0].summary).toBe("Created board 'Architecture'");
  });

  it("filters activity by boardId and limits results", async () => {
    await recordActivity({
      boardId: "board-1",
      kind: "update",
      summary: "Edit on board 1",
    });
    await recordActivity({
      boardId: "board-2",
      kind: "comment",
      summary: "Comment on board 2",
    });
    await recordActivity({
      boardId: "board-1",
      kind: "tag",
      summary: "Tag on board 1",
    });

    const board1Activities = await listActivity({ boardId: "board-1" });
    expect(board1Activities).toHaveLength(2);
    expect(board1Activities.every((a) => a.boardId === "board-1")).toBe(true);

    const limited = await listActivity({ limit: 1 });
    expect(limited).toHaveLength(1);
  });

  it("clears activity globally or for a specific board", async () => {
    await recordActivity({
      boardId: "board-1",
      kind: "create",
      summary: "First",
    });
    await recordActivity({
      boardId: "board-2",
      kind: "create",
      summary: "Second",
    });

    // Clear board-1 only
    await clearActivity("board-1");
    let all = await listActivity();
    expect(all).toHaveLength(1);
    expect(all[0].boardId).toBe("board-2");

    // Clear all
    await clearActivity();
    all = await listActivity();
    expect(all).toHaveLength(0);
  });
});
