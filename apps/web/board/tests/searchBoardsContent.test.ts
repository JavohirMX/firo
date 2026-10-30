/*
 * `searchBoardsContent`: the cross-board search behind the home's "Inside
 * boards" section. fake-indexeddb, same reasoning as `library.test.ts`.
 * Fixtures are plain payloads written through `writeBoardPayload` and loaded
 * by the real schema repair path, so a shape the loader rejects shows up here
 * as a missing match, not a green test against a fantasy shape.
 */
import "fake-indexeddb/auto";

import { clear } from "idb-keyval";

import {
  boardStore,
  DEFAULT_BOARD_ID,
  setActiveBoardId,
  writeBoardPayload,
} from "../storage";
import {
  createBlankBoard,
  listBoards,
  putBoardMeta,
  trashBoard,
} from "../library";
import { searchBoardsContent } from "../search";

beforeEach(async () => {
  await clear(boardStore);
  setActiveBoardId(DEFAULT_BOARD_ID);
});

/** A valid sticky note element, shaped after the schema fixtures. */
const stickyNote = (id: string, text: string, tags?: string[]) => ({
  id,
  type: "stickynote",
  text,
  fontSize: 20,
  fontFamily: 6,
  textAlign: "left",
  verticalAlign: "top",
  isContainer: false,
  x: 40,
  y: 60,
  width: 200,
  height: 200,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "#fff9b1",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roundness: null,
  roughness: 1,
  opacity: 100,
  version: 3,
  versionNonce: 112233,
  index: "a0",
  created: 1750000000000,
  updated: 1750000005000,
  groupIds: [],
  frameId: null,
  containerId: null,
  bindings: [],
  link: null,
  locked: false,
  isDeleted: false,
  ...(tags ? { tags } : {}),
});

const textElement = (id: string, text: string) => ({
  ...stickyNote(id, text),
  type: "text",
});

const boardWith = async (name: string, payload: object, tags?: string[]) => {
  const meta = await createBlankBoard(name);
  if (tags) {
    await putBoardMeta({ id: meta.id, tags });
  }
  await writeBoardPayload(meta.id, JSON.stringify(payload));
  return meta;
};

