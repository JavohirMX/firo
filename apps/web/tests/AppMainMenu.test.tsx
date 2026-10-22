import "fake-indexeddb/auto";
import React, { useState } from "react";
import { Excalidraw } from "@firo/editor";
import { defaultLang, languages } from "@firo/editor/i18n";

import {
  screen,
  fireEvent,
  waitFor,
  render,
} from "@firo/editor/tests/test-utils";

import type { Theme } from "@firo/element/types";

import { Provider } from "../app-jotai";
import { AppMainMenu } from "../components/AppMainMenu";
import { homeUrl } from "../board/routes";
import { useAppLangCode } from "../app-language/language-state";

const TestMenuApp = () => {
  const [langCode] = useAppLangCode();
  const [theme, setTheme] = useState<Theme | "system">("light");

  return (
    <Excalidraw
      langCode={langCode}
      theme={theme === "system" ? "light" : theme}
      onThemeChange={(newTheme) => setTheme(newTheme)}
    >
      <AppMainMenu isCollaborating={false} theme={theme} refresh={() => {}} />
    </Excalidraw>
  );
};

describe("AppMainMenu", () => {
  const originalLocation = window.location;
  let assignMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      writable: true,
      value: {
        ...originalLocation,
        assign: assignMock,
        pathname: "/",
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });

  const renderMainMenu = async () => {
    await render(
      <Provider>
        <TestMenuApp />
      </Provider>,
    );

    const menuButton = document.querySelector(".dropdown-menu-button");
    expect(menuButton).not.toBeNull();
    fireEvent.click(menuButton!);
  };

  // Radix opens a submenu on ArrowRight, mirroring keyboard use.
  const openSubmenu = (testid: string) => {
    fireEvent.keyDown(screen.getByTestId(testid), { key: "ArrowRight" });
  };

  it("renders the five top-level groups (Miro parity row 7)", async () => {
    await renderMainMenu();

    // Board - Edit - View - Preferences - Help; Firo keeps Help where Miro
    // has Accessibility, whose options live inside Preferences here.
    expect(screen.getByTestId("main-menu-board-submenu")).not.toBeNull();
    expect(screen.getByTestId("main-menu-edit-submenu")).not.toBeNull();
    expect(screen.getByTestId("main-menu-view-submenu")).not.toBeNull();
    expect(screen.getByTestId("main-menu-preferences-submenu")).not.toBeNull();
    expect(screen.getByTestId("main-menu-help-submenu")).not.toBeNull();
  });

  it("groups board navigation and file operations under Board", async () => {
    await renderMainMenu();
    openSubmenu("main-menu-board-submenu");

    expect(screen.getByTestId("main-menu-all-boards")).not.toBeNull();
    expect(screen.getByTestId("main-menu-new-board")).not.toBeNull();
    expect(screen.getByTestId("main-menu-version-history")).not.toBeNull();
    expect(screen.getByText("Import")).not.toBeNull();
    expect(screen.getByText("Export")).not.toBeNull();
  });

  it("groups canvas tools under Edit", async () => {
    await renderMainMenu();
    openSubmenu("main-menu-edit-submenu");

    expect(screen.getByTestId("command-palette-button")).not.toBeNull();
    expect(screen.getByTestId("search-menu-button")).not.toBeNull();
    expect(screen.getByTestId("clear-canvas-button")).not.toBeNull();
  });

  it("groups appearance under View and settings under Preferences", async () => {
    await renderMainMenu();
    openSubmenu("main-menu-view-submenu");

    expect(document.querySelector('input[name="theme"]')).not.toBeNull();
    expect(screen.getByTestId("canvas-background-label")).not.toBeNull();

    openSubmenu("main-menu-preferences-submenu");
    // the group trigger and the item share the name
    expect(screen.getAllByText("Preferences").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector(".main-menu-language-row")).not.toBeNull();
    expect(screen.getByText("Language")).not.toBeNull();
    expect(document.querySelector(".dropdown-select__language")).not.toBeNull();
  });

  it("groups help under Help", async () => {
    await renderMainMenu();
    openSubmenu("main-menu-help-submenu");

    expect(screen.getByTestId("help-menu-item")).not.toBeNull();
  });

  it("navigates to all boards when clicking 'All boards'", async () => {
    await renderMainMenu();
    openSubmenu("main-menu-board-submenu");

    const allBoardsItem = screen.getByTestId("main-menu-all-boards");
    fireEvent.click(allBoardsItem);
    expect(assignMock).toHaveBeenCalledWith(homeUrl());
  });

  it("creates a new board and navigates to it when clicking 'New board'", async () => {
    await renderMainMenu();
    openSubmenu("main-menu-board-submenu");

    const newBoardItem = screen.getByTestId("main-menu-new-board");
    fireEvent.click(newBoardItem);

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/\?board=/),
      );
    });
  });

  it("renders file operations import and export submenus", async () => {
    await renderMainMenu();
    openSubmenu("main-menu-board-submenu");

    const importTrigger = screen
      .getByText("Import")
      .closest(".dropdown-menu__submenu-trigger");
    expect(importTrigger).not.toBeNull();

    const exportTrigger = screen
      .getByText("Export")
      .closest(".dropdown-menu__submenu-trigger");
    expect(exportTrigger).not.toBeNull();
  });

  it("toggles theme via Theme radio selection", async () => {
    await renderMainMenu();
    openSubmenu("main-menu-view-submenu");

    const themeRadios = document.querySelectorAll<HTMLInputElement>(
      'input[name="theme"]',
    );
    expect(themeRadios.length).toBeGreaterThanOrEqual(2);

    const darkRadio = themeRadios[1]; // [0] = light, [1] = dark, [2] = system
    fireEvent.click(darkRadio);

    await waitFor(() => {
      expect(darkRadio.checked).toBe(true);
    });
  });

  it("renders the language selector inside polished row and handles language changes", async () => {
    await renderMainMenu();
    openSubmenu("main-menu-preferences-submenu");

    const select = document.querySelector<HTMLSelectElement>(
      ".dropdown-select__language",
    );
    expect(select).not.toBeNull();

    const testLang = languages.find((lang) => lang.code === "fr-FR");
    expect(testLang).toBeDefined();

    fireEvent.change(select!, {
      target: { value: "fr-FR" },
    });

    await waitFor(() => {
      expect(select!.value).toBe("fr-FR");
    });

    // Revert back
    fireEvent.change(select!, {
      target: { value: defaultLang.code },
    });

    await waitFor(() => {
      expect(select!.value).toBe(defaultLang.code);
    });
  });
});
