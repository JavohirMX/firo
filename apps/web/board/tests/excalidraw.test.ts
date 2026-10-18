import { describe, expect, it } from "vitest";

import { createStickyNote } from "@firo/board/defaults";

import {
  isExcalidrawJson,
  convertExcalidrawToFiro,
  convertFiroToExcalidraw,
} from "../excalidraw";

describe("Bidirectional Excalidraw converter", () => {
  it("detects Excalidraw JSON scenes", () => {
    expect(
      isExcalidrawJson({ type: "excalidraw", version: 2, elements: [] }),
    ).toBe(true);
    expect(
      isExcalidrawJson({ elements: [{ id: "1", type: "rectangle" }] }),
    ).toBe(true);
    expect(isExcalidrawJson({ schemaVersion: 2, elements: [] })).toBe(false);
    expect(isExcalidrawJson(null)).toBe(false);
  });

  it("converts Excalidraw scene to Firo elements", async () => {
    const excalidrawScene = {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [
        {
          id: "rect-1",
          type: "rectangle",
          x: 100,
          y: 200,
          width: 150,
          height: 80,
          backgroundColor: "#ffc9c9",
          strokeColor: "#e03131",
          strokeWidth: 2,
        },
        {
          id: "text-1",
          type: "text",
          x: 120,
          y: 220,
          width: 100,
          height: 30,
          text: "Hello Excalidraw",
          fontSize: 20,
          fontFamily: 4,
          containerId: "rect-1",
        },
      ],
    };

    const { elements: firoElements } = await convertExcalidrawToFiro(
      excalidrawScene,
    );
    expect(firoElements.length).toBe(2);

    const rect = firoElements[0];
    expect(rect.id).toBe("rect-1");
    expect(rect.type).toBe("rectangle");
    expect(rect.x).toBe(100);

    const textEl = firoElements[1] as any;
    expect(textEl.type).toBe("text");
    expect(textEl.containerId).toBe("rect-1");
    expect(textEl.text).toBe("Hello Excalidraw");
  });

  it("converts Firo board back to Excalidraw JSON", () => {
    const note = createStickyNote({
      id: "note-1",
      x: 300,
      y: 400,
      backgroundColor: "#fff9b8",
      text: "Converted Note",
    });

    const firoBoard = {
      schemaVersion: 2,
      elements: [note],
    };

    const excalidrawScene = convertFiroToExcalidraw(firoBoard as any);
    expect(excalidrawScene.type).toBe("excalidraw");
    expect(excalidrawScene.version).toBe(2);
    expect(excalidrawScene.elements.length).toBeGreaterThanOrEqual(1);

    const exportedNote = excalidrawScene.elements[0];
    expect(exportedNote.id).toBe("note-1");
    expect(exportedNote.type).toBe("stickynote");
    expect(exportedNote.text).toBe("Converted Note");
  });
});
