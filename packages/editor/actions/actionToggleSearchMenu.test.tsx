import { CANVAS_SEARCH_TAB, DEFAULT_SIDEBAR } from "@firo/common";

import { Excalidraw } from "../index";
import { act, render } from "../tests/test-utils";

import { actionToggleSearchMenu } from "./actionToggleSearchMenu";

const { h } = window;

describe("actionToggleSearchMenu", () => {
  it("checked state reflects whether canvas search sidebar tab is open", () => {
    // Unrelated gridModeEnabled should not affect search menu checked state
    expect(
      actionToggleSearchMenu.checked?.({
        gridModeEnabled: true,
        openSidebar: null,
      } as any),
    ).toBe(false);

    expect(
      actionToggleSearchMenu.checked?.({
        gridModeEnabled: false,
        openSidebar: { name: DEFAULT_SIDEBAR.name, tab: CANVAS_SEARCH_TAB },
      } as any),
    ).toBe(true);
  });

  it("predicate returns true regardless of gridModeEnabled props", () => {
    expect(actionToggleSearchMenu.predicate?.()).toBe(true);
  });

  it("opens the search sidebar tab when performed", async () => {
    await render(<Excalidraw />);

    await act(async () => {
      h.app.actionManager.executeAction(actionToggleSearchMenu);
    });

    expect(h.state.openSidebar).toEqual({
      name: DEFAULT_SIDEBAR.name,
      tab: CANVAS_SEARCH_TAB,
    });
    expect(actionToggleSearchMenu.checked?.(h.state)).toBe(true);
  });
});
