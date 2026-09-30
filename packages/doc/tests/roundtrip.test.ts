/**
 * The board round trip, and the two things that make it safe: undo locality, and
 * persistence that is not a provider.
 *
 * The round-trip criterion is the one the phase is named for:
 * "a board round-trips through @firo/doc -> Yjs -> IndexedDB -> @firo/doc with no
 * data loss". IndexedDB is jsdom-less here, so the real store is exercised in
 * `persistence.test.ts` and this file covers the part that is pure logic --
 * serialise, load into a document, and read it back unchanged.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import * as Y from "yjs";

import {
  applyRemoteUpdate,
  LOAD_ORIGIN,
  LOCAL_ORIGIN,
  openBoardMemory,
  REMOTE_ORIGIN,
} from "@firo/doc";

import { asFractionalIndex, loadBoard, serializeBoard } from "@firo/schema";

import type { FiroDoc } from "@firo/doc";
import type { Collection, FiroElement, FiroRecord } from "@firo/schema";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

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

const collection = (id: string): Collection =>
  ({
    id,
    boardId: "b-1",
    name: "Tasks",
    order: asFractionalIndex("a0"),
    version: 1,
    columns: [
      { id: "c-1", key: "title", name: "Title", type: "text" },
      { id: "c-2", key: "done", name: "Done", type: "boolean" },
    ],
  } as unknown as Collection);

const record = (id: string, collectionId: string): FiroRecord =>
  ({
    id,
    collectionId,
    values: {
      title: { type: "text", value: `row ${id}` },
      done: { type: "boolean", value: false },
    },
    created: 1750000000000,
    updated: 1750000000000,
    order: asFractionalIndex("a0"),
    archived: false,
  } as unknown as FiroRecord);

/** A board with every kind of thing in it. */
const seed = (doc: FiroDoc): void => {
  doc.commit([
    { kind: "createElement", element: note("el-1") },
    { kind: "createElement", element: note("el-2", { x: 300, y: 20 }) },
    { kind: "createElement", element: note("el-3", { x: 600, y: 20 }) },
    { kind: "createCollection", collection: collection("col-1") },
    { kind: "createRecord", record: record("rec-1", "col-1") },
    { kind: "createRecord", record: record("rec-2", "col-1") },
    { kind: "setMeta", entries: { name: "Workshop", created: 1750000000000 } },
    {
      kind: "setAsset",
      id: "img-1",
      reference: {
        hash: "abc",
        mimeType: "image/png",
        bytes: 1024,
        width: 100,
        height: 50,
      },
    },
  ]);
};

let doc: FiroDoc;

beforeEach(() => {
  doc = openBoardMemory();
});

afterEach(() => {
  doc.destroy();
});

/* -------------------------------------------------------------------------- */
/* Round trip                                                                  */
/* -------------------------------------------------------------------------- */

