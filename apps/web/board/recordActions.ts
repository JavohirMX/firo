/**
 * Commands and actions for structured records and collections.
 *
 * ## Why this exists
 *
 * Facilitates creating and manipulating structured record collections on the canvas,
 * satisfying AC-3 ("A tester creates a collection with columns Title, Status, Due...").
 *
 * Projections (Table, Board, Grid) render these collections into canvas elements,
 * allowing switchable views over the same records without any reload.
 */

import { randomId } from "@firo/common";
import { generateKeyBetween } from "@firo/fractional-indexing";
import { asFractionalIndex, isFractionalIndex } from "@firo/schema";
import { boardId } from "@firo/board";

import type { FiroDoc, Mutation } from "@firo/doc";
import type { Collection, FiroRecord } from "@firo/schema";
import type { CommandPaletteItem } from "@firo/editor/components/CommandPalette/types";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

/**
 * Creates a standard task collection with 5 records matching AC-3 requirements:
 * Columns: Title (text), Status (singleSelect: Todo, Doing, Done), Due (date).
 * Includes the "Write the RFC" card in "Doing" status.
 */
export const buildTaskCollectionData = (
  docBoardId: string,
): { collection: Collection; records: readonly FiroRecord[] } => {
  const collectionId = `col-${randomId()}`;
  const collection: Collection = {
    id: collectionId,
    boardId: docBoardId,
    name: "Tasks",
    order: asFractionalIndex("a0"),
    version: 1,
    columns: [
      { id: `c-${randomId()}`, key: "title", name: "Title", type: "text" },
      {
        id: `c-${randomId()}`,
        key: "status",
        name: "Status",
        type: "singleSelect",
        options: [
          { id: "opt-Todo", name: "Todo", color: "#495057" },
          { id: "opt-Doing", name: "Doing", color: "#1971c2" },
          { id: "opt-Done", name: "Done", color: "#2f9e44" },
        ],
      },
      { id: `c-${randomId()}`, key: "due", name: "Due", type: "date" },
    ],
  };

  const tasks: Array<{
    title: string;
    status: "Todo" | "Doing" | "Done";
    due?: string;
  }> = [
    { title: "Write the RFC", status: "Doing", due: "2026-10-15" },
    { title: "Design data model", status: "Done", due: "2026-10-10" },
    { title: "Build projection UI", status: "Doing", due: "2026-10-14" },
    { title: "Write unit tests", status: "Todo", due: "2026-10-16" },
    { title: "Ship version 1", status: "Todo", due: "2026-10-20" },
  ];

  const now = Date.now();
  const records: FiroRecord[] = tasks.map((task, index) => ({
    id: `rec-${randomId()}`,
    collectionId,
    values: {
      title: { type: "text", value: task.title },
      status: { type: "singleSelect", value: `opt-${task.status}` },
      due: { type: "date", value: task.due ?? null },
    },
    created: now,
    updated: now,
    order: asFractionalIndex(`a${index}`),
    archived: false,
  }));

  return { collection, records };
};

/**
 * Commits a new task collection to the document.
 */
export const insertTaskCollection = (
  getDocument: () => FiroDoc,
): { collectionId: string } => {
  const doc = getDocument();
  const id = boardId(getDocument);
  const { collection, records } = buildTaskCollectionData(id);

  const mutations: Mutation[] = [
    { kind: "createCollection", collection },
    ...records.map((record) => ({ kind: "createRecord" as const, record })),
  ];

  doc.commit(mutations);
  return { collectionId: collection.id };
};

/**
 * Adds an empty record or named record to an existing collection.
 */
export const addRecordToCollection = (
  getDocument: () => FiroDoc,
  collectionId: string,
  title = "New task",
): string => {
  const doc = getDocument();
  const recordId = `rec-${randomId()}`;
  const now = Date.now();

  /*
   * Append after the collection's current last card. A key built from the
   * clock (`a${now}`) is not a valid fractional index -- trailing digits can
   * end in zero, which the encoding forbids -- and `asFractionalIndex`
   * throws on it, so the card simply failed to appear roughly one press in
   * ten.
   */
  const last = doc
    .read()
    .records.filter((record) => record.collectionId === collectionId)
    .map((record) => record.order)
    .filter(isFractionalIndex)
    .reduce((max, key) => (key > max ? key : max), "");

  const mutation: Mutation = {
    kind: "createRecord",
    record: {
      id: recordId,
      collectionId,
      values: {
        title: { type: "text", value: title },
        status: { type: "singleSelect", value: "opt-Todo" },
        due: { type: "date", value: null },
      },
      created: now,
      updated: now,
      order: asFractionalIndex(
        generateKeyBetween(last === "" ? null : last, null),
      ),
      archived: false,
    },
  };

  doc.commit([mutation]);
  return recordId;
};

/**
 * Returns command palette items for records and collections.
 */
export const recordCommandPaletteItems = (
  _api: ExcalidrawImperativeAPI,
  getDocument: () => FiroDoc,
  refresh: () => void,
): CommandPaletteItem[] => [
  {
    label: "Insert task collection",
    category: "Elements",
    perform: () => {
      insertTaskCollection(getDocument);
      refresh();
    },
  },
];
