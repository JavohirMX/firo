import { describe, expect, it } from "vitest";

import { createStickyNote } from "@firo/board/defaults";
import { setCustomTextMetricsProvider } from "@firo/element";

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

  it("restores a sticky note's label already fitted inside the note", () => {
    /*
     * Regression: a note persisted at the auto-fit ceiling (fontSize 55 on a
     * 250px note, the mirror's pre-fit value) used to come back with its
     * label drawn raw — unwrapped, at 55, overflowing the note's left edge —
     * until a post-mount reflow happened to win its race against the scene
     * mount. The conversion now lays the note and label out itself, so the
     * label is born wrapped and contained on every load.
     *
     * The test environment's default text metrics are font-size independent
     * (character count times a constant), which would let any fontSize "fit"
     * and defeat the shrink assertion. Approximate a real canvas instead:
     * width proportional to the font size carried in the font string.
     */
    setCustomTextMetricsProvider({
      getLineWidth: (text, fontString) => {
        const px = Number(/(\d+(?:\.\d+)?)px/.exec(fontString)?.[1] ?? 20);
        return text.length * px * 0.55;
      },
    });

    const short = createStickyNote({
      id: "note-fit",
      x: 375,
      y: 275,
      width: 250,
      height: 250,
      text: "Manual one",
      fontSize: 55,
    });
    const long = createStickyNote({
      id: "note-shrink",
      x: 675,
      y: 275,
      width: 250,
      height: 250,
      text: "Manual one two three four five six seven eight nine ten",
      fontSize: 55,
    });

    const excalidrawScene = convertFiroToExcalidraw({
      schemaVersion: 2,
      elements: [short, long],
    } as any);

    const expectContained = (noteId: string) => {
      const restoredNote = excalidrawScene.elements.find(
        (el: any) => el.id === noteId,
      );
      const label = excalidrawScene.elements.find(
        (el: any) => el.type === "text" && el.containerId === noteId,
      );
      expect(restoredNote).toBeTruthy();
      expect(label).toBeTruthy();
      expect(label.x).toBeGreaterThanOrEqual(restoredNote.x);
      expect(label.x + label.width).toBeLessThanOrEqual(
        restoredNote.x + restoredNote.width,
      );
      expect(label.y).toBeGreaterThanOrEqual(restoredNote.y);
      expect(label.y + label.height).toBeLessThanOrEqual(
        restoredNote.y + restoredNote.height,
      );
      return label;
    };

    // short text may keep its size by wrapping, but never spills (the bug)
    const shortLabel = expectContained("note-fit");
    expect(shortLabel.originalText).toBe("Manual one");
    expect(shortLabel.width).toBeLessThanOrEqual(250 - 2 * 16);

    // text that cannot fit at the ceiling even wrapped must shrink
    const longLabel = expectContained("note-shrink");
    expect(longLabel.fontSize).toBeLessThan(55);
  });
});
