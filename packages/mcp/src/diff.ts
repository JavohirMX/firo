/**
 * Declarative Diff Engine for Firo MCP Server (Phase 10.2).
 *
 * Computes and applies declarative diffs into atomic FiroDoc transactions.
 */

import { generateKeyBetween } from "@firo/fractional-indexing";

import {
  declarativeElementToFiro,
  plainTextToProseMirrorDoc,
  serializeDocToDeclarative,
} from "./declarative.js";

import type {
  DeclarativeBoard,
  DeclarativeCollection,
  DeclarativeElement,
  DeclarativeRecord,
} from "./declarative.js";
import type {
  Collection,
  Column,
  CommentEntry,
  CommentThread,
  CommitResult,
  ElementUpdate,
  FieldValue,
  FiroDoc,
  FiroElement,
  FiroRecord,
  FractionalIndex,
  Mutation,
  RecordUpdate,
} from "./types.js";

export interface ElementDiff {
  insert?: DeclarativeElement[];
  update?: (Partial<DeclarativeElement> & { id: string })[];
  delete?: string[];
}

export interface CollectionDiff {
  insert?: DeclarativeCollection[];
  update?: (Partial<DeclarativeCollection> & { id: string })[];
  delete?: string[];
}

export interface RecordDiff {
  insert?: DeclarativeRecord[];
  update?: (Partial<DeclarativeRecord> & { id: string })[];
  delete?: string[];
}

export interface CommentDiff {
  createThread?: {
    id?: string;
    elementId: string;
    anchor?: { x: number; y: number };
    body: string;
    author?: string;
  }[];
  replyThread?: {
    threadId: string;
    body: string;
    author?: string;
  }[];
  resolveThread?: string[];
  deleteThread?: string[];
}

export interface BoardDiff {
  elements?: ElementDiff;
  collections?: CollectionDiff;
  records?: RecordDiff;
  comments?: CommentDiff;
  meta?: Record<string, unknown>;
}

const areEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * Computes declarative diff between two board representations.
 */
