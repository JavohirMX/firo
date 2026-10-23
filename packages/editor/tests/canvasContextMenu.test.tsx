import React from "react";
import { vi } from "vitest";

import { reseed } from "@firo/common";

import { pointFrom } from "@firo/math";

import { LinearElementEditor } from "@firo/element";

import type { LocalPoint } from "@firo/math";

import { actionAddCommentOnElement } from "../actions/actionCanvasAnchor";

import {
  actionAddCommentAtAnchor,
  actionToggleSelectionDimensions,
} from "../actions/actionCanvasAnchor";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { UI, Pointer } from "./helpers/ui";
import {
  render,
  act,
  fireEvent,
  mockBoundingClientRect,
  restoreOriginalGetBoundingClientRect,
  GlobalTestState,
  unmountComponent,
} from "./test-utils";

import type { ActionName } from "../actions/types";

unmountComponent();

beforeEach(() => {
  localStorage.clear();
  reseed(7);
});

const { h } = window;

describe("canvas context menu lane (ADR-0033)", () => {
  beforeAll(() => {
    mockBoundingClientRect();
  });

  afterAll(() => {
    restoreOriginalGetBoundingClientRect();
  });

  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  const openCanvasMenu = (clientX = 100, clientY = 100) => {
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX,
      clientY,
    });
    const menu = UI.queryContextMenu();
    expect(menu).not.toBeNull();
    return menu!;
  };

  const clickRow = (menu: HTMLElement, name: ActionName) => {
    const row = menu.querySelector(`li[data-testid="${name}"]`);
    expect(row).not.toBeNull();
    fireEvent.click(row!);
  };

  it("composes the canvas lane: creation rows, the checkable group, Show all, then the extras tail", () => {
    const menu = openCanvasMenu();
    const rows = Array.from(menu.querySelectorAll("li")).map((li) =>
      li.getAttribute("data-testid"),
    );
    const expected: (ActionName | null)[] = [
      "paste",
      "unlockAllElements",
      null, // separator
      "addTextAtAnchor",
      "addStickyNoteAtAnchor",
      "addCommentAtAnchor", // host hook unset in this render -> row absent
      null,
      "gridMode",
      "objectsSnapMode",
      "arrowBinding",
      "midpointSnapping",
      "toggleSelectionDimensions",
      null,
      "zoomToFit",
      null,
      "selectAll",
      "copyAsPng",
      "copyAsSvg",
      "copyText",
      null,
      "zenMode",
      "viewMode",
      "stats",
    ];
    // predicate-gated rows (nothing locked, no host comment hook, no
    // clipboard-capable selection in jsdom) collapse, and with them their
    // separator, so assert order over the rows that render
    const rendered = expected.filter(
      (name) =>
        name !== "unlockAllElements" &&
        name !== "addCommentAtAnchor" &&
        name !== "copyAsPng" &&
        name !== "copyAsSvg" &&
        name !== "copyText",
    );
    let at = 0;
    for (const name of rendered) {
      if (name === null) {
        continue;
      }
      let index = -1;
      for (let i = at; i < rows.length; i++) {
        if (rows[i] === name) {
          index = i;
          break;
        }
      }
      // -1 means the row never rendered at or after the previous row
      expect(index).toBeGreaterThanOrEqual(at);
      at = index;
    }
  });

  it("creates a sticky at the menu anchor and lands in edit mode", () => {
    const before = h.elements.length;
    const menu = openCanvasMenu(100, 100);
    clickRow(menu, "addStickyNoteAtAnchor");
    // the note plus the bound label its edit session creates
    expect(h.elements.length).toBe(before + 2);
    const note = h.elements[h.elements.length - 2];
    expect(note.type).toBe("stickynote");
    // the anchor is the note's centre: client minus the canvas offsets
    expect(note.x + note.width / 2).toBeCloseTo(100 - h.state.offsetLeft, 0);
    expect(note.y + note.height / 2).toBeCloseTo(100 - h.state.offsetTop, 0);
    expect(h.state.editingTextElement).not.toBeNull();
    // the edit session moves the selection to the bound label
    expect(h.elements[h.elements.length - 1].type).toBe("text");
  });

  it("creates a text element at the menu anchor and lands in edit mode", () => {
    const before = h.elements.length;
    const menu = openCanvasMenu(120, 80);
    clickRow(menu, "addTextAtAnchor");
    expect(h.elements.length).toBe(before + 1);
    const text = h.elements[h.elements.length - 1];
    expect(text.type).toBe("text");
    expect(h.state.editingTextElement).not.toBeNull();
  });

  it("keeps Add comment hidden without the host hook, visible with it", () => {
    const menu = openCanvasMenu();
    expect(
      menu.querySelector('li[data-testid="addCommentAtAnchor"]'),
    ).toBeNull();
    expect(actionAddCommentAtAnchor.predicate?.([], h.state, {} as any)).toBe(
      false,
    );
    const spy = vi.fn();
    expect(
      actionAddCommentAtAnchor.predicate?.([], h.state, {
        onAddComment: spy,
      } as any),
    ).toBe(true);
  });

  it("hands the scene anchor to the host comment hook", () => {
    const menu = openCanvasMenu(100, 100);
    expect(h.state.contextMenu).not.toBeNull();
    const spy = vi.fn();
    actionAddCommentAtAnchor.perform(h.elements as any, h.state, undefined, {
      props: { onAddComment: spy },
    } as any);
    // default view: zoom 1, no scroll -> scene is client minus the offsets
    expect(spy).toHaveBeenCalledWith({
      point: { x: 100 - h.state.offsetLeft, y: 100 - h.state.offsetTop },
    });
    expect(menu).not.toBeNull();
  });

  it("toggles the selection-dimensions overlay from the checkable group", () => {
    expect(h.state.showSelectionDimensions).toBe(false);
    expect(actionToggleSelectionDimensions.checked?.(h.state)).toBe(false);
    const menu = openCanvasMenu();
    clickRow(menu, "toggleSelectionDimensions");
    expect(h.state.showSelectionDimensions).toBe(true);
    expect(actionToggleSelectionDimensions.checked?.(h.state)).toBe(true);
  });
});

