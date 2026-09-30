/**
 * The board index and the asset store.
 *
 * Both are `idb-keyval` ([`ADR-0005`](../../../docs/adr/0005-indexeddb-via-idb-keyval.md)),
 * both are in their own database, and neither is in the Yjs document. The
 * reasons are different and worth keeping apart:
 *
 * - **The board index** is *discovery* data -- which boards exist, what they are
 *   called, when they were last opened. It has to be readable without opening a
 *   document, so putting it in one would mean loading every board to draw a list.
 * - **Assets** are *bytes*. A 2 MB image inside a CRDT update is broadcast on
 *   every sync and duplicated in every peer, and the CRDT's own efficiency is
 *   irrelevant next to that. The document holds a content-addressed reference.
 *
 * Neither is CRDT data, and putting either in the document would be the same
 * mistake in two directions.
 */
import { clear, createStore, del, entries, get, keys, set } from "idb-keyval";

import type { AssetReference } from "./mutations.js";

/** `idb-keyval` store for the board list. Distinct from the board documents. */
const boardIndexStore = createStore("firo-boards", "index");

/** `idb-keyval` store for asset blobs. Distinct from both of the above. */
const assetStore = createStore("firo-assets", "blobs");

/* -------------------------------------------------------------------------- */
/* The board index                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What the index knows about a board.
 *
 * Everything here is cheap to read for *every* board, because the list is drawn
 * from it without opening a document. Anything that would need a document to
 * answer -- how many elements, how large -- is deliberately absent.
 */
export type BoardIndexEntry = {
  id: string;
  name: string;
  /** epoch ms. Client wall-clock; not an ordering clock for merges. */
  created: number;
  /** epoch ms of the last open or the last commit we were told about. */
  lastOpened: number;
  /** A colour from the board palette, so the list needs no document. */
  color?: string;
  /** Thumbnail as a data URL, if one has been generated. Small by construction. */
  thumbnail?: string;
};

/**
 * Read the whole board list, most recently opened first.
 *
 * Sorted here rather than by an index key because "most recently opened" changes
 * on every open, and maintaining a sorted key list is a write amplification bug
 * waiting to happen. A board list is tens of entries, not thousands.
 */
export const listBoards = async (): Promise<BoardIndexEntry[]> => {
  const all = await entries<string, BoardIndexEntry>(boardIndexStore);
  return all
    .map(([, entry]) => entry)
    .filter((entry): entry is BoardIndexEntry => Boolean(entry && entry.id))
    .sort((a, b) => b.lastOpened - a.lastOpened);
};

export const getBoard = async (
  id: string,
): Promise<BoardIndexEntry | undefined> =>
  get<BoardIndexEntry>(id, boardIndexStore);

export const putBoard = async (entry: BoardIndexEntry): Promise<void> => {
  await set(entry.id, entry, boardIndexStore);
};

/**
 * Merge a patch into a board's index entry, creating it if absent.
 *
 * A read-modify-write, and therefore a race between two windows opening the same
 * board. The last writer wins on the fields it set, and because every field here
 * is either immutable-after-creation or a last-opened timestamp, losing a race
 * is harmless. It is called out because the same shape elsewhere in this package
 * *is* harmful, and the difference is worth knowing.
 */
export const touchBoard = async (
  id: string,
  patch: Partial<Omit<BoardIndexEntry, "id">>,
): Promise<BoardIndexEntry> => {
  const existing = (await getBoard(id)) ?? {
    id,
    name: "Untitled board",
    created: Date.now(),
    lastOpened: Date.now(),
  };
  const merged: BoardIndexEntry = { ...existing, ...patch, id };
  await set(id, merged, boardIndexStore);
  return merged;
};

/**
 * Forget a board in the index.
 *
 * ## The document is not deleted
 *
 * This removes the entry from the list. The board's IndexedDB document stays
 * where it is, and re-adding an entry with the same id brings it back with all
 * its content. That is a real decision, not an oversight: "remove from my list"
 * and "destroy this data" are different requests, and conflating them is how a
 * tidy-up pass becomes data loss. Destroying the document is `deleteBoardData`,
 * which is a separate, explicitly destructive call.
 */
