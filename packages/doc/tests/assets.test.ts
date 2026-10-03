/**
 * Reading a board's assets.
 *
 * ADR-0018 called the absence of a reader a hard blocker on the `.firo`
 * directory format: the document has always held an assets map, and an exporter
 * cannot write `assets/<sha256>.<ext>` beside `board.json` without being able to
 * enumerate what a board needs. These tests cover the reader that closes it, plus
 * the one thing about it that is easy to break by accident.
 *
 * The easy-to-break thing is the cost. `read()` is called on every durable
 * transaction (via `notify()`) and `apps/web/board/board.ts` attaches a debounced
 * autosave to `doc.onUpdate`, so anything added to `read()` is charged to a
 * keystroke. The assets therefore read lazily, and the tests under "the cost" are
 * what keep that a decision rather than an intention.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as Y from "yjs";

import { openBoardMemory, readAllAssets, structure } from "@firo/doc";

import { asFractionalIndex, serializeBoard } from "@firo/schema";

import type { AssetReference, FiroDoc, Mutation } from "@firo/doc";
import type { ImageElement } from "@firo/schema";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** An image element. The fixture only needs the fields this file talks about. */
const image = (id: string, fileId: string): ImageElement =>
  ({
    id,
    type: "image",
    fileId,
    status: "saved",
    x: 0,
    y: 0,
    width: 120,
    height: 90,
    angle: 0,
    scale: [1, 1],
    crop: null,
    version: 1,
    versionNonce: 1,
    index: asFractionalIndex("a0"),
    created: 1750000000000,
    updated: 1750000000000,
    groupIds: [],
    frameId: null,
    containerId: null,
    isDeleted: false,
  } as unknown as ImageElement);

const setAsset = (
  id: string,
  over: Partial<AssetReference> = {},
): Mutation => ({
  kind: "setAsset",
  id,
  reference: {
    hash: `hash-${id}`,
    mimeType: "image/png",
    bytes: 1024,
    ...over,
  },
});

let doc: FiroDoc;

beforeEach(() => {
  doc = openBoardMemory();
});

afterEach(() => {
  doc.destroy();
});

/* -------------------------------------------------------------------------- */
/* The reader                                                                   */
/* -------------------------------------------------------------------------- */

describe("a board's assets are readable", () => {
  test("what setAsset wrote comes back", () => {
    doc.commit([
      { kind: "createElement", element: image("el-1", "file-1") },
      setAsset("file-1", { width: 120, height: 90 }),
    ]);

    expect(doc.readAssets()).toEqual({
      "file-1": {
        hash: "hash-file-1",
        mimeType: "image/png",
        bytes: 1024,
        width: 120,
        height: 90,
      },
    });
  });

  test("it is keyed by fileId, not by hash, so two ids on one image both appear", () => {
    // The same logo on 50 cards is stored once. That is deduplication, and it is
    // the *exporter's* job: it resolves two fileIds to one `assets/<sha256>.png`
    // path and records both in the manifest. A reader keyed by hash would have
    // collapsed them here and thrown away the fact the manifest exists to keep.
    doc.commit([
      setAsset("file-1", { hash: "same", bytes: 4096 }),
      setAsset("file-2", { hash: "same", bytes: 4096 }),
    ]);

    const assets = doc.readAssets();
    expect(Object.keys(assets).sort()).toEqual(["file-1", "file-2"]);
    expect(assets["file-1"].hash).toBe(assets["file-2"].hash);
  });

  test("a board with no assets reads as empty rather than undefined", () => {
    expect(doc.readAssets()).toEqual({});
    expect(doc.read().assets).toEqual({});
  });

  test("the optional dimensions are absent, not null, when they were not supplied", () => {
    // `null` is a meaningful stored value elsewhere in the document ("no link",
    // "no parent container"), so a reader that invented one here would be leaving
    // a caller to un-invent it. Absent is what absent means.
    doc.commit([setAsset("file-1")]);
    const reference = doc.readAssets()["file-1"];

    expect("width" in reference).toBe(false);
    expect("height" in reference).toBe(false);
    expect(reference.hash).toBe("hash-file-1");
  });

  test("removeAsset removes it from the reader", () => {
    doc.commit([setAsset("file-1"), setAsset("file-2")]);
    doc.commit([{ kind: "removeAsset", id: "file-1" }]);

    expect(Object.keys(doc.readAssets())).toEqual(["file-2"]);
  });

  test("an asset written under an id no element faces is still reported", () => {
    // Not this package's job to police. An asset reference outliving the element
    // that introduced it is what content addressing makes normal, and a reader
    // that dropped unreferenced assets would hand an exporter a manifest missing
    // bytes the board actually needs.
    doc.commit([setAsset("orphan")]);
    expect(doc.readAssets().orphan.hash).toBe("hash-orphan");
  });

  test("reading is not writing", () => {
    doc.commit([setAsset("file-1")]);
    const before = doc.durableUpdates;

    doc.readAssets();
    void doc.read().assets;
    doc.read();

    expect(doc.durableUpdates).toBe(before);
  });

  test("a node that is not a map reads as an empty entry rather than throwing", () => {
    // A read is the one operation that has to work in order for the reader to
    // *see* that something is wrong. A crash here would hide a malformed document
    // behind a stack trace, which is the opposite of what `fromYMap` exists for.
    doc.rawYdoc.getMap("assets").set("broken", 42 as never);

    expect(doc.readAssets()).toEqual({ broken: {} });
  });

  test("an asset reference is typed, not `any`", () => {
    doc.commit([setAsset("file-1", { width: 8 })]);

    // Both annotations are the assertion. If `readAssets()` returned
    // `Record<string, unknown>` these would not compile.
    const hash: string = doc.readAssets()["file-1"].hash;
    const width: number | undefined = doc.readAssets()["file-1"].width;

    expect(hash).toBe("hash-file-1");
    expect(width).toBe(8);
  });
});

