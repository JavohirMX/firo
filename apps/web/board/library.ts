/**
 * The board home's data: which boards exist, and what each one is.
 *
 * ## Why this is not `@firo/doc`'s board index
 *
 * [`@firo/doc`](../../../packages/doc/src/library.ts) already has a board index
 * and a `listBoards()`. The app does not use it, and this module does not either,
 * for the reason the autosave does not use `openBoard`: the app persists each
 * board as a JSON snapshot in `./storage.ts` ([ADR-0005](../../../docs/adr/0005-indexeddb-via-idb-keyval.md),
 * [ADR-0018](../../../docs/adr/0018-a-firo-is-a-directory.md) clause 9), not as a
 * `y-indexeddb` update log. The doc package's index names boards whose documents
 * live in a *different* store under a *different* key scheme; listing it to draw
 * the home would offer boards that have no bytes behind them. So the index that
 * is drawn is the index of the store the documents are actually in, and it is
 * kept here.
 *
 * The divergence is real and is recorded rather than hidden: two board indexes
 * exist in the tree, and only this one is wired.
 *
 * ## How it is stored
 *
 * The index is a single record under one key, not one key per board. One key
 * per board would let `listBoards` scan with `entries`, but `entries` reads the
 * *values* too — and the values in this store include every board's full
 * document. Listing boards would then deserialize every board to draw a list of
 * names. One small record costs a read-modify-write on every change, which for a
 * single-person local-first app in v1 is the right trade; the concurrent-write
 * race it accepts is the same one `@firo/doc`'s `touchBoard` accepts and
 * documents.
 */

import { createFiroDoc } from "@firo/doc";
import { mintBoardId } from "@firo/board";
import { randomId } from "@firo/common";
import { get, set } from "idb-keyval";
import { loadBoard, serializeBoard } from "@firo/schema";

import {
  boardStore,
  DEFAULT_BOARD_ID,
  deleteBoardPayload,
  hasBoardPayload,
  readBoardPayload,
  setActiveBoardId,
  writeBoardPayload,
} from "./storage";

import type { BoardTemplate } from "./templates";

/** The store key the board index lives under. Not a board's payload key. */
const INDEX_KEY = "board-index";

/** The store key folders are saved under. */
const FOLDERS_KEY = "board-folders";

export interface BoardFolder {
  id: string;
  name: string;
  color?: string;
  created: number;
}

/** What the home needs to know about a board, and nothing more. */
export interface BoardMeta {
  id: string;
  name: string;
  /** Free-form labels. Minimal on purpose — filtering, not a taxonomy. */
  tags: string[];
  /** epoch ms. */
  created: number;
  /** epoch ms. Recents is this, sorted. */
  lastOpened: number;
  /** Accent for the thumbnail placeholder, when there is no real thumbnail. */
  color?: string;
  /** A rendered preview, as a data URL, when one has been generated. */
  thumbnail?: string;
  /** epoch ms when moved to the trash; absent means the board is live. */
  trashedAt?: number;
  folderId?: string;
  starred?: boolean;
}

type BoardIndex = Record<string, BoardMeta>;

type BoardMetaInput = Pick<BoardMeta, "id"> & Partial<Omit<BoardMeta, "id">>;

/** True for a value that can be one index entry, not just "an object". */
const isMeta = (value: unknown): value is BoardMeta =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as BoardMeta).id === "string";

/**
 * Read the index, tolerating anything unreadable as "no boards".
 *
 * A home that throws is worse than a home that is momentarily empty: the second
 * is recoverable by reloading, and a corrupt index is not something the person
 * can act on anyway. A write will replace it.
 */
const readIndex = async (): Promise<BoardIndex> => {
  let raw: unknown;
  try {
    raw = await get(INDEX_KEY, boardStore);
  } catch {
    return {};
  }
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const index: BoardIndex = {};
  for (const [id, meta] of Object.entries(raw as Record<string, unknown>)) {
    if (isMeta(meta) && id === meta.id) {
      index[id] = { ...meta, tags: meta.tags ?? [] };
    }
  }
  return index;
};

