/**
 * Local persistence.
 *
 * ## What this is
 *
 * `y-indexeddb`, which is three lines, plus the parts it does not do: a key that
 * cannot collide with another store in the same origin, and a way to tell a
 * stored copy from a stale one.
 *
 * ## Why persistence is not a provider
 *
 * `IndexeddbPersistence` is local and only local. It satisfies the local-first
 * requirement completely -- every change is on disk, the board works offline,
 * reopening is instant -- with no server. Adding sync in v2 is one more
 * subscription plus a server; that is the entire argument for choosing Yjs in v1
 * ([`../../../docs/trd/03-crdt-and-sync.md`](../../../docs/trd/03-crdt-and-sync.md)).
 */
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

import { FiroDoc as FiroDocClass } from "./doc.js";

import { REMOTE_ORIGIN } from "./origin.js";

import type { FiroDoc } from "./doc.js";
import type { BoardImport } from "./doc.js";

/**
 * Namespaced IndexedDB key for a board's document.
 *
 * The prefix matters more than it looks. The board *index* and the *asset store*
 * use their own `idb-keyval` databases, and a key that could collide with either
 * would make a board unreadable in a way that presents as data loss. Every key in
 * this package carries a distinct prefix for that reason.
 */
export const boardKey = (boardId: string): string => `firo:board:${boardId}`;

export type BoardPersistence = {
  /** The `y-indexeddb` handle. Call `destroy()` to detach. */
  persistence: IndexeddbPersistence;
  /** The document. Valid immediately; the stored state may still be arriving. */
  doc: FiroDoc;
  /**
   * Resolves once the stored state has been applied.
   *
   * Needed for the things that genuinely must wait: whether the board has ever
   * been saved, the board list's ordering, and the first-run-versus-returning
   * distinction.
   */
  whenLoaded: Promise<IndexeddbPersistence>;
};

/**
 * Open a board, restoring it from IndexedDB if it is there.
 *
 * ## Why the document is returned before the stored state is applied
 *
 * A caller that awaited the load would show an empty board for the length of the
 * read, on every open, and would need a "still loading" case in every view. Yjs
 * applies the stored update as a single transaction when it arrives, which fires
 * `subscribe` listeners, so a caller that renders from `read()` and re-renders on
 * `subscribe` is correct without knowing the load exists.
 *
 * ## Why `openBoardMemory` is a separate function
 *
 * A boolean flag on `openBoard` is a flag someone forgets to pass, and the
 * failure is a board that silently vanishes on reload -- which looks exactly like
 * data loss. A separate constructor cannot be called by accident.
 */
export const openBoard = (boardId: string): BoardPersistence => {
  const ydoc = new Y.Doc();
  const doc = new FiroDocClass(ydoc);
  /*
   * The provider gets the *raw* document, deliberately. `y-indexeddb` opens its
   * transactions with no origin at all -- it applies stored updates under
   * `Y.transact(doc, fn)`, whose origin defaults to null -- so handing it the
   * guarded view would refuse every restore. It is inside this package, it only
   * reads and applies, and it is the one place a raw reference is intended.
   */
  const persistence = new IndexeddbPersistence(boardKey(boardId), ydoc);

  return {
    persistence,
    doc,
    whenLoaded: persistence.whenSynced,
  };
};

/**
 * A board that is not persisted.
 *
 * For a preview, a test, and a scratch board that should not appear in the list.
 */
export const openBoardMemory = (): FiroDoc => {
  const ydoc = new Y.Doc();
  return new FiroDocClass(ydoc);
};

/**
 * Replace a document's contents with a validated board.
 *
 * Thin by design: validation belongs to `@firo/schema` and must happen *before*
 * anything reaches the document, because a file from a newer version has to be
 * refused with nothing written. So the caller runs `loadBoard` and passes the
 * result; this only puts it into Yjs.
 *
 * Existing content is not cleared first. A load into a non-empty document merges,
 * and `FiroDoc.load` is the operation that knows about `LOAD_ORIGIN` and about
 * what a load is not allowed to do to the undo stack. Opening a board for a fresh
 * load gives an empty document, which is the case this is written for.
 */
export const loadInto = (doc: FiroDoc, board: BoardImport): void => {
  doc.load(board);
};

/**
 * Apply an update from a peer.
 *
 * Exists so the v2 provider path has one place that tags the origin. Applying a
 * remote update with no origin would be refused by the write guard -- the guard
 * cannot tell an untagged apply from a stray local write, and loosening it to
 * allow untagged applies would remove the only thing it protects.
 */
export const applyRemoteUpdate = (doc: FiroDoc, update: Uint8Array): void => {
  // Through `rawYdoc` because `Y.applyUpdate` is a free function, not a method:
  // it will open a transaction on whatever document it is given, and the origin
  // we pass is what keeps the guard satisfied.
  Y.applyUpdate(doc.rawYdoc, update, REMOTE_ORIGIN);
};
