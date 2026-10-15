import React from "react";

import { CODES, KEYS } from "@firo/common";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { fireEvent, render, waitFor } from "./test-utils";

const { h } = window;

describe("shortcuts", () => {
  it("Clear canvas shortcut should display confirm dialog", async () => {
    await render(
      <Excalidraw
        initialData={{ elements: [API.createElement({ type: "rectangle" })] }}
        handleKeyboardGlobally
      />,
    );

    expect(window.h.elements.length).toBe(1);

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.keyDown(KEYS.DELETE);
    });
    const confirmDialog = document.querySelector(".confirm-dialog")!;
    expect(confirmDialog).not.toBe(null);

    fireEvent.click(confirmDialog.querySelector('[aria-label="Confirm"]')!);

    await waitFor(() => {
      expect(window.h.elements[0].isDeleted).toBe(true);
    });
  });

  /**
   * Miro's grid key, and the guard around it.
   *
   * Miro's `G` is a plain toggle; Firo has four grid patterns, so the inherited
   * command *cycles* them and the grid turns off after the last one. The
   * binding is Miro's, the cycling is Firo's and is kept rather than flattened —
   * the alternative hides three patterns behind the mouse.
   *
   * `Ctrl+G` is grouping, and the grid binding must not eat it. That is why the
   * keyTest refuses every modifier instead of matching `G` unconditionally.
   */
  it("binds the grid to a bare G, and leaves Ctrl+G to grouping", async () => {
    await render(
      <Excalidraw
        initialData={{
          elements: [
            API.createElement({ type: "rectangle", id: "a" }),
            API.createElement({ type: "rectangle", id: "b" }),
          ],
        }}
        handleKeyboardGlobally
      />,
    );

    expect(h.state.gridModeEnabled).toBe(false);

    Keyboard.codePress(CODES.G);
    expect(h.state.gridModeEnabled).toBe(true);
    expect(h.state.gridType).toBe("dots");

    // ...and cycles the pattern, the way the button does.
    Keyboard.codePress(CODES.G);
    expect(h.state.gridType).toBe("lines");
    Keyboard.codePress(CODES.G);
    Keyboard.codePress(CODES.G);
    expect(h.state.gridType).toBe("isometric");

    // The cycle is finite: the press after the last pattern is the off switch.
    Keyboard.codePress(CODES.G);
    expect(h.state.gridModeEnabled).toBe(false);

    // A `g` press *with* Ctrl is the group shortcut, and reaches it: the grid
    // binding refuses modifiers, so nothing is swallowed. Both `key` and `code`
    // are set here, because grouping matches on the produced letter while the
    // grid matches on the physical key — the asymmetry is real and this pins it.
    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.keyPress(KEYS.A);
    });
    expect(Object.keys(h.state.selectedElementIds)).toHaveLength(2);

    fireEvent.keyDown(document, { key: KEYS.G, code: CODES.G, ctrlKey: true });

    expect(h.state.gridModeEnabled).toBe(false);
    expect(h.elements[0].groupIds).toHaveLength(1);
    expect(h.elements[0].groupIds[0]).toBe(h.elements[1].groupIds[0]);
  });
});
