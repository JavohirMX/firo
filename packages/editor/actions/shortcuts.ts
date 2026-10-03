import { isDarwin } from "@firo/common";

import type { SubtypeOf } from "@firo/common/utility-types";

import { t } from "../i18n";
import { getShortcutKey } from "../shortcut";

import type { ActionName } from "./types";

export type ShortcutName =
  | SubtypeOf<
      ActionName,
      | "toggleTheme"
      | "loadScene"
      | "clearCanvas"
      | "cut"
      | "copy"
      | "paste"
      | "copyStyles"
      | "pasteStyles"
      | "selectAll"
      | "deleteSelectedElements"
      | "duplicateSelection"
      | "sendBackward"
      | "bringForward"
      | "sendToBack"
      | "bringToFront"
      | "copyAsPng"
      | "group"
      | "ungroup"
      | "gridMode"
      | "zenMode"
      | "objectsSnapMode"
      | "stats"
      | "addToLibrary"
      | "viewMode"
      | "flipHorizontal"
      | "flipVertical"
      | "hyperlink"
      | "toggleElementLock"
      | "resetZoom"
      | "zoomOut"
      | "zoomIn"
      | "zoomToFit"
      | "zoomToFitSelectionInViewport"
      | "zoomToFitSelection"
      | "saveFileToDisk"
      | "saveToActiveFile"
      | "toggleShortcuts"
      | "wrapSelectionInFrame"
      /*
       * Firo's facilitator commands (`apps/web/board/facilitatorActions.ts`).
       *
       * Listed here purely so the command palette can *print* them. A shortcut that
       * exists but is named nowhere is a shortcut nobody discovers, and the palette
       * is the discoverability backstop; the `keyTest` in the app is what actually
       * binds them.
       *
       * Every one is `Alt`-prefixed. That is a considered choice rather than a
       * default: the Phase 3 plan requires single-key shortcuts to be individually
       * disableable for voice-control users, and `ActionManager` has no such switch
       * for a host-registered action — `UIOptions.canvasActions` is a fixed list of
       * seven inherited names, and a name not in it is always enabled. So a bare
       * letter here would be a bare letter nobody could turn off. See the module
       * header of `facilitatorActions.ts` for the collision check that picked them.
       */
      | "toggleFacilitatorTimer"
      | "resetFacilitatorTimer"
      | "addMinuteToTimer"
      | "toggleBoardReveal"
      | "addVoteToSelection"
      | "removeVoteFromSelection"
      | "readVoteTally"
    >
  | "saveScene"
  | "imageExport"
  | "commandPalette"
  | "searchMenu"
  | "toolLock";

