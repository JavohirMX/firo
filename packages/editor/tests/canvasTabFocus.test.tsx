import { KEYS } from "@firo/common";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { fireEvent, render } from "./test-utils";

const { h } = window;

// Tab on the focused canvas switches the shape type of a convertible
// selection. With nothing to convert it must keep its native job, moving
// focus, so the canvas is not a keyboard trap (PRD NFR: focus never trapped).
describe("canvas Tab key", () => {
  const pressTab = (shiftKey = false) => {
    const container = h.app.excalidrawContainerRef.current!;
    container.focus();
    // fireEvent returns false when the event was default-prevented
    return fireEvent.keyDown(container, { key: KEYS.TAB, shiftKey });
  };

  it("does not trap Tab or Shift+Tab on an empty board", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    expect(pressTab()).toBe(true);
    expect(pressTab(true)).toBe(true);
  });

  it("does not trap Tab when the selection is not convertible", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    const image = API.createElement({ type: "image" });
    API.setElements([image]);
    API.setSelectedElements([image]);
    expect(pressTab()).toBe(true);
  });

  it("still takes Tab to switch the shape of a convertible selection", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    const rectangle = API.createElement({ type: "rectangle" });
    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);
    expect(pressTab()).toBe(false);
  });

  it("lets Tab leave again after Escape deselects", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    const rectangle = API.createElement({ type: "rectangle" });
    API.setElements([rectangle]);
    API.setSelectedElements([rectangle]);
    expect(pressTab()).toBe(false);
    fireEvent.keyDown(h.app.excalidrawContainerRef.current!, {
      key: KEYS.ESCAPE,
    });
    API.setSelectedElements([]);
    expect(pressTab()).toBe(true);
  });
});

describe("canvas Tab key in view mode", () => {
  it("does not trap Tab in view mode", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} viewModeEnabled />);
    const container = h.app.excalidrawContainerRef.current!;
    container.focus();
    expect(fireEvent.keyDown(container, { key: KEYS.TAB })).toBe(true);
    expect(
      fireEvent.keyDown(container, { key: KEYS.TAB, shiftKey: true }),
    ).toBe(true);
  });
});