const writeIndex = async (index: BoardIndex): Promise<void> => {
  await set(INDEX_KEY, index, boardStore);
};

/**
 * Insert or update one board's metadata.
 *
 * Fields that are absent from `input` are kept from the existing entry rather
 * than defaulted, so a caller that only means to rename a board does not also
 * reset its `lastOpened` to now.
 */
export const putBoardMeta = async (
  input: BoardMetaInput,
): Promise<BoardMeta> => {
  const index = await readIndex();
  const existing = index[input.id];
  const now = Date.now();
  const meta: BoardMeta = {
    ...existing,
    ...input,
    id: input.id,
    tags: input.tags ?? existing?.tags ?? [],
    created: input.created ?? existing?.created ?? now,
    lastOpened: input.lastOpened ?? existing?.lastOpened ?? now,
  };
  if ("folderId" in input && input.folderId === undefined) {
    delete meta.folderId;
  }
  index[meta.id] = meta;
  await writeIndex(index);
  return meta;
};

/** Every board, live and trashed, most recently opened first. */
export const listBoards = async (): Promise<BoardMeta[]> => {
  const index = await readIndex();
  return Object.values(index).sort((a, b) => b.lastOpened - a.lastOpened);
};

export const getBoardMeta = async (
  id: string,
): Promise<BoardMeta | undefined> => {
  const index = await readIndex();
  return index[id];
};

/** Mark a board as opened now, and return its metadata. */
export const openBoard = async (id: string): Promise<BoardMeta | undefined> => {
  const index = await readIndex();
  const meta = index[id];
  if (!meta) {
    return undefined;
  }
  meta.lastOpened = Date.now();
  index[id] = meta;
  await writeIndex(index);
  return meta;
};

export const renameBoard = async (
  id: string,
  name: string,
): Promise<BoardMeta | undefined> => {
  const trimmed = name.trim();
  if (!trimmed) {
    return getBoardMeta(id);
  }
  return putBoardMeta({ id, name: trimmed });
};

/** Move a board to the trash. Reversible; the bytes are untouched. */
export const trashBoard = async (id: string): Promise<void> => {
  await putBoardMeta({ id, trashedAt: Date.now() });
};

/** Bring a board back out of the trash. */
export const restoreTrashedBoard = async (id: string): Promise<void> => {
  const index = await readIndex();
  const meta = index[id];
  if (!meta) {
    return;
  }
  delete meta.trashedAt;
  index[id] = meta;
  await writeIndex(index);
};

export const toggleStarBoard = async (
  boardId: string,
  starred?: boolean,
): Promise<BoardMeta> => {
  const meta = await getBoardMeta(boardId);
  const nextStarred = starred !== undefined ? starred : !meta?.starred;
  return putBoardMeta({ id: boardId, starred: nextStarred });
};

export const listFolders = async (): Promise<BoardFolder[]> => {
  let raw: unknown;
  try {
    raw = await get(FOLDERS_KEY, boardStore);
  } catch {
    return [];
  }
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.filter((f): f is BoardFolder =>
      Boolean(f && typeof f.id === "string" && typeof f.name === "string"),
    );
  }
  if (typeof raw === "object") {
    return Object.values(raw as Record<string, BoardFolder>).filter(
      (f): f is BoardFolder =>
        Boolean(f && typeof f.id === "string" && typeof f.name === "string"),
    );
  }
  return [];
};

export const createFolder = async (
  name: string,
  color?: string,
): Promise<BoardFolder> => {
  const folders = await listFolders();
  const folder: BoardFolder = {
    id: randomId(),
    name: name.trim(),
    color,
    created: Date.now(),
  };
  await set(FOLDERS_KEY, [...folders, folder], boardStore);
  return folder;
};

