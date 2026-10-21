import type { ExcalidrawStickyNoteElement } from "@firo/element/types";

import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { Keyboard } from "../tests/helpers/ui";
import { act, render, waitFor } from "../tests/test-utils";

import {
  actionChangeStickyNoteSize,
  getSelectionStickyNoteSize,
  getStickyNoteSizePreset,
  STICKY_NOTE_SIZE_PRESETS,
  stickyNoteSizeForKey,
} from "./actionStickyNoteSize";

const h = window.h;

const note = (
  id: string,
  side: number,
  overrides: Partial<ExcalidrawStickyNoteElement> = {},
) =>
  API.createElement({
    type: "stickynote",
    id,
    width: side,
    height: side,
    baseHeight: side,
    ...overrides,
  });

describe("sticky-note size presets", () => {
  it("reads a preset only when width and base height agree", () => {
    expect(getStickyNoteSizePreset(note("m", 250))).toBe("m");
    expect(getStickyNoteSizePreset(note("s", 180))).toBe("s");
    expect(getStickyNoteSizePreset(note("l", 340))).toBe("l");
    // Text made the note taller, but the chosen size is still M.
    expect(getStickyNoteSizePreset(note("grown", 250, { height: 410 }))).toBe(
      "m",
    );

    // A resize to something else is not a preset...
    expect(getStickyNoteSizePreset(note("custom", 300))).toBeNull();
    // ...and neither is a rectangular note that happens to be 250 wide.
    expect(
      getStickyNoteSizePreset(note("rectangle", 250, { width: 180 })),
    ).toBeNull();
  });

  it("labels the selection from what the notes agree on", () => {
    const m = note("m", 250);

    expect(getSelectionStickyNoteSize([m])).toBe("M");
    expect(getSelectionStickyNoteSize([m, note("m2", 250)])).toBe("M");
    expect(getSelectionStickyNoteSize([m, note("s", 180)])).toBe("—");
    expect(getSelectionStickyNoteSize([])).toBeNull();
    expect(
      getSelectionStickyNoteSize([
        m,
        API.createElement({ type: "rectangle", id: "rect" }),
      ]),
    ).toBeNull();
  });

  it("applies a preset to every selected note in one undo step", async () => {
    const first = note("first", 250);
    const second = note("second", 250);

    await render(
      <Excalidraw
        initialData={{ elements: [first, second] }}
        handleKeyboardGlobally
      />,
    );
    API.setAppState({
      selectedElementIds: { [first.id]: true, [second.id]: true },
    });

    const applied = h.history.undoStack.length;

    await act(async () => {
      h.app.actionManager.executeAction(actionChangeStickyNoteSize, "api", "s");
    });

    await waitFor(() => {
      for (const id of [first.id, second.id]) {
        expect(h.elements.find((element) => element.id === id)).toMatchObject({
          width: 180,
          height: 180,
          baseHeight: 180,
        });
      }
    });
    expect(h.history.undoStack.length).toBe(applied + 1);

    // One undo restores both notes: the loop is one action result, not one
    // history entry per note.
    await act(async () => {
      Keyboard.undo();
    });

    await waitFor(() => {
      for (const id of [first.id, second.id]) {
        expect(h.elements.find((element) => element.id === id)).toMatchObject({
          width: 250,
          height: 250,
          baseHeight: 250,
        });
      }
    });
  });

  it("does nothing when a non-sticky element is selected", async () => {
    await render(<Excalidraw />);
    const rectangle = API.createElement({ type: "rectangle", id: "rect" });
    API.setElements([rectangle]);
    API.setAppState({ selectedElementIds: { [rectangle.id]: true } });

    const before = h.elements.find((element) => element.id === rectangle.id);

    await act(async () => {
      h.app.actionManager.executeAction(actionChangeStickyNoteSize, "api", "l");
    });

    expect(h.elements.find((element) => element.id === rectangle.id)).toBe(
      before,
    );
  });

  it("does not mutate locked sticky notes", async () => {
    await render(<Excalidraw />);
    const lockedNote = note("locked", 250, { locked: true });
    API.setElements([lockedNote]);
    API.setAppState({ selectedElementIds: { [lockedNote.id]: true } });

    expect(
      actionChangeStickyNoteSize.predicate?.(
        h.elements,
        h.state,
        h.app.props,
        h.app,
      ),
    ).toBe(false);

    await act(async () => {
      h.app.actionManager.executeAction(actionChangeStickyNoteSize, "api", "s");
    });

    expect(h.elements.find((el) => el.id === lockedNote.id)).toMatchObject({
      width: 250,
      height: 250,
      baseHeight: 250,
    });
  });
});


describe("stickyNoteSizeForKey", () => {
  it("resolves each preset to its pixels", () => {
    expect(stickyNoteSizeForKey("s")).toBe(STICKY_NOTE_SIZE_PRESETS.s);
    expect(stickyNoteSizeForKey("m")).toBe(STICKY_NOTE_SIZE_PRESETS.m);
    expect(stickyNoteSizeForKey("l")).toBe(STICKY_NOTE_SIZE_PRESETS.l);
  });

  it("falls back to m for junk from restored app state", () => {
    // Restored localStorage is not proof of validity: a hand edit, an older
    // build or a removed preset must create an ordinary note, not crash.
    expect(stickyNoteSizeForKey("xl")).toBe(STICKY_NOTE_SIZE_PRESETS.m);
    expect(stickyNoteSizeForKey(undefined)).toBe(STICKY_NOTE_SIZE_PRESETS.m);
    expect(stickyNoteSizeForKey(250)).toBe(STICKY_NOTE_SIZE_PRESETS.m);
  });
});
