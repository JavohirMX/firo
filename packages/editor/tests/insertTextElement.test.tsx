import { Excalidraw } from "../index";

import { Keyboard } from "./helpers/ui";
import { act, render } from "./test-utils";

const { h } = window;

describe("imperative insertTextElement", () => {
  it("inserts a centred, selected text element and returns to selection", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    act(() => {
      h.app.setActiveTool({ type: "rectangle" });
    });
    let created: ReturnType<typeof h.app.insertTextElement>;
    act(() => {
      created = h.app.insertTextElement({
        sceneX: 200,
        sceneY: 100,
        text: "😀",
        fontSize: 48,
      });
    });
    expect(h.elements).toHaveLength(1);
    const el = h.elements[0] as any;
    expect(el.type).toBe("text");
    expect(el.text).toBe("😀");
    expect(el.fontSize).toBe(48);
    expect(el.x + el.width / 2).toBeCloseTo(200, 0);
    expect(el.y + el.height / 2).toBeCloseTo(100, 0);
    expect(created!.id).toBe(el.id);
    expect(h.state.selectedElementIds).toEqual({ [el.id]: true });
    expect(h.state.activeTool.type).toBe("selection");
  });

  it("is a no-op for empty text", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    act(() => {
      h.app.insertTextElement({ sceneX: 0, sceneY: 0, text: "" });
    });
    expect(h.elements).toHaveLength(0);
  });

  it("is a no-op in view mode", async () => {
    await render(<Excalidraw viewModeEnabled />);
    act(() => {
      h.app.insertTextElement({ sceneX: 0, sceneY: 0, text: "😀" });
    });
    expect(h.elements).toHaveLength(0);
  });

  it("is undoable as a single step", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    act(() => {
      h.app.insertTextElement({ sceneX: 0, sceneY: 0, text: "😀" });
    });
    expect(h.elements.filter((e) => !e.isDeleted)).toHaveLength(1);
    Keyboard.undo();
    expect(h.elements.filter((e) => !e.isDeleted)).toHaveLength(0);
  });
});

describe("imperative insertEmbeddableElement", () => {
  it("is undoable as a single step", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    act(() => {
      h.app.insertEmbeddableElement({
        sceneX: 0,
        sceneY: 0,
        link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });
    });
    expect(h.elements.filter((e) => !e.isDeleted)).toHaveLength(1);
    Keyboard.undo();
    expect(h.elements.filter((e) => !e.isDeleted)).toHaveLength(0);
  });
});