/* -------------------------------------------------------------------------- */
/* The snapshot field                                                           */
/* -------------------------------------------------------------------------- */

describe("the snapshot exposes the assets", () => {
  test("snapshot.assets and readAssets() agree", () => {
    doc.commit([setAsset("file-1", { width: 10, height: 20 })]);

    expect(doc.read().assets).toEqual(doc.readAssets());
    expect(doc.read().assets["file-1"]).toEqual({
      hash: "hash-file-1",
      mimeType: "image/png",
      bytes: 1024,
      width: 10,
      height: 20,
    });
  });

  test("it is memoised: two accesses are one walk of the same object", () => {
    // Otherwise `snapshot.assets["a"]` followed by `snapshot.assets["b"]` walks
    // the map twice, and the lazy window documented on `read()` reopens.
    //
    // Asserted by counting the walks *and* by identity. The identity half uses
    // `Object.is` rather than `expect(x).toBe(x)` on purpose: this Vitest version
    // falls back to deep equality in `toBe`, so `toBe` would compare two
    // structurally identical objects and pass with the memoisation deleted --
    // which is exactly what a mutation run caught it doing.
    const spy = vi.spyOn(doc, "readAssets");
    doc.commit([setAsset("file-1")]);
    const snapshot = doc.read();

    const first = snapshot.assets;
    const second = snapshot.assets;

    expect(spy).toHaveBeenCalledTimes(1);
    expect(Object.is(first, second)).toBe(true);
    expect(second).toEqual({ "file-1": { ...first["file-1"] } });

    spy.mockRestore();
  });

  test("the first read fixes the value for that snapshot", () => {
    // A memo shared *across* snapshots would be the bug in the other direction:
    // an exporter would write the board it had rather than the one it has.
    doc.commit([setAsset("file-1")]);
    const before = doc.read();
    const assets = before.assets;

    doc.commit([setAsset("file-2")]);

    expect(Object.keys(assets)).toEqual(["file-1"]);
    // The same object, unchanged, even though the document has moved on.
    expect(Object.is(before.assets, assets)).toBe(true);
    // ...and a *new* snapshot sees the new state, which is the point of reading.
    expect(Object.keys(doc.read().assets).sort()).toEqual(["file-1", "file-2"]);
  });

  test("assets read after a later commit reflect that later commit", () => {
    // The one thing `read()` gives up, pinned rather than left to be discovered.
    //
    // `assets` is read on first access, so a snapshot whose `assets` nobody has
    // touched yet reports the document as of *that* access rather than as of
    // `read()`. It is a deliberate trade (see the note on `FiroDoc.read`) and the
    // failure is untidy rather than lossy: a manifest built this way names an
    // asset whose element is not in `board.json`, and the store is
    // content-addressed so the bytes it names are bytes already held.
    //
    // Pinned because a future contributor who cannot see it will not think about
    // it, and the alternative -- a snapshot that is quietly not a snapshot -- is
    // worse than a documented asymmetry.
    const snapshot = doc.read();
    doc.commit([setAsset("late")]);

    expect(Object.keys(snapshot.assets)).toEqual(["late"]);
  });

  test("a subscriber's snapshot carries the assets too", () => {
    // `notify()` builds the snapshot through `read()`, so the lazy field has to
    // survive that path -- otherwise the exporter would be the one consumer that
    // cannot see them.
    const seen: Array<Record<string, AssetReference>> = [];
    doc.subscribe((snapshot) => seen.push(snapshot.assets));

    doc.commit([setAsset("file-1")]);

    expect(seen).toHaveLength(1);
    expect(Object.keys(seen[0])).toEqual(["file-1"]);
  });
});

/* -------------------------------------------------------------------------- */
/* The cost                                                                     */
/* -------------------------------------------------------------------------- */

