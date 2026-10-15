import { describe, expect, it } from "vitest";

import {
  convertFiroToMiroItems,
  convertMiroItemsToFiro,
  generateMiroCreationScript,
  miroHtmlToPlainText,
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
});