export const renameFolder = async (
  id: string,
  name: string,
): Promise<BoardFolder | undefined> => {
  const trimmed = name.trim();
  const folders = await listFolders();
  if (!trimmed) {
    return folders.find((f) => f.id === id);
  }
  let updated: BoardFolder | undefined;
  const next = folders.map((f) => {
    if (f.id === id) {
      updated = { ...f, name: trimmed };
      return updated;
    }
    return f;
  });
  if (updated) {
    await set(FOLDERS_KEY, next, boardStore);
  }
  return updated;
};

export const deleteFolder = async (id: string): Promise<void> => {
  const folders = await listFolders();
  const next = folders.filter((f) => f.id !== id);
  await set(FOLDERS_KEY, next, boardStore);

  // Un-assign folderId from all boards that were in this folder
  const index = await readIndex();
  let changed = false;
  for (const meta of Object.values(index)) {
    if (meta.folderId === id) {
      delete meta.folderId;
      changed = true;
    }
  }
  if (changed) {
    await writeIndex(index);
  }
};

export const setBoardFolder = async (
  boardId: string,
  folderId?: string,
): Promise<BoardMeta> => {
  const index = await readIndex();
  const existing = index[boardId] ?? (await putBoardMeta({ id: boardId }));
  if (folderId) {
    existing.folderId = folderId;
  } else {
    delete existing.folderId;
  }
  index[boardId] = existing;
  await writeIndex(index);
  return existing;
};

/**
 * Delete a board's metadata **and** its document.
 *
 * The one operation here that destroys bytes, and the only reason it is separate
 * from `trashBoard`: the trash is the reversible half, and the two must not be
 * one function a caller can reach for by accident.
 */
export const deleteBoardForever = async (id: string): Promise<void> => {
  const index = await readIndex();
  delete index[id];
  await writeIndex(index);
  await deleteBoardPayload(id);
};

/**
 * Write a board's document and its index entry, for an id already decided.
 *
 * The id is required rather than minted here on purpose: it has to be stamped
 * *into the document* before the document is serialised, so the caller mints it
 * with `mintBoardId` and builds the payload around it. A board's library slot and
 * the identity it carries in its file are then the same string
 * ([`@firo/board` identity](../../../packages/board/src/identity.ts)); without
 * that, a board created from a template would answer to one id in the URL and
 * another in its votes and export manifest.
 */
export const createBoard = async ({
  id,
  name,
  tags = [],
  color,
  payload,
}: {
  id: string;
  name: string;
  tags?: string[];
  color?: string;
  payload?: string;
}): Promise<BoardMeta> => {
  if (payload !== undefined) {
    await writeBoardPayload(id, payload);
  }
  return putBoardMeta({ id, name, tags, color });
};

/**
 * Create a board from a curated template and return its metadata.
 *
 * The identity mutation comes from `mintBoardId` rather than being spelled out
 * here, so this commits the same `setMeta` the rest of the app uses — in the same
 * transaction as the template's elements, which is what makes a board's identity
 * and its first content one undo step rather than two.
 */
export const createBoardFromTemplate = async (
  template: BoardTemplate,
): Promise<BoardMeta> => {
  const { id, mutation } = mintBoardId();
  const doc = createFiroDoc();
  doc.commit([
    mutation,
    ...template
      .build()
      .map((element) => ({ kind: "createElement" as const, element })),
  ]);
  const payload = JSON.stringify(serializeBoard(doc.read()));
  return createBoard({
    id,
    name: template.name,
    tags: template.tags,
    color: template.color,
    payload,
  });
};

/** Create an empty board, with its identity already stamped. */
export const createBlankBoard = async (
  name = "Untitled board",
): Promise<BoardMeta> => {
  const { id, mutation } = mintBoardId();
  const doc = createFiroDoc();
  doc.commit([mutation]);
  const payload = JSON.stringify(serializeBoard(doc.read()));
  return createBoard({ id, name, payload });
};

