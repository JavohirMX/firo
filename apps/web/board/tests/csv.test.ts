import { describe, expect, it } from "vitest";
import { createFiroDoc } from "@firo/doc";
import { createStickyNote } from "@firo/board/defaults";

import {
  parseCsv,
  serializeCsv,
  exportStickyNotesToCsv,
  csvToStickyNotes,
} from "../csv";

describe("CSV Serializer and Parser", () => {
  it("parses RFC 4180 CSV correctly with commas and quotes", () => {
    const csv =
      'Name,Text,"Notes, with commas"\nAlice,"Hello\nworld","Special ""quotes"""';
    const parsed = parseCsv(csv);

    expect(parsed.headers).toEqual(["Name", "Text", "Notes, with commas"]);
    expect(parsed.rows).toEqual([
      ["Alice", "Hello\nworld", 'Special "quotes"'],
    ]);
  });

  it("serializes rows with proper escaping", () => {
    const rows = [
      ["Title", "Description"],
      ["Item 1", 'Needs "quotes" & commas, right?'],
      ["Item 2", "Simple text"],
    ];
    const csv = serializeCsv(rows);

    expect(csv).toBe(
      'Title,Description\r\nItem 1,"Needs ""quotes"" & commas, right?"\r\nItem 2,Simple text',
    );
  });

  it("exports sticky notes from a FiroDoc", () => {
    const doc = createFiroDoc();
    const note1 = createStickyNote({
      id: "note-1",
      x: 100,
      y: 200,
      backgroundColor: "#fff9b8",
      text: "First Idea",
    });
    const note2 = createStickyNote({
      id: "note-2",
      x: 350,
      y: 200,
      backgroundColor: "#a6e3e9",
      text: "Second Idea",
    });

    doc.commit([
      { kind: "createElement", element: note1 },
      { kind: "createElement", element: note2 },
    ]);

    const csvOutput = exportStickyNotesToCsv(doc);
    const parsed = parseCsv(csvOutput);

    expect(parsed.headers).toEqual([
      "ID",
      "Type",
      "Content",
      "BackgroundColor",
      "TextColor",
      "Tags",
      "FrameId",
      "X",
      "Y",
      "Width",
      "Height",
    ]);
    expect(parsed.rows[0][0]).toBe("note-1");
    expect(parsed.rows[0][1]).toBe("stickynote");
    expect(parsed.rows[0][2]).toBe("First Idea");
    expect(parsed.rows[0][3]).toBe("#fff9b8");

    expect(parsed.rows[1][0]).toBe("note-2");
    expect(parsed.rows[1][1]).toBe("stickynote");
    expect(parsed.rows[1][2]).toBe("Second Idea");
    expect(parsed.rows[1][3]).toBe("#a6e3e9");
  });

  it("converts imported CSV into a grid of sticky notes", () => {
    const csvInput =
      "Task,Owner\nDesign System,Alice\nSync Server,Bob\nMobile UI,Charlie";
    const notes = csvToStickyNotes(csvInput, {
      startX: 50,
      startY: 100,
      color: "pink",
    });

    expect(notes.length).toBe(3);
    expect(notes[0].type).toBe("stickynote");
    expect(notes[0].backgroundColor).toBe("pink");
    expect(notes[0].x).toBe(50);
    expect(notes[0].y).toBe(100);

    // Text in note should contain row values
    expect(notes[0].text).toBe("Design System");
    expect(notes[1].x).toBe(50 + 220); // 200 + 20 gap
    expect(notes[2].x).toBe(50 + 440);
  });
});
