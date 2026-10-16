import { describe, expect, it } from "vitest";
import {
  asFractionalIndex,
  createDocBlockCollection,
  createDocBlockRecord,
  DOC_BLOCK_COLLECTION_ID,
  docBlockRecordFromFiroRecord,
  docBlockRecordToFiroRecord,
  isDocBlockRecord,
} from "@firo/schema";

import type { FiroRecord } from "@firo/schema";

import {
  applyDocBlockChange,
  createDefaultDocBlockNode,
  DOC_BLOCK_LAYOUT,
  docBlockProjection,
  docBlockSchema,
  docBlockToPlainText,
  parseDocBlockJson,
  serializeDocBlockNode,
} from "../src/index.js";

describe("Doc Block ProseMirror Schema", () => {
  it("defines all required marks: bold, italic, code, link", () => {
    expect(docBlockSchema.marks.bold).toBeDefined();
    expect(docBlockSchema.marks.italic).toBeDefined();
    expect(docBlockSchema.marks.code).toBeDefined();
    expect(docBlockSchema.marks.link).toBeDefined();
  });

  it("defines all required nodes: doc, paragraph, heading, lists, blockquote, codeBlock, hardBreak, horizontalRule, text", () => {
    const nodes = docBlockSchema.nodes;
    expect(nodes.doc).toBeDefined();
    expect(nodes.paragraph).toBeDefined();
    expect(nodes.heading).toBeDefined();
    expect(nodes.bulletList).toBeDefined();
    expect(nodes.orderedList).toBeDefined();
    expect(nodes.listItem).toBeDefined();
    expect(nodes.blockquote).toBeDefined();
    expect(nodes.codeBlock).toBeDefined();
    expect(nodes.hardBreak).toBeDefined();
    expect(nodes.horizontalRule).toBeDefined();
    expect(nodes.text).toBeDefined();
  });

  it("supports heading levels 1, 2, and 3", () => {
    const h1 = docBlockSchema.nodes.heading.create(
      { level: 1 },
      docBlockSchema.text("Title H1"),
    );
    const h2 = docBlockSchema.nodes.heading.create(
      { level: 2 },
      docBlockSchema.text("Section H2"),
    );
    const h3 = docBlockSchema.nodes.heading.create(
      { level: 3 },
      docBlockSchema.text("Subsection H3"),
    );

    expect(h1.attrs.level).toBe(1);
    expect(h2.attrs.level).toBe(2);
    expect(h3.attrs.level).toBe(3);
  });

  it("creates and formats formatted text runs with marks", () => {
    const boldMark = docBlockSchema.marks.bold.create();
    const italicMark = docBlockSchema.marks.italic.create();
    const codeMark = docBlockSchema.marks.code.create();
    const linkMark = docBlockSchema.marks.link.create({
      href: "https://example.com",
      title: "Example",
    });

    const boldText = docBlockSchema.text("bold", [boldMark]);
    const italicText = docBlockSchema.text("italic", [italicMark]);
    const codeText = docBlockSchema.text("code", [codeMark]);
    const linkText = docBlockSchema.text("link", [linkMark]);

    const p = docBlockSchema.nodes.paragraph.create(null, [
      boldText,
      docBlockSchema.text(" "),
      italicText,
      docBlockSchema.text(" "),
      codeText,
      docBlockSchema.text(" "),
      linkText,
    ]);

    expect(p.childCount).toBe(7);
    expect(p.child(0).marks[0].type.name).toBe("bold");
    expect(p.child(2).marks[0].type.name).toBe("italic");
    expect(p.child(4).marks[0].type.name).toBe("code");
    expect(p.child(6).marks[0].type.name).toBe("link");
    expect(p.child(6).marks[0].attrs.href).toBe("https://example.com");
  });

  it("creates lists and nested list items", () => {
    const item1 = docBlockSchema.nodes.listItem.create(
      null,
      docBlockSchema.nodes.paragraph.create(null, docBlockSchema.text("First")),
    );
    const item2 = docBlockSchema.nodes.listItem.create(
      null,
      docBlockSchema.nodes.paragraph.create(
        null,
        docBlockSchema.text("Second"),
      ),
    );

    const bulletList = docBlockSchema.nodes.bulletList.create(null, [
      item1,
      item2,
    ]);
    expect(bulletList.type.name).toBe("bulletList");
    expect(bulletList.childCount).toBe(2);

    const orderedList = docBlockSchema.nodes.orderedList.create({ order: 1 }, [
      item1,
      item2,
    ]);
    expect(orderedList.type.name).toBe("orderedList");
    expect(orderedList.attrs.order).toBe(1);
  });

  it("creates blockquote, codeBlock, and horizontalRule", () => {
    const quote = docBlockSchema.nodes.blockquote.create(
      null,
      docBlockSchema.nodes.paragraph.create(
        null,
        docBlockSchema.text("Quoted insight"),
      ),
    );
    const code = docBlockSchema.nodes.codeBlock.create(
      null,
      docBlockSchema.text("const x = 42;"),
    );
    const hr = docBlockSchema.nodes.horizontalRule.create();

    expect(quote.type.name).toBe("blockquote");
    expect(code.type.name).toBe("codeBlock");
    expect(hr.type.name).toBe("horizontalRule");
  });
});