describe("a board round-trips through the document and the schema", () => {
  test("nothing is lost", () => {
    seed(doc);

    // doc -> serialised form
    const serialised = serializeBoard(doc.read());

    // ...and back, through validation, into a fresh document
    const other = openBoardMemory();
    const loaded = loadBoard(serialised);
    expect(loaded.log.hasRepairs, loaded.log.summary()).toBe(false);
    other.load(loaded as never);

    const a = doc.read();
    const b = other.read();

    expect(b.elements).toHaveLength(a.elements.length);
    expect(b.collections).toHaveLength(a.collections.length);
    expect(b.records).toHaveLength(a.records.length);
    expect(b.meta).toEqual(a.meta);

    for (const element of a.elements) {
      expect(b.elements.find((e) => e.id === element.id)).toEqual(element);
    }
    for (const r of a.records) {
      expect(b.records.find((x) => x.id === r.id)).toEqual(r);
    }
    for (const c of a.collections) {
      expect(b.collections.find((x) => x.id === c.id)).toEqual(c);
    }
    other.destroy();
  });

  test("the z-order survives, not just the set of elements", () => {
    // Order is a `Y.Array` precisely because it carries information the element
    // set does not. A round trip that preserved the notes but reset their order
    // would look complete and be wrong.
    seed(doc);
    doc.commit([{ kind: "reorderElements", ids: ["el-3", "el-1", "el-2"] }]);
    expect(doc.elementOrder()).toEqual(["el-3", "el-1", "el-2"]);

    const other = openBoardMemory();
    other.load(loadBoard(serializeBoard(doc.read())) as never);
    expect(other.elementOrder()).toEqual(["el-3", "el-1", "el-2"]);
    other.destroy();
  });

  test("a reordering that omits an element keeps it rather than dropping it", () => {
    // A partial reorder is a real call shape -- "put these three on top" -- and
    // silently dropping the unmentioned elements would lose them.
    seed(doc);
    doc.commit([{ kind: "reorderElements", ids: ["el-3"] }]);
    expect(doc.elementOrder()).toHaveLength(3);
    expect(doc.elementOrder()[0]).toBe("el-3");
  });

  test("an id with no element is not inserted into the order", () => {
    seed(doc);
    doc.commit([
      { kind: "reorderElements", ids: ["el-1", "ghost", "el-2", "el-3"] },
    ]);
    expect(doc.elementOrder()).toEqual(["el-1", "el-2", "el-3"]);
  });

  test("an asset is a reference, and the bytes never enter the document", () => {
    seed(doc);
    const assets = doc.ydoc.getMap("assets").toJSON() as Record<
      string,
      unknown
    >;
    expect(assets["img-1"]).toMatchObject({
      hash: "abc",
      mimeType: "image/png",
    });
    // The bytes are the whole reason: a 2 MB image inside a CRDT update is
    // broadcast per sync and duplicated per peer.
    expect(JSON.stringify(assets)).not.toMatch(/base64|data:/);
  });

  test("a large board round-trips without loss", () => {
    // The size where a "just rebuild the object" implementation starts to matter.
    const many = Array.from({ length: 500 }, (_, i) =>
      note(`el-${i}`, { x: i * 7 }),
    );
    doc.commit([{ kind: "createElements", elements: many }]);
    expect(doc.read().elements).toHaveLength(500);

    const other = openBoardMemory();
    other.load(loadBoard(serializeBoard(doc.read())) as never);
    expect(other.read().elements).toHaveLength(500);
    expect(other.elementOrder()).toEqual(doc.elementOrder());
    other.destroy();
  });
});

/* -------------------------------------------------------------------------- */
/* Undo                                                                        */
/* -------------------------------------------------------------------------- */