describe("searchBoardsContent", () => {
  it("returns nothing for an empty or whitespace query", async () => {
    await boardWith("Roadmap", { elements: [stickyNote("e1", "roadmap")] });
    expect(await searchBoardsContent("")).toEqual([]);
    expect(await searchBoardsContent("   ")).toEqual([]);
  });

  it("matches a board title case-insensitively", async () => {
    const meta = await boardWith("Quarterly Roadmap", {});
    const matches = await searchBoardsContent("quarterly");
    expect(matches).toEqual([
      {
        boardId: meta.id,
        boardName: "Quarterly Roadmap",
        snippet: "Quarterly Roadmap",
        matchType: "title",
      },
    ]);
  });

  it("excludes trashed boards even when the title matches", async () => {
    const meta = await boardWith("Quarterly Roadmap", {});
    await trashBoard(meta.id);
    expect(await searchBoardsContent("quarterly")).toEqual([]);
  });

  it("reports a board tag once even when several tags match", async () => {
    const meta = await boardWith("Board", {}, [
      "roadmap-2026",
      "roadmap-archive",
    ]);
    const matches = await searchBoardsContent("roadmap");
    expect(matches).toEqual([
      {
        boardId: meta.id,
        boardName: "Board",
        snippet: "Board tag: #roadmap-2026",
        matchType: "tag",
      },
    ]);
  });

  it("matches sticky note text with a snippet", async () => {
    const meta = await boardWith("Board", {
      elements: [stickyNote("e1", "Ship the roadmap review")],
    });
    const matches = await searchBoardsContent("roadmap");
    expect(matches).toEqual([
      {
        boardId: meta.id,
        boardName: "Board",
        snippet: "Ship the roadmap review",
        matchType: "stickynote",
      },
    ]);
  });

  it("matches plain text elements as text, not sticky notes", async () => {
    const meta = await boardWith("Board", {
      elements: [textElement("e1", "Roadmap principles")],
    });
    const matches = await searchBoardsContent("roadmap");
    expect(matches).toEqual([
      expect.objectContaining({ boardId: meta.id, matchType: "text" }),
    ]);
  });

  it("matches an element tag", async () => {
    const meta = await boardWith("Board", {
      elements: [stickyNote("e1", "note", ["roadmap"])],
    });
    const matches = await searchBoardsContent("roadmap");
    expect(matches).toEqual([
      {
        boardId: meta.id,
        boardName: "Board",
        snippet: "Tag: #roadmap",
        matchType: "tag",
      },
    ]);
  });

  it("matches a card field value once per record", async () => {
    const meta = await boardWith("Board", {
      records: [
        {
          id: "rec-1",
          collectionId: "col-1",
          values: {
            "col-a": { type: "text", value: "Roadmap kickoff" },
            "col-b": { type: "text", value: "Roadmap retro" },
          },
          created: 1,
          updated: 2,
          order: 1,
          archived: false,
        },
      ],
    });
    const matches = await searchBoardsContent("roadmap");
    expect(matches).toEqual([
      {
        boardId: meta.id,
        boardName: "Board",
        snippet: "Roadmap kickoff",
        matchType: "card",
      },
    ]);
  });

  it("matches rich text card fields through the ProseMirror doc", async () => {
    const meta = await boardWith("Board", {
      records: [
        {
          id: "rec-1",
          collectionId: "col-1",
          values: {
            "col-a": {
              type: "richText",
              value: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Roadmap narrative" }],
                  },
                ],
              },
            },
          },
          created: 1,
          updated: 2,
          order: 1,
          archived: false,
        },
      ],
    });
    const matches = await searchBoardsContent("roadmap");
    expect(matches).toEqual([
      {
        boardId: meta.id,
        boardName: "Board",
        snippet: "Roadmap narrative",
        matchType: "card",
      },
    ]);
  });

  it("matches every matching comment, not just the first", async () => {
    const meta = await boardWith("Board", {
      comments: [
        {
          id: "thread-1",
          elementId: "",
          anchor: { x: 0, y: 0 },
          comments: [
            { id: "c1", body: "roadmap looks good", author: "", createdAt: 1 },
            { id: "c2", body: "roadmap needs dates", author: "", createdAt: 2 },
          ],
          resolved: false,
          author: "",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    });
    const matches = await searchBoardsContent("roadmap");
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.matchType === "comment")).toBe(true);
    expect(matches.every((m) => m.boardId === meta.id)).toBe(true);
  });

  it("centers the snippet on the match with ellipses on both sides", async () => {
    const longText =
      "A very long note that rambles on about many topics before finally " +
      "mentioning the roadmap deep inside the text and then continuing " +
      "with even more words afterwards";
    const meta = await boardWith("Board", {
      elements: [stickyNote("e1", longText)],
    });
    const matches = await searchBoardsContent("roadmap");
    expect(matches).toHaveLength(1);
    expect(matches[0].snippet.startsWith("…")).toBe(true);
    expect(matches[0].snippet.endsWith("…")).toBe(true);
    expect(matches[0].snippet).toContain("roadmap");
    expect(meta.id).toBe(matches[0].boardId);
  });

  it("skips a board whose payload cannot be parsed, keeps the rest", async () => {
    const broken = await createBlankBoard("Broken");
    await writeBoardPayload(broken.id, "{not json");
    const good = await boardWith("Good", {
      elements: [stickyNote("e1", "roadmap note")],
    });
    const matches = await searchBoardsContent("roadmap");
    expect(matches).toEqual([
      expect.objectContaining({ boardId: good.id, matchType: "stickynote" }),
    ]);
  });

  it("aggregates matches across boards", async () => {
    const a = await boardWith("Alpha", {
      elements: [stickyNote("e1", "roadmap alpha")],
    });
    const b = await boardWith("Beta", {
      elements: [stickyNote("e2", "roadmap beta")],
    });
    const matches = await searchBoardsContent("roadmap");
    const byBoard = new Set(matches.map((m) => m.boardId));
    expect(byBoard).toEqual(new Set([a.id, b.id]));
    // sanity: the listing really holds both boards
    expect((await listBoards()).map((x) => x.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });
});
