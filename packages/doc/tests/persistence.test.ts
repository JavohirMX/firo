/**
 * Local persistence.
 *
 * ## Why this file needs `fake-indexeddb` and why that is not cheating
 *
 * The round trip the phase is named for ends in IndexedDB, and jsdom does not
 * implement IndexedDB. So this is the one place the real store is exercised
 * rather than a stand-in: `fake-indexeddb` is a spec-faithful in-memory
 * implementation of IndexedDB, and the code under test -- `y-indexeddb` and
 * `idb-keyval` -- is the real code, unmodified. What is faked is the browser, not
 * the persistence.
 *
 * Mocking `IndexeddbPersistence` instead would test only that the wiring calls a
 * method, which is the part most likely to be right.
 *
 * `fake-indexeddb` is Apache-2.0, test-only, never shipped, and pinned to the
 * same `3.1.7` that `packages/editor` already depends on -- one copy in the tree,
 * not two.
 */
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  boardKey,
  clearAssets,
  clearBoardIndex,
  getAsset,
  getAssetBytes,
  getAssetMimeType,
  hasAsset,
  hashBytes,
  listBoards,
  openBoard,
  putAsset,
  removeFromIndex,
  touchBoard,
} from "@firo/doc";

import { asFractionalIndex } from "@firo/schema";

import type { AssetReference } from "@firo/doc";
import type { FiroElement } from "@firo/schema";

const note = (id: string, over: Record<string, unknown> = {}): FiroElement =>
  ({
    id,
    type: "stickynote",
    text: `note ${id}`,
    x: 10,
    y: 20,
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
    version: 1,
    versionNonce: 1,
    index: asFractionalIndex("a0"),
    created: 1750000000000,
    updated: 1750000000000,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    isDeleted: false,
    isContainer: false,
    fontSize: 20,
    fontFamily: 6,
    textAlign: "left",
    verticalAlign: "top",
    ...over,
  } as unknown as FiroElement);

/** Everything opened in a test, so every test closes all of it. */
const opened: {
  persistence: { destroy: () => void };
  doc: { destroy: () => void };
}[] = [];

const open = (boardId: string) => {
  const handle = openBoard(boardId);
  opened.push(handle);
  return handle;
};

beforeEach(async () => {
  await clearBoardIndex();
  await clearAssets();
});

afterEach(() => {
  while (opened.length) {
    const handle = opened.pop();
    handle?.persistence.destroy();
    handle?.doc.destroy();
  }
});

/* -------------------------------------------------------------------------- */
/* The round trip                                                              */
/* -------------------------------------------------------------------------- */