describe("undo is local", () => {
  test("a remote change does not appear in the local undo stack", () => {
    const undo = doc.createUndoManager({ captureTimeout: 0 });
    doc.commit([{ kind: "createElement", element: note("local") }]);
    expect(undo.undoStack.length).toBe(1);

    // A peer adds an element of its own. A real `FiroDoc`, not a hand-rolled
    // `Y.Doc`: a peer running the same build writes the same shape, and a test
    // that invented a different one would be testing a case that cannot occur.
    const peer = openBoardMemory();
    peer.commit([{ kind: "createElement", element: note("remote") }]);
    applyRemoteUpdate(doc, Y.encodeStateAsUpdate(peer.rawYdoc));

    expect(doc.element("remote")).not.toBeNull();
    // The point: the peer's change is not something *we* can undo.
    expect(undo.undoStack.length).toBe(1);
  });

  test("undoing does not revert the remote change", () => {
    const undo = doc.createUndoManager({ captureTimeout: 0 });
    doc.commit([{ kind: "createElement", element: note("local") }]);
    doc.commit([
      {
        kind: "updateElements",
        updates: [{ id: "local", changes: { x: 50 } }],
      },
    ]);

    const peer = openBoardMemory();
    peer.commit([{ kind: "createElement", element: note("remote") }]);
    applyRemoteUpdate(doc, Y.encodeStateAsUpdate(peer.rawYdoc));

    undo.undo();
    undo.undo();

    expect(doc.element("local")).toBeNull();
    // The peer's element is untouched by our undo.
    expect(doc.element("remote")).not.toBeNull();
  });

  test("one commit is one undo step, however many elements it touches", () => {
    // A group move or a paste. If this were one step per element, Ctrl-Z would
    // undo one note of a five-note move.
    const undo = doc.createUndoManager({ captureTimeout: 0 });
    doc.commit([
      { kind: "createElement", element: note("a") },
      { kind: "createElement", element: note("b") },
      { kind: "createElement", element: note("c") },
    ]);
    expect(undo.undoStack.length).toBe(1);

    undo.undo();
    expect(doc.read().elements).toHaveLength(0);
  });

  test("a load is not an undo step", () => {
    // The bug this prevents: opening a board puts its contents into the undo
    // stack, so the first Ctrl-Z empties the board the user just opened. That is
    // the most alarming thing a local-first app can do on first use.
    const undo = doc.createUndoManager({ captureTimeout: 0 });
    doc.load({ elements: [note("a")], collections: [], records: [], meta: {} });

    expect(doc.read().elements).toHaveLength(1);
    expect(undo.undoStack.length).toBe(0);
    expect(undo.redoStack.length).toBe(0);
  });

  test("undo restores a delete, keeping the element's identity and content", () => {
    const undo = doc.createUndoManager({ captureTimeout: 0 });
    seed(doc);
    doc.commit([{ kind: "deleteElements", ids: ["el-2"] }]);
    expect(doc.element("el-2")?.isDeleted).toBe(true);
    expect(doc.elementOrder()).not.toContain("el-2");

    undo.undo();
    const restored = doc.element("el-2");
    expect(restored?.isDeleted).toBe(false);
    expect(restored?.text).toBe("note el-2");
    expect(doc.elementOrder()).toContain("el-2");
  });
});

/* -------------------------------------------------------------------------- */
/* Versioning and merge bookkeeping                                            */
/* -------------------------------------------------------------------------- */

describe("the document maintains merge bookkeeping", () => {
  test("a move bumps `version` and `versionNonce`", () => {
    seed(doc);
    const before = doc.element("el-1")!;
    doc.commit([
      {
        kind: "updateElements",
        updates: [{ id: "el-1", changes: { x: 999 } }],
      },
    ]);
    const after = doc.element("el-1")!;

    expect(after.x).toBe(999);
    expect(after.version).toBe(before.version + 1);
    expect(after.versionNonce).not.toBe(before.versionNonce);
  });

  test("a non-merge change does not bump `version`", () => {
    // If it did, a concurrent text edit would lose a concurrent move: the whole
    // element is replaced, so last-writer-wins would pick the text edit and drop
    // the move. `version` is a merge-priority counter, not a change counter.
    seed(doc);
    const before = doc.element("el-1")!;
    doc.commit([
      {
        kind: "updateElements",
        updates: [{ id: "el-1", changes: { text: "edited" } }],
      },
    ]);
    const after = doc.element("el-1")!;

    expect(after.text).toBe("edited");
    expect(after.version).toBe(before.version);
    expect(after.updated).toBeGreaterThanOrEqual(before.updated);
  });

  test("`created` is preserved across edits and undo", () => {
    seed(doc);
    const created = doc.element("el-1")!.created;
    doc.commit([
      { kind: "updateElements", updates: [{ id: "el-1", changes: { x: 1 } }] },
    ]);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);
    doc.commit([{ kind: "restoreElements", ids: ["el-1"] }]);
    expect(doc.element("el-1")!.created).toBe(created);
  });

  test("a tombstone keeps the element, so a delete is reversible", () => {
    seed(doc);
    doc.commit([{ kind: "deleteElements", ids: ["el-1"] }]);

    const node = doc.ydoc.getMap("elements").get("el-1") as {
      get: (k: string) => unknown;
    };
    // The key is still there. Removing it would make the delete
    // indistinguishable from never having existed, which breaks undo and lets a
    // concurrent edit resurrect it.
    expect(node).toBeDefined();
    expect(node.get("isDeleted")).toBe(true);
    expect(typeof node.get("deletedAt")).toBe("number");
  });

  test("an explicit `undefined` removes an optional key rather than nulling it", () => {
    // `null` is a meaningful value for several optional fields, so "remove" and
    // "set to null" are different operations.
    seed(doc);
    doc.commit([
      {
        kind: "updateElements",
        updates: [{ id: "el-1", changes: { recordId: "rec-1" } }],
      },
    ]);
    expect(doc.element("el-1")).toHaveProperty("recordId", "rec-1");

    doc.commit([
      {
        kind: "updateElements",
        updates: [{ id: "el-1", changes: { recordId: undefined } }],
      },
    ]);
    expect(doc.element("el-1")).not.toHaveProperty("recordId");
  });
});