export const removeFromIndex = async (id: string): Promise<void> => {
  await del(id, boardIndexStore);
};

/** Every board id currently in the index. */
export const listBoardIds = async (): Promise<string[]> =>
  keys<string>(boardIndexStore);

/* -------------------------------------------------------------------------- */
/* Assets                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A stored asset.
 *
 * Content-addressed: `hash` is derived from the bytes, so storing the same
 * image twice costs one blob. The `id` is the *element-facing* name, which is
 * what a board refers to; it is not the hash, because two elements showing the
 * same image should be able to carry different layout.
 */
export type StoredAsset = {
  id: string;
  hash: string;
  mimeType: string;
  bytes: number;
  blob: Blob;
};

/**
 * Hash bytes for content addressing.
 *
 * SHA-256 via WebCrypto, hex-encoded. WebCrypto is async, which is the right
 * shape for this: hashing a 4 MB image is not something to block a frame on, and
 * the await costs nothing next to the IndexedDB write that follows.
 */
export const hashBytes = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

/** Anything `putAsset` will accept as bytes. */
export type AssetData = Blob | ArrayBuffer | Uint8Array;

/**
 * What is actually written to IndexedDB under a hash.
 *
 * Raw bytes, not a `Blob`. Three reasons, in order of weight:
 *
 * 1. **It is the simplest thing that works.** An `ArrayBuffer` is
 *    structured-cloneable in every environment that has IndexedDB. A `Blob` is
 *    supported in every *browser* -- and being browser-only meant the asset path
 *    could not be tested at all, because jsdom's `Blob` and `fake-indexeddb`'s
 *    structured-clone implementation are from different realms and refuse each
 *    other's objects. An untestable path is a path that rots.
 * 2. **No wrapper to unwrap.** Reading gives bytes, which is what
 *    `createImageBitmap`, `new Image()` and a download link all want.
 * 3. **The MIME type belongs with the reference, not duplicated here** -- except
 *    that it costs nothing to keep it alongside, because reading a blob back
 *    needs it and a second lookup would be a second round trip.
 */
type AssetRecord = {
  bytes: ArrayBuffer;
  mimeType: string;
};

/**
 * Read bytes out of whatever the caller had.
 *
 * ## Why none of this uses `instanceof`
 *
 * `instanceof` is realm-local. An `ArrayBuffer` created in an iframe, a worker, or
 * a test environment is a perfectly good `ArrayBuffer` and is not
 * `instanceof ArrayBuffer` out here. Since Firo is explicitly meant to be
 * embeddable in an iframe and a shadow root
 * ([`../../../AGENTS.md`](../../../AGENTS.md)), a caller handing us bytes from
 * another realm would be told their `ArrayBuffer` is not one.
 *
 * So the checks are structural: `ArrayBuffer.isView` and the internal-slot brand
 * both work across realms, and a `Blob` is identified by the shape it is
 * required to have.
 *
 * ## Why `FileReader` and not `new Response(blob).arrayBuffer()`
 *
 * The `Response` route is tidier and was tried first. It is also silently wrong
 * in jsdom, which does not treat a jsdom `Blob` as body bytes: it produced a
 * 13-byte buffer for the 5-byte blob `"hello"` and hashed *every* asset
 * identically. A wrong hash is worse than no hash -- it deduplicates distinct
 * images into one, so the second image on a board is the first.
 *
 * `FileReader` is the older, uglier, universally implemented route, and it is
 * correct.
 */
const toArrayBuffer = async (data: AssetData): Promise<ArrayBuffer> => {
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength,
    ) as ArrayBuffer;
  }
  if (Object.prototype.toString.call(data) === "[object ArrayBuffer]") {
    return data as ArrayBuffer;
  }

  /*
   * A `Blob` by shape. `size`, `type` and `slice` are the three members every
   * Blob has and a Uint8Array does not.
   */
  const candidate = data as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  const looksLikeBlob =
    typeof candidate?.size === "number" &&
    typeof candidate?.type === "string" &&
    typeof candidate?.slice === "function";

  if (looksLikeBlob) {
    if (typeof candidate.arrayBuffer === "function") {
      return candidate.arrayBuffer();
    }
    if (typeof FileReader === "function") {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (result instanceof ArrayBuffer) {
            resolve(result);
          } else {
            reject(new TypeError("FileReader did not return an ArrayBuffer."));
          }
        };
        reader.onerror = () =>
          reject(reader.error ?? new Error("Could not read the Blob."));
        reader.readAsArrayBuffer(candidate);
      });
    }
    throw new TypeError(
      "This environment's Blob has no arrayBuffer() and no FileReader. " +
        "Pass an ArrayBuffer or Uint8Array instead.",
    );
  }

  throw new TypeError(
    `Assets must be a Blob, an ArrayBuffer or a Uint8Array; got ` +
      `${Object.prototype.toString.call(data)}.`,
  );
};