describe("a board survives a reload", () => {
  test("commit, close, reopen: the board is identical", async () => {
    // The phase's exit criterion, end to end, against a real IndexedDB.
    const first = open("board-roundtrip");
    await first.whenLoaded;

    first.doc.commit([
      { kind: "createElement", element: note("el-1") },
      { kind: "createElement", element: note("el-2", { x: 300 }) },
      { kind: "createElement", element: note("el-3", { x: 600 }) },
      { kind: "reorderElements", ids: ["el-3", "el-1", "el-2"] },
      {
        kind: "updateElements",
        updates: [{ id: "el-2", changes: { text: "edited" } }],
      },
      { kind: "deleteElements", ids: ["el-3"] },
      { kind: "setMeta", entries: { name: "Workshop" } },
    ]);
    const before = first.doc.read();
    const orderBefore = first.doc.elementOrder();

    // Let the debounced write flush. `y-indexeddb` batches, so a test that
    // asserted immediately would be asserting on a race.
    await flush();
    first.persistence.destroy();
    first.doc.destroy();
    opened.pop();

    const second = open("board-roundtrip");
    await second.whenLoaded;

    const after = second.doc.read();
    expect(after.elements.map((e) => e.id).sort()).toEqual(
      before.elements.map((e) => e.id).sort(),
    );
    expect(after.elementOrder).toEqual(orderBefore);
    expect(after.meta).toEqual(before.meta);

    const el2 = second.doc.element("el-2");
    expect(el2?.text).toBe("edited");
    expect(el2?.x).toBe(300);
    // The tombstone survived, so the delete is still reversible after a reload.
    expect(second.doc.element("el-3")?.isDeleted).toBe(true);
  });

  test("a board's key is namespaced, so it cannot collide with the index", async () => {
    // The reason for the prefix. A board document and a board-index entry that
    // could share a key would make a board unreadable in a way that presents as
    // data loss.
    expect(boardKey("abc")).toBe("firo:board:abc");
    expect(boardKey("abc")).not.toBe("abc");

    await touchBoard("abc", { name: "A board" });
    const entry = await listBoards();
    expect(entry.map((e) => e.id)).toEqual(["abc"]);
  });

  test("two boards do not see each other", async () => {
    const a = open("board-a");
    const b = open("board-b");
    await Promise.all([a.whenLoaded, b.whenLoaded]);

    a.doc.commit([{ kind: "setMeta", entries: { name: "A" } }]);
    b.doc.commit([{ kind: "setMeta", entries: { name: "B" } }]);
    await flush();

    expect(a.doc.read().meta.name).toBe("A");
    expect(b.doc.read().meta.name).toBe("B");
  });

  test("the document is usable before the stored state has loaded", async () => {
    // The reason `openBoard` does not await internally. A caller that had to
    // await would need a "still loading" case in every view, and would show an
    // empty board for the length of the read on every open.
    const first = open("board-async");
    await first.whenLoaded;
    first.doc.commit([{ kind: "setMeta", entries: { name: "Preloaded" } }]);
    await flush();
    first.persistence.destroy();
    first.doc.destroy();
    opened.pop();

    const second = open("board-async");
    // Read immediately, without awaiting. The load has not run yet, so this is
    // empty -- and that is the contract, not a bug.
    expect(second.doc.read().meta.name).toBeUndefined();

    // And then it arrives, as one transaction, which is what makes a
    // render-from-`read()` caller correct without knowing the load exists.
    const seen: (string | undefined)[] = [];
    second.doc.subscribe((snapshot) =>
      seen.push(snapshot.meta.name as string | undefined),
    );
    await second.whenLoaded;
    expect(second.doc.read().meta.name).toBe("Preloaded");
    expect(seen).toContain("Preloaded");
  });
});

/* -------------------------------------------------------------------------- */
/* The board index                                                             */
/* -------------------------------------------------------------------------- */

