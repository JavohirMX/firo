import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { act, render, fireEvent } from "../tests/test-utils";

import {
  actionToggleHiddenUntilRevealed,
  actionToggleHideInPresentation,
} from "./actionVisibility";

const { h } = window;

describe("visibility object-lane actions", () => {
  it.each([
    [actionToggleHiddenUntilRevealed, "hiddenUntilRevealed"],
    [actionToggleHideInPresentation, "hideInPresentation"],
  ] as const)(
    "hands %s to the host, using all-selected toggle semantics",
    async (action, flag) => {
      const onSetElementVisibility = vi.fn();
      await render(
        <Excalidraw onSetElementVisibility={onSetElementVisibility} />,
      );
      const first = API.createElement({ type: "rectangle", id: "first" });
      Object.assign(first, { customData: { [`firo.${flag}`]: true } });
      const second = API.createElement({ type: "rectangle", id: "second" });
      API.setElements([first, second]);
      API.setSelectedElements([first, second]);
      expect(action.checked(h.state, h.elements)).toBe(false);
      act(() => h.app.actionManager.executeAction(action));
      expect(onSetElementVisibility).toHaveBeenLastCalledWith(
        ["first", "second"],
        flag,
        true,
      );
      API.setSelectedElements([first]);
      expect(action.checked(h.state, h.elements)).toBe(true);
      act(() => h.app.actionManager.executeAction(action));
      expect(onSetElementVisibility).toHaveBeenLastCalledWith(
        ["first"],
        flag,
        false,
      );
    },
  );

  it("refuses direct execution in view mode even when a callback remains", async () => {
    const onSetElementVisibility = vi.fn();
    await render(
      <Excalidraw onSetElementVisibility={onSetElementVisibility} />,
    );
    const shape = API.createElement({ type: "rectangle" });
    API.setElements([shape]);
    API.setSelectedElements([shape]);
    actionToggleHideInPresentation.perform(
      h.elements as never,
      { ...h.state, viewModeEnabled: true },
      null,
      h.app,
    );
    expect(onSetElementVisibility).not.toHaveBeenCalled();
  });
  it("renders checkable rows beside Lock through the keyboard object lane", async () => {
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        onSetElementVisibility={vi.fn()}
      />,
    );
    const shape = API.createElement({ type: "rectangle", id: "selected" });
    Object.assign(shape, { customData: { "firo.hiddenUntilRevealed": true } });
    API.setElements([shape]);
    API.setSelectedElements([shape]);
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Enter",
      ctrlKey: true,
    });
    const hidden = document.querySelector(
      '[data-testid="toggleHiddenUntilRevealed"] button',
    );
    const presentation = document.querySelector(
      '[data-testid="toggleHideInPresentation"] button',
    );
    expect(hidden?.getAttribute("role")).toBe("menuitemcheckbox");
    expect(hidden?.getAttribute("aria-checked")).toBe("true");
    expect(presentation?.getAttribute("aria-checked")).toBe("false");
  });
});
