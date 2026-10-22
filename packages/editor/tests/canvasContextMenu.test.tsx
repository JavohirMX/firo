import React from "react";

import { reseed } from "@firo/common";

import {
  actionAddCommentAtAnchor,
  actionToggleSelectionDimensions,
} from "../actions/actionCanvasAnchor";
import { Excalidraw } from "../index";

import { UI } from "./helpers/ui";
import {
  render,
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
        onAddCommentAtPoint: spy,
      } as any),
    ).toBe(true);
  });

  it("hands the scene anchor to the host comment hook", () => {
    const menu = openCanvasMenu(100, 100);
    expect(h.state.contextMenu).not.toBeNull();
    const spy = vi.fn();
    actionAddCommentAtAnchor.perform(h.elements as any, h.state, undefined, {
      props: { onAddCommentAtPoint: spy },
    } as any);
    // default view: zoom 1, no scroll -> scene is client minus the offsets
    expect(spy).toHaveBeenCalledWith({
      x: 100 - h.state.offsetLeft,
      y: 100 - h.state.offsetTop,
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
