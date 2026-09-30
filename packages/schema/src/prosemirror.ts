/**
 * ProseMirror integration.
 *
 * ADR-0004: every editable rich-text surface stores a ProseMirror document.
 * Rendering stays on canvas; editing mounts an `EditorView` positioned from the
 * same layout, so the two are pixel-identical. This file owns the *schema* and
 * the serialisation format; the binding and the editing surface are Phase 5.
 *
 * ## Why the schema is so small
 *
 * A whiteboard label is not a document. Every mark here has to survive being
 * drawn at 16 px, measured for contrast, and re-rendered to canvas, which rules
 * out most of ProseMirror's default suite:
 *
 * - **No headings, no lists, no blockquotes, no code blocks.** They are
 *   meaningless in a diagram label and each is a layout mode someone would have
 *   to implement on canvas.
 * - **No inline images.** A picture inside a label would be a second asset
 *   reference inside a text field, inside an element, inside a CRDT update. An
 *   image is its own element type.
 * - **No tables.** A table is a projection, not rich text (rule 4,
 *   [`../../AGENTS.md`](../../AGENTS.md)).
 *
 * What remains is the set that survives on canvas: bold, italic, underline,
 * strikethrough, inline code, and a link. Everything else is a Phase 5 decision
 * that has to be measured on rendered output first.
 *
 * ## Why the stored form is JSON, not a Yjs fragment
 *
 * A `ProseMirrorDoc` is stored as its `toJSON()` form inside the element's
 * `Y.Map`. A `y-prosemirror` binding is deliberately *not* used in Phase 1, and
 * the reason is the whole point of the ephemeral/durable split:
 *
 * - A collaborative `Y.XmlFragment` for text would put per-keystroke document
 *   updates into the CRDT. A committed text edit must be one undo step; a
 *   keystroke-rate binding makes that impossible and floods the update log.
 * - The text is small and only meaningful at commit boundaries, so a JSON
 *   round-trip on commit is cheaper than a live binding.
 * - Two people editing *different* elements' text is the common case. Element
 *   granularity (which `Y.Map` per element already gives us) resolves it.
 *
 * If a future phase proves a live binding is needed for a specific surface,
 * that is a per-field decision, and it belongs in an ADR.
 */
import { Schema } from "prosemirror-model";

import type { Node as ProseMirrorNode } from "prosemirror-model";

/**
 * The Firo rich-text schema.
 *
 * Exported as a single instance: ProseMirror schemas are immutable by
 * convention, and two of them would not interoperate.
 */
export const firoTextSchema = new Schema({
  nodes: {
    /*
     * `doc` is the document node and must be first. Its `content` expression is
     * `block+` rather than ProseMirror's default `block*` so that a document is
     * never empty: an element with a `text` field and no runs would render as
     * nothing, which is indistinguishable from a load failure.
     */
    doc: {
      content: "block+",
    },

    /*
     * The one block type. A paragraph, without the numbering or heading
     * semantics of its upstream equivalent.
     */
    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },

    text: {
      group: "inline",
    },
  },

  marks: {
    bold: {
      parseDOM: [{ tag: "b" }, { tag: "strong" }],
      toDOM: () => ["b", 0],
    },

    italic: {
      parseDOM: [{ tag: "i" }, { tag: "em" }],
      toDOM: () => ["i", 0],
    },

    underline: {
      parseDOM: [{ tag: "u" }],
      toDOM: () => ["u", 0],
    },

    strike: {
      parseDOM: [{ tag: "s" }, { tag: "del" }],
      toDOM: () => ["s", 0],
    },

    code: {
      // `code` is inline and excluded here on purpose: an inline code span on a
      // whiteboard label is a different visual treatment (monospace, no
      // underline) and Phase 5 decides whether it is worth a renderer path.
      parseDOM: [{ tag: "code" }],
      toDOM: () => ["code", 0],
    },

    link: {
      attrs: { href: {} },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (dom) => ({ href: (dom as Element).getAttribute("href") }),
        },
      ],
      toDOM: (mark) => ["a", mark.attrs, 0],
    },
  },
});

/**
 * The stored form of a rich-text value.
 *
 * This is ProseMirror's own `NodeJSON`. It is deliberately not a Firo-invented
 * shape: it is a published, versioned format with its own `toJSON`/`fromJSON`,
 * so a future Firo that changes its schema can still read this, and a file
 * written by a future Firo is recognisable rather than arbitrary.
 */
export type ProseMirrorDoc = ReturnType<ProseMirrorNode["toJSON"]>;

/** Build a document from stored JSON. Throws if the JSON is not valid. */
export const parseProseMirrorDoc = (json: unknown): ProseMirrorNode => {
  if (json === null || typeof json !== "object") {
    throw new TypeError(
      `A rich-text value must be a ProseMirror JSON object, got ${
        json === null ? "null" : typeof json
      }.`,
    );
  }
  return firoTextSchema.nodeFromJSON(json);
};

/** A minimal valid document, used as the migration default. */
export const emptyProseMirrorDoc = (): ProseMirrorDoc =>
  firoTextSchema
    .node("doc", null, [firoTextSchema.node("paragraph", null, [])])
    .toJSON() as ProseMirrorDoc;

/** Plain-text extraction, for canvas layout, search, and the accessibility tree. */
export const proseMirrorToPlainText = (json: ProseMirrorDoc): string => {
  const node = parseProseMirrorDoc(json);
  const parts: string[] = [];
  node.descendants((child) => {
    if (child.isText) {
      parts.push(child.text ?? "");
    }
    // A paragraph boundary is a real line break in the layout, so record it.
    else if (child.type.name === "paragraph" && parts.length) {
      parts.push("\n");
    }
  });
  return parts.join("");
};

/**
 * Whether a stored value is plausibly a ProseMirror doc.
 *
 * Structural, not exhaustive: it checks the shape a migration needs to decide
 * whether to repair, and leaves full validity to `parseProseMirrorDoc`. A strict
 * check here would reject a document from a future schema that is merely *newer*,
 * which is a different failure (and one that should be loud).
 */
export const isProseMirrorDoc = (value: unknown): value is ProseMirrorDoc => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const doc = value as { type?: unknown; content?: unknown };
  return doc.type === "doc" && Array.isArray(doc.content);
};
