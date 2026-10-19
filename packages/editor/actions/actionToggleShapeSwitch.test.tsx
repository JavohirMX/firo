import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { act, render } from "../tests/test-utils";
import { convertElementTypePopupAtom } from "../components/ConvertElementTypePopup";
import { editorJotaiStore } from "../editor-jotai";

import { actionToggleShapeSwitch } from "./actionToggleShapeSwitch";

const { h } = window;

describe("actionToggleShapeSwitch", () => {
  it("has viewMode disabled and no grid-mode checked state", () => {
    expect(actionToggleShapeSwitch.viewMode).toBe(false);
    expect((actionToggleShapeSwitch as any).checked).toBeUndefined();
  });

  it("predicate only matches when a convertible, unlocked element is selected", async () => {
    await render(<Excalidraw />);

    const rect = API.createElement({
      type: "rectangle",
      id: "rect",
    });
    const lockedRect = API.createElement({
      type: "rectangle",
      id: "lockedRect",
      locked: true,
    });
    const frame = API.createElement({
      type: "frame",
      id: "frame",
    });

    API.setElements([rect, lockedRect, frame]);

    // Nothing selected -> predicate is false, even though rect exists on scene
    API.setAppState({ selectedElementIds: {} });
    expect(actionToggleShapeSwitch.predicate?.(h.elements, h.state)).toBe(
      false,
    );

    // Locked rectangle selected -> predicate is false
    API.setAppState({ selectedElementIds: { [lockedRect.id]: true } });
    expect(actionToggleShapeSwitch.predicate?.(h.elements, h.state)).toBe(
      false,
    );

    // Frame selected -> predicate is false (not convertible)
    API.setAppState({ selectedElementIds: { [frame.id]: true } });
    expect(actionToggleShapeSwitch.predicate?.(h.elements, h.state)).toBe(
      false,
    );

    // Unlocked rectangle selected -> predicate is true
    API.setAppState({ selectedElementIds: { [rect.id]: true } });
    expect(actionToggleShapeSwitch.predicate?.(h.elements, h.state)).toBe(true);
  });

  it("opens the convert element type popup panel when performed", async () => {
    await render(<Excalidraw />);
    const rect = API.createElement({ type: "rectangle", id: "rect" });
    API.setElements([rect]);
    API.setAppState({ selectedElementIds: { [rect.id]: true } });

    editorJotaiStore.set(convertElementTypePopupAtom, null);

    await act(async () => {
      h.app.actionManager.executeAction(actionToggleShapeSwitch);
    });

    expect(editorJotaiStore.get(convertElementTypePopupAtom)).toEqual({
      type: "panel",
    });
  });
});
