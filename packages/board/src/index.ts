/**
 * `@firo/board` — a board as the editor sees it.
 *
 * This package sits between the document model and the canvas. It exists because
 * those two halves are deliberately kept apart:
 *
 * - `@firo/doc` knows about Yjs, transactions and undo, and nothing about drawing.
 * - `@firo/element` knows about canvases, hit testing and rendering, and nothing
 *   about CRDTs.
 *
 * Neither is allowed to know about the other. `@firo/schema` is the shared
 * vocabulary, and this package is the only place the two vocabularies meet.
 *
 * ## The one rule that matters
 *
 * **The document is authoritative. The editor holds a lossy projection of it.**
 *
 * The projection is genuinely lossy, in ways that are documented per-field in
 * `./elements.ts`. Firo's `Binding` carries `focus` and `gap`; Excalidraw's
 * `boundElements` is only `{ id, type }` and keeps that geometry on the arrow
 * instead — a shape Firo does not have yet. So an element read out of the editor
 * and written back whole would silently destroy data the document is holding.
 *
 * Consequently nothing here ever writes a whole editor element back. Sync is
 * field-by-field, from the editor, into the document, and only for fields the
 * editor owns. Anything the editor cannot represent is left alone.
 *
 * This is the same rule as the single write path
 * ([`ADR-0016`](../../docs/adr/0016-enforce-the-write-path-with-a-proxy.md)):
 * there is one place durable state changes, and this package is not it.
 */

export {
  toEditorElement,
  toEditorElements,
  toEditorScene,
  fromEditorElements,
  EDITOR_OWNED_FIELDS,
  seedForId,
  labelIdFor,
} from "./elements.js";

export { createStickyNote, STICKY_NOTE_DEFAULTS } from "./defaults.js";
