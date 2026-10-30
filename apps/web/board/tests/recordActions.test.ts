import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";
import { asFractionalIndex } from "@firo/schema";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import {
  addRecordToCollection,
  buildTaskCollectionData,
  insertTaskCollection,
  recordCommandPaletteItems,
} from "../recordActions";

/*
 * The task-collection seam behind the "Insert task collection" command
 * (AC-3: a collection with Title / Status / Due columns and starter cards).
 *
 * The record store itself is `@firo/doc`'s and tested there. What only this
 * module owns:
 *
 * 1. **The starter content.** The exact columns and starter cards a new
 *    collection opens with, including "Write the RFC" sitting in Doing.
 * 2. **The commit shape.** One commit carries the collection and its records
 *    together; a half-written collection would be a projection's crash.
 * 3. **Adding a card.** New records default to Todo with no due date, in the
 *    collection they were added to.
 */

const newBoard = () => {
  const doc = new FiroDoc(new Y.Doc());
  return { doc, getDocument: () => doc };
};

describe("buildTaskCollectionData", () => {
  it("builds the AC-3 columns: Title text, Status select, Due date", () => {
    const { collection } = buildTaskCollectionData("board-x");
    expect(collection.name).toBe("Tasks");
    expect(collection.boardId).toBe("board-x");
    expect(collection.columns.map((column) => column.key)).toEqual([
      "title",
      "status",
      "due",
    ]);
    expect(collection.columns.map((column) => column.type)).toEqual([
      "text",
      "singleSelect",
      "date",
    ]);
    const status = collection.columns[1];
    expect(status.options?.map((option) => option.name)).toEqual([
      "Todo",
      "Doing",
      "Done",
    ]);
    expect(status.options?.map((option) => option.id)).toEqual([
      "opt-Todo",
      "opt-Doing",
      "opt-Done",
    ]);
  });

  it("starts with the RFC card in Doing and four more cards", () => {
    const { collection, records } = buildTaskCollectionData("board-x");
    expect(records).toHaveLength(5);
    const rfc = records.find(
      (record) =>
        record.values.title.type === "text" &&
        record.values.title.value === "Write the RFC",
    );
    expect(rfc).toBeDefined();
    expect(rfc!.values.status).toEqual({
      type: "singleSelect",
      value: "opt-Doing",
    });
    for (const record of records) {
      expect(record.collectionId).toBe(collection.id);
      expect(record.archived).toBe(false);
      expect(record.created).toBe(record.updated);
    }
  });

  it("mints a fresh collection id per call", () => {
    const a = buildTaskCollectionData("board-x");
    const b = buildTaskCollectionData("board-x");
    expect(a.collection.id).not.toBe(b.collection.id);
  });
});

describe("insertTaskCollection", () => {
  it("commits the collection and its cards in one readable state", () => {
    const { doc, getDocument } = newBoard();
    const { collectionId } = insertTaskCollection(getDocument);
    const snapshot = doc.read();
    const collection = snapshot.collections.find(
      (entry) => entry.id === collectionId,
    );
    expect(collection).toBeDefined();
    expect(collection!.name).toBe("Tasks");
    // The board id is stamped on first use and threads into the collection.
    expect(collection!.boardId).toBe(doc.read().meta.id);
    const records = snapshot.records.filter(
      (record) => record.collectionId === collectionId,
    );
    expect(records).toHaveLength(5);
  });
});

describe("addRecordToCollection", () => {
  it("adds a Todo card with no due date under the default title", () => {
    const { doc, getDocument } = newBoard();
    const { collectionId } = insertTaskCollection(getDocument);
    const recordId = addRecordToCollection(getDocument, collectionId);
    const record = doc.read().records.find((entry) => entry.id === recordId);
    expect(record).toBeDefined();
    expect(record!.collectionId).toBe(collectionId);
    expect(record!.values.title).toEqual({ type: "text", value: "New task" });
    expect(record!.values.status).toEqual({
      type: "singleSelect",
      value: "opt-Todo",
    });
    expect(record!.values.due).toEqual({ type: "date", value: null });
    expect(record!.archived).toBe(false);
  });

  it("appends after the collection's current last card", () => {
    const { doc, getDocument } = newBoard();
    const { collectionId } = insertTaskCollection(getDocument);
    const recordId = addRecordToCollection(getDocument, collectionId);
    const records = doc
      .read()
      .records.filter((record) => record.collectionId === collectionId);
    const added = records.find((record) => record.id === recordId)!;
    for (const other of records) {
      if (other.id !== recordId) {
        expect(added.order > other.order).toBe(true);
      }
    }
  });

  it("honours an explicit title", () => {
    const { doc, getDocument } = newBoard();
    const { collectionId } = insertTaskCollection(getDocument);
    const recordId = addRecordToCollection(
      getDocument,
      collectionId,
      "Review the plan",
    );
    const record = doc.read().records.find((entry) => entry.id === recordId);
    expect(record!.values.title).toEqual({
      type: "text",
      value: "Review the plan",
    });
  });
});

/*
 * The clock-key bug, pinned deterministically.
 *
 * `addRecordToCollection` used to build the order key as `a${Date.now()}`.
 * Two pinned instants stand in for the two failure modes, so the regression
 * no longer depends on what the clock happens to read when the suite runs:
 * 1792782394870 ends in zero (an invalid key: the original code threw here)
 * and 1792782394864 is valid digits (the original key still sorted before
 * the starter cards' "a4", not appended).
 */
describe("the clock-key order bug (regression)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pins the encoding fact: a clock key ending in zero is invalid", () => {
    expect(() => asFractionalIndex("a1792782394870")).toThrow(RangeError);
    expect(() => asFractionalIndex("a1792782394864")).not.toThrow();
  });

  it("at a trailing-zero instant, adding a card succeeds and appends", () => {
    vi.useFakeTimers({ now: 1792782394870 });
    const { doc, getDocument } = newBoard();
    const { collectionId } = insertTaskCollection(getDocument);
    const recordId = addRecordToCollection(getDocument, collectionId);
    const records = doc
      .read()
      .records.filter((record) => record.collectionId === collectionId);
    const added = records.find((record) => record.id === recordId)!;
    // The clock still stamps created/updated; it no longer names the order.
    expect(added.created).toBe(1792782394870);
    for (const other of records) {
      if (other.id !== recordId) {
        expect(added.order > other.order).toBe(true);
      }
    }
  });

  it("at a valid-key instant, the card still appends after the last card", () => {
    vi.useFakeTimers({ now: 1792782394864 });
    const { doc, getDocument } = newBoard();
    const { collectionId } = insertTaskCollection(getDocument);
    const recordId = addRecordToCollection(getDocument, collectionId);
    const records = doc
      .read()
      .records.filter((record) => record.collectionId === collectionId);
    const added = records.find((record) => record.id === recordId)!;
    const last = records
      .filter((record) => record.id !== recordId)
      .map((record) => record.order)
      .reduce((max, key) => (key > max ? key : max), "");
    expect(added.order > last).toBe(true);
  });
});

describe("recordCommandPaletteItems", () => {
  it("offers the insert command, which writes and then refreshes", () => {
    const { doc, getDocument } = newBoard();
    const refresh = vi.fn();
    const items = recordCommandPaletteItems(
      {} as ExcalidrawImperativeAPI,
      getDocument,
      refresh,
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("Insert task collection");
    expect(items[0].category).toBe("Elements");

    items[0].perform({ actionManager: {} as never, event: {} as never });
    expect(doc.read().collections).toHaveLength(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
