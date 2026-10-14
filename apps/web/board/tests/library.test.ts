/*
 * The board library.
 *
 * ## What is actually at stake
 *
 * Before this, the app had one board under one key. Giving it a *list* is the
 * change that can lose work silently: a bug in the key scheme writes board B's
 * bytes over board A's, and the only symptom is a board that looks empty. So the
 * tests below spend their effort on the two things that must hold:
 *
 * 1. **The default board's key is unchanged.** Every browser that used Firo
 *    before the home exists holds its board under `autosave`. If that string
 *    moves, that board disappears on next open.
 * 2. **Boards are isolated.** Creating, renaming, trashing and deleting one
 *    board must not touch another's metadata or bytes.
 *
 * ## Why IndexedDB is faked
 *
 * Same reason as `storage.test.ts`: jsdom has none, and the failure this guards
 * against is the storage layer's own behaviour, which a hand-written mock would
 * not reproduce.
 */
import "fake-indexeddb/auto";

import { clear, get } from "idb-keyval";

import { createFiroDoc } from "@firo/doc";
import { loadBoard } from "@firo/schema";
import { createStickyNote } from "@firo/board";

import {
  boardStore,
  DEFAULT_BOARD_ID,
  readBoardPayload,
  restoreBoard,
  saveBoard,
  setActiveBoardId,
  writeBoardPayload,
} from "../storage";
import {
  createBlankBoard,
  createBoard,
  createBoardFromTemplate,
  deleteBoardForever,
  formatLastOpened,
  getBoardMeta,
  listBoards,
  openBoard,
  openBoardById,
  putBoardMeta,
  renameBoard,
  resolveInitialBoard,
  restoreTrashedBoard,
  setActiveBoard,
  trashBoard,
} from "../library";
import { templateById } from "../templates";

beforeEach(async () => {
  // The whole store, not just one key: this file writes the index as well as
  // payloads, and a leftover index would make `listBoards` lie.
  await clear(boardStore);
  setActiveBoardId(DEFAULT_BOARD_ID);
});

