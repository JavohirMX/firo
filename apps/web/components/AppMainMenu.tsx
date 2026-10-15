import { MainMenu } from "@firo/editor/index";
import React from "react";

import { isDevEnv } from "@firo/common";
import { BoardsIcon, PlusIcon } from "@firo/ui";
import { useI18n } from "@firo/editor/i18n";

import type { Theme } from "@firo/element/types";

import { homeUrl, boardUrl } from "../board/routes";
import { createBoard } from "../board/library";
import { LanguageList } from "../app-language/LanguageList";

import { saveDebugState } from "./DebugCanvas";
import "./AppMainMenu.scss";

/**
 * The hamburger menu.
 *
 * Two items here were Excalidraw+ selling links — one to the landing page, one
 * to sign-up — each with `utm_source=excalidraw` tracking parameters and
 * branching on the `excplus-auth` cookie. Both are removed. The `VITE_APP_PLUS_*`
 * environment variables they read no longer exist; see `.env.development`.
 *
 * The app was otherwise local-first with no server and no account system, so
 * there is nothing to sign up to and no signed-in state to branch on. Sign-in
 * arrives in v2 with the self-hosted server (ADR-0008).
 */
export const AppMainMenu: React.FC<{
  isCollaborating: boolean;
  theme: Theme | "system";
  refresh: () => void;
}> = React.memo((props) => {
  const { t } = useI18n();

  return (
    <MainMenu>
      {/* Section 1: Board Navigation */}
      <MainMenu.Item
        icon={<BoardsIcon size={18} />}
        onSelect={() => {
          window.location.assign(homeUrl());
        }}
        data-testid="main-menu-all-boards"
      >
        All boards
      </MainMenu.Item>
      <MainMenu.Item
        icon={<PlusIcon size={18} />}
        onSelect={async () => {
          const newBoard = await createBoard({ name: "Untitled board" });
          window.location.assign(boardUrl(newBoard.id));
        }}
        data-testid="main-menu-new-board"
      >
        New board
      </MainMenu.Item>

      <MainMenu.Separator />

      {/* Section 2: File Operations */}
      <MainMenu.DefaultItems.SaveToActiveFile />
      {/*
       * Firo's board file.
       *
       * Beside "Export image..." because that is the same intent — getting the board
       * off the screen — and someone looking for one will look near the other. The
       * image export produces a picture; this produces the board, which is the thing
       * they actually came back for.
       *
       * These belong *here* rather than in the editor's fallback menu. The app supplies
       * its own menu through `MainMenuTunnel`, so `LayerUI`'s `__fallback` list is
       * never rendered — a fact that cost an hour to find, because the items were
       * added to the fallback first and simply never appeared, with no error.
       *
       * Both return `null` when the host has not registered the matching action, which
       * is the case for a bare Excalidraw embed: the behaviour needs a document, and an
       * embed has none.
       */}
      <MainMenu.DefaultItems.ImportSubMenu>
        <MainMenu.DefaultItems.LoadFromFiroFile />
        <MainMenu.DefaultItems.LoadScene />
      </MainMenu.DefaultItems.ImportSubMenu>
      <MainMenu.DefaultItems.ExportSubMenu>
        <MainMenu.DefaultItems.SaveAsFiroFile />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.ExportMiroScript />
        <MainMenu.DefaultItems.Export />
      </MainMenu.DefaultItems.ExportSubMenu>

      <MainMenu.Separator />

      {/* Section 3: Canvas & Tools */}
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.ClearCanvas />

      <MainMenu.Separator />

      {/* Section 4: Settings & Appearance */}
      <MainMenu.DefaultItems.Preferences />
      <MainMenu.DefaultItems.ToggleTheme allowSystemTheme theme={props.theme} />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
      <MainMenu.ItemCustom>
        <div className="main-menu-language-row">
          <span className="main-menu-language-label">
            {t("labels.language") || "Language"}
          </span>
          <LanguageList />
        </div>
      </MainMenu.ItemCustom>

      <MainMenu.Separator />

      {/* Section 5: Help & Diagnostics */}
      <MainMenu.DefaultItems.Help />
      {isDevEnv() && (
        <MainMenu.Item
          icon={undefined}
          onSelect={() => {
            if (window.visualDebug) {
              delete window.visualDebug;
              saveDebugState({ enabled: false });
            } else {
              window.visualDebug = { data: [] };
              saveDebugState({ enabled: true });
            }
            props?.refresh();
          }}
        >
          Visual Debug
        </MainMenu.Item>
      )}
    </MainMenu>
  );
});