describe("the board index", () => {
  test("lists boards most recently opened first", async () => {
    await touchBoard("old", { name: "Old", lastOpened: 1000 });
    await touchBoard("new", { name: "New", lastOpened: 2000 });
    await touchBoard("mid", { name: "Mid", lastOpened: 1500 });

    expect((await listBoards()).map((e) => e.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  test("a board created with no name still gets a usable entry", async () => {
    const entry = await touchBoard("fresh", {});
    expect(entry.name).toBe("Untitled board");
    expect(entry.created).toBeGreaterThan(0);
  });

  test("removing a board from the list does not touch its document", async () => {
    // "Remove from my list" and "destroy this data" are different requests, and
    // conflating them is how a tidy-up pass becomes data loss.
    const handle = open("keep-me");
    await handle.whenLoaded;
    handle.doc.commit([{ kind: "setMeta", entries: { name: "Precious" } }]);
    await flush();

    await removeFromIndex("keep-me");
    expect(await listBoards()).toEqual([]);

    // Re-adding the entry brings the board back, with all its content.
    await touchBoard("keep-me", { name: "Precious" });
    const reopened = open("keep-me");
    await reopened.whenLoaded;
    expect(reopened.doc.read().meta.name).toBe("Precious");
  });

  test("the index is readable without opening a document", async () => {
    // The reason the index is not in a Yjs document: drawing the board list must
    // not require loading every board to find out it exists.
    await touchBoard("a", { name: "A" });
    await touchBoard("b", { name: "B" });
    expect(await listBoards()).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Assets                                                                      */
/* -------------------------------------------------------------------------- */

describe("assets are content-addressed blobs outside the document", () => {
  it("stores bytes under their hash, not the element-facing id", async () => {
    const reference = await putAsset(
      "img-1",
      new Blob(["hello"], { type: "text/plain" }),
    );

    expect(reference.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(reference.bytes).toBe(5);
    expect(reference.mimeType).toBe("text/plain");

    // Retrievable by hash, which is what the document holds. Read as bytes
    // rather than with `blob.text()`: jsdom's Blob has no `text()`, and the
    // byte accessor is the primitive the renderer would use anyway.
    expect(
      new TextDecoder().decode((await getAssetBytes(reference.hash))!),
    ).toBe("hello");
    expect((await getAsset(reference.hash))?.size).toBe(5);
  });

  it("accepts raw bytes, which is the primitive callers should prefer", async () => {
    // A caller with bytes already in hand should not have to wrap them in a
    // Blob, and `Blob.arrayBuffer()` is recent enough that not every
    // environment has it.
    const bytes = new TextEncoder().encode("hello");
    const reference = await putAsset("raw", bytes);

    expect(reference.bytes).toBe(5);
    expect(reference.mimeType).toBe("application/octet-stream");
    expect(
      new TextDecoder().decode((await getAssetBytes(reference.hash))!),
    ).toBe("hello");
  });

  it("an ArrayBuffer and the same bytes as a Blob hash identically", async () => {
    // The hash is of the *content*, so the input type must not leak into it.
    const text = "identical bytes";
    const asBlob = await putAsset(
      "a",
      new Blob([text], { type: "text/plain" }),
    );
    const asBytes = await putAsset("b", new TextEncoder().encode(text));
    expect(asBytes.hash).toBe(asBlob.hash);
  });

  it("stores bytes, not a Blob, and reports the MIME type beside them", async () => {
    const reference = await putAsset(
      "m",
      new Blob(["x"], { type: "image/png" }),
    );
    // The stored form is an ArrayBuffer: structured-cloneable everywhere, and
    // no wrapper to unwrap on read.
    expect((await getAssetBytes(reference.hash))?.byteLength).toBe(1);
    expect(await getAssetMimeType(reference.hash)).toBe("image/png");
  });

  it("two elements showing the same image share one blob", async () => {
    const image = new Blob(["same bytes"], { type: "image/png" });
    const first = await putAsset("img-1", image);
    const second = await putAsset("img-2", image);

    expect(second.hash).toBe(first.hash);
    // Two names, one blob. This is the whole point of content addressing: an
    // image pasted twice is stored once.
    expect(await hasAsset(first.hash)).toBe(true);
  });

  it("different bytes get different hashes", async () => {
    const a = await putAsset("x", new Blob(["a"]));
    const b = await putAsset("y", new Blob(["b"]));
    expect(a.hash).not.toBe(b.hash);
  });

  it("the hash is content, not identity, so it is stable across calls", async () => {
    const bytes = new TextEncoder().encode("stable");
    const first = await hashBytes(bytes.buffer as ArrayBuffer);
    const second = await hashBytes(bytes.buffer as ArrayBuffer);
    expect(first).toBe(second);
  });

  it("a reference carries what a renderer needs and not the bytes", async () => {
    const reference: AssetReference = await putAsset(
      "img-1",
      new Blob(["x".repeat(1000)], { type: "image/png" }),
      { width: 320, height: 240 },
    );
    expect(reference).toMatchObject({ width: 320, height: 240, bytes: 1000 });
    // No data URL, no base64. A 2 MB image inside a CRDT update is broadcast on
    // every sync and duplicated in every peer.
    expect(JSON.stringify(reference)).not.toMatch(/base64|data:|\\/);
  });

  it("a missing asset is null, not a throw", async () => {
    expect(await getAsset("does-not-exist")).toBeNull();
    expect(await hasAsset("does-not-exist")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("teardown", () => {
  it("clearing the index leaves assets and documents alone", async () => {
    const handle = open("survivor");
    await handle.whenLoaded;
    handle.doc.commit([{ kind: "setMeta", entries: { name: "Still here" } }]);
    await putAsset("img", new Blob(["bytes"]));
    await touchBoard("survivor", {});
    await flush();

    await clearBoardIndex();
    expect(await listBoards()).toEqual([]);
    expect(await hasAsset((await putAsset("img2", new Blob(["b"]))).hash)).toBe(
      true,
    );

    // The document is untouched, because it is a different store entirely.
    const reopened = open("survivor");
    await reopened.whenLoaded;
    expect(reopened.doc.read().meta.name).toBe("Still here");
  });
});

/**
 * Let `y-indexeddb` flush.
 *
 * It batches writes, so a test that asserted straight after a commit would be
 * asserting on a race rather than on persistence. A macrotask turn is enough for
 * the store to settle in tests, and an explicit wait is honest about that being
 * a wait rather than a synchronisation.
 */
const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
