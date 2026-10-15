/**
 * Mutation & Undo Builder for AI operations.
 *
 * Commits AI mutations atomically to `FiroDoc` via `doc.commit()`.
 * Strict guardrail: No AI write bypasses `@firo/doc`. Every AI operation executes
 * as a single atomic transaction, ensuring it can be completely undone in one
 * step via `doc.undo()`.
 */
import type { CommitResult, FiroDoc, Mutation } from "@firo/doc";

import type {
  ClusterResult,
  DiagramResult,
  TextToRecordsResult,
} from "./types.js";

/**
 * Commits mutations from any AI operation as a single atomic transaction to `FiroDoc`.
 *
 * Because all mutations are passed to one `doc.commit()` call, Yjs wraps them in a
 * single transaction with `LOCAL_ORIGIN`. This guarantees 100% undoability:
 * calling `doc.undo()` rolls back the entire AI operation at once.
 */
export function executeAiOperation(
  doc: FiroDoc,
  mutations: readonly Mutation[],
): CommitResult {
  if (!mutations || mutations.length === 0) {
    return {
      changed: false,
      applied: 0,
      localRevision: doc.revision,
    };
  }

  return doc.commit(mutations);
}

/**
 * Applies a sticky note clustering result to the board document atomically.
 */
export function applyClustering(
  doc: FiroDoc,
  result: ClusterResult,
): CommitResult {
  return executeAiOperation(doc, result.mutations);
}

/**
 * Applies a generated diagram (shapes, arrows, labels) to the board document atomically.
 */
export function applyDiagram(
  doc: FiroDoc,
  result: DiagramResult,
): CommitResult {
  return executeAiOperation(doc, result.mutations);
}

/**
 * Applies generated structured records to the document atomically.
 */
export function applyRecords(
  doc: FiroDoc,
  result: TextToRecordsResult,
): CommitResult {
  return executeAiOperation(doc, result.mutations);
}
