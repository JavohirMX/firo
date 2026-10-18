/**
 * Doc Block structured document projection for Phase 10 §10.5.
 *
 * Rules:
 * - Rule 3: Text is ProseMirror, not a string (TRD-05).
 * - Rule 4: Records are not elements (TRD-06).
 *
 * Provides the full ProseMirror schema for structured canvas documents
 * and the Doc Block projection over the record store.
 */
import { Schema } from "prosemirror-model";
import {
  createDocBlockRecord,
  docBlockRecordToFiroRecord,
  docBlockRecordFromFiroRecord,
  DOC_BLOCK_COLLECTION_ID,
  isDocBlockRecord,
} from "@firo/schema";

import type { Collection, FiroRecord } from "@firo/schema";

import { orderedRecords, reorderMutation } from "./ordering.js";

import type { Node as ProseMirrorNode } from "prosemirror-model";
import type {
  LayoutContext,
  Projection,
  ProjectionElement,
  ProjectionIntent,
  RecordMutation,
} from "./types.js";

export {
  createDocBlockRecord,
  docBlockRecordToFiroRecord,
  docBlockRecordFromFiroRecord,
  DOC_BLOCK_COLLECTION_ID,
  isDocBlockRecord,
};

/**
 * The ProseMirror schema for structured Doc Blocks (§10.5, TRD-05).
 *
 * Marks: bold, italic, code, link.
 * Nodes: doc, paragraph, heading(1-3), bulletList, orderedList, listItem,
 *        blockquote, codeBlock, hardBreak, horizontalRule, text.
 */
export const docBlockSchema = new Schema({
  nodes: {
    doc: {
      content: "block+",
    },

    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },

    heading: {
      attrs: {
        level: { default: 1 },
      },
      content: "inline*",
      group: "block",
      defining: true,
      parseDOM: [
        { tag: "h1", attrs: { level: 1 } },
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
      ],
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },

    bulletList: {
      content: "listItem+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM: () => ["ul", 0],
    },

    orderedList: {
      attrs: {
        order: { default: 1 },
      },
      content: "listItem+",
      group: "block",
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (dom) => ({
            order: (dom as HTMLElement).hasAttribute("start")
              ? +(dom as HTMLElement).getAttribute("start")!
              : 1,
          }),
        },
      ],
      toDOM: (node) =>
        node.attrs.order === 1
          ? ["ol", 0]
          : ["ol", { start: node.attrs.order }, 0],
    },

    listItem: {
      content: "paragraph block*",
      defining: true,
      parseDOM: [{ tag: "li" }],
      toDOM: () => ["li", 0],
    },

    blockquote: {
      content: "block+",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "blockquote" }],
      toDOM: () => ["blockquote", 0],
    },

    codeBlock: {
      content: "text*",
      marks: "",
      group: "block",
      code: true,
      defining: true,
      parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
      toDOM: () => ["pre", ["code", 0]],
    },

    hardBreak: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM: () => ["br"],
    },

    horizontalRule: {
      group: "block",
      parseDOM: [{ tag: "hr" }],
      toDOM: () => ["hr"],
    },

    text: {
      group: "inline",
    },
  },

  marks: {
    bold: {
      parseDOM: [
        { tag: "strong" },
        { tag: "b" },
        { style: "font-weight=bold" },
        { style: "font-weight=700" },
      ],
      toDOM: () => ["strong", 0],
    },

    italic: {
      parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
      toDOM: () => ["em", 0],
    },

    code: {
      parseDOM: [{ tag: "code" }],
      toDOM: () => ["code", 0],
    },

    link: {
      attrs: {
        href: {},
        title: { default: null },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (dom) => ({
            href: (dom as HTMLElement).getAttribute("href"),
            title: (dom as HTMLElement).getAttribute("title"),
          }),
        },
      ],
      toDOM: (node) => [
        "a",
        { href: node.attrs.href, title: node.attrs.title },
        0,
      ],
    },
  },
});

/**
 * Create a default empty ProseMirror document for a Doc Block.
 */
export const createDefaultDocBlockNode = (title?: string): ProseMirrorNode => {
  const nodes = [];
  if (title) {
    nodes.push(
      docBlockSchema.nodes.heading.create(
        { level: 1 },
        docBlockSchema.text(title),
      ),
    );
  }
  nodes.push(docBlockSchema.nodes.paragraph.create());
  return docBlockSchema.nodes.doc.create(null, nodes);
};

/**
 * Parse a JSON-serialised ProseMirror node into a typed Node using docBlockSchema.
 */