describe("the board index", () => {
  it("lists boards most recently opened first", async () => {
    await putBoardMeta({ id: "a", name: "A", lastOpened: 100 });
    await putBoardMeta({ id: "b", name: "B", lastOpened: 300 });
    await putBoardMeta({ id: "c", name: "C", lastOpened: 200 });

    expect((await listBoards()).map((board) => board.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("keeps fields a partial update does not mention", async () => {
    await putBoardMeta({ id: "a", name: "A", tags: ["x"], lastOpened: 100 });
    await putBoardMeta({ id: "a", name: "Renamed" });

    const meta = await getBoardMeta("a");
    expect(meta?.tags).toEqual(["x"]);
    expect(meta?.lastOpened).toBe(100);
    expect(meta?.name).toBe("Renamed");
  });

  it("touches lastOpened when a board is opened", async () => {
    await putBoardMeta({ id: "a", name: "A", lastOpened: 100 });
    const opened = await openBoard("a");
    expect(opened?.lastOpened).toBeGreaterThan(100);
  });

  it("names a renamed board, and ignores an empty name", async () => {
    await putBoardMeta({ id: "a", name: "A" });
    await renameBoard("a", "  New name  ");
    expect((await getBoardMeta("a"))?.name).toBe("New name");

    await renameBoard("a", "   ");
    expect((await getBoardMeta("a"))?.name).toBe("New name");
  });

  it("moves a board to the trash and back, with tags intact", async () => {
    await putBoardMeta({ id: "a", name: "A", tags: ["keep"] });

    await trashBoard("a");
    expect((await getBoardMeta("a"))?.trashedAt).toBeGreaterThan(0);

    await restoreTrashedBoard("a");
    const meta = await getBoardMeta("a");
    expect(meta?.trashedAt).toBeUndefined();
    expect(meta?.tags).toEqual(["keep"]);
  });
});

describe("the key scheme", () => {
  it("keeps the default board under the original key", async () => {
    // The regression that matters most: a board saved before the home existed
    // must still be found.
    await writeBoardPayload(DEFAULT_BOARD_ID, "{}");
    expect(await get("autosave", boardStore)).toBe("{}");
    expect(await get("autosave:default", boardStore)).toBeUndefined();
  });

  it("namespaces every other board's bytes", async () => {
    await writeBoardPayload("abc", "payload");
    expect(await get("autosave:abc", boardStore)).toBe("payload");
    expect(await get("autosave", boardStore)).toBeUndefined();
  });
});

describe("creating boards", () => {
  it("creates a blank board with a document that names itself", async () => {
    const meta = await createBlankBoard();

    const payload = await readBoardPayload(meta.id);
    expect(payload).toBeDefined();
    expect(loadBoard(JSON.parse(payload as string)).meta.id).toBe(meta.id);
  });

  it("creates a board from a template with the template's notes", async () => {
    const template = templateById("retrospective");
    expect(template).toBeDefined();

    const meta = await createBoardFromTemplate(template!);

    const payload = await readBoardPayload(meta.id);
    const loaded = loadBoard(JSON.parse(payload as string));
    expect(loaded.elements).toHaveLength(template!.build().length);
    // The library slot and the document identity are the same string, so an
    // export's manifest names the board the URL named.
    expect(loaded.meta.id).toBe(meta.id);
    expect(meta.tags).toEqual(template!.tags);
  });

  it("does not put one board's bytes behind another's key", async () => {
    const first = await createBlankBoard();
    const second = await createBlankBoard();

    expect(first.id).not.toBe(second.id);
    expect(await readBoardPayload(first.id)).toBeDefined();
    expect(await readBoardPayload(second.id)).toBeDefined();
  });

  it("stores a provided payload without touching the active board", async () => {
    setActiveBoardId("active");
    await createBoard({ id: "new", name: "New", payload: "bytes" });

    expect(await readBoardPayload("new")).toBe("bytes");
    expect(await readBoardPayload("active")).toBeUndefined();
  });
});

describe("deleting a board", () => {
  it("removes the metadata and the bytes, and leaves others alone", async () => {
    const doomed = await createBlankBoard();
    const kept = await createBlankBoard();

    await deleteBoardForever(doomed.id);

    expect(await getBoardMeta(doomed.id)).toBeUndefined();
    expect(await readBoardPayload(doomed.id)).toBeUndefined();
    expect(await getBoardMeta(kept.id)).toBeDefined();
    expect(await readBoardPayload(kept.id)).toBeDefined();
  });
});

describe("resolving what to open", () => {
  it("resumes the most recently opened live board", async () => {
    await putBoardMeta({ id: "old", name: "Old", lastOpened: 100 });
    await putBoardMeta({ id: "new", name: "New", lastOpened: 200 });

    expect((await resolveInitialBoard())?.id).toBe("new");
  });

  it("skips a trashed board", async () => {
    await putBoardMeta({ id: "trashed", name: "T", lastOpened: 200 });
    await putBoardMeta({ id: "live", name: "L", lastOpened: 100 });
    await trashBoard("trashed");

    expect((await resolveInitialBoard())?.id).toBe("live");
  });

  it("adopts a board saved before the home existed", async () => {
    // An `autosave` record with no index entry: the pre-7.5 single board.
    await writeBoardPayload(DEFAULT_BOARD_ID, "{}");

    const meta = await resolveInitialBoard();
    expect(meta?.id).toBe(DEFAULT_BOARD_ID);
    // Adopted into the index, so it appears on the home from now on.
    expect(await getBoardMeta(DEFAULT_BOARD_ID)).toBeDefined();
  });

  it("returns null when there is nothing at all", async () => {
    expect(await resolveInitialBoard()).toBeNull();
  });
});

describe("opening a board by id", () => {
  it("returns a live board's metadata", async () => {
    await putBoardMeta({ id: "a", name: "A" });
    expect((await openBoardById("a"))?.id).toBe("a");
  });

  it("refuses a trashed board", async () => {
    await putBoardMeta({ id: "a", name: "A" });
    await trashBoard("a");
    expect(await openBoardById("a")).toBeNull();
  });

  it("refuses an id that names nothing", async () => {
    expect(await openBoardById("ghost")).toBeNull();
  });
});

describe("switching the active board", () => {
  it("routes the autosave to the active board's key", async () => {
    const meta = await createBlankBoard();
    setActiveBoard(meta);

    const doc = createFiroDoc();
    doc.commit([
      {
        kind: "createElement",
        element: createStickyNote({ id: "n1", x: 0, y: 0, text: "hello" }),
      },
    ]);
    await saveBoard(doc);

    const stored = await get(`autosave:${meta.id}`, boardStore);
    expect(typeof stored).toBe("string");

    const reopened = createFiroDoc();
    expect(await restoreBoard(reopened)).toEqual({
      status: "restored",
      elements: 1,
    });
  });
});

describe("formatLastOpened", () => {
  const now = 1_000_000_000_000;

  it("says 'just now' for the recent past", () => {
    expect(formatLastOpened(now - 5_000, now)).toBe("just now");
  });

  it("counts minutes, hours and days in the singular and plural", () => {
    expect(formatLastOpened(now - 60_000, now)).toBe("1 minute ago");
    expect(formatLastOpened(now - 2 * 60_000, now)).toBe("2 minutes ago");
    expect(formatLastOpened(now - 3 * 3_600_000, now)).toBe("3 hours ago");
    expect(formatLastOpened(now - 2 * 86_400_000, now)).toBe("2 days ago");
  });

  it("never reports a negative age for a clock that jumped", () => {
    expect(formatLastOpened(now + 5_000, now)).toBe("just now");
  });
});