/**
 * Duplicate an existing board.
 *
 * Loads the original board's payload, creates a new board with "(Copy)",
 * saves the cloned payload with the new board's id, copies tags and folderId,
 * and updates recents.
 */
export const duplicateBoard = async (boardId: string): Promise<BoardMeta> => {
  const original = await getBoardMeta(boardId);
  if (!original) {
    throw new Error(`Board not found: ${boardId}`);
  }
  const copyName = `${original.name} (Copy)`;
  const newBoard = await createBlankBoard(copyName);

  const rawPayload = await readBoardPayload(boardId);
  if (rawPayload) {
    try {
      const loaded = loadBoard(JSON.parse(rawPayload));
      const clonedPayload = JSON.stringify(
        serializeBoard({
          ...loaded,
          meta: { ...loaded.meta, id: newBoard.id },
        }),
      );
      await writeBoardPayload(newBoard.id, clonedPayload);
    } catch {
      // Keep blank payload if loading original failed
    }
  }

  const now = Date.now();
  return putBoardMeta({
    id: newBoard.id,
    name: copyName,
    tags: [...(original.tags ?? [])],
    folderId: original.folderId,
    color: original.color,
    lastOpened: now,
  });
};

/**
 * Resolve a `?board=<id>` to the board to open, or `null` for the home.
 *
 * The one board that can exist without an index entry is the default board
 * written before the home existed, so it is adopted on first sight rather than
 * being invisible until opened by hand. A trashed board resolves to `null`: the
 * trash is not a route.
 */
export const openBoardById = async (id: string): Promise<BoardMeta | null> => {
  const meta = await getBoardMeta(id);
  if (meta) {
    if (meta.trashedAt) {
      return null;
    }
    return (await openBoard(id)) ?? meta;
  }
  if (id === DEFAULT_BOARD_ID && (await hasBoardPayload(id))) {
    return putBoardMeta({ id, name: "Untitled board" });
  }
  return null;
};

/**
 * The board to open when the URL names none.
 *
 * "Resume the last board" is not a stored pointer: it is the most recently
 * opened live board, which is the head of the index's own ordering. A browser
 * with no index yet but an `autosave` record gets that board adopted instead of
 * being shown an empty home.
 */
export const resolveInitialBoard = async (): Promise<BoardMeta | null> => {
  const boards = await listBoards();
  const live = boards.find((board) => !board.trashedAt);
  if (live) {
    return (await openBoard(live.id)) ?? live;
  }
  return openBoardById(DEFAULT_BOARD_ID);
};

/**
 * The board this tab is showing, cached so the board menu can name it.
 *
 * Set once by whoever resolved the route, before the editor mounts — the same
 * lifetime rule as the active id in `./storage.ts`, and for the same reason.
 */
let activeBoard: BoardMeta | null = null;

export const setActiveBoard = (meta: BoardMeta): void => {
  activeBoard = meta;
  setActiveBoardId(meta.id);
};

export const getActiveBoard = (): BoardMeta | null => activeBoard;

/**
 * "2 days ago" for a board card.
 *
 * Hand-rolled rather than `Intl.RelativeTimeFormat` because the granularity is
 * coarse and the wording should not change with the machine's locale — a board
 * home that says "vor 2 Tagen" beside "Boards" is worse than one that is
 * consistently plain.
 */
export const formatLastOpened = (ms: number, now = Date.now()): string => {
  const diff = Math.max(0, now - ms);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return "just now";
  }
  if (diff < hour) {
    const minutes = Math.round(diff / minute);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (diff < day) {
    const hours = Math.round(diff / hour);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (diff < 30 * day) {
    const days = Math.round(diff / day);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  const months = Math.round(diff / (30 * day));
  return `${months} month${months === 1 ? "" : "s"} ago`;
};