export const computeDiff = (
  oldBoard: DeclarativeBoard,
  newBoard: DeclarativeBoard,
): BoardDiff => {
  const diff: BoardDiff = {};

  // 1. Elements
  const oldElementMap = new Map<string, DeclarativeElement>(
    oldBoard.elements.map((e) => [e.id, e]),
  );
  const newElementMap = new Map<string, DeclarativeElement>(
    newBoard.elements.map((e) => [e.id, e]),
  );

  const insertedElements: DeclarativeElement[] = [];
  const updatedElements: (Partial<DeclarativeElement> & { id: string })[] = [];
  const deletedElements: string[] = [];

  for (const [id, newEl] of newElementMap) {
    const oldEl = oldElementMap.get(id);
    if (!oldEl) {
      insertedElements.push(newEl);
    } else {
      const changes: Partial<DeclarativeElement> & { id: string } = { id };
      let hasChanges = false;

      const compareKeys: (keyof DeclarativeElement)[] = [
        "x",
        "y",
        "width",
        "height",
        "angle",
        "text",
        "strokeColor",
        "backgroundColor",
        "fillStyle",
        "strokeWidth",
        "strokeStyle",
        "roundness",
        "roughness",
        "opacity",
        "fontSize",
        "fontFamily",
        "textAlign",
        "verticalAlign",
        "containerId",
        "frameId",
        "tags",
        "locked",
        "link",
        "points",
        "bindings",
        "name",
        "startArrowhead",
        "endArrowhead",
        "elbowed",
        "customData",
      ];

      for (const key of compareKeys) {
        if (!areEqual(oldEl[key], newEl[key])) {
          (changes as Record<string, unknown>)[key] = newEl[key];
          hasChanges = true;
        }
      }

      if (hasChanges) {
        updatedElements.push(changes);
      }
    }
  }

  for (const id of oldElementMap.keys()) {
    if (!newElementMap.has(id)) {
      deletedElements.push(id);
    }
  }

  if (
    insertedElements.length > 0 ||
    updatedElements.length > 0 ||
    deletedElements.length > 0
  ) {
    diff.elements = {};
    if (insertedElements.length > 0) {
      diff.elements.insert = insertedElements;
    }
    if (updatedElements.length > 0) {
      diff.elements.update = updatedElements;
    }
    if (deletedElements.length > 0) {
      diff.elements.delete = deletedElements;
    }
  }

  // 2. Collections
  const oldCollectionMap = new Map<string, DeclarativeCollection>(
    oldBoard.collections.map((c) => [c.id, c]),
  );
  const newCollectionMap = new Map<string, DeclarativeCollection>(
    newBoard.collections.map((c) => [c.id, c]),
  );

  const insertedCollections: DeclarativeCollection[] = [];
  const updatedCollections: (Partial<DeclarativeCollection> & {
    id: string;
  })[] = [];
  const deletedCollections: string[] = [];

  for (const [id, newCol] of newCollectionMap) {
    const oldCol = oldCollectionMap.get(id);
    if (!oldCol) {
      insertedCollections.push(newCol);
    } else {
      const changes: Partial<DeclarativeCollection> & { id: string } = { id };
      let hasColChanges = false;
      if (oldCol.name !== newCol.name) {
        changes.name = newCol.name;
        hasColChanges = true;
      }
      if (!areEqual(oldCol.columns, newCol.columns)) {
        changes.columns = newCol.columns;
        hasColChanges = true;
      }
      if (oldCol.order !== newCol.order) {
        changes.order = newCol.order;
        hasColChanges = true;
      }
      if (hasColChanges) {
        updatedCollections.push(changes);
      }
    }
  }

  for (const id of oldCollectionMap.keys()) {
    if (!newCollectionMap.has(id)) {
      deletedCollections.push(id);
    }
  }

  if (
    insertedCollections.length > 0 ||
    updatedCollections.length > 0 ||
    deletedCollections.length > 0
  ) {
    diff.collections = {};
    if (insertedCollections.length > 0) {
      diff.collections.insert = insertedCollections;
    }
    if (updatedCollections.length > 0) {
      diff.collections.update = updatedCollections;
    }
    if (deletedCollections.length > 0) {
      diff.collections.delete = deletedCollections;
    }
  }

  // 3. Records
  const oldRecordMap = new Map<string, DeclarativeRecord>(
    oldBoard.records.map((r) => [r.id, r]),
  );
  const newRecordMap = new Map<string, DeclarativeRecord>(
    newBoard.records.map((r) => [r.id, r]),
  );

  const insertedRecords: DeclarativeRecord[] = [];
  const updatedRecords: (Partial<DeclarativeRecord> & { id: string })[] = [];
  const deletedRecords: string[] = [];

  for (const [id, newRec] of newRecordMap) {
    const oldRec = oldRecordMap.get(id);
    if (!oldRec) {
      insertedRecords.push(newRec);
    } else {
      const changes: Partial<DeclarativeRecord> & { id: string } = { id };
      let hasRecChanges = false;

      if (!areEqual(oldRec.values, newRec.values)) {
        changes.values = newRec.values;
        hasRecChanges = true;
      }
      if (oldRec.order !== newRec.order) {
        changes.order = newRec.order;
        hasRecChanges = true;
      }
      if (oldRec.archived !== newRec.archived) {
        changes.archived = newRec.archived;
        hasRecChanges = true;
      }

      if (hasRecChanges) {
        updatedRecords.push(changes);
      }
    }
  }

  for (const id of oldRecordMap.keys()) {
    if (!newRecordMap.has(id)) {
      deletedRecords.push(id);
    }
  }

  if (
    insertedRecords.length > 0 ||
    updatedRecords.length > 0 ||
    deletedRecords.length > 0
  ) {
    diff.records = {};
    if (insertedRecords.length > 0) {
      diff.records.insert = insertedRecords;
    }
    if (updatedRecords.length > 0) {
      diff.records.update = updatedRecords;
    }
    if (deletedRecords.length > 0) {
      diff.records.delete = deletedRecords;
    }
  }

  // 4. Meta
  if (!areEqual(oldBoard.meta, newBoard.meta)) {
    diff.meta = newBoard.meta;
  }

  return diff;
};

/**
 * Normalizes raw record values into typed FieldValue objects based on column schema.
 */
