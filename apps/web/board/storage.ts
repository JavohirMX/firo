/**
 * Getting a board off the machine, and back onto it.
 *
 * ## Why this file exists
 *
 * The document is authoritative and saves nothing. `FiroDoc` is built at module
 * scope and lives until the tab closes, and nothing in `apps/web` ever wrote it out
 * — so a refresh lost every note, shape and stroke. The only reason a board seemed
 * to survive was Excalidraw's own `LocalData`, which stores a redundant copy of the
 * *editor's* elements. That is the thing the document model replaced, and relying on
 * it means the two can disagree with no one able to say which is right.
 *
 * ## Why IndexedDB, and why not `localStorage`
 *
 * Because [`ADR-0005`](../../../docs/adr/0005-indexeddb-via-idb-keyval.md) decided
 * it, having considered `localStorage` and rejected it on measurement rather than
 * taste: roughly 5–10 MB, and synchronous, so every write blocks the main thread.
 *
 * Both limits bite on the board this product is for. A two-hour workshop with a few
 * hundred images and thousands of elements does not fit in 5 MB, and the person it
 * fails for is the person we are building for. It was built here first anyway, which
 * is worth recording: the rejection was correct and it still looked like the obvious
 * choice, because `localStorage` is synchronous and this file's first draft needed
 * to restore before the canvas read the document. IndexedDB forces that to be
 * asynchronous, which is the better shape anyway — see below.
 *
 * `idb-keyval` is already a dependency of the fork (upstream uses it for files), so
 * this adds nothing to maintain.
 *
 * ## Why one path for autosave and for files
 *
 * Both use `serializeBoard` and `loadBoard`, the same functions, on the same JSON.
 * The autosave is not a second format that can drift from the file format, and a
 * board saved by one is readable by the other. It also means autosave exercises the
 * file path continuously, so a file that cannot be read back is discovered by the
 * next reload rather than by someone who needed their work.
 *
 * ## Why JSON and not the Yjs update log
 *
 * `Y.encodeStateAsUpdate` would be less code and would preserve the CRDT exactly.
 * It was not chosen. An update log is an opaque blob that cannot be read, diffed or
 * hand-repaired, and it grows with every tombstone — including the one that editing
 * a note's text creates on every keystroke session. A board file a person can open
 * in a text editor and understand is worth more here than perfect CRDT fidelity,
 * and the document is the source of truth anyway, so nothing is lost by writing its
 * *state* rather than its history.
 *
 * ## Why restoring is asynchronous, and why that is an improvement
 *
 * IndexedDB reads are async, so the document cannot be populated before the canvas
 * asks it for the board. The tempting fix is to restore in the background and let
 * the board appear a moment later — an empty canvas that fills in, which on a large
 * board looks exactly like the board was lost.
 *
 * It is not done that way. The editor already waits on a promise for its initial
 * scene, and the restore is awaited there, so the canvas is created with the board
 * already in it. The flash does not exist because nothing renders until the answer
 * arrives. That was only obvious once the storage layer stopped being synchronous,
 * which is an argument for the ADR and against the thing it replaced.
 */
import { createStore, del, get, set } from "idb-keyval";

import { loadBoard, serializeBoard } from "@firo/schema";

import type { FiroDoc } from "@firo/doc";

/**
 * Where the board is stored.
 *
 * A dedicated database and object store rather than Excalidraw's, deliberately: the
 * two hold the same board in different representations, and sharing a store would
 * let one overwrite the other with no way to tell which wrote last.
 *
 * `createStore` rather than a database name: `idb-keyval`'s convenience exports take
 * a `UseStore` handle, and building it once here means the database is opened once
 * for the module rather than per operation.
 *
 * Exported because "the same place the board lives" is a thing more than this module
 * needs: a future import-a-file path writes here too, and the tests have to poison it
 * with bytes `loadBoard` will refuse. Reaching into storage by name to do that would
 * put the key in two places, and the two would drift.
 */
export const boardStore = createStore("firo", "board");

/**
 * The key the one board Firo has always had was saved under.
 *
 * Kept as the *default* board's key, exactly as it was, rather than renamed to
 * `autosave:default`. That is deliberate: every browser that has used Firo
 * before the board home landed holds its board under this string, and renaming
 * it would present as an empty board on the next open — the silent-loss failure
 * the rest of this file exists to prevent. The default board's bytes are
 * unchanged; only *other* boards gained a key of their own.
 */
const KEY = "autosave";

/**
 * The id of the board a browser held before boards had ids.
 *
 * `?board` absent from the URL resolves to this, and this board's payload lives
 * under `autosave` rather than `autosave:default`, so an existing board opens
 * without a migration step.
 */
export const DEFAULT_BOARD_ID = "default";

