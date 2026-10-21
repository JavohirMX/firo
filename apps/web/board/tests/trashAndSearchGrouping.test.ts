/*
 * `emptyTrash` and `groupContentMatches`: the two app-side pieces behind the
 * home's trash upkeep and its "Inside boards" section. Same fake-indexeddb
 * reasoning as `library.test.ts`.
 */
import "fake-indexeddb/auto";

import { clear } from "idb-keyval";

import {
  boardStore,
  DEFAULT_BOARD_ID,
  hasBoardPayload,
  readBoardPayload,
  setActiveBoardId,
} from "../storage";
import {
  createBlankBoard,
  emptyTrash,
  getBoardMeta,
  listBoards,
  putBoardMeta,
  trashBoard,
} from "../library";
import { groupContentMatches } from "../search";

beforeEach(async () => {
  await clear(boardStore);
  setActiveBoardId(DEFAULT_BOARD_ID);
});

describe("emptyTrash", () => {
  it("deletes every trashed board's metadata and bytes, and only those", async () => {
    const keep = await createBlankBoard("Keep me");
    const gone1 = await createBlankBoard("Old one");
    const gone2 = await createBlankBoard("Old two");
    await trashBoard(gone1.id);
    await trashBoard(gone2.id);
    expect(await hasBoardPayload(gone1.id)).toBe(true);

    const deleted = await emptyTrash();
    expect(deleted).toBe(2);

    const remaining = await listBoards();
    expect(remaining.map((b) => b.id)).toEqual([keep.id]);
    expect(await hasBoardPayload(gone1.id)).toBe(false);
    expect(await hasBoardPayload(gone2.id)).toBe(false);
    expect(await readBoardPayload(keep.id)).toBeTruthy();
  });

  it("is a no-op on an empty trash", async () => {
    await putBoardMeta({ id: "a", name: "A" });
    expect(await emptyTrash()).toBe(0);
    expect(await getBoardMeta("a")).toBeDefined();
  });
});

describe("groupContentMatches", () => {
  it("keeps one row per board and counts the rest", () => {
    const grouped = groupContentMatches([
      {
        boardId: "a",
        boardName: "Alpha",
        snippet: "first hit",
        matchType: "stickynote",
      },
      {
        boardId: "a",
        boardName: "Alpha",
        snippet: "second hit",
        matchType: "comment",
      },
      {
        boardId: "b",
        boardName: "Beta",
        snippet: "only hit",
        matchType: "text",
      },
    ]);

    expect(grouped).toEqual([
      {
        boardId: "a",
        boardName: "Alpha",
        snippet: "first hit",
        matchType: "stickynote",
        matchCount: 2,
      },
      {
        boardId: "b",
        boardName: "Beta",
        snippet: "only hit",
        matchType: "text",
        matchCount: 1,
      },
    ]);
  });

  it("drops title and tag matches, which the grid already shows", () => {
    const grouped = groupContentMatches([
      {
        boardId: "a",
        boardName: "Alpha",
        snippet: "Alpha",
        matchType: "title",
      },
      {
        boardId: "a",
        boardName: "Alpha",
        snippet: "Board tag: #x",
        matchType: "tag",
      },
    ]);
    expect(grouped).toEqual([]);
  });
});