export const normalizeRecordValues = (
  rawValues: Record<string, unknown>,
  columns: readonly Column[],
): Record<string, FieldValue> => {
  const columnMap = new Map<string, Column>(columns.map((c) => [c.key, c]));
  const result: Record<string, FieldValue> = {};

  for (const [key, val] of Object.entries(rawValues)) {
    if (val && typeof val === "object" && "type" in val && "value" in val) {
      result[key] = val as FieldValue;
      continue;
    }

    const col = columnMap.get(key);
    const colType = col?.type ?? "text";

    switch (colType) {
      case "number":
        result[key] = {
          type: "number",
          value: typeof val === "number" ? val : Number(val) || 0,
        };
        break;
      case "boolean":
        result[key] = {
          type: "boolean",
          value: Boolean(val),
        };
        break;
      case "singleSelect":
        result[key] = {
          type: "singleSelect",
          value: val !== null && val !== undefined ? String(val) : null,
        };
        break;
      case "multiSelect":
        result[key] = {
          type: "multiSelect",
          value: Array.isArray(val)
            ? val.map(String)
            : val
            ? [String(val)]
            : [],
        };
        break;
      case "date":
      case "person":
      case "link":
        result[key] = {
          type: colType,
          value: val !== null && val !== undefined ? String(val) : null,
        };
        break;
      case "richText":
        result[key] = {
          type: "richText",
          value: plainTextToProseMirrorDoc(String(val ?? "")),
        };
        break;
      case "text":
      default:
        result[key] = {
          type: "text",
          value: String(val ?? ""),
        };
        break;
    }
  }

  return result;
};

/**
 * Converts a BoardDiff into atomic FiroDoc Mutations.
 */