const shortcutMap: Record<ShortcutName, string[]> = {
  toggleTheme: [getShortcutKey("Shift+Alt+D")],
  saveScene: [getShortcutKey("CtrlOrCmd+S")],
  loadScene: [getShortcutKey("CtrlOrCmd+O")],
  clearCanvas: [getShortcutKey("CtrlOrCmd+Delete")],
  imageExport: [getShortcutKey("CtrlOrCmd+Shift+E")],
  commandPalette: [
    getShortcutKey("CtrlOrCmd+/"),
    getShortcutKey("CtrlOrCmd+Shift+P"),
  ],
  cut: [getShortcutKey("CtrlOrCmd+X")],
  copy: [getShortcutKey("CtrlOrCmd+C")],
  paste: [getShortcutKey("CtrlOrCmd+V")],
  copyStyles: [getShortcutKey("CtrlOrCmd+Alt+C")],
  pasteStyles: [getShortcutKey("CtrlOrCmd+Alt+V")],
  selectAll: [getShortcutKey("CtrlOrCmd+A")],
  deleteSelectedElements: [getShortcutKey("Delete")],
  duplicateSelection: [
    getShortcutKey("CtrlOrCmd+D"),
    getShortcutKey(`Alt+${t("helpDialog.drag")}`),
  ],
  sendBackward: [getShortcutKey("CtrlOrCmd+[")],
  bringForward: [getShortcutKey("CtrlOrCmd+]")],
  sendToBack: [
    isDarwin
      ? getShortcutKey("CtrlOrCmd+Alt+[")
      : getShortcutKey("CtrlOrCmd+Shift+["),
  ],
  bringToFront: [
    isDarwin
      ? getShortcutKey("CtrlOrCmd+Alt+]")
      : getShortcutKey("CtrlOrCmd+Shift+]"),
  ],
  copyAsPng: [getShortcutKey("Shift+Alt+C")],
  group: [getShortcutKey("CtrlOrCmd+G")],
  ungroup: [getShortcutKey("CtrlOrCmd+Shift+G")],
  gridMode: [getShortcutKey("CtrlOrCmd+'")],
  zenMode: [getShortcutKey("Alt+Z")],
  objectsSnapMode: [getShortcutKey("Alt+S")],
  stats: [getShortcutKey("Alt+/")],
  addToLibrary: [],
  flipHorizontal: [getShortcutKey("Shift+H")],
  flipVertical: [getShortcutKey("Shift+V")],
  viewMode: [getShortcutKey("Alt+R")],
  hyperlink: [getShortcutKey("CtrlOrCmd+K")],
  toggleElementLock: [getShortcutKey("CtrlOrCmd+Shift+L")],
  resetZoom: [getShortcutKey("CtrlOrCmd+0")],
  zoomOut: [getShortcutKey("CtrlOrCmd+-")],
  zoomIn: [getShortcutKey("CtrlOrCmd++")],
  zoomToFitSelection: [getShortcutKey("Shift+3")],
  zoomToFit: [getShortcutKey("Shift+1")],
  zoomToFitSelectionInViewport: [getShortcutKey("Shift+2")],
  saveFileToDisk: [getShortcutKey("CtrlOrCmd+S")],
  saveToActiveFile: [getShortcutKey("CtrlOrCmd+S")],
  toggleShortcuts: [getShortcutKey("?")],
  searchMenu: [getShortcutKey("CtrlOrCmd+F")],
  wrapSelectionInFrame: [],
  toolLock: [getShortcutKey("Q")],
  /*
   * The facilitator's `Alt` chords. Checked against every inherited binding before
   * being written down, and the checks are worth keeping in mind when adding more:
   *
   * `Alt+H` distribute-horizontal, `Alt+V` distribute-vertical, `Alt+S` objects-snap,
   * `Alt+Z` zen, `Alt+R` view mode, `Alt+/` stats, `Alt+Shift+D` theme, `Alt+Shift+C`
   * copy-as-SVG. Most of those `keyTest`s do not test `shiftKey`, so
   * `Alt+Shift+<any of those letters>` is taken too — which is what rules out the
   * obvious `Alt+Shift+D` for "remove a dot" and the obvious `Alt+V` for "vote".
   *
   * `T`, `M`, `P`, `D`, `W` and `L` are free in that whole region.
   */
  toggleFacilitatorTimer: [getShortcutKey("Alt+T")],
  resetFacilitatorTimer: [getShortcutKey("Alt+Shift+T")],
  addMinuteToTimer: [getShortcutKey("Alt+M")],
  toggleBoardReveal: [getShortcutKey("Alt+Shift+P")],
  addVoteToSelection: [getShortcutKey("Alt+D")],
  removeVoteFromSelection: [getShortcutKey("Alt+W")],
  readVoteTally: [getShortcutKey("Alt+L")],
};

export const getShortcutFromShortcutName = (name: ShortcutName, idx = 0) => {
  const shortcuts = shortcutMap[name];
  // if multiple shortcuts available, take the first one
  return shortcuts && shortcuts.length > 0
    ? shortcuts[idx] || shortcuts[0]
    : "";
};
