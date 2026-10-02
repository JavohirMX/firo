import { MainMenu } from "@firo/editor/index";
import React from "react";

import { isDevEnv } from "@firo/common";

import type { Theme } from "@firo/element/types";

import { LanguageList } from "../app-language/LanguageList";

import { saveDebugState } from "./DebugCanvas";

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
  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
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
      <MainMenu.DefaultItems.SaveAsFiroFile />
      <MainMenu.DefaultItems.LoadFromFiroFile />
      <MainMenu.DefaultItems.ClearCanvas />
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
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences />
      <MainMenu.DefaultItems.ToggleTheme allowSystemTheme theme={props.theme} />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
});