export const diffToMutations = (doc: FiroDoc, diff: BoardDiff): Mutation[] => {
  const mutations: Mutation[] = [];
  const snapshot = doc.read();

  const existingElementMap = new Map<string, FiroElement>(
    snapshot.elements.map((e) => [e.id, e]),
  );
  const existingCollectionMap = new Map<string, Collection>(
    snapshot.collections.map((c) => [c.id, c]),
  );
  const existingRecordMap = new Map<string, FiroRecord>(
    snapshot.records.map((r) => [r.id, r]),
  );

  // 1. Elements Insert
  if (diff.elements?.insert && diff.elements.insert.length > 0) {
    let lastKey: string | null =
      snapshot.elements.length > 0
        ? snapshot.elements[snapshot.elements.length - 1].index
        : null;

    const firoElements: FiroElement[] = [];
    for (const decl of diff.elements.insert) {
      const nextKey = generateKeyBetween(lastKey, null);
      lastKey = nextKey;
      const el = declarativeElementToFiro(decl, { fallbackIndex: nextKey });
      firoElements.push(el);
      existingElementMap.set(el.id, el);
    }

    if (firoElements.length === 1) {
      mutations.push({ kind: "createElement", element: firoElements[0] });
    } else if (firoElements.length > 1) {
      mutations.push({ kind: "createElements", elements: firoElements });
    }
  }

  // 2. Elements Update
  if (diff.elements?.update && diff.elements.update.length > 0) {
    const updates: ElementUpdate[] = [];

    for (const update of diff.elements.update) {
      const existing = existingElementMap.get(update.id);
      if (!existing) {
        continue;
      }

      const changes: any = {};

      if (update.x !== undefined) {
        changes.x = update.x;
      }
      if (update.y !== undefined) {
        changes.y = update.y;
      }
      if (update.width !== undefined) {
        changes.width = update.width;
      }
      if (update.height !== undefined) {
        changes.height = update.height;
      }
      if (update.angle !== undefined) {
        changes.angle = update.angle as any;
      }
      if (update.strokeColor !== undefined) {
        changes.strokeColor = update.strokeColor;
      }
      if (update.backgroundColor !== undefined) {
        changes.backgroundColor = update.backgroundColor;
      }
      if (update.fillStyle !== undefined) {
        changes.fillStyle = update.fillStyle;
      }
      if (update.strokeWidth !== undefined) {
        changes.strokeWidth = update.strokeWidth;
      }
      if (update.strokeStyle !== undefined) {
        changes.strokeStyle = update.strokeStyle;
      }
      if (update.roundness !== undefined) {
        changes.roundness = update.roundness;
      }
      if (update.roughness !== undefined) {
        changes.roughness = update.roughness;
      }
      if (update.opacity !== undefined) {
        changes.opacity = update.opacity;
      }
      if (update.containerId !== undefined) {
        changes.containerId = update.containerId;
      }
      if (update.frameId !== undefined) {
        changes.frameId = update.frameId;
      }
      if (update.groupIds !== undefined) {
        changes.groupIds = update.groupIds as any;
      }
      if (update.bindings !== undefined) {
        changes.bindings = update.bindings;
      }
      if (update.tags !== undefined) {
        changes.tags = update.tags;
      }
      if (update.locked !== undefined) {
        changes.locked = update.locked;
      }
      if (update.link !== undefined) {
        changes.link = update.link;
      }
      if (update.customData !== undefined) {
        changes.customData = update.customData;
      }

      if (update.text !== undefined) {
        if (existing.type === "stickynote" || existing.type === "text") {
          (changes as any).text = update.text;
        } else {
          changes.text = plainTextToProseMirrorDoc(update.text);
        }
      }

      if (update.fontSize !== undefined) {
        (changes as any).fontSize = update.fontSize;
      }
      if (update.fontFamily !== undefined) {
        (changes as any).fontFamily = update.fontFamily;
      }
      if (update.textAlign !== undefined) {
        (changes as any).textAlign = update.textAlign;
      }
      if (update.verticalAlign !== undefined) {
        (changes as any).verticalAlign = update.verticalAlign;
      }
      if (update.points !== undefined) {
        (changes as any).points = update.points;
      }
      if (update.name !== undefined) {
        (changes as any).name = update.name;
      }
      if (update.elbowed !== undefined) {
        (changes as any).elbowed = update.elbowed;
      }
      if (update.startArrowhead !== undefined) {
        (changes as any).startArrowhead = update.startArrowhead;
      }
      if (update.endArrowhead !== undefined) {
        (changes as any).endArrowhead = update.endArrowhead;
      }

      updates.push({ id: update.id, changes });
    }

    if (updates.length > 0) {
      mutations.push({ kind: "updateElements", updates });
    }
  }

  // 3. Elements Delete
  if (diff.elements?.delete && diff.elements.delete.length > 0) {
    const validIds = diff.elements.delete.filter((id) =>
      existingElementMap.has(id),
    );
    if (validIds.length > 0) {
      mutations.push({ kind: "deleteElements", ids: validIds });
    }
  }

  // 4. Collections Insert
  if (diff.collections?.insert && diff.collections.insert.length > 0) {
    for (const c of diff.collections.insert) {
      const col: Collection = {
        id: c.id,
        boardId: snapshot.meta.id ? String(snapshot.meta.id) : "board-active",
        name: c.name,
        columns: c.columns,
        order: (c.order ?? "a0") as FractionalIndex,
        version: 1,
      };
      mutations.push({ kind: "createCollection", collection: col });
      existingCollectionMap.set(col.id, col);
    }
  }

  // 5. Collections Update
  if (diff.collections?.update && diff.collections.update.length > 0) {
    for (const u of diff.collections.update) {
      if (existingCollectionMap.has(u.id)) {
        mutations.push({
          kind: "updateCollection",
          id: u.id,
          changes: {
            ...(u.name !== undefined ? { name: u.name } : {}),
            ...(u.columns !== undefined ? { columns: u.columns } : {}),
            ...(u.order !== undefined
              ? { order: u.order as FractionalIndex }
              : {}),
          },
        });
      }
    }
  }

  // 6. Collections Delete
  if (diff.collections?.delete && diff.collections.delete.length > 0) {
    for (const id of diff.collections.delete) {
      if (existingCollectionMap.has(id)) {
        mutations.push({ kind: "deleteCollection", id });
      }
    }
  }

  // 7. Records Insert
  if (diff.records?.insert && diff.records.insert.length > 0) {
    const recordsToCreate: FiroRecord[] = [];
    let lastOrder = "a0";

    for (const r of diff.records.insert) {
      const collection = existingCollectionMap.get(r.collectionId);
      const cols = collection ? collection.columns : [];
      const values = normalizeRecordValues(r.values, cols);
      const order = (r.order ??
        generateKeyBetween(lastOrder, null)) as FractionalIndex;
      lastOrder = order;

      const record: FiroRecord = {
        id: r.id,
        collectionId: r.collectionId,
        values,
        order,
        archived: r.archived ?? false,
        created: Date.now(),
        updated: Date.now(),
      };
      recordsToCreate.push(record);
      existingRecordMap.set(record.id, record);
    }

    if (recordsToCreate.length === 1) {
      mutations.push({ kind: "createRecord", record: recordsToCreate[0] });
    } else if (recordsToCreate.length > 1) {
      mutations.push({ kind: "createRecords", records: recordsToCreate });
    }
  }

  // 8. Records Update
  if (diff.records?.update && diff.records.update.length > 0) {
    const updates: RecordUpdate[] = [];

    for (const u of diff.records.update) {
      const existing = existingRecordMap.get(u.id);
      if (!existing) {
        continue;
      }

      const changes: any = {};
      if (u.values) {
        const collection = existingCollectionMap.get(existing.collectionId);
        const cols = collection ? collection.columns : [];
        const normalized = normalizeRecordValues(u.values, cols);
        changes.values = { ...existing.values, ...normalized };
      }
      if (u.order !== undefined) {
        changes.order = u.order as FractionalIndex;
      }
      if (u.archived !== undefined) {
        changes.archived = u.archived;
      }

      updates.push({ id: u.id, changes });
    }

    if (updates.length > 0) {
      mutations.push({ kind: "updateRecords", updates });
    }
  }

  // 9. Records Delete (Archive)
  if (diff.records?.delete && diff.records.delete.length > 0) {
    const validRecordIds = diff.records.delete.filter((id) =>
      existingRecordMap.has(id),
    );
    if (validRecordIds.length > 0) {
      mutations.push({ kind: "archiveRecords", ids: validRecordIds });
    }
  }

  // 10. Comments Create Thread
  if (diff.comments?.createThread && diff.comments.createThread.length > 0) {
    for (const th of diff.comments.createThread) {
      const threadId =
        th.id ?? `thread-${Math.random().toString(36).slice(2, 9)}`;
      const commentId = `cmt-${Math.random().toString(36).slice(2, 9)}`;
      const thread: CommentThread = {
        id: threadId,
        elementId: th.elementId,
        anchor: th.anchor ?? { x: 0, y: 0 },
        comments: [
          {
            id: commentId,
            body: th.body,
            author: th.author ?? "AI Assistant",
            createdAt: Date.now(),
          },
        ],
        resolved: false,
        author: th.author ?? "AI Assistant",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mutations.push({ kind: "createCommentThread", thread });
    }
  }

  // 11. Comments Reply Thread
  if (diff.comments?.replyThread && diff.comments.replyThread.length > 0) {
    for (const reply of diff.comments.replyThread) {
      const thread = snapshot.comments.find((t) => t.id === reply.threadId);
      if (thread) {
        const newEntry: CommentEntry = {
          id: `cmt-${Math.random().toString(36).slice(2, 9)}`,
          body: reply.body,
          author: reply.author ?? "AI Assistant",
          createdAt: Date.now(),
        };
        mutations.push({
          kind: "updateCommentThread",
          id: reply.threadId,
          changes: {
            comments: [...thread.comments, newEntry],
          },
        });
      }
    }
  }

  // 12. Comments Resolve Thread
  if (diff.comments?.resolveThread && diff.comments.resolveThread.length > 0) {
    for (const id of diff.comments.resolveThread) {
      mutations.push({
        kind: "updateCommentThread",
        id,
        changes: { resolved: true },
      });
    }
  }

  // 13. Comments Delete Thread
  if (diff.comments?.deleteThread && diff.comments.deleteThread.length > 0) {
    for (const id of diff.comments.deleteThread) {
      mutations.push({ kind: "deleteCommentThread", id });
    }
  }

  // 14. Meta
  if (diff.meta && Object.keys(diff.meta).length > 0) {
    mutations.push({ kind: "setMeta", entries: diff.meta });
  }

  return mutations;
};

/**
 * Apply a declarative diff to a FiroDoc.
 */
export const applyDiff = (doc: FiroDoc, diff: BoardDiff): CommitResult => {
  const mutations = diffToMutations(doc, diff);
  if (mutations.length === 0) {
    return {
      changed: false,
      applied: 0,
      localRevision: doc.read().elementOrder.length,
    };
  }
  return doc.commit(mutations);
};

/**
 * Apply a full updated DeclarativeBoard by computing the minimal diff and committing it.
 */
export const applyDeclarativeBoard = (
  doc: FiroDoc,
  newBoard: DeclarativeBoard,
): CommitResult => {
  const currentBoard = serializeDocToDeclarative(doc, {
    boardId: newBoard.id,
    title: newBoard.title,
  });
  const diff = computeDiff(currentBoard, newBoard);
  return applyDiff(doc, diff);
};
