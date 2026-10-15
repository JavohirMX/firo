import * as Y from "yjs";

import type { Role } from "../db/schema.js";

const DEFAULT_ARRAY_ROOTS = ["elementOrder", "recordOrder"];
const DEFAULT_MAP_ROOTS = [
  "elements",
  "collections",
  "records",
  "comments",
  "meta",
  "assets",
];

/**
 * Checks whether an update submitted by a commenter modifies ONLY the `comments` partition.
 *
 * If the update touches `elements`, `collections`, `records`, `meta`, `assets`,
 * ordering arrays, or any other root partition, it returns false.
 */
export function isCommenterUpdateAllowed(
  roomDoc: Y.Doc,
  update: Uint8Array,
): boolean {
  const testDoc = new Y.Doc();
  let touchedNonComment = false;

  const markTouched = () => {
    touchedNonComment = true;
  };

  for (const name of DEFAULT_ARRAY_ROOTS) {
    testDoc.getArray(name).observeDeep(markTouched);
  }

  for (const name of DEFAULT_MAP_ROOTS) {
    if (name !== "comments") {
      testDoc.getMap(name).observeDeep(markTouched);
    } else {
      // Ensure comments map exists so it doesn't look like an unexpected root
      testDoc.getMap(name);
    }
  }

  // Pre-seed testDoc with room state
  Y.applyUpdate(testDoc, Y.encodeStateAsUpdate(roomDoc));
  const initialKeys = new Set(testDoc.share.keys());

  touchedNonComment = false;

  try {
    Y.applyUpdate(testDoc, update);
  } catch {
    return false;
  }

  for (const key of testDoc.share.keys()) {
    if (key !== "comments" && !initialKeys.has(key)) {
      touchedNonComment = true;
    }
  }

  return !touchedNonComment;
}

export function canRoleWriteUpdate(
  role: Role,
  roomDoc: Y.Doc,
  update: Uint8Array,
): boolean {
  if (role === "viewer") {
    return false;
  }
  if (role === "commenter") {
    return isCommenterUpdateAllowed(roomDoc, update);
  }
  if (role === "editor" || role === "owner") {
    return true;
  }
  return false;
}