/**
 * The board this tab is showing.
 *
 * Module scope, like the document in `./board.ts`, because the payload key is
 * derived from it and two callers disagreeing about which board is open would
 * write one board's bytes over another's. Set once, before the editor mounts and
 * therefore before the first autosave, by whoever resolved the route.
 *
 * Switching boards is a full reload in this slice, so this is never changed
 * after the editor exists. The `restoreFailed` flag below depends on that: it is
 * global to the module, so if boards could be switched in place a failure on one
 * would disarm the autosave of the next.
 */
let activeBoardId: string = DEFAULT_BOARD_ID;

export const setActiveBoardId = (id: string): void => {
  activeBoardId = id || DEFAULT_BOARD_ID;
};

export const getActiveBoardId = (): string => activeBoardId;

/**
 * The store key a board's serialised document lives under.
 *
 * The default board keeps the original `autosave` key; every other board is
 * namespaced. One function rather than the string built at each call site, so
 * the two can never disagree about which board a key names.
 */
const payloadKey = (id: string): string =>
  id === DEFAULT_BOARD_ID ? KEY : `${KEY}:${id}`;

/** What a save produced, so the caller can tell success from silent failure. */
export type SaveResult =
  | { ok: true; bytes: number }
  | { ok: false; reason: "unavailable" | "failed"; detail?: string };

/** Current status of the autosave, for the save indicator in the UI (AC-10). */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

let currentSaveStatus: SaveStatus = "idle";
const statusListeners = new Set<(status: SaveStatus) => void>();

export const getSaveStatus = (): SaveStatus => currentSaveStatus;

export const subscribeSaveStatus = (
  listener: (status: SaveStatus) => void,
): (() => void) => {
  statusListeners.add(listener);
  listener(currentSaveStatus);
  return () => {
    statusListeners.delete(listener);
  };
};

const notifySaveStatus = (status: SaveStatus): void => {
  currentSaveStatus = status;
  for (const listener of statusListeners) {
    listener(status);
  }
};

/** What a restore produced. `empty` is the ordinary first run. */
export type RestoreResult =
  | { status: "restored"; elements: number }
  | { status: "empty" }
  | { status: "failed"; detail: string };

/**
 * Set once a restore has failed, and cleared only by an explicit `clearSavedBoard`.
 *
 * This is the module's one piece of state, and it exists to stop the autosave from
 * destroying the only copy of someone's work.
 *
 * The sequence it prevents: a board is written, something makes it unreadable — a
 * newer Firo, a hand-edited file, a partial write — and the restore fails. The
 * document is now empty and looks exactly like a board nobody has drawn on. The next
 * autosave fires, serialises that empty document, and overwrites the stored board.
 * The original is gone, with no trace that it was ever there.
 *
 * So a failed restore disarms the autosave. The alternative — saving anyway and
 * hoping — trades a recoverable situation (an empty canvas, a warning, the bytes
 * still in storage) for an unrecoverable one.
 */
let restoreFailed = false;

