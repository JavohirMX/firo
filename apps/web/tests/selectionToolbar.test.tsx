import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { ExcalidrawElement } from "@firo/element/types";

import { WebSelectionToolbar } from "../App";

const mocks = vi.hoisted(() => ({
  elements: [] as ExcalidrawElement[],
  executeAction: vi.fn(),
  mutateElement: vi.fn(),
  triggerUpdate: vi.fn(),
}));

vi.mock("@firo/editor", async () => {
  const actual = await vi.importActual<any>("@firo/editor");
  return {
    ...actual,
    useApp: () => ({
      scene: {
        getNonDeletedElements: () => mocks.elements,
        getNonDeletedElementsMap: () =>
          new Map(mocks.elements.map((el) => [el.id, el])),
        mutateElement: mocks.mutateElement,
        triggerUpdate: mocks.triggerUpdate,
      },
      state: { zoom: { value: 1 }, scrollX: 0, scrollY: 0 },
      ownerDocument: document,
    }),
    useExcalidrawActionManager: () => ({
      actions: {
        changeStickyNoteSize: "changeStickyNoteSizeAction",
        toggleShapeSwitch: "toggleShapeSwitchAction",
        hyperlink: "hyperlinkAction",
        duplicateSelection: "duplicateSelectionAction",
        toggleElementLock: "toggleElementLockAction",
        bringToFront: "bringToFrontAction",
        deleteSelectedElements: "deleteSelectedElementsAction",
      },
      executeAction: mocks.executeAction,
    }),
  };
});

const stateFor = (selectedElementIds: Record<string, boolean>) =>
  ({
    viewModeEnabled: false,
    editingTextElement: null,
    selectedElementIds,
  } as any);

const element = (
  id: string,
  type: "stickynote" | "rectangle",
  side: number,
): any => ({
  id,
  type,
  x: 0,
  y: 0,
  width: side,
  height: side,
  baseHeight: type === "stickynote" ? side : undefined,
  angle: 0,
  isDeleted: false,
  boundElements: [],
  groupIds: [],
  frameId: null,
});

describe("the selection lane's sticky size control", () => {
  beforeEach(() => {
    mocks.elements = [];
    mocks.executeAction.mockClear();
  });

  it("shows the agreed preset and applies a new one", () => {
    const sticky = element("sticky", "stickynote", 250);
    mocks.elements = [sticky];

    render(
      <WebSelectionToolbar
        appState={stateFor({ [sticky.id]: true })}
        onComment={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Sticky note size (M)",
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const menu = screen.getByRole("menu", { name: "Sticky note size" });
    expect(
      screen
        .getByRole("menuitemradio", { name: /Medium/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(menu).toBeDefined();

    fireEvent.click(screen.getByRole("menuitemradio", { name: /Large/ }));

    expect(mocks.executeAction).toHaveBeenCalledWith(
      "changeStickyNoteSizeAction",
      "ui",
      "l",
    );
    expect(screen.queryByRole("menu", { name: "Sticky note size" })).toBeNull();
  });

  it("shows a dash when the selected notes disagree", () => {
    const medium = element("medium", "stickynote", 250);
    const large = element("large", "stickynote", 340);
    mocks.elements = [medium, large];

    render(
      <WebSelectionToolbar
        appState={stateFor({ [medium.id]: true, [large.id]: true })}
        onComment={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Sticky note size (—)" }),
    ).toBeDefined();
  });

  it("shows conversion for a convertible selection", () => {
    const rectangle = element("rect", "rectangle", 100);
    mocks.elements = [rectangle];

    render(
      <WebSelectionToolbar
        appState={stateFor({ [rectangle.id]: true })}
        onComment={vi.fn()}
      />,
    );

    const convert = screen.getByRole("button", { name: "Switch shape" });
    fireEvent.click(convert);

    expect(mocks.executeAction).toHaveBeenCalledWith("toggleShapeSwitchAction");
  });

  it("is absent unless every selected element is a sticky note", () => {
    const sticky = element("sticky", "stickynote", 250);
    const rectangle = element("rect", "rectangle", 100);
    mocks.elements = [sticky, rectangle];

    render(
      <WebSelectionToolbar
        appState={stateFor({ [sticky.id]: true, [rectangle.id]: true })}
        onComment={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Sticky note size/ }),
    ).toBeNull();
  });

  it("hides size, convert and link controls when elements are locked", () => {
    const sticky = { ...element("sticky", "stickynote", 250), locked: true };
    const rect = {
      ...element("rect", "rectangle", 100),
      locked: true,
      link: "https://example.com",
    };
    mocks.elements = [sticky];

    const { unmount } = render(
      <WebSelectionToolbar
        appState={stateFor({ [sticky.id]: true })}
        onComment={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Sticky note size/ }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDefined();

    unmount();
    mocks.elements = [rect];

    render(
      <WebSelectionToolbar
        appState={stateFor({ [rect.id]: true })}
        onComment={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Switch shape" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Edit link|Create link/ }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDefined();
  });

  it("shows font size, text align and color picker controls for sticky notes", () => {
    const sticky = {
      ...element("sticky-1", "stickynote", 250),
      backgroundColor: "#FFF9B1",
      customData: { autoFontSize: true },
    };
    const label = {
      ...element("sticky-1~label", "stickynote", 250),
      type: "text",
      containerId: "sticky-1",
      text: "hello",
      originalText: "hello",
      fontSize: 24,
      autoFontSize: true,
      textAlign: "center",
    };
    mocks.elements = [sticky, label];

    render(
      <WebSelectionToolbar
        appState={stateFor({ [sticky.id]: true })}
        onComment={vi.fn()}
      />,
    );

    // Font size button shows "Aa Auto ↕" by default
    const fontSizeBtn = screen.getByRole("button", { name: /Font size/ });
    expect(fontSizeBtn).toBeDefined();
    expect(fontSizeBtn.textContent).toContain("Aa Auto ↕");

    // Text align button is present
    const alignBtn = screen.getByRole("button", { name: /Text align/ });
    expect(alignBtn).toBeDefined();

    // Color swatch button is present
    const colorBtn = screen.getByRole("button", {
      name: "Color",
    });
    expect(colorBtn).toBeDefined();

    // Opening font size menu shows Auto and preset font sizes
    fireEvent.click(fontSizeBtn);
    expect(screen.getByRole("menu", { name: "Font size" })).toBeDefined();
    expect(screen.getByText("Auto")).toBeDefined();
    expect(screen.getByText("20 px")).toBeDefined();

    // Clicking a preset font size updates the element
    const size20Btn = screen.getByText("20 px");
    fireEvent.click(size20Btn);
    expect(mocks.mutateElement).toHaveBeenCalled();
    expect(mocks.triggerUpdate).toHaveBeenCalled();
  });
});
