import React from "react";

import { KEYS, viewportCoordsToSceneCoords } from "@firo/common";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { act, fireEvent, GlobalTestState, render } from "./test-utils";

import type { ExcalidrawImperativeAPI } from "../types";

const { h } = window;
const mouse = new Pointer("mouse");

const POINTER = { pointerId: 1, pointerType: "mouse", isPrimary: true };

describe("Miro Tool Behaviors: Stamp & Shortcuts", () => {
  let excalidrawAPI: ExcalidrawImperativeAPI;

  beforeEach(async () => {
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        onExcalidrawAPI={(api) => {
          excalidrawAPI = api as any;
        }}
      />,
    );
    API.setAppState({ width: 1000, height: 800 });
  });

  it("pressing 'S' activates rectangle tool", () => {
    expect(h.state.activeTool.type).toBe("selection");
    Keyboard.keyPress("s");
    expect(h.state.activeTool.type).toBe("rectangle");
  });

  it("pressing 'R' also activates rectangle tool", () => {
    expect(h.state.activeTool.type).toBe("selection");
    Keyboard.keyPress("r");
    expect(h.state.activeTool.type).toBe("rectangle");
  });

  it("single click on canvas with rectangle tool creates a 100x100 rectangle centered at click position", () => {
    act(() => {
      excalidrawAPI.setActiveTool({ type: "rectangle" });
    });
    expect(h.state.activeTool.type).toBe("rectangle");

    mouse.clickAt(300, 300);

    const rect = h.elements.find(
      (el) => el.type === "rectangle" && !el.isDeleted,
    );
    expect(rect).toBeDefined();
    expect(rect!.width).toBe(100);
    expect(rect!.height).toBe(100);
    expect(rect!.x).toBe(250);
    expect(rect!.y).toBe(250);
    // tool should revert to selection
    expect(h.state.activeTool.type).toBe("selection");
    // created element should be selected
    expect(h.state.selectedElementIds[rect!.id]).toBe(true);
  });

  it("single click on canvas with diamond tool creates a 100x100 diamond", () => {
    act(() => {
      excalidrawAPI.setActiveTool({ type: "diamond" });
    });
    expect(h.state.activeTool.type).toBe("diamond");

    mouse.clickAt(400, 400);

    const diamond = h.elements.find(
      (el) => el.type === "diamond" && !el.isDeleted,
    );
    expect(diamond).toBeDefined();
    expect(diamond!.width).toBe(100);
    expect(diamond!.height).toBe(100);
    expect(diamond!.x).toBe(350);
    expect(diamond!.y).toBe(350);
    expect(h.state.activeTool.type).toBe("selection");
    expect(h.state.selectedElementIds[diamond!.id]).toBe(true);
  });

  it("single click on canvas with ellipse tool creates a 100x100 ellipse", () => {
    act(() => {
      excalidrawAPI.setActiveTool({ type: "ellipse" });
    });
    expect(h.state.activeTool.type).toBe("ellipse");

    mouse.clickAt(500, 500);

    const ellipse = h.elements.find(
      (el) => el.type === "ellipse" && !el.isDeleted,
    );
    expect(ellipse).toBeDefined();
    expect(ellipse!.width).toBe(100);
    expect(ellipse!.height).toBe(100);
    expect(ellipse!.x).toBe(450);
    expect(ellipse!.y).toBe(450);
    expect(h.state.activeTool.type).toBe("selection");
    expect(h.state.selectedElementIds[ellipse!.id]).toBe(true);
  });

  it("pressing Escape when rectangle tool is active returns activeTool.type to selection", () => {
    act(() => {
      excalidrawAPI.setActiveTool({ type: "rectangle" });
    });
    expect(h.state.activeTool.type).toBe("rectangle");

    Keyboard.keyPress(KEYS.ESCAPE);
    expect(h.state.activeTool.type).toBe("selection");
  });

  it("dragging rectangle tool from toolbar drops a 100x100 rectangle onto canvas", () => {
    const rectButton = GlobalTestState.renderResult.getByToolName("rectangle");
    fireEvent.pointerDown(rectButton, {
      ...POINTER,
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { ...POINTER, clientX: 300, clientY: 300 });

    const preview = h.app.toolDrag.preview!;
    expect(preview).not.toBeNull();
    expect(preview.type).toBe("rectangle");
    expect([preview.width, preview.height]).toEqual([100, 100]);

    fireEvent.pointerUp(GlobalTestState.interactiveCanvas, {
      ...POINTER,
      button: 0,
      clientX: 300,
      clientY: 300,
    });

    const rect = h.elements.find(
      (el) => el.type === "rectangle" && !el.isDeleted,
    );
    expect(rect).toBeDefined();
    const center = viewportCoordsToSceneCoords(
      { clientX: 300, clientY: 300 },
      h.state,
    );
    expect(rect!.x + rect!.width / 2).toBeCloseTo(center.x);
    expect(rect!.y + rect!.height / 2).toBeCloseTo(center.y);
    expect(rect!.width).toBe(100);
    expect(rect!.height).toBe(100);
    expect(h.state.activeTool.type).toBe("selection");
  });

  it("dragging diamond tool from toolbar drops a 100x100 diamond onto canvas", () => {
    const diamondButton = GlobalTestState.renderResult.getByToolName("diamond");
    fireEvent.pointerDown(diamondButton, {
      ...POINTER,
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { ...POINTER, clientX: 400, clientY: 400 });

    const preview = h.app.toolDrag.preview!;
    expect(preview).not.toBeNull();
    expect(preview.type).toBe("diamond");
    expect([preview.width, preview.height]).toEqual([100, 100]);

    fireEvent.pointerUp(GlobalTestState.interactiveCanvas, {
      ...POINTER,
      button: 0,
      clientX: 400,
      clientY: 400,
    });

    const diamond = h.elements.find(
      (el) => el.type === "diamond" && !el.isDeleted,
    );
    expect(diamond).toBeDefined();
    expect(diamond!.width).toBe(100);
    expect(diamond!.height).toBe(100);
    expect(h.state.activeTool.type).toBe("selection");
  });

  it("dragging ellipse tool from toolbar drops a 100x100 ellipse onto canvas", () => {
    const ellipseButton = GlobalTestState.renderResult.getByToolName("ellipse");
    fireEvent.pointerDown(ellipseButton, {
      ...POINTER,
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(window, { ...POINTER, clientX: 500, clientY: 500 });

    const preview = h.app.toolDrag.preview!;
    expect(preview).not.toBeNull();
    expect(preview.type).toBe("ellipse");
    expect([preview.width, preview.height]).toEqual([100, 100]);

    fireEvent.pointerUp(GlobalTestState.interactiveCanvas, {
      ...POINTER,
      button: 0,
      clientX: 500,
      clientY: 500,
    });

    const ellipse = h.elements.find(
      (el) => el.type === "ellipse" && !el.isDeleted,
    );
    expect(ellipse).toBeDefined();
    expect(ellipse!.width).toBe(100);
    expect(ellipse!.height).toBe(100);
    expect(h.state.activeTool.type).toBe("selection");
  });
});
