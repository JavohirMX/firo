/**
 * Schema migrations.
 *
 * Rule 2: Every schema change ships with a migration and fixture.
 * Spreads previous objects to preserve unknown keys.
 */
import {
  createDocBlockCollection,
  DOC_BLOCK_COLLECTION_ID,
  DOC_BLOCK_COLLECTION_NAME,
} from "./records.js";

import type { ElementMigration } from "./registry.js";

/**
 * Element schema v3 -> v4: Doc Blocks on canvas (§10.5).
 *
 * Elements themselves do not change structure; migration preserves all fields.
 */
export const V3_TO_V4_DOC_BLOCKS: ElementMigration = {
  from: 3,
  to: 4,
  migrate: (raw) => ({ ...raw }),
};

/**
 * Board schema v4 migration.
 *
 * Spreads the previous board object, preserving all properties, unknown keys,
 * elements, and existing collections, and adds the default Doc Blocks collection
 * if not already present.
 */
export const migrateBoardV3ToV4 = <T extends Record<string, unknown>>(
  previousBoard: T,
  boardId?: string,
): T & { elementSchemaVersion: 4; collections: unknown[] } => {
  const existingCollections = Array.isArray(previousBoard.collections)
    ? (previousBoard.collections as Array<Record<string, unknown>>)
    : [];

  const hasDocBlocks = existingCollections.some(
    (c) =>
      c.id === DOC_BLOCK_COLLECTION_ID || c.name === DOC_BLOCK_COLLECTION_NAME,
  );

  const metaId =
    typeof (previousBoard.meta as { id?: string } | undefined)?.id === "string"
      ? (previousBoard.meta as { id: string }).id
      : "board-1";
  const effectiveBoardId = boardId ?? metaId;

  const docBlocksCollection = createDocBlockCollection(effectiveBoardId);

  const collections = hasDocBlocks
    ? existingCollections
    : [...existingCollections, docBlocksCollection];

  return {
    ...previousBoard,
    elementSchemaVersion: 4,
    collections,
  };
};

export const schemaV4Migration = migrateBoardV3ToV4;