describe("object context menu lane (ADR-0033)", () => {
  const mouse = new Pointer("mouse");
  const hostComment = vi.fn();

  beforeAll(() => {
    mockBoundingClientRect();
  });

  afterAll(() => {
    restoreOriginalGetBoundingClientRect();
  });

  beforeEach(async () => {
    hostComment.mockClear();
    await render(
      <Excalidraw handleKeyboardGlobally={true} onAddComment={hostComment} />,
    );
  });

  afterEach(() => {
    mouse.reset();
  });

  const drawSelectedRectangle = () => {
    UI.clickTool("rectangle");
    mouse.down(60, 60);
    mouse.up(160, 160);
  };

  const openElementMenu = () => {
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 100,
      clientY: 100,
    });
    const menu = UI.queryContextMenu();
    expect(menu).not.toBeNull();
    return menu!;
  };

  it("composes the object lane per ADR-0033", () => {
    drawSelectedRectangle();
    const menu = openElementMenu();
    const rows = Array.from(menu.querySelectorAll("li")).map((li) =>
      li.getAttribute("data-testid"),
    );
    const order: ActionName[] = [
      "copy",
      "cut",
      "paste",
      "copyElementLink",
      "duplicateSelection",
      "deleteSelectedElements",
      "addCommentOnElement",
      "copyStyles",
      "pasteStyles",
      "hyperlink",
      "toggleElementLock",
      "wrapSelectionInFrame",
    ];
    let at = 0;
    for (const name of order) {
      let index = -1;
      for (let i = at; i < rows.length; i++) {
        if (rows[i] === name) {
          index = i;
          break;
        }
      }
      // -1 means the row never rendered at or after the previous row
      expect(index).toBeGreaterThanOrEqual(at);
      at = index;
    }
  });

  it("offers Add comment only for a single-element selection", () => {
    drawSelectedRectangle();
    const menu = openElementMenu();
    expect(
      menu.querySelector('li[data-testid="addCommentOnElement"]'),
    ).not.toBeNull();
    // a two-element selection hides the row: a thread anchors to one element
    const first = API.createElement({ type: "rectangle" });
    const second = API.createElement({ type: "rectangle", x: 300, y: 300 });
    expect(
      actionAddCommentOnElement.predicate?.(
        [first, second],
        {
          ...h.state,
          selectedElementIds: { [first.id]: true, [second.id]: true },
        } as any,
        { onAddComment: () => {} } as any,
      ),
    ).toBe(false);
  });

  it("hands the selected element to the host comment hook", () => {
    drawSelectedRectangle();
    const menu = openElementMenu();
    const selected = h.elements[0];
    const row = menu.querySelector('li[data-testid="addCommentOnElement"]');
    fireEvent.click(row!);
    expect(hostComment).toHaveBeenCalledWith({ elementId: selected.id });
  });
});

