import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { Keyboard } from "../tests/helpers/ui";
import { act, render } from "../tests/test-utils";

import { actionClearContent } from "./actionClearContent";

const { h } = window;

const makeElements = () => {
  const container = API.createElement({
    type: "rectangle",
    id: "box",
    width: 200,
    height: 100,
    boundElements: [{ type: "text", id: "label" }],
  });
  const text = API.createElement({
    type: "text",
    id: "label",
    containerId: "box",
    text: "hello",
  });
  const plain = API.createElement({ type: "text", id: "plain", text: "solo" });
  return { container, text, plain };
};

const setup = () => {
  const els = makeElements();
  API.setElements([els.container, els.text, els.plain]);
  return els;
};

describe("clear content", () => {
  it("removes the bound text and keeps the container", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    setup();
    API.setSelectedElements([h.elements.find((e) => e.id === "box")! as any]);
    act(() => {
      h.app.actionManager.executeAction(actionClearContent);
    });
    const box = h.elements.find((e) => e.id === "box")!;
    const label = h.elements.find((e) => e.id === "label")!;
    expect(box.isDeleted).toBe(false);
    expect(label.isDeleted).toBe(true);
    expect(box.boundElements ?? []).toEqual([]);
  });

  it("undo brings the text back", async () => {
    const { container, text } = makeElements();
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        initialData={{ elements: [container, text] }}
      />,
    );
    API.setSelectedElements([h.elements.find((e) => e.id === "box")! as any]);
    act(() => {
      h.app.actionManager.executeAction(actionClearContent);
    });
    expect(h.elements.find((e) => e.id === "label")!.isDeleted).toBe(true);
    Keyboard.undo();
    expect(h.elements.find((e) => e.id === "label")!.isDeleted).toBe(false);
  });

  it("does not apply to a standalone text or an empty container", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    const { plain } = setup();
    const empty = API.createElement({ type: "rectangle", id: "empty" });
    API.setElements([...h.elements, empty]);
    for (const el of [plain, empty]) {
      API.setSelectedElements([h.elements.find((e) => e.id === el.id)! as any]);
      expect(
        actionClearContent.predicate!(
          h.elements as any,
          h.state as any,
          {},
          h.app as any,
        ),
      ).toBe(false);
    }
  });

  it("clears only the selected containers, not other labelled shapes", async () => {
    const a = API.createElement({
      type: "rectangle",
      id: "a",
      boundElements: [{ type: "text", id: "ta" }],
    });
    const ta = API.createElement({
      type: "text",
      id: "ta",
      containerId: "a",
      text: "A",
    });
    const b = API.createElement({
      type: "rectangle",
      id: "b",
      boundElements: [{ type: "text", id: "tb" }],
    });
    const tb = API.createElement({
      type: "text",
      id: "tb",
      containerId: "b",
      text: "B",
    });
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        initialData={{ elements: [a, ta, b, tb] }}
      />,
    );
    API.setSelectedElements([h.elements.find((e) => e.id === "a")! as any]);
    act(() => {
      h.app.actionManager.executeAction(actionClearContent);
    });
    expect(h.elements.find((e) => e.id === "ta")!.isDeleted).toBe(true);
    expect(h.elements.find((e) => e.id === "tb")!.isDeleted).toBe(false);
    expect(h.elements.find((e) => e.id === "b")!.boundElements?.length).toBe(1);
  });

  it("clears an arrow label and keeps the arrow", async () => {
    const arrow = API.createElement({
      type: "arrow",
      id: "arr",
      width: 200,
      height: 0,
      boundElements: [{ type: "text", id: "tl" }],
    });
    const label = API.createElement({
      type: "text",
      id: "tl",
      containerId: "arr",
      text: "yes",
    });
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        initialData={{ elements: [arrow, label] }}
      />,
    );
    API.setSelectedElements([h.elements.find((e) => e.id === "arr")! as any]);
    act(() => {
      h.app.actionManager.executeAction(actionClearContent);
    });
    expect(h.elements.find((e) => e.id === "arr")!.isDeleted).toBe(false);
    expect(h.elements.find((e) => e.id === "tl")!.isDeleted).toBe(true);
  });

  it("skips a locked container", async () => {
    const box = API.createElement({
      type: "rectangle",
      id: "lk",
      locked: true,
      boundElements: [{ type: "text", id: "tlk" }],
    });
    const text = API.createElement({
      type: "text",
      id: "tlk",
      containerId: "lk",
      text: "keep",
    });
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        initialData={{ elements: [box, text] }}
      />,
    );
    API.setSelectedElements([h.elements.find((e) => e.id === "lk")! as any]);
    act(() => {
      h.app.actionManager.executeAction(actionClearContent);
    });
    expect(h.elements.find((e) => e.id === "tlk")!.isDeleted).toBe(false);
  });

  it("is not available in view mode", async () => {
    expect(actionClearContent.viewMode).toBe(false);
  });
});