describe("Doc Block Serialisation & Conversion", () => {
  it("creates default document node with title heading and empty paragraph", () => {
    const doc = createDefaultDocBlockNode("Architecture RFC");
    expect(doc.type.name).toBe("doc");
    expect(doc.childCount).toBe(2);
    expect(doc.child(0).type.name).toBe("heading");
    expect(doc.child(0).textContent).toBe("Architecture RFC");
    expect(doc.child(1).type.name).toBe("paragraph");
  });

  it("round-trips document to JSON and back", () => {
    const original = docBlockSchema.nodes.doc.create(null, [
      docBlockSchema.nodes.heading.create(
        { level: 1 },
        docBlockSchema.text("Meeting Notes"),
      ),
      docBlockSchema.nodes.paragraph.create(
        null,
        docBlockSchema.text("Action items:"),
      ),
      docBlockSchema.nodes.bulletList.create(null, [
        docBlockSchema.nodes.listItem.create(
          null,
          docBlockSchema.nodes.paragraph.create(
            null,
            docBlockSchema.text("Task A"),
          ),
        ),
      ]),
    ]);

    const json = serializeDocBlockNode(original);
    const restored = parseDocBlockJson(json);

    expect(restored.childCount).toBe(3);
    expect(restored.child(0).textContent).toBe("Meeting Notes");
    expect(restored.child(1).textContent).toBe("Action items:");
    expect(restored.child(2).type.name).toBe("bulletList");
  });

  it("recovers gracefully from malformed JSON", () => {
    const recovered = parseDocBlockJson({ invalid: true });
    expect(recovered.type.name).toBe("doc");
  });

  it("extracts plain text cleanly from structured doc blocks", () => {
    const doc = docBlockSchema.nodes.doc.create(null, [
      docBlockSchema.nodes.heading.create(
        { level: 1 },
        docBlockSchema.text("Overview"),
      ),
      docBlockSchema.nodes.paragraph.create(
        null,
        docBlockSchema.text("Here is the plan."),
      ),
      docBlockSchema.nodes.bulletList.create(null, [
        docBlockSchema.nodes.listItem.create(
          null,
          docBlockSchema.nodes.paragraph.create(
            null,
            docBlockSchema.text("Point 1"),
          ),
        ),
        docBlockSchema.nodes.listItem.create(
          null,
          docBlockSchema.nodes.paragraph.create(
            null,
            docBlockSchema.text("Point 2"),
          ),
        ),
      ]),
      docBlockSchema.nodes.codeBlock.create(
        null,
        docBlockSchema.text("console.log('done');"),
      ),
    ]);

    const plain = docBlockToPlainText(doc);
    expect(plain).toContain("Overview");
    expect(plain).toContain("Here is the plan.");
    expect(plain).toContain("• Point 1");
    expect(plain).toContain("• Point 2");
    expect(plain).toContain("```\nconsole.log('done');\n```");
  });
});