describe("context menu structure and keyboard (ADR-0033)", () => {
  beforeAll(() => {
    mockBoundingClientRect();
  });

  afterAll(() => {
    restoreOriginalGetBoundingClientRect();
  });

  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  const openObjectMenu = () => {
    const rect = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 50,
      clientY: 50,
    });
    const menu = UI.queryContextMenu();
    expect(menu).not.toBeNull();
    return menu!;
  };

  it("renders menu roles and submenu parents with aria attributes", () => {
    const menu = openObjectMenu();
    expect(menu.getAttribute("role")).toBe("menu");
    expect(
      menu.querySelector('button[role="menuitem"][aria-haspopup="menu"]'),
    ).not.toBeNull();
    const arrange = menu.querySelector('button[data-submenu="arrange"]')!;
    expect(arrange.getAttribute("aria-expanded")).toBe("false");
    // checkable rows expose the checkbox role
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 500,
      clientY: 500,
    });
  });

  it("opens the Arrange submenu by click and the Info submenu shows facts", () => {
    const menu = openObjectMenu();
    fireEvent.click(menu.querySelector('button[data-submenu="arrange"]')!);
    expect(menu.querySelector('li[data-testid="sendToBack"]')).not.toBeNull();

    fireEvent.click(menu.querySelector('button[data-submenu="info"]')!);
    expect(menu.textContent).toContain("Created");
    expect(menu.textContent).toContain("Last modified");
    expect(menu.textContent).toContain("Word count");
  });

  it("focuses the first row on open and ArrowDown walks rows", () => {
    const menu = openObjectMenu();
    const rows = Array.from(
      menu.querySelectorAll<HTMLElement>(
        ":scope > li > button.context-menu-item",
      ),
    );
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: "End" });
    expect(document.activeElement).toBe(rows[rows.length - 1]);
    fireEvent.keyDown(rows[rows.length - 1], { key: "Home" });
    expect(document.activeElement).toBe(rows[0]);
  });

  it("ArrowRight opens the submenu, ArrowLeft closes it, Escape closes the lane and keeps the selection", () => {
    const menu = openObjectMenu();
    const arrange = menu.querySelector<HTMLElement>(
      'button[data-submenu="arrange"]',
    )!;
    arrange.focus();
    fireEvent.keyDown(arrange, { key: "ArrowRight" });
    const firstSubRow = menu.querySelector<HTMLElement>(
      ".context-menu-item__submenu button.context-menu-item",
    );
    expect(firstSubRow).not.toBeNull();
    expect(document.activeElement).toBe(firstSubRow);

    fireEvent.keyDown(firstSubRow!, { key: "ArrowLeft" });
    expect(menu.querySelector(".context-menu-item__submenu")).toBeNull();
    expect(document.activeElement).toBe(arrange);

    // Escape rung: the lane closes, the selection stays
    fireEvent.keyDown(arrange, { key: "Escape" });
    expect(UI.queryContextMenu()).toBeNull();
    expect(Object.keys(h.state.selectedElementIds).length).toBe(1);
  });

  it("opens the object lane with Ctrl+Enter for the selection", () => {
    const rect = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    API.setElements([rect]);
    API.setSelectedElements([rect]);
    expect(UI.queryContextMenu()).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Enter",
      ctrlKey: true,
    });
    const menu = UI.queryContextMenu();
    expect(menu).not.toBeNull();
    expect(
      menu!.querySelector('button[data-submenu="arrange"]'),
    ).not.toBeNull();
  });

  // c0faab8: the lane's keyTest must yield to the editor's own binding for a
  // single selected line or arrow, which enters the line editor instead
  it("keeps Ctrl+Enter line editing for a selected line, with no lane", () => {
    const line = API.createElement({
      type: "line",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(100, 100)],
    });
    API.setElements([line]);
    API.setSelectedElements([line]);
    // pointer selection seeds this state in the real flow; Enter then toggles
    // the editor on (actionToggleLinearEditor toggles, it does not create)
    act(() => {
      h.setState({
        selectedLinearElement: new LinearElementEditor(
          line,
          h.app.scene.getNonDeletedElementsMap(),
        ),
      });
    });
    expect(UI.queryContextMenu()).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Enter",
      ctrlKey: true,
    });
    expect(UI.queryContextMenu()).toBeNull();
    expect(h.state.selectedLinearElement?.isEditing).toBe(true);
    expect(h.state.selectedLinearElement?.elementId).toEqual(line.id);
  });

  it("keeps Ctrl+Enter line editing for a selected arrow, with no lane", () => {
    const arrow = API.createElement({
      type: "arrow",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(100, 100)],
    });
    API.setElements([arrow]);
    API.setSelectedElements([arrow]);
    // pointer selection seeds this state in the real flow; Enter then toggles
    // the editor on (actionToggleLinearEditor toggles, it does not create)
    act(() => {
      h.setState({
        selectedLinearElement: new LinearElementEditor(
          arrow,
          h.app.scene.getNonDeletedElementsMap(),
        ),
      });
    });
    expect(UI.queryContextMenu()).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Enter",
      ctrlKey: true,
    });
    expect(UI.queryContextMenu()).toBeNull();
    expect(h.state.selectedLinearElement?.isEditing).toBe(true);
    expect(h.state.selectedLinearElement?.elementId).toEqual(arrow.id);
  });

  it("opens the lane with Ctrl+Enter for a linear multi-selection", () => {
    const first = API.createElement({
      type: "line",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(100, 100)],
    });
    const second = API.createElement({
      type: "line",
      x: 200,
      y: 0,
      width: 100,
      height: 100,
      points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(100, 100)],
    });
    API.setElements([first, second]);
    API.setSelectedElements([first, second]);
    expect(UI.queryContextMenu()).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Enter",
      ctrlKey: true,
    });
    expect(UI.queryContextMenu()).not.toBeNull();
    expect(h.state.selectedLinearElement?.isEditing ?? false).toBe(false);
  });
});
