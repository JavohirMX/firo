/**
 * `@firo/doc` — one board's document, its write path, and its local store.
 *
 * ## The one rule
 *
 * **`commit()` is the only thing that writes to the Yjs document, and the
 * package enforces it.** A `beforeTransaction` hook throws on any transaction
 * whose origin this package did not set, so a stray write is a thrown error at
 * the point of the mistake rather than a board that is 300x its content size six
 * months later.
 *
 * The other half of the same rule is `setEphemeral()`, which goes to Yjs
 * awareness. A five-second drag through it produces **zero** document updates,
 * and `durableUpdates` is the counter that proves it.
 *
 * ## Why there is no UI here
 *
 * This is the data layer. It has no canvas, no React, and no knowledge of how
 * anything is drawn -- which is what makes the data model testable exhaustively
 * without a browser, and why the TRD puts it before the renderer
 * ([`../../../docs/plans/phase-1-document-model.md`](../../../docs/plans/phase-1-document-model.md)).
 */
export { FiroDoc, createFiroDoc } from "./doc.js";
export {
  UnauthoredWriteError,
  WriteGuard,
  guardedDoc,
  knownReadMethods,
  MUTATING,
} from "./guard.js";
export type { BoardSnapshot, BoardImport, CommitResult } from "./doc.js";

export {
  LOCAL_ORIGIN,
  REMOTE_ORIGIN,
  LOAD_ORIGIN,
  isKnownOrigin,
} from "./origin.js";

export {
  EVERY_KIND_IS_LISTED,
  MUTATION_KINDS,
  isMutation,
} from "./mutations.js";
export type {
  AssetReference,
  ElementChanges,
  ElementUpdate,
  Mutation,
  RecordChanges,
  RecordUpdate,
} from "./mutations.js";

export {
  applyEphemeralPatch,
  AWARENESS_KEY,
  EMPTY_EPHEMERAL_STATE,
} from "./ephemeral.js";
export type {
  DragPreview,
  EphemeralPatch,
  EphemeralPresentation,
  EphemeralReveal,
  EphemeralState,
  EphemeralTimer,
} from "./ephemeral.js";

/*
 * The readers, exported as a family.
 *
 * `readAllAssets` joined three siblings that were reachable only by deep import
 * into the package. Exposing one of the four from the root and not the other
 * three would be an arbitrary line: they are the same shape, they are the same
 * `fromYMap` pattern, and a caller who wants one has the same reason to want the
 * others.
 */
export {
  ROOTS,
  fromYMap,
  isPlainObject,
  readAllAssets,
  readAllCollections,
  readAllElements,
  readAllRecords,
  structure,
  toYMap,
} from "./structure.js";
export type { DocStructure, ElementNode, RootName } from "./structure.js";

export {
  applyRemoteUpdate,
  boardKey,
  loadInto,
  openBoard,
  openBoardMemory,
} from "./persistence.js";
export type { BoardPersistence } from "./persistence.js";

export {
  clearAssets,
  clearBoardIndex,
  getAsset,
  getAssetBytes,
  getAssetMimeType,
  getBoard,
  hasAsset,
  hashBytes,
  listBoardIds,
  listBoards,
  putAsset,
  putBoard,
  removeFromIndex,
  touchBoard,
} from "./library.js";
export type { AssetData, BoardIndexEntry, StoredAsset } from "./library.js";
