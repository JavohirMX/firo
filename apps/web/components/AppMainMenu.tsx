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