describe("DocBlockRecord & Record Store Interoperability", () => {
  it("creates DocBlockRecord with defaults", () => {
    const docBlock = createDocBlockRecord({ title: "Design Spec" });
    expect(docBlock.title).toBe("Design Spec");
    expect(docBlock.collectionId).toBe(DOC_BLOCK_COLLECTION_ID);
    expect(docBlock.dimensions.width).toBe(560);
    expect(docBlock.dimensions.height).toBe(400);
    expect(docBlock.styling.backgroundColor).toBe("#ffffff");
    expect(isDocBlockRecord(docBlock)).toBe(true);
  });

  it("round-trips between DocBlockRecord and FiroRecord", () => {
    const original = createDocBlockRecord({
      id: "doc-test-1",
      title: "System RFC",
      fragmentKey: "fragment-custom-key",
      dimensions: { width: 640, height: 480 },
      styling: {
        backgroundColor: "#f8f9fa",
        textColor: "#212529",
        fontSize: 18,
        padding: 32,
        borderRadius: 12,
      },
      order: asFractionalIndex("a0"),
    });

    const firoRecord = docBlockRecordToFiroRecord(original);
    expect(firoRecord.id).toBe("doc-test-1");
    expect(firoRecord.values.title).toEqual({
      type: "text",
      value: "System RFC",
    });
    expect(firoRecord.values.fragmentKey).toEqual({
      type: "text",
      value: "fragment-custom-key",
    });
    expect(firoRecord.values.width).toEqual({ type: "number", value: 640 });
    expect(firoRecord.values.height).toEqual({ type: "number", value: 480 });

    const restored = docBlockRecordFromFiroRecord(firoRecord);
    expect(restored.id).toBe(original.id);
    expect(restored.title).toBe(original.title);
    expect(restored.fragmentKey).toBe(original.fragmentKey);
    expect(restored.dimensions).toEqual(original.dimensions);
    expect(restored.styling).toEqual(original.styling);
    expect(restored.order).toBe(original.order);
  });
});

describe("Doc Block Projection Layout & Interaction", () => {
  const collection = createDocBlockCollection("board-1");

  const records: FiroRecord[] = [
    docBlockRecordToFiroRecord(
      createDocBlockRecord({
        id: "doc-1",
        title: "Sprint Planning",
        order: asFractionalIndex("a0"),
      }),
    ),
    docBlockRecordToFiroRecord(
      createDocBlockRecord({
        id: "doc-2",
        title: "Retrospective",
        order: asFractionalIndex("a1"),
      }),
    ),
  ];

  it("lays out Doc Blocks with coordinates and dimensions", () => {
    const elements = docBlockProjection.layout(collection, records, {
      originX: 100,
      originY: 50,
    });

    expect(elements).toHaveLength(2);

    const [first, second] = elements;
    expect(first.id).toBe("doc-block-doc-1");
    expect(first.recordId).toBe("doc-1");
    expect(first.type).toBe("card");
    expect(first.x).toBe(100);
    expect(first.y).toBe(50);
    expect(first.width).toBe(560);
    expect(first.height).toBe(400);
    expect(first.text).toBe("Sprint Planning");

    expect(second.id).toBe("doc-block-doc-2");
    expect(second.recordId).toBe("doc-2");
    expect(second.x).toBe(100 + 560 + DOC_BLOCK_LAYOUT.GAP_X);
    expect(second.y).toBe(50);
  });

  it("filters out archived records", () => {
    const withArchived: FiroRecord[] = [
      ...records,
      {
        ...records[0],
        id: "doc-archived",
        archived: true,
        order: asFractionalIndex("a2"),
      },
    ];

    const elements = docBlockProjection.layout(collection, withArchived);
    expect(elements).toHaveLength(2);
    expect(elements.some((e) => e.recordId === "doc-archived")).toBe(false);
  });

  it("applies incremental changes O(changed)", () => {
    const elements = docBlockProjection.layout(collection, records);

    const updatedRecord = docBlockRecordToFiroRecord(
      createDocBlockRecord({
        id: "doc-1",
        title: "Sprint Planning (Updated)",
        dimensions: { width: 600, height: 450 },
        order: asFractionalIndex("a0"),
      }),
    );

    const nextElements = applyDocBlockChange(
      records[0],
      updatedRecord,
      elements,
    );

    expect(nextElements).toHaveLength(2);
    expect(nextElements[0].text).toBe("Sprint Planning (Updated)");
    expect(nextElements[0].width).toBe(600);
    expect(nextElements[0].height).toBe(450);
    expect(nextElements[1]).toBe(elements[1]); // unmodified element reference preserved
  });

  it("interprets edit intent into RecordMutation", () => {
    const mutation = docBlockProjection.interpret(collection, records, {
      kind: "edit",
      recordId: "doc-1",
      columnKey: "title",
      value: "Roadmap 2027",
    });

    expect(mutation).toEqual({
      kind: "setField",
      recordId: "doc-1",
      columnKey: "title",
      value: { type: "text", value: "Roadmap 2027" },
    });
  });

  it("interprets reorder intent into RecordMutation", () => {
    const mutation = docBlockProjection.interpret(collection, records, {
      kind: "reorder",
      recordId: "doc-2",
      beforeId: "doc-1",
    });

    expect(mutation).toBeDefined();
    expect(mutation?.kind).toBe("setOrder");
    expect(mutation?.recordId).toBe("doc-2");
  });
});
