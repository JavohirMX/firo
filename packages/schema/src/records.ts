/**
 * Doc Block records for Phase 10 §10.5.
 *
 * Rule 4: Records are not elements.
 * A DocBlock is a typed row in a collection, rendered via a projection on the canvas.
 * Rule 3: Text is ProseMirror, not a string (TRD-05).
 */
import type { FractionalIndex } from "@firo/element/types";

import { asFractionalIndex } from "./types.js";

import type { Collection, Column, FiroRecord } from "./types.js";

export type DocBlockDimensions = Readonly<{
  width: number;
  height: number;
}>;

export type DocBlockStyling = Readonly<{
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  fontSize?: number;
  padding?: number;
  borderRadius?: number;
}>;

/**
 * A DocBlock record representing a structured ProseMirror document block on canvas.
 */
export type DocBlockRecord = Readonly<{
  id: string;
  collectionId: string;
  title: string;
  fragmentKey: string;
  dimensions: DocBlockDimensions;
  styling: DocBlockStyling;
  order: FractionalIndex;
  created: number;
  updated: number;
  archived?: boolean;
}>;

export const DEFAULT_DOC_BLOCK_DIMENSIONS: DocBlockDimensions = {
  width: 560,
  height: 400,
};

export const DEFAULT_DOC_BLOCK_STYLING: DocBlockStyling = {
  backgroundColor: "#ffffff",
  textColor: "#1e1e1e",
  fontSize: 16,
  padding: 24,
  borderRadius: 8,
};

export const DOC_BLOCK_COLLECTION_ID = "col-doc-blocks";
export const DOC_BLOCK_COLLECTION_NAME = "Doc Blocks";

export const DOC_BLOCK_COLUMNS: readonly Column[] = [
  { id: "c-title", key: "title", name: "Title", type: "text" },
  {
    id: "c-fragment-key",
    key: "fragmentKey",
    name: "Fragment Key",
    type: "text",
  },
  { id: "c-width", key: "width", name: "Width", type: "number" },
  { id: "c-height", key: "height", name: "Height", type: "number" },
  { id: "c-styling", key: "styling", name: "Styling", type: "text" },
] as const;

/**
 * Create a new DocBlock collection for a board.
 */
export const createDocBlockCollection = (boardId: string): Collection => ({
  id: DOC_BLOCK_COLLECTION_ID,
  boardId,
  name: DOC_BLOCK_COLLECTION_NAME,
  columns: DOC_BLOCK_COLUMNS,
  order: asFractionalIndex("a0"),
  version: 1,
});

/**
 * Create a new DocBlockRecord with default values.
 */
export const createDocBlockRecord = (
  overrides: Partial<DocBlockRecord> & { title: string },
): DocBlockRecord => {
  const now = Date.now();
  const id =
    overrides.id ?? `doc-${now}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    collectionId: overrides.collectionId ?? DOC_BLOCK_COLLECTION_ID,
    title: overrides.title,
    fragmentKey: overrides.fragmentKey ?? `fragment-${id}`,
    dimensions: {
      width: overrides.dimensions?.width ?? DEFAULT_DOC_BLOCK_DIMENSIONS.width,
      height:
        overrides.dimensions?.height ?? DEFAULT_DOC_BLOCK_DIMENSIONS.height,
    },
    styling: {
      ...DEFAULT_DOC_BLOCK_STYLING,
      ...overrides.styling,
    },
    order: overrides.order ?? asFractionalIndex("a0"),
    created: overrides.created ?? now,
    updated: overrides.updated ?? now,
    archived: overrides.archived ?? false,
  };
};

/**
 * Convert a DocBlockRecord into a generic FiroRecord for storage in the record store.
 */
export const docBlockRecordToFiroRecord = (
  docBlock: DocBlockRecord,
): FiroRecord => ({
  id: docBlock.id,
  collectionId: docBlock.collectionId,
  values: {
    title: { type: "text", value: docBlock.title },
    fragmentKey: { type: "text", value: docBlock.fragmentKey },
    width: { type: "number", value: docBlock.dimensions.width },
    height: { type: "number", value: docBlock.dimensions.height },
    styling: { type: "text", value: JSON.stringify(docBlock.styling) },
  },
  created: docBlock.created,
  updated: docBlock.updated,
  order: docBlock.order,
  archived: docBlock.archived ?? false,
});

/**
 * Convert a generic FiroRecord back into a typed DocBlockRecord.
 */
export const docBlockRecordFromFiroRecord = (
  record: FiroRecord,
): DocBlockRecord => {
  const titleVal = record.values.title;
  const fragVal = record.values.fragmentKey;
  const widthVal = record.values.width;
  const heightVal = record.values.height;
  const styleVal = record.values.styling;

  const title =
    titleVal && titleVal.type === "text" ? titleVal.value : "Untitled Doc";
  const fragmentKey =
    fragVal && fragVal.type === "text"
      ? fragVal.value
      : `fragment-${record.id}`;

  const width =
    widthVal && widthVal.type === "number"
      ? widthVal.value
      : DEFAULT_DOC_BLOCK_DIMENSIONS.width;
  const height =
    heightVal && heightVal.type === "number"
      ? heightVal.value
      : DEFAULT_DOC_BLOCK_DIMENSIONS.height;

  let styling: DocBlockStyling = { ...DEFAULT_DOC_BLOCK_STYLING };
  if (styleVal && styleVal.type === "text" && styleVal.value) {
    try {
      styling = { ...styling, ...JSON.parse(styleVal.value) };
    } catch {
      // keep default styling if parse fails
    }
  }

  return {
    id: record.id,
    collectionId: record.collectionId,
    title,
    fragmentKey,
    dimensions: { width, height },
    styling,
    order: record.order,
    created: record.created,
    updated: record.updated,
    archived: record.archived,
  };
};

/**
 * Type guard for DocBlockRecord.
 */
export const isDocBlockRecord = (value: unknown): value is DocBlockRecord => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.collectionId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.fragmentKey === "string" &&
    typeof candidate.dimensions === "object" &&
    candidate.dimensions !== null &&
    typeof (candidate.dimensions as { width?: unknown }).width === "number" &&
    typeof (candidate.dimensions as { height?: unknown }).height === "number"
  );
};
