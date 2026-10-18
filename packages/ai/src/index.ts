/**
 * `@firo/ai` — Local-first AI engine for Firo whiteboard and record store.
 *
 * All operations execute against local models (Ollama, OpenAI-compatible local servers).
 * Strict NFR-3: Zero telemetry or cloud network calls.
 * Strict guardrail: Every AI mutation commits through `@firo/doc` and is 100% undoable.
 */

// Types & Errors
export * from "./types.js";

// Client
export {
  createLlmClient,
  extractJsonFromText,
  LocalLlmClient,
  resolveEndpointUrl,
} from "./client.js";

// Operations
export { clusterStickyNotes } from "./operations/cluster.js";
export { summarizeBoard, summarizeComments } from "./operations/summarize.js";
export { textToDiagram } from "./operations/diagram.js";
export { textToRecords } from "./operations/records.js";
export { createElementBase, textToProseMirrorDoc } from "./operations/utils.js";

// Executor & Undo Builder
export {
  applyClustering,
  applyDiagram,
  applyRecords,
  executeAiOperation,
} from "./executor.js";
