import {
  KEYS,
  CANVAS_SEARCH_TAB,
  CLASSES,
  DEFAULT_SIDEBAR,
} from "@firo/common";

import { CaptureUpdateAction } from "@firo/element";

import { searchIcon } from "../components/icons";

import { register } from "./register";

export const actionToggleSearchMenu = register({
  name: "searchMenu",
  icon: searchIcon,
  keywords: ["search", "find"],
  label: "search.title",
  viewMode: true,
  trackEvent: {
    category: "search_menu",
    action: "toggle",
  },
  perform(elements, appState, _, app) {
    if (appState.openDialog) {
      return false;
    }

    if (
      appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
      appState.openSidebar.tab === CANVAS_SEARCH_TAB
    ) {
      const searchInput =
        app.excalidrawContainerValue.container?.querySelector<HTMLInputElement>(
          `.${CLASSES.SEARCH_MENU_INPUT_WRAPPER} input`,
        );

      searchInput?.focus();
      searchInput?.select();
      return false;
    }

    return {
      appState: {
        ...appState,
        openSidebar: { name: DEFAULT_SIDEBAR.name, tab: CANVAS_SEARCH_TAB },
        openDialog: null,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  checked: (appState) =>
    appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
    appState.openSidebar.tab === CANVAS_SEARCH_TAB,
  predicate: () => true,
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.key === KEYS.F,
});