describe("read() does not walk the assets", () => {
  test("a subscribed board runs read() per transaction and never reads assets", () => {
    // The two halves are the test. Without a subscriber `notify()` returns early
    // and `read()` is never called, so asserting "not called" would pass for the
    // wrong reason and prove nothing. The subscriber makes the read happen; the
    // spy proves what it did not do inside.
    const spy = vi.spyOn(doc, "readAssets");
    let notifications = 0;
    doc.subscribe(() => {
      notifications += 1;
    });

    doc.commit([{ kind: "createElement", element: image("el-1", "file-1") }]);
    doc.commit([setAsset("file-1")]);
    doc.commit([
      {
        kind: "updateElements",
        updates: [{ id: "el-1", changes: { x: 12 } }],
      },
    ]);

    // `notify()` ran, so `read()` ran.
    expect(notifications).toBe(3);
    // ...and it did not walk a single asset on the way.
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  test("50 images cost nothing per keystroke", () => {
    // AC-6 names 50 images, so 50 is the number that matters rather than an
    // arbitrary one.
    doc.commit([{ kind: "createElement", element: image("el-1", "file-1") }]);
    doc.commit(
      Array.from({ length: 50 }, (_, i) =>
        setAsset(`file-${i}`, { bytes: 2_000_000 }),
      ),
    );

    const spy = vi.spyOn(doc, "readAssets");
    let notifications = 0;
    doc.subscribe(() => {
      notifications += 1;
    });

    // Twenty keystroke-sized edits to one note, on a board carrying 50 images.
    for (let i = 1; i <= 20; i++) {
      doc.commit([
        {
          kind: "updateElements",
          updates: [{ id: "el-1", changes: { x: i } }],
        },
      ]);
    }

    expect(notifications).toBe(20);
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  test("the walk still happens when a caller asks for it", () => {
    // The other half of the same trade: laziness that never produces the value is
    // not laziness, it is a broken feature.
    const spy = vi.spyOn(doc, "readAssets");
    doc.commit([setAsset("file-1")]);

    expect(Object.keys(doc.read().assets)).toEqual(["file-1"]);
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});

/* -------------------------------------------------------------------------- */
/* The standalone reader                                                        */
/* -------------------------------------------------------------------------- */

describe("readAllAssets works on a bare structure", () => {
  test("without a FiroDoc, the way the sibling readers do", () => {
    // `readAllElements` / `readAllRecords` / `readAllCollections` are all reachable
    // with nothing but a `Y.Doc` and `structure()`. An asset reader that needed a
    // document to work would be the odd one out in that family, and the family is
    // how a caller reads a peer's state without instantiating ours.
    const ydoc = new Y.Doc();
    const node = new Y.Map<unknown>();
    node.set("hash", "abc");
    node.set("mimeType", "image/png");
    node.set("bytes", 12);
    ydoc.getMap("assets").set("file-1", node);

    expect(readAllAssets(structure(ydoc))).toEqual({
      "file-1": { hash: "abc", mimeType: "image/png", bytes: 12 },
    });
  });

  test("an empty document has an empty assets root", () => {
    expect(readAllAssets(structure(new Y.Doc()))).toEqual({});
  });

  test("it reads through the guarded document without tripping the write guard", () => {
    // The assets root is a `Y.Map`, and `forEach` on a shared type is exactly how
    // a bug obtains a live node to mutate -- so the guard wraps the callback
    // argument. A reader that did not go through that path would either bypass
    // the guard or be refused by it, and neither is what should happen.
    doc.commit([setAsset("file-1")]);

    expect(() =>
      doc.ydoc.getMap("assets").forEach(() => undefined),
    ).not.toThrow();
    expect(doc.readAssets()["file-1"].hash).toBe("hash-file-1");
  });
});

/* -------------------------------------------------------------------------- */
/* The document format is unchanged                                             */
/* -------------------------------------------------------------------------- */

describe("assets do not leak into board.json", () => {
  test("the serialised board carries no assets key, with or without images", () => {
    // ADR-0018 outcome 2 is the load-bearing bet of the whole directory format:
    // `board.json` is byte-for-byte the file that ships today, so the container
    // never reached into the document. `serializeBoard` builds a fresh object
    // from five named fields, which is why the lazy getter is safe here -- but
    // that is a property of `serializeBoard`, not an accident, and this is the
    // test that keeps it one.
    expect(serializeBoard(doc.read())).not.toHaveProperty("assets");

    doc.commit([
      { kind: "createElement", element: image("el-1", "file-1") },
      setAsset("file-1"),
    ]);

    expect(serializeBoard(doc.read())).not.toHaveProperty("assets");
    expect(JSON.stringify(serializeBoard(doc.read()))).not.toMatch(
      /hash-file-1|"assets"/,
    );
  });

  test("an asset does not change the bytes of an otherwise identical board", () => {
    doc.commit([{ kind: "createElement", element: image("el-1", "file-1") }]);
    const withoutAsset = JSON.stringify(serializeBoard(doc.read()));

    doc.commit([setAsset("file-1")]);
    const withAsset = JSON.stringify(serializeBoard(doc.read()));

    expect(withAsset).toBe(withoutAsset);
  });
});
