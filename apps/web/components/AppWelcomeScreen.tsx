import { useI18n } from "@firo/editor/i18n";
import { WelcomeScreen } from "@firo/editor/index";
import React from "react";

/**
 * The welcome screen shown on first load.
 *
 * Upstream branched its heading on the `excplus-auth` cookie and rendered
 * "Excalidraw+" as a link to the paid product for signed-in users, and offered a
 * sign-up link with `utm_source=excalidraw` tracking to everyone else. Both are
 * gone: Firo v1 has no account system, so there is no signed-in state and
 * nothing to sign up to. Sign-in arrives in v2 with the self-hosted server
 * (ADR-0008).
 */
export const AppWelcomeScreen: React.FC<Record<string, never>> = React.memo(
  () => {
    const { t } = useI18n();

    return (
      <WelcomeScreen>
        <WelcomeScreen.Hints.MenuHint>
          {t("welcomeScreen.app.menuHint")}
        </WelcomeScreen.Hints.MenuHint>
        <WelcomeScreen.Hints.ToolbarHint />
        <WelcomeScreen.Hints.HelpHint />
        <WelcomeScreen.Center>
          <WelcomeScreen.Center.Logo />
          <WelcomeScreen.Center.Heading>
            {t("welcomeScreen.app.center_heading")}
            <br />
            {t("welcomeScreen.app.center_heading_line2")}
            <br />
            {t("welcomeScreen.app.center_heading_line3")}
          </WelcomeScreen.Center.Heading>
          <WelcomeScreen.Center.Menu>
            <WelcomeScreen.Center.MenuItemLoadScene />
            <WelcomeScreen.Center.MenuItemHelp />
          </WelcomeScreen.Center.Menu>
        </WelcomeScreen.Center>
      </WelcomeScreen>
    );
  },
);