/* -------------------------------------------------------------------------- */
/* Deletion does not cascade                                                  */
/* -------------------------------------------------------------------------- */

describe("deleting a collection keeps its records", () => {
  test("the records and their values survive", () => {
    // The one place the data model promised it could not lose something. Values
    // are keyed by `Column.key`, so restoring the collection brings the data
    // back; cascading would make that impossible.
    seed(doc);
    doc.commit([{ kind: "deleteCollection", id: "col-1" }]);

    expect(doc.read().collections).toHaveLength(0);
    expect(doc.read().records).toHaveLength(2);
    expect(doc.record("rec-1")?.values.title).toEqual({
      type: "text",
      value: "row rec-1",
    });
  });

  test("re-creating the collection makes the values readable again", () => {
    seed(doc);
    doc.commit([{ kind: "deleteCollection", id: "col-1" }]);
    doc.commit([{ kind: "createCollection", collection: collection("col-1") }]);

    const board = loadBoard(serializeBoard(doc.read()));
    expect(board.log.hasRepairs, board.log.summary()).toBe(false);
    expect(board.records[0].values.title).toEqual({
      type: "text",
      value: "row rec-1",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Archiving                                                                   */
/* -------------------------------------------------------------------------- */

describe("records are archived, not deleted", () => {
  test("archiving hides a row from a projection and is reversible", () => {
    seed(doc);
    doc.commit([{ kind: "archiveRecords", ids: ["rec-1"] }]);
    expect(doc.record("rec-1")?.archived).toBe(true);
    // Still in the document: a row dragged out of a table is not a deleted row.
    expect(doc.read().records).toHaveLength(2);

    doc.commit([{ kind: "unarchiveRecords", ids: ["rec-1"] }]);
    expect(doc.record("rec-1")?.archived).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Origins                                                                     */
/* -------------------------------------------------------------------------- */

describe("origins are distinct and all accepted", () => {
  test("a load, a local commit and a remote apply are three different things", () => {
    // Distinct identity is the whole mechanism: `REMOTE_ORIGIN` excluded from the
    // local undo stack, `LOAD_ORIGIN` invisible to it too. Two origins that
    // compared equal would collapse those three cases into one.
    expect(new Set([LOCAL_ORIGIN, REMOTE_ORIGIN, LOAD_ORIGIN]).size).toBe(3);
  });

  test("remote applies are permitted and are not local writes", () => {
    // `durableUpdates` counts local writes only. A remote apply must not inflate
    // it, or a test asserting "the drag produced no updates" could be satisfied
    // by someone else's traffic.
    const peer = openBoardMemory();
    peer.commit([{ kind: "createElement", element: note("remote") }]);
    const before = doc.durableUpdates;
    applyRemoteUpdate(doc, Y.encodeStateAsUpdate(peer.rawYdoc));
    expect(doc.element("remote")).not.toBeNull();
    expect(doc.durableUpdates).toBe(before);
  });
});
