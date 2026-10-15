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

  it("renders all 5 logical sections and items", async () => {
    await renderMainMenu();

    // Section 1: Board Navigation
    expect(screen.getByTestId("main-menu-all-boards")).not.toBeNull();
    expect(screen.getByTestId("main-menu-new-board")).not.toBeNull();

    // Section 2: File Operations
    expect(screen.getByText("Import")).not.toBeNull();
    expect(screen.getByText("Export")).not.toBeNull();

    // Section 3: Canvas & Tools
    expect(screen.getByTestId("command-palette-button")).not.toBeNull();
    expect(screen.getByTestId("search-menu-button")).not.toBeNull();
    expect(screen.getByTestId("clear-canvas-button")).not.toBeNull();

    // Section 4: Settings & Appearance
    expect(screen.getByText("Preferences")).not.toBeNull();
    expect(document.querySelector('input[name="theme"]')).not.toBeNull();
    expect(screen.getByTestId("canvas-background-label")).not.toBeNull();
    expect(document.querySelector(".main-menu-language-row")).not.toBeNull();
    expect(screen.getByText("Language")).not.toBeNull();
    expect(document.querySelector(".dropdown-select__language")).not.toBeNull();

    // Section 5: Help & Diagnostics
    expect(screen.getByTestId("help-menu-item")).not.toBeNull();
  });

  it("separates the 5 sections with separators", async () => {
    await renderMainMenu();

    const mainMenu = document.querySelector(".dropdown-menu.main-menu");
    expect(mainMenu).not.toBeNull();

    const separators = mainMenu!.querySelectorAll(".dropdown-menu-separator");
    expect(separators.length).toBe(4);
  });

  it("navigates to all boards when clicking 'All boards'", async () => {
    await renderMainMenu();

    const allBoardsItem = screen.getByTestId("main-menu-all-boards");
    fireEvent.click(allBoardsItem);
    expect(assignMock).toHaveBeenCalledWith(homeUrl());
  });

  it("creates a new board and navigates to it when clicking 'New board'", async () => {
    await renderMainMenu();

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
