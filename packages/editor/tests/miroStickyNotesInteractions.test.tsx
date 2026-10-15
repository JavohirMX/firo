import React from "react";

import { DEFAULT_STICKY_NOTE_SIZE, KEYS } from "@firo/common";

import type { ExcalidrawStickyNoteElement } from "@firo/element/types";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { getTextEditor } from "./queries/dom";
import { fireEvent, render } from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

describe("Miro sticky notes canvas interactions", () => {
  beforeEach(async () => {
    localStorage.clear();
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    API.setAppState({ width: 1000, height: 800 });
  });

  it("double-clicking canvas creates sticky note and calls text editing", async () => {
    expect(h.elements).toHaveLength(0);

    mouse.doubleClickAt(300, 300);

    const stickyNotes = h.elements.filter(
      (el) => el.type === "stickynote" && !el.isDeleted,
    ) as ExcalidrawStickyNoteElement[];

    expect(stickyNotes).toHaveLength(1);
    const note = stickyNotes[0];
    expect(note.width).toBe(DEFAULT_STICKY_NOTE_SIZE);
    expect(note.height).toBe(DEFAULT_STICKY_NOTE_SIZE);
    // Origin is centered at (300, 300) minus size / 2 = (225, 225)
    expect(note.x).toBe(300 - DEFAULT_STICKY_NOTE_SIZE / 2);
    expect(note.y).toBe(300 - DEFAULT_STICKY_NOTE_SIZE / 2);

    // Text editing is started on the note
    expect(h.state.editingTextElement).not.toBeNull();
    expect(h.state.editingTextElement?.containerId).toBe(note.id);

    // Exiting the editor confirms the note is selected
    const editor = await getTextEditor();
    Keyboard.keyPress(KEYS.ESCAPE, editor);
    expect(h.state.editingTextElement).toBeNull();
    expect(h.state.selectedElementIds[note.id]).toBe(true);
  });

  it("double-clicking canvas with Alt creates raw text instead of sticky note", async () => {
    expect(h.elements).toHaveLength(0);

    fireEvent.doubleClick(
      window.document.querySelector("canvas.interactive")!,
      {
        clientX: 300,
        clientY: 300,
        altKey: true,
      },
    );

    const stickyNotes = h.elements.filter(
      (el) => el.type === "stickynote" && !el.isDeleted,
    );
    expect(stickyNotes).toHaveLength(0);

    const textElements = h.elements.filter(
      (el) => el.type === "text" && !el.isDeleted,
    );
    expect(textElements).toHaveLength(1);
  });

  it("pressing Tab on selected sticky note spawns adjacent sticky note to the right", async () => {
    const note = API.createElement({
      type: "stickynote",
      id: "note1",
      x: 100,
      y: 100,
      width: 150,
      height: 150,
      baseHeight: 150,
      strokeColor: "#1e1e1e",
      backgroundColor: "#fff9b1",
    });
    API.setElements([note]);
    API.setSelectedElements([note]);

    expect(h.state.editingTextElement).toBeNull();

    fireEvent.keyDown(document, { key: KEYS.TAB });

    const stickyNotes = h.elements.filter(
      (el) => el.type === "stickynote" && !el.isDeleted,
    ) as ExcalidrawStickyNoteElement[];

    expect(stickyNotes).toHaveLength(2);

    const newNote = stickyNotes.find((el) => el.id !== "note1")!;
    expect(newNote).toBeDefined();
    // note.x + note.width + GAP = 100 + 150 + 24 = 274
    expect(newNote.x).toBe(274);
    expect(newNote.y).toBe(100);
    expect(newNote.width).toBe(150);
    expect(newNote.height).toBe(150);
    expect(newNote.strokeColor).toBe("#1e1e1e");
    expect(newNote.backgroundColor).toBe("#fff9b1");

    // Text editing is started on the new note
    expect(h.state.editingTextElement).not.toBeNull();
    expect(h.state.editingTextElement?.containerId).toBe(newNote.id);

    // Exiting the editor confirms the new note is selected
    const editor = await getTextEditor();
    Keyboard.keyPress(KEYS.ESCAPE, editor);
    expect(h.state.editingTextElement).toBeNull();
    expect(h.state.selectedElementIds[newNote.id]).toBe(true);
  });

  it("pressing Shift+Tab spawns adjacent note to the left", async () => {
    const note = API.createElement({
      type: "stickynote",
      id: "note1",
      x: 200,
      y: 100,
      width: 150,
      height: 150,
      baseHeight: 150,
      strokeColor: "#1e1e1e",
      backgroundColor: "#fff9b1",
    });
    API.setElements([note]);
    API.setSelectedElements([note]);

    expect(h.state.editingTextElement).toBeNull();

    fireEvent.keyDown(document, { key: KEYS.TAB, shiftKey: true });

    const stickyNotes = h.elements.filter(
      (el) => el.type === "stickynote" && !el.isDeleted,
    ) as ExcalidrawStickyNoteElement[];

    expect(stickyNotes).toHaveLength(2);

    const newNote = stickyNotes.find((el) => el.id !== "note1")!;
    expect(newNote).toBeDefined();
    // note.x - note.width - GAP = 200 - 150 - 24 = 26
    expect(newNote.x).toBe(26);
    expect(newNote.y).toBe(100);
    expect(newNote.width).toBe(150);
    expect(newNote.height).toBe(150);
    expect(newNote.strokeColor).toBe("#1e1e1e");
    expect(newNote.backgroundColor).toBe("#fff9b1");

    // Text editing is started on the new note
    expect(h.state.editingTextElement).not.toBeNull();
    expect(h.state.editingTextElement?.containerId).toBe(newNote.id);

    // Exiting the editor confirms the new note is selected
    const editor = await getTextEditor();
    Keyboard.keyPress(KEYS.ESCAPE, editor);
    expect(h.state.editingTextElement).toBeNull();
    expect(h.state.selectedElementIds[newNote.id]).toBe(true);
  });

  it("pressing Enter on selected sticky note spawns note below", async () => {
    const note = API.createElement({
      type: "stickynote",
      id: "note1",
      x: 100,
      y: 100,
      width: 150,
      height: 150,
      baseHeight: 150,
      strokeColor: "#1e1e1e",
      backgroundColor: "#fff9b1",
    });
    API.setElements([note]);
    API.setSelectedElements([note]);

    expect(h.state.editingTextElement).toBeNull();

    fireEvent.keyDown(document, { key: KEYS.ENTER });

    const stickyNotes = h.elements.filter(
      (el) => el.type === "stickynote" && !el.isDeleted,
    ) as ExcalidrawStickyNoteElement[];

    expect(stickyNotes).toHaveLength(2);

    const newNote = stickyNotes.find((el) => el.id !== "note1")!;
    expect(newNote).toBeDefined();
    // note.x = 100, note.y + note.height + GAP = 100 + 150 + 24 = 274
    expect(newNote.x).toBe(100);
    expect(newNote.y).toBe(274);
    expect(newNote.width).toBe(150);
    expect(newNote.height).toBe(150);
    expect(newNote.strokeColor).toBe("#1e1e1e");
    expect(newNote.backgroundColor).toBe("#fff9b1");

    // Text editing is started on the new note
    expect(h.state.editingTextElement).not.toBeNull();
    expect(h.state.editingTextElement?.containerId).toBe(newNote.id);

    // Exiting the editor confirms the new note is selected
    const editor = await getTextEditor();
    Keyboard.keyPress(KEYS.ESCAPE, editor);
    expect(h.state.editingTextElement).toBeNull();
    expect(h.state.selectedElementIds[newNote.id]).toBe(true);
  });
});