/**
 * Best-effort MIME type. Bytes have none, so they get the generic one.
 *
 * Shape-based rather than `instanceof Blob`, for the cross-reason reason
 * `toArrayBuffer` avoids it.
 */
const mimeTypeOf = (data: AssetData, fallback: string): string => {
  const candidate = data as Partial<Blob>;
  return typeof candidate?.type === "string" && candidate.type
    ? candidate.type
    : fallback;
};

/**
 * Store an asset, deduplicating by content hash.
 *
 * Returns a reference for the document. The bytes are stored under their *hash*,
 * never under the element-facing `id`, so two elements showing the same image
 * share one blob and deleting one element's reference does not delete the bytes
 * the other one needs.
 *
 * `id` is the *element-facing* name and is not persisted -- it exists so the
 * caller can tell two references apart. Two callers passing the same bytes and
 * different ids get one blob and two references to it.
 */
export const putAsset = async (
  id: string,
  data: AssetData,
  dimensions?: { width: number; height: number },
): Promise<AssetReference> => {
  void id; // not persisted; the hash is the key. See the note above.
  const buffer = await toArrayBuffer(data);
  const hash = await hashBytes(buffer);

  // Content-addressed write. Storing under a hash that is already present would
  // write the same bytes again for nothing, so it is checked first.
  const mimeType = mimeTypeOf(data, "application/octet-stream");
  const existing = await get<AssetRecord>(hash, assetStore);
  if (existing === undefined) {
    await set(hash, { bytes: buffer, mimeType }, assetStore);
  }

  return {
    hash,
    mimeType,
    bytes: buffer.byteLength,
    ...(dimensions ?? {}),
  };
};

/**
 * Fetch the raw bytes for a hash, or null.
 *
 * The primitive the other accessors are built on. A board with 200 images wants
 * this, not 200 constructed `Blob`s it will immediately read back.
 */
export const getAssetBytes = async (
  hash: string,
): Promise<ArrayBuffer | null> => {
  const record = await get<AssetRecord>(hash, assetStore);
  return record ? record.bytes : null;
};

/** The stored MIME type for a hash, or null. */
export const getAssetMimeType = async (
  hash: string,
): Promise<string | null> => {
  const record = await get<AssetRecord>(hash, assetStore);
  return record ? record.mimeType : null;
};

/**
 * Fetch an asset as a `Blob`, or null.
 *
 * A convenience over `getAssetBytes`: the stored form is bytes, and this builds
 * the wrapper on demand rather than on every read.
 */
export const getAsset = async (hash: string): Promise<Blob | null> => {
  const record = await get<AssetRecord>(hash, assetStore);
  return record ? new Blob([record.bytes], { type: record.mimeType }) : null;
};

/**
 * Whether a hash is stored.
 *
 * Separate from `getAsset` so a caller can check availability without holding a
 * multi-megabyte blob in memory, which is the common case: a board with 200
 * images does not want all 200 decoded to decide what to render.
 */
export const hasAsset = async (hash: string): Promise<boolean> =>
  (await get(hash, assetStore)) !== undefined;

/* -------------------------------------------------------------------------- */
/* Destructive operations                                                      */
/* -------------------------------------------------------------------------- */

/** Erase the board index. Does not touch board documents or assets. */
export const clearBoardIndex = async (): Promise<void> => {
  await clear(boardIndexStore);
};

/** Erase every stored asset. */
export const clearAssets = async (): Promise<void> => {
  await clear(assetStore);
};
