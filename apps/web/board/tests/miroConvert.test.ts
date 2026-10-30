import { describe, expect, it } from "vitest";

import { DEFAULT_FONT_FAMILY } from "@firo/common";

import {
  convertFiroToMiroItems,
  convertMiroItemsToFiro,
  generateMiroCreationScript,
  mapMiroCapToArrowhead,
  miroHtmlToPlainText,
  miroHtmlToProseMirror,
  normalizeMiroColor,
} from "../miro";

import type { MiroItem } from "../miro";

describe("Miro conversion", () => {
  describe("htmlToText", () => {
    it("strips HTML tags and decodes entities", () => {
      const html =
        "<p>First line &amp; more</p><p>Second line &lt;test&gt;</p>";
      expect(miroHtmlToPlainText(html)).toBe(
        "First line & more\nSecond line <test>",
      );
    });

    it("handles line breaks <br>", () => {
      const html = "Hello<br/>World<br>Again";
      expect(miroHtmlToPlainText(html)).toBe("Hello\nWorld\nAgain");
    });
  });

  describe("mapMiroCapToArrowhead", () => {
    it("maps Miro line endings to Firo arrowheads", () => {
      expect(mapMiroCapToArrowhead("arrow")).toBe("arrow");
      expect(mapMiroCapToArrowhead("stealth")).toBe("arrow");
      expect(mapMiroCapToArrowhead("triangle")).toBe("triangle");
      expect(mapMiroCapToArrowhead("circle")).toBe("circle");
      expect(mapMiroCapToArrowhead("diamond")).toBe("diamond");
      expect(mapMiroCapToArrowhead("none")).toBeNull();
      expect(mapMiroCapToArrowhead(undefined)).toBeNull();
    });
  });

  describe("htmlToProseMirror rich text extraction", () => {
    it("extracts bold, italic, underline, strikethrough, code, and link marks", () => {
      const html =
        '<p><strong>Bold</strong> <em>Italic</em> <u>Underline</u> <s>Strike</s> <code>code</code> <a href="https://example.com">Link</a></p>';
      const doc = miroHtmlToProseMirror(html);

      expect(doc.type).toBe("doc");
      expect(doc.content).toHaveLength(1);

      const paragraph = doc.content![0];
      expect(paragraph.type).toBe("paragraph");
      expect(paragraph.content).toBeDefined();

      const textNodes = paragraph.content!;
      const boldNode = textNodes.find((n) => n.text === "Bold");
      expect(boldNode?.marks).toContainEqual({ type: "bold" });

      const italicNode = textNodes.find((n) => n.text === "Italic");
      expect(italicNode?.marks).toContainEqual({ type: "italic" });

      const underlineNode = textNodes.find((n) => n.text === "Underline");
      expect(underlineNode?.marks).toContainEqual({ type: "underline" });

      const strikeNode = textNodes.find((n) => n.text === "Strike");
      expect(strikeNode?.marks).toContainEqual({ type: "strike" });

      const codeNode = textNodes.find((n) => n.text === "code");
      expect(codeNode?.marks).toContainEqual({ type: "code" });

      const linkNode = textNodes.find((n) => n.text === "Link");
      expect(linkNode?.marks).toContainEqual({
        type: "link",
        attrs: { href: "https://example.com" },
      });
    });

    it("extracts text colors from span styles and font tags", () => {
      const html =
        '<p><span style="color: #ff0000">Red text</span> and <font color="#00ff00">Green text</font></p>';
      const doc = miroHtmlToProseMirror(html);
      const textNodes = doc.content![0].content!;

      const redNode = textNodes.find((n) => n.text === "Red text");
      expect(redNode?.marks).toContainEqual({
        type: "color",
        attrs: { color: "#ff0000" },
      });

      const greenNode = textNodes.find((n) => n.text === "Green text");
      expect(greenNode?.marks).toContainEqual({
        type: "color",
        attrs: { color: "#00ff00" },
      });
    });

    it("formats unordered lists with bullet prefixes and preserves inline marks", () => {
      const html =
        "<ul><li>First item</li><li>Second <strong>bold</strong> item</li></ul>";
      const doc = miroHtmlToProseMirror(html);

      expect(doc.content).toHaveLength(2);

      const p1 = doc.content![0];
      expect(p1.content![0].text).toBe("• First item");

      const p2 = doc.content![1];
      expect(p2.content![0].text).toBe("• Second ");
      expect(p2.content![1].text).toBe("bold");
      expect(p2.content![1].marks).toContainEqual({ type: "bold" });
      expect(p2.content![2].text).toBe(" item");
    });

    it("formats ordered lists with numbered prefixes", () => {
      const html = "<ol><li>Step one</li><li>Step two</li></ol>";
      const doc = miroHtmlToProseMirror(html);

      expect(doc.content).toHaveLength(2);
      expect(doc.content![0].content![0].text).toBe("1. Step one");
      expect(doc.content![1].content![0].text).toBe("2. Step two");
    });

    it("returns minimal valid document for empty or null HTML", () => {
      const docNull = miroHtmlToProseMirror(null);
      expect(docNull).toEqual({
        type: "doc",
        content: [{ type: "paragraph", content: [] }],
      });

      const docEmpty = miroHtmlToProseMirror("");
      expect(docEmpty).toEqual({
        type: "doc",
        content: [{ type: "paragraph", content: [] }],
      });
    });
  });

  describe("color mapping", () => {
    it("maps Miro color names to hex codes", () => {
      expect(normalizeMiroColor("yellow")).toBe("#fbf34c");
      expect(normalizeMiroColor("cyan")).toBe("#a6e3e9");
      expect(normalizeMiroColor("#123456")).toBe("#123456");
      expect(normalizeMiroColor(undefined, "transparent")).toBe("transparent");
    });
  });

  describe("convertMiroItemsToFiro", () => {
    it("converts sticky notes correctly with centered coordinates", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "sticky_1",
          type: "sticky_note",
          data: { content: "<p>Architecture Idea</p>" },
          position: { x: 200, y: 200, origin: "center" },
          geometry: { width: 100, height: 100 },
          style: { fillColor: "yellow", textAlign: "center" },
        },
      ];

      const { board } = await convertMiroItemsToFiro(miroItems, {
        boardMeta: { name: "Test Board" },
      });

      expect(board.meta.name).toBe("Test Board");
      expect(board.elements.length).toBe(1);

      const note = board.elements[0];
      expect(note.type).toBe("stickynote");
      expect(note.text).toBe("Architecture Idea");
      // Top-left: x = 200 - 100/2 = 150, y = 200 - 100/2 = 150
      expect(note.x).toBe(150);
      expect(note.y).toBe(150);
      expect(note.backgroundColor).toBe("#fbf34c");
      expect(note.textAlign).toBe("center");
    });

    it("converts shapes (circle to ellipse, round rectangle)", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "circle_1",
          type: "shape",
          data: { shape: "circle" },
          position: { x: 100, y: 100, origin: "center" },
          geometry: { width: 80, height: 80 },
          style: { fillColor: "cyan", borderColor: "#000000" },
        },
        {
          id: "rect_1",
          type: "shape",
          data: { shape: "round_rectangle" },
          position: { x: 300, y: 300, origin: "center" },
          geometry: { width: 120, height: 60 },
        },
      ];

      const { board } = await convertMiroItemsToFiro(miroItems);

      expect(board.elements.length).toBe(2);
      expect(board.elements[0].type).toBe("ellipse");
      expect(board.elements[0].backgroundColor).toBe("#a6e3e9");

      expect(board.elements[1].type).toBe("rectangle");
      expect(board.elements[1].roundness).toEqual({ type: 3 });
    });

    it("converts frames and preserves containment", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "frame_1",
          type: "frame",
          data: { title: "Sprint 1" },
          position: { x: 500, y: 500, origin: "center" },
          geometry: { width: 400, height: 300 },
        },
        {
          id: "item_in_frame",
          type: "sticky_note",
          parentId: "frame_1",
          data: { content: "Inside Frame" },
          position: { x: 450, y: 450, origin: "center" },
          geometry: { width: 100, height: 100 },
        },
      ];

      const { board } = await convertMiroItemsToFiro(miroItems);

      const frame = board.elements.find((e) => e.type === "frame");
      const note = board.elements.find((e) => e.type === "stickynote");

      expect(frame).toBeDefined();
      expect(frame?.name).toBe("Sprint 1");

      expect(note).toBeDefined();
      expect(note?.containerId).toBe("frame_1");
      expect(note?.frameId).toBe("frame_1");
    });

    it("converts connectors and binds endpoints", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "n1",
          type: "sticky_note",
          data: { content: "Node 1" },
        },
        {
          id: "n2",
          type: "sticky_note",
          data: { content: "Node 2" },
        },
        {
          id: "c1",
          type: "connector",
          start: { item: "n1" },
          end: { item: "n2" },
        },
      ];

      const { board } = await convertMiroItemsToFiro(miroItems);
      const arrow = board.elements.find((e) => e.type === "arrow");

      expect(arrow).toBeDefined();
      const bindings = arrow?.bindings as { elementId: string }[];
      expect(bindings.length).toBe(2);
      expect(bindings[0].elementId).toBe("n1");
      expect(bindings[1].elementId).toBe("n2");
    });

    it("translates frame-relative coordinates to absolute canvas positions", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "frame_parent",
          type: "frame",
          data: { title: "Section" },
          position: { x: 1000, y: 1000, origin: "center" }, // top-left is 600, 700
          geometry: { width: 800, height: 600 },
        },
        {
          id: "child_note",
          type: "sticky_note",
          parentId: "frame_parent",
          data: { content: "Child Note" },
          position: { x: 100, y: 150, origin: "top-left" },
          geometry: { width: 100, height: 100 },
        },
      ];

      const { board } = await convertMiroItemsToFiro(miroItems);
      const child = board.elements.find((e) => e.id === "child_note");

      expect(child).toBeDefined();
      // Frame top-left is 1000 - 400 = 600, 1000 - 300 = 700.
      // Relative child top-left 100, 150 -> absolute canvas 700, 850.
      expect(child?.x).toBe(700);
      expect(child?.y).toBe(850);
      expect(child?.frameId).toBe("frame_parent");
    });

    it("resolves images using URL resource ID and maps to assets", async () => {
      const fakePng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      const mediaFiles = new Map<string, Uint8Array>([["88888", fakePng]]);

      const miroItems: MiroItem[] = [
        {
          id: "img_1",
          type: "image",
          data: {
            url: "https://miro.com/api/v1/boards/uXjVO123/resources/88888/download",
          },
          position: { x: 200, y: 200 },
          geometry: { width: 400, height: 300 },
        },
      ];

      const { board, assetsToPut } = await convertMiroItemsToFiro(miroItems, {
        mediaFiles,
      });

      expect(board.elements.length).toBe(1);
      const img = board.elements[0];
      expect(img.type).toBe("image");
      expect(img.fileId).toBeTruthy();
      expect(assetsToPut.size).toBe(1);
      const firstAsset = Array.from(assetsToPut.values())[0];
      expect(firstAsset.mimeType).toBe("image/png");
    });

    it("picks high-contrast white text for dark sticky note backgrounds", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "dark_note",
          type: "sticky_note",
          data: { content: "Dark Note" },
          style: { fillColor: "black" },
          position: { x: 0, y: 0 },
          geometry: { width: 100, height: 100 },
        },
      ];

      const { board } = await convertMiroItemsToFiro(miroItems);
      const note = board.elements[0];
      expect(note.strokeColor).toBe("#ffffff");
    });

    it("calculates relative position cascades accurately for arbitrarily nested elements (sticky in card in frame in section)", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "sec_1",
          type: "section",
          data: { title: "Architecture Section" },
          position: { x: 1000, y: 1000, origin: "top-left" },
          geometry: { width: 2000, height: 1600 },
        },
        {
          id: "frame_1",
          type: "frame",
          parentId: "sec_1",
          data: { title: "Inner Frame" },
          position: { x: 200, y: 150, origin: "top-left" },
          geometry: { width: 1000, height: 800 },
        },
        {
          id: "card_1",
          type: "card",
          parentId: "frame_1",
          data: {
            title: "API Gateway Card",
            description: "Handles incoming routing",
          },
          position: { x: 100, y: 120, origin: "top-left" },
          geometry: { width: 300, height: 180 },
        },
        {
          id: "sticky_1",
          type: "sticky_note",
          parentId: "card_1",
          data: { content: "<p><strong>Auth</strong> token check</p>" },
          position: { x: 30, y: 40, origin: "top-left" },
          geometry: { width: 100, height: 100 },
        },
      ];

      const { board } = await convertMiroItemsToFiro(miroItems);

      const sectionEl = board.elements.find((e) => e.id === "sec_1");
      const frameEl = board.elements.find((e) => e.id === "frame_1");
      const cardEl = board.elements.find((e) => e.id === "card_1");
      const stickyEl = board.elements.find((e) => e.id === "sticky_1");

      expect(sectionEl).toBeDefined();
      expect(frameEl).toBeDefined();
      expect(cardEl).toBeDefined();
      expect(stickyEl).toBeDefined();

      // Section is at top-level canvas coords
      expect(sectionEl?.x).toBe(1000);
      expect(sectionEl?.y).toBe(1000);
      expect(sectionEl?.width).toBe(2000);
      expect(sectionEl?.height).toBe(1600);

      // Frame top-left = section.x + 200, section.y + 150 = 1200, 1150
      expect(frameEl?.x).toBe(1200);
      expect(frameEl?.y).toBe(1150);
      expect(frameEl?.containerId).toBe("sec_1");
      expect(frameEl?.frameId).toBe("sec_1");

      // Card top-left = frame.x + 100, frame.y + 120 = 1300, 1270
      expect(cardEl?.x).toBe(1300);
      expect(cardEl?.y).toBe(1270);
      expect(cardEl?.containerId).toBe("frame_1");
      expect(cardEl?.frameId).toBe("frame_1");

      // Sticky top-left = card.x + 30, card.y + 40 = 1330, 1310
      expect(stickyEl?.x).toBe(1330);
      expect(stickyEl?.y).toBe(1310);
      expect(stickyEl?.containerId).toBe("card_1");
      expect(stickyEl?.frameId).toBe("frame_1");

      // Verify Z-Index order: outer section (depth 0) before frame (depth 1) before card before sticky
      const secIdx = board.elements.findIndex((e) => e.id === "sec_1");
      const frameIdx = board.elements.findIndex((e) => e.id === "frame_1");
      const cardIdx = board.elements.findIndex((e) => e.id === "card_1");
      const stickyIdx = board.elements.findIndex((e) => e.id === "sticky_1");

      expect(secIdx).toBeLessThan(frameIdx);
      expect(frameIdx).toBeLessThan(cardIdx);
      expect(cardIdx).toBeLessThan(stickyIdx);
    });

    it("converts orthogonal elbow connectors with labels and line endings", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "step_a",
          type: "shape",
          data: { shape: "rectangle", content: "Step A" },
          position: { x: 100, y: 100, origin: "top-left" },
          geometry: { width: 100, height: 60 },
        },
        {
          id: "step_b",
          type: "shape",
          data: { shape: "rectangle", content: "Step B" },
          position: { x: 400, y: 300, origin: "top-left" },
          geometry: { width: 100, height: 60 },
        },
        {
          id: "conn_1",
          type: "connector",
          shape: "elbowed",
          start: { item: "step_a" },
          end: { item: "step_b" },
          style: {
            startStrokeCap: "circle",
            endStrokeCap: "triangle",
            strokeColor: "#ff5500",
            strokeWidth: 3,
            strokeStyle: "dashed",
          },
          captions: [
            {
              content: "Data Pipeline",
              position: 0.5,
            },
          ],
        },
      ];

      const { board } = await convertMiroItemsToFiro(miroItems);

      const arrow = board.elements.find((e) => e.id === "conn_1");
      expect(arrow).toBeDefined();
      expect(arrow?.type).toBe("arrow");
      expect(arrow?.elbowed).toBe(true);
      expect(arrow?.roundness).toBeNull();
      expect(arrow?.startArrowhead).toBe("circle");
      expect(arrow?.endArrowhead).toBe("triangle");
      expect(arrow?.strokeColor).toBe("#ff5500");
      expect(arrow?.strokeWidth).toBe(3);
      expect(arrow?.strokeStyle).toBe("dashed");

      // Start: Step A center = (150, 130)
      // End: Step B center = (450, 330)
      // dx = 300, dy = 200
      expect(arrow?.points).toEqual([
        [0, 0],
        [150, 0],
        [150, 200],
        [300, 200],
      ]);

      // Check bound label text element
      const boundElements = arrow?.boundElements as {
        id: string;
        type: string;
      }[];
      expect(boundElements).toHaveLength(1);
      expect(boundElements[0].type).toBe("text");

      const labelEl = board.elements.find((e) => e.id === boundElements[0].id);
      expect(labelEl).toBeDefined();
      expect(labelEl?.type).toBe("text");
      expect(labelEl?.text).toBe("Data Pipeline");
      expect(labelEl?.containerId).toBe("conn_1");
      expect(labelEl?.textAlign).toBe("center");
      expect(labelEl?.verticalAlign).toBe("middle");
      expect(labelEl?.richText).toBeDefined();
    });

    it("converts curved connectors with proportional roundness", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "c_curve",
          type: "connector",
          shape: "curved",
          position: { x: 50, y: 50, origin: "top-left" },
          geometry: { width: 200, height: 100 },
          style: {
            endStrokeCap: "diamond",
          },
        },
      ];

      const { board } = await convertMiroItemsToFiro(miroItems);
      const arrow = board.elements.find((e) => e.id === "c_curve");

      expect(arrow).toBeDefined();
      expect(arrow?.elbowed).toBe(false);
      expect(arrow?.roundness).toEqual({ type: 2 });
      expect(arrow?.endArrowhead).toBe("diamond");
      expect(arrow?.points).toEqual([
        [0, 0],
        [100, 50],
        [200, 100],
      ]);
    });

    it("preserves ProseMirror richText formatting on converted elements", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "rich_sticky",
          type: "sticky_note",
          data: {
            content:
              "<p><strong>High priority:</strong> <em>Refactor</em> sync logic</p><ul><li>Write tests</li><li>Check perf</li></ul>",
          },
          position: { x: 100, y: 100 },
          geometry: { width: 200, height: 200 },
        },
      ];

      const { board } = await convertMiroItemsToFiro(miroItems);
      const note = board.elements[0];

      // Plain text for canvas renderer compatibility
      expect(typeof note.text).toBe("string");
      expect(note.text).toContain("High priority: Refactor sync logic");
      expect(note.text).toContain("Write tests");

      // ProseMirror document for rich-text fidelity
      const richText = note.richText as { type: string; content?: unknown[] };
      expect(richText).toBeDefined();
      expect(richText.type).toBe("doc");
      expect(Array.isArray(richText.content)).toBe(true);
      expect(richText.content?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("real .rtb backup serialization (grounded 2026-10-30)", () => {
    it("maps light_pink fillColor instead of dropping it to transparent", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "lp1",
          type: "sticky_note",
          shape: "square",
          content: "note",
          style: { fillColor: "light_pink" },
          origin: "center",
          relativeTo: "canvas_center",
          x: 0,
          y: 0,
          width: 200,
          height: 200,
        },
      ];
      const { board } = await convertMiroItemsToFiro(miroItems);
      const el = board.elements.find((e) => e.id === "lp1");
      expect(el?.backgroundColor).toBe("#ffd5f3");
    });

    it("honors top-level origin field from backup items", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "o1",
          type: "sticky_note",
          shape: "square",
          content: "note",
          origin: "top-left",
          relativeTo: "canvas_center",
          x: 100,
          y: 50,
          width: 200,
          height: 100,
        },
      ];
      const { board } = await convertMiroItemsToFiro(miroItems);
      const el = board.elements.find((e) => e.id === "o1");
      expect(el?.x).toBe(100);
      expect(el?.y).toBe(50);
    });

    it("resolves fractional bound connector endpoints against item bounds", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "a",
          type: "sticky_note",
          shape: "square",
          content: "A",
          origin: "center",
          x: 0,
          y: 0,
          width: 200,
          height: 200,
        },
        {
          id: "b",
          type: "sticky_note",
          shape: "square",
          content: "B",
          origin: "center",
          x: 1000,
          y: 0,
          width: 200,
          height: 200,
        },
        {
          id: "c1",
          type: "connector",
          shape: "straight",
          start: { item: "a", position: { x: 1, y: 0.75 }, snapTo: "right" },
          end: { item: "b", position: { x: 0, y: 0.25 }, snapTo: "left" },
          width: 800,
          height: 0,
        },
      ];
      const { board } = await convertMiroItemsToFiro(miroItems);
      const arrow = board.elements.find((e) => e.type === "arrow");
      expect(arrow).toBeDefined();
      // A box is x:-100..100; right edge at x=100, y at (0.75-0.5)*200=50.
      expect(arrow?.x).toBeCloseTo(100, 5);
      expect(arrow?.y).toBeCloseTo(50, 5);
      // B box is x:900..1100; left edge x=900 -> dx=800.
      expect(arrow?.width).toBeCloseTo(800, 5);
      const startBinding = arrow?.startBinding as { focus: number };
      const endBinding = arrow?.endBinding as { focus: number };
      expect(startBinding.focus).toBeCloseTo(0.5, 5);
      expect(endBinding.focus).toBeCloseTo(-0.5, 5);
    });
  });

  describe("Firo to Miro export", () => {
    it("converts Firo elements back to Miro items", () => {
      const firoElements = [
        {
          id: "firo_note",
          type: "stickynote",
          text: "Back to Miro",
          x: 100,
          y: 100,
          width: 150,
          height: 150,
          backgroundColor: "#fbf34c",
          textAlign: "center",
        },
      ];

      const miroItems = convertFiroToMiroItems(firoElements);
      expect(miroItems.length).toBe(1);
      expect(miroItems[0].type).toBe("sticky_note");
      expect(miroItems[0].data?.content).toBe("Back to Miro");
      expect(miroItems[0].position?.x).toBe(175); // 100 + 150/2
      expect(miroItems[0].position?.y).toBe(175);
      expect(miroItems[0].style?.fillColor).toBe("yellow");
    });

    it("generates an executable Miro Web SDK script", () => {
      const firoElements = [
        {
          id: "el1",
          type: "stickynote",
          text: "Hello",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ];

      const script = generateMiroCreationScript(firoElements);
      expect(script).toContain("miro.board.createStickyNote");
      expect(script).toContain("Hello");
    });
  });

  describe("Miro import enhancements", () => {
    it("scales font size according to Miro item.scale", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "text-scale-1",
          type: "text",
          data: { content: "Scaled Title" },
          position: { x: 0, y: 0 },
          geometry: { width: 200, height: 50 },
          style: { fontSize: 14 },
          scale: 2.5,
        },
      ];

      const { board } = await convertMiroItemsToFiro(miroItems);
      expect(board.elements.length).toBe(1);
      const textEl = board.elements[0];
      expect(textEl.type).toBe("text");
      // 14 * 2.5 = 35
      expect(textEl.fontSize).toBe(35);
      expect(textEl.fontFamily).toBe(DEFAULT_FONT_FAMILY);
    });

    it("quantizes sticky note font size to valid schema values [16, 20, 28, 36]", async () => {
      const miroItems: MiroItem[] = [
        {
          id: "sticky-1",
          type: "sticky_note",
          data: { content: "Small sticky" },
          position: { x: 0, y: 0 },
          geometry: { width: 100, height: 100 },
          style: { fontSize: 13 },
        },
        {
          id: "sticky-2",
          type: "sticky_note",
          data: { content: "Medium sticky" },
          position: { x: 200, y: 0 },
          geometry: { width: 100, height: 100 },
          style: { fontSize: 22 },
        },
        {
          id: "sticky-3",
          type: "sticky_note",
          data: { content: "Large sticky" },
          position: { x: 400, y: 0 },
          geometry: { width: 100, height: 100 },
          style: { fontSize: 34 },
        },
      ];

      const { board } = await convertMiroItemsToFiro(miroItems);
      expect(board.elements.length).toBe(3);

      expect(board.elements[0].fontSize).toBe(16);
      expect(board.elements[0].textAlign).toBe("center");
      expect(board.elements[0].verticalAlign).toBe("middle");

      expect(board.elements[1].fontSize).toBe(20);
      expect(board.elements[2].fontSize).toBe(36);
    });

    it("extracts and indexes media files into assetsToPut", async () => {
      const pngBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const mediaFiles = new Map<string, Uint8Array>([
        ["resources/12345.png", pngBytes],
      ]);

      const miroItems: MiroItem[] = [
        {
          id: "img-1",
          type: "image",
          data: {},
          position: { x: 100, y: 100 },
          geometry: { width: 200, height: 150 },
          resourceId: "12345",
        },
      ];

      const { board, assetsToPut } = await convertMiroItemsToFiro(miroItems, {
        mediaFiles,
      });

      expect(board.elements.length).toBe(1);
      const imgEl = board.elements[0];
      expect(imgEl.type).toBe("image");
      expect(imgEl.fileId).toBeDefined();

      expect(assetsToPut.size).toBe(1);
      const asset = Array.from(assetsToPut.values())[0];
      expect(asset.hash).toBe(imgEl.fileId);
      expect(asset.mimeType).toBe("image/png");
      expect(asset.bytes).toEqual(pngBytes);
    });
  });
});