/** Write the document out. Never rejects; a failed save is reported, not thrown. */
export const saveBoard = async (doc: FiroDoc): Promise<SaveResult> => {
  notifySaveStatus("saving");
  if (restoreFailed) {
    /*
     * Refuse only while there is something to destroy.
     *
     * The document in memory is not the person's board — it is an empty board that
     * replaced one we could not read — so writing it out would destroy the only copy.
     * But if nothing is stored any more there is nothing to destroy, and refusing
     * would leave the board permanently unsaveable over a failure that no longer
     * matters. Storage can be emptied by devtools, by another tab, or by eviction,
     * and none of those should leave someone unable to keep working.
     *
     * So the guard is about the stored bytes, not about the flag. The flag only
     * records that a restore failed; whether it still matters is decided from the
     * state that actually exists.
     */
    if ((await storedBoard()) !== undefined) {
      /*
       * Not `unavailable`: nothing is wrong with storage, and a caller reporting
       * this as "storage is broken" sends the reader looking in the wrong place.
       */
      notifySaveStatus("error");
      return {
        ok: false,
        reason: "unavailable",
        detail:
          "a previous restore failed, and the saved board is still there; " +
          "saving now would overwrite it with an empty document",
      };
    }
    restoreFailed = false;
  }

  let payload: string;
  try {
    payload = JSON.stringify(serializeBoard(doc.read()));
  } catch (error) {
    /*
     * A circular reference, or a value JSON cannot represent. Nothing can be done
     * about it here, and it must not reject into the editor's change handler — a
     * failed autosave is a nuisance, a rejected one is an unhandled rejection.
     */
    notifySaveStatus("error");
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    await set(payloadKey(activeBoardId), payload, boardStore);
  } catch (error) {
    notifySaveStatus("error");
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  notifySaveStatus("saved");
  return { ok: true, bytes: payload.length };
};

/**
 * Read a board back in.
 *
 * Never rejects. A restore is awaited while the canvas is being created, so anything
 * it throws becomes an exception before anything is on screen — the worst place for
 * one, and the one place where a blank canvas has no explanation.
 */
export const restoreBoard = async (doc: FiroDoc): Promise<RestoreResult> => {
  if (typeof navigator !== "undefined" && navigator.storage?.persist) {
    void navigator.storage.persist().catch(() => {});
  }
  let payload: string | undefined;
  try {
    payload = await storedBoard();
  } catch {
    // Storage itself is unreachable. Not the same as "nothing stored": a board may
    // well exist and simply not be readable right now, so the autosave is left
    // armed rather than disarmed on a transient error.
    return { status: "empty" };
  }

  if (payload === undefined) {
    // The ordinary first run. Not a failure, and it clears any earlier failure:
    // there is nothing stored, so nothing can be destroyed by saving over it.
    restoreFailed = false;
    return { status: "empty" };
  }

  let loaded: ReturnType<typeof loadBoard>;
  try {
    loaded = loadBoard(JSON.parse(payload));
  } catch (error) {
    restoreFailed = true;
    return {
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  /*
   * `loadBoard` repairs rather than rejects wherever it can, so a board with one bad
   * field loads with that field defaulted. Only a board it cannot read at all throws.
   */
  doc.load({
    elements: loaded.elements,
    collections: loaded.collections,
    records: loaded.records,
    comments: loaded.comments,
    elementOrder: loaded.elementOrder,
    meta: loaded.meta,
  });

  return { status: "restored", elements: loaded.elements.length };
};

/** The raw stored string, or `undefined` when nothing is stored. */
const storedBoard = (): Promise<string | undefined> =>
  get<string>(payloadKey(activeBoardId), boardStore) as Promise<
    string | undefined
  >;

/** Whether anything has been autosaved. Cheap, and safe to call before a restore. */
export const hasSavedBoard = async (): Promise<boolean> => {
  try {
    return (await storedBoard()) !== undefined;
  } catch {
    return false;
  }
};

/**
 * Forget the autosaved board, and re-arm the autosave.
 *
 * The only way out of a failed restore, and deliberately the only one: "start again"
 * has to be something a person decides to do, not something that happens because
 * they drew a shape after the failure.
 */
export const clearSavedBoard = async (): Promise<void> => {
  restoreFailed = false;
  try {
    await del(payloadKey(activeBoardId), boardStore);
  } catch {
    // A board that cannot be cleared is a nuisance.
  }
};

/**
 * Read a board's payload by id, without switching to it.
 *
 * For the board library (`./library.ts`), which has to answer "does this board
 * have a document?" and "copy this one" without changing the active board or
 * disturbing the autosave's failed-restore guard. Reading is not saving, so
 * this is free of that guard's concerns.
 */
export const readBoardPayload = async (
  id: string,
): Promise<string | undefined> =>
  get<string>(payloadKey(id), boardStore) as Promise<string | undefined>;

/** Whether a board has a stored document. The home uses it to skip empty ids. */
export const hasBoardPayload = async (id: string): Promise<boolean> => {
  try {
    return (await readBoardPayload(id)) !== undefined;
  } catch {
    return false;
  }
};

/**
 * Write a payload for a board by id, without switching to it.
 *
 * Used by the board home to create a board (from a template or blank) *before*
 * navigating to it. The navigated-to tab then restores it through the ordinary
 * autosave path, so creation and editing write the same bytes.
 */
export const writeBoardPayload = async (
  id: string,
  payload: string,
): Promise<void> => {
  await set(payloadKey(id), payload, boardStore);
};

/** Remove a board's document. The explicitly destructive half of delete. */
export const deleteBoardPayload = async (id: string): Promise<void> => {
  try {
    await del(payloadKey(id), boardStore);
  } catch {
    // A board that cannot be removed is a nuisance, and the index entry that
    // names it is removed by the caller either way.
  }
};

/**
 * Call `run` no more than once per `waitMs`, with the last call's arguments.
 *
 * Used for autosave. The document updates on every committed change, which during a
 * drag is several times a second, and serialising a whole board — every point of
 * every stroke — that often would put string-building on the hot path of drawing.
 *
 * A trailing call is always scheduled, so the last change in a burst is never the one
 * that gets dropped, which is the failure that loses the thing someone just did.
 */
export const debounce = <A extends unknown[]>(
  run: (...args: A) => void,
  waitMs: number,
): ((...args: A) => void) => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (...args: A) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      run(...args);
    }, waitMs);
  };
};
