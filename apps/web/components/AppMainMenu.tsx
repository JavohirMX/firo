import { MainMenu } from "@firo/editor/index";
import React from "react";

import { isDevEnv } from "@firo/common";
import {
  BoardsIcon,
  ClockIcon,
  DownloadIcon,
  PlusIcon,
  UploadIcon,
} from "@firo/ui";
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
  onExport?: () => void;
  onImport?: () => void;
  onVersionHistory?: () => void;
  /** Name of the signed-in sync user, if any. */
  syncUsername?: string | null;
  /** Offered only when a sync server is reachable. */
  onSignIn?: () => void;
  onSignOut?: () => void;
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
      <MainMenu.Item
        icon={<ClockIcon size={18} />}
        onSelect={props.onVersionHistory}
        data-testid="main-menu-version-history"
      >
        Version history...
      </MainMenu.Item>
      {props.onImport ? (
        <MainMenu.Item
          icon={<UploadIcon size={18} />}
          onSelect={props.onImport}
          data-testid="main-menu-import"
        >
          Import...
        </MainMenu.Item>
      ) : (
        <MainMenu.DefaultItems.ImportSubMenu>
          <MainMenu.DefaultItems.LoadFromFiroFile />
          <MainMenu.DefaultItems.LoadScene />
        </MainMenu.DefaultItems.ImportSubMenu>
      )}

      {props.onExport ? (
        <MainMenu.Item
          icon={<DownloadIcon size={18} />}
          shortcut="CtrlOrCmd+Shift+E"
          onSelect={props.onExport}
          data-testid="main-menu-export"
        >
          Export...
        </MainMenu.Item>
      ) : (
        <MainMenu.DefaultItems.ExportSubMenu>
          <MainMenu.DefaultItems.SaveAsFiroFile />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ExportMiroScript />
          <MainMenu.DefaultItems.Export />
        </MainMenu.DefaultItems.ExportSubMenu>
      )}

      {props.syncUsername && props.onSignOut ? (
        <MainMenu.Item
          onSelect={props.onSignOut}
          data-testid="main-menu-sign-out"
        >
          Sign out ({props.syncUsername})
        </MainMenu.Item>
      ) : props.onSignIn ? (
        <MainMenu.Item
          onSelect={props.onSignIn}
          data-testid="main-menu-sign-in"
        >
          Sign in to sync server...
        </MainMenu.Item>
      ) : null}

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