export const parseDocBlockJson = (json: unknown): ProseMirrorNode => {
  if (!json || typeof json !== "object") {
    return createDefaultDocBlockNode();
  }
  try {
    return docBlockSchema.nodeFromJSON(json);
  } catch {
    return createDefaultDocBlockNode();
  }
};

/**
 * Serialise a ProseMirror Node to a JSON object.
 */
export const serializeDocBlockNode = (
  node: ProseMirrorNode,
): Record<string, unknown> => {
  return node.toJSON() as Record<string, unknown>;
};

/**
 * Extract plain text from a Doc Block ProseMirror node or JSON object.
 */
export const docBlockToPlainText = (
  input: ProseMirrorNode | Record<string, unknown>,
): string => {
  const node: ProseMirrorNode =
    "isText" in input && "type" in input
      ? (input as ProseMirrorNode)
      : parseDocBlockJson(input);

  const extractText = (n: ProseMirrorNode): string => {
    if (n.isText) {
      return n.text ?? "";
    }
    const childrenText: string[] = [];
    n.forEach((child) => {
      childrenText.push(extractText(child));
    });

    if (n.type.name === "paragraph" || n.type.name === "heading") {
      return `${childrenText.join("")}\n`;
    }
    if (n.type.name === "listItem") {
      return `• ${childrenText.join("").trim()}\n`;
    }
    if (n.type.name === "codeBlock") {
      return `\`\`\`\n${childrenText.join("")}\n\`\`\`\n`;
    }
    if (n.type.name === "blockquote") {
      return `> ${childrenText.join("").trim()}\n`;
    }
    if (n.type.name === "horizontalRule") {
      return "---\n";
    }
    if (n.type.name === "hardBreak") {
      return "\n";
    }

    return childrenText.join("");
  };

  return extractText(node).trim();
};

/**
 * Layout constant dimensions for Doc Blocks on canvas.
 */
export const DOC_BLOCK_LAYOUT = {
  DEFAULT_WIDTH: 560,
  DEFAULT_HEIGHT: 400,
  GAP_X: 40,
  GAP_Y: 40,
  HEADER_HEIGHT: 48,
} as const;

/**
 * Compute the canvas layout element for one Doc Block record.
 */
export const layoutDocBlockElement = (
  record: FiroRecord,
  index: number,
  context: LayoutContext = {},
): ProjectionElement => {
  const docBlock = docBlockRecordFromFiroRecord(record);
  const width = docBlock.dimensions.width;
  const height = docBlock.dimensions.height;

  const originX = context.originX ?? 0;
  const originY = context.originY ?? 0;

  // Lay out sequentially with comfortable canvas margins
  const x = originX + index * (width + DOC_BLOCK_LAYOUT.GAP_X);
  const y = originY;

  return {
    id: `doc-block-${record.id}`,
    recordId: record.id,
    type: "card",
    x,
    y,
    width,
    height,
    columnKey: "title",
    text: docBlock.title,
  };
};

/**
 * Incremental change application: O(changed records).
 */
export const applyDocBlockChange = (
  _previous: FiroRecord,
  next: FiroRecord,
  elements: readonly ProjectionElement[],
): readonly ProjectionElement[] => {
  const index = elements.findIndex((el) => el.recordId === next.id);
  if (index === -1) {
    return elements;
  }
  const updated = layoutDocBlockElement(next, index);
  const copy = [...elements];
  copy[index] = updated;
  return copy;
};

/**
 * The Doc Block projection over the record store (§10.5, TRD-06).
 *
 * Implements switchable, zero-reload projection layout over typed records.
 */
export const docBlockProjection: Projection = {
  id: "docBlock",
  name: "Doc Block",
  supports: ["edit", "reorder", "freePlacement"],

  layout: (
    collection: Collection,
    records: readonly FiroRecord[],
    context: LayoutContext = {},
  ): readonly ProjectionElement[] => {
    const relevant = records.filter(
      (r) => !r.archived && r.collectionId === collection.id,
    );
    const sorted = orderedRecords(relevant);

    const offset = context.offset ?? 0;
    const limit = context.limit ?? sorted.length;
    const windowed = sorted.slice(offset, offset + limit);

    return windowed.map((record, index) =>
      layoutDocBlockElement(record, offset + index, context),
    );
  },

  interpret: (
    _collection: Collection,
    records: readonly FiroRecord[],
    intent: ProjectionIntent,
  ): RecordMutation | null => {
    if (intent.kind === "edit") {
      return {
        kind: "setField",
        recordId: intent.recordId,
        columnKey: intent.columnKey,
        value: { type: "text", value: intent.value },
      };
    }

    if (intent.kind === "reorder") {
      return reorderMutation(records, intent.recordId, intent.beforeId);
    }

    return null;
  },
};
