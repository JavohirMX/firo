import { CODES, KEYS } from "@firo/common";

import { CaptureUpdateAction } from "@firo/element";

import { gridIcon } from "../components/icons";

import { register } from "./register";

import type { GridType } from "../types";

export const GRID_TYPES: readonly GridType[] = [
  "dots",
  "lines",
  "crosses",
  "isometric",
] as const;

export const actionToggleGridMode = register({
  name: "gridMode",
  icon: gridIcon,
  keywords: ["snap"],
  label: "labels.toggleGrid",
  viewMode: true,
  trackEvent: {
    category: "canvas",
    predicate: (appState) => appState.gridModeEnabled,
  },
  perform(elements, appState, formData) {
    let nextGridModeEnabled: boolean;
    let nextGridType: GridType = appState.gridType ?? "dots";

    if (typeof formData === "boolean") {
      nextGridModeEnabled = formData;
    } else if (
      typeof formData === "string" &&
      GRID_TYPES.includes(formData as GridType)
    ) {
      nextGridModeEnabled = true;
      nextGridType = formData as GridType;
    } else if (formData === "toggle") {
      nextGridModeEnabled = !appState.gridModeEnabled;
    } else if (!appState.gridModeEnabled) {
      // Cycling: off -> dots -> lines -> crosses -> isometric -> off
      nextGridModeEnabled = true;
      nextGridType = appState.gridType ?? "dots";
    } else {
      const currentType = appState.gridType ?? "dots";
      const currentIndex = GRID_TYPES.indexOf(currentType);
      if (currentIndex >= 0 && currentIndex < GRID_TYPES.length - 1) {
        nextGridModeEnabled = true;
        nextGridType = GRID_TYPES[currentIndex + 1];
      } else {
        nextGridModeEnabled = false;
        nextGridType = "dots";
      }
    }

    return {
      appState: {
        ...appState,
        gridModeEnabled: nextGridModeEnabled,
        gridType: nextGridType,
        objectsSnapModeEnabled: false,
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  checked: (appState) => appState.gridModeEnabled,
  predicate: (element, appState, props) => {
    return props.gridModeEnabled === undefined;
  },
  // Miro parity: plain `G` toggles the grid (Firo previously used `Ctrl+'`,
  // which Miro does not). Modifiers stay clear so `Ctrl+G` (group) still wins —
  // see `actionGroup`. Miro-first on collision; the standard editing keys
  // (copy/cut/paste/select-all/undo/redo) are the exception.
  keyTest: (event) =>
    !event[KEYS.CTRL_OR_CMD] &&
    !event.shiftKey &&
    !event.altKey &&
    event.code === CODES.G,
});
