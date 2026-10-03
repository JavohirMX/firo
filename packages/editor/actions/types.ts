import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@firo/element/types";

import type { CaptureUpdateActionType } from "@firo/element";

import type {
  AppClassProperties,
  AppState,
  ExcalidrawProps,
  BinaryFiles,
  UIAppState,
} from "../types";
import type React from "react";

export type ActionSource =
  | "ui"
  | "keyboard"
  | "contextMenu"
  | "api"
  | "commandPalette";

/** if false, the action should be prevented */
export type ActionResult =
  | {
      elements?: readonly ExcalidrawElement[] | null;
      appState?: Partial<AppState> | null;
      files?: BinaryFiles | null;
      captureUpdate: CaptureUpdateActionType;
      replaceFiles?: boolean;
    }
  | false;

type ActionFn<TData = any> = (
  elements: readonly OrderedExcalidrawElement[],
  appState: Readonly<AppState>,
  formData: TData | undefined,
  app: AppClassProperties,
) => ActionResult | Promise<ActionResult>;

export type UpdaterFn = (res: ActionResult) => void;
export type ActionFilterFn = (action: Action) => void;

export type ActionName =
  | "copy"
  | "cut"
  | "paste"
  | "copyAsPng"
  | "copyAsSvg"
  | "copyText"
  | "sendBackward"
  | "bringForward"
  | "sendToBack"
  | "bringToFront"
  | "copyStyles"
  | "selectAll"
  | "pasteStyles"
  | "gridMode"
  | "zenMode"
  | "objectsSnapMode"
  | "arrowBinding"
  | "midpointSnapping"
  | "showHints"
  | "stats"
  | "changeStrokeColor"
  | "changeBackgroundColor"
  | "changeBucketFillBackgroundColor"
  | "changeFillStyle"
  | "changeStrokeWidth"
  | "changeSloppiness"
  | "changeFreedrawMode"
  | "changeStrokeStyle"
  | "changeArrowhead"
  | "changeArrowType"
  | "changeArrowProperties"
  | "changeOpacity"
  | "changeFontSize"
  | "undo"
  | "redo"
  | "finalize"
  | "changeProjectName"
  | "changeExportBackground"
  | "changeExportEmbedScene"
  | "changeExportScale"
  | "saveToActiveFile"
  | "saveFileToDisk"
  | "loadScene"
  | "duplicateSelection"
  | "deleteSelectedElements"
  | "changeViewBackgroundColor"
  | "clearCanvas"
  | "zoomIn"
  | "zoomOut"
  | "resetZoom"
  | "zoomToFit"
  | "zoomToFitSelection"
  | "zoomToFitSelectionInViewport"
  | "changeFontFamily"
  | "changeTextAlign"
  | "changeVerticalAlign"
  | "toggleFullScreen"
  | "toggleShortcuts"
  | "group"
  | "ungroup"
  | "goToCollaborator"
  | "addToLibrary"
  | "changeRoundness"
  | "alignTop"
  | "alignBottom"
  | "alignLeft"
  | "alignRight"
  | "alignVerticallyCentered"
  | "alignHorizontallyCentered"
  | "distributeHorizontally"
  | "distributeVertically"
  | "flipHorizontal"
  | "flipVertical"
  | "deselect"
  | "viewMode"
  | "exportWithDarkMode"
  | "toggleTheme"
  | "increaseFontSize"
  | "decreaseFontSize"
  | "unbindText"
  | "hyperlink"
  | "bindText"
  | "unlockAllElements"
  | "toggleElementLock"
  | "toggleLinearEditor"
  | "selectAllElementsInFrame"
  | "removeAllElementsFromFrame"
  | "updateFrameRendering"
  | "createContainerFromText"
  | "wrapTextInContainer"
  | "commandPalette"
  | "autoResize"
  | "elementStats"
  | "searchMenu"
  | "copyElementLink"
  /*
   * Firo's own actions, registered by the host through
   * `excalidrawAPI.registerAction`.
   *
   * The union is closed on purpose upstream — an action name is an identifier the
   * menu, the command palette and the keyboard all key off, and letting them be typed
   * as arbitrary strings would mean no autocomplete and no way to notice a typo. But
   * the union is also the only thing standing between a host and the supported
   * extension point, and a host that cannot name its own actions cannot use it.
   *
   * So the names are added here rather than the union being opened. Two, because
   * there are two: getting a board out of the browser as a file, and putting one back.
   */
  | "exportFiroFile"
  | "importFiroFile"
  /*
   * The facilitator's commands, from `apps/web/board/facilitatorActions.ts`.
   *
   * Two of the seven are a toggle rather than one action per state:
   * `toggleFacilitatorTimer` covers idle, running and paused, and `toggleBoardReveal`
   * covers private and revealed. A facilitator thinks "run the clock", not
   * "transition the state machine", and cannot see which state the board is in from
   * the board — so three actions for two states would be three things to remember
   * and one of them would be wrong.
   */
  | "toggleFacilitatorTimer"
  | "resetFacilitatorTimer"
  | "addMinuteToTimer"
  | "toggleBoardReveal"
  | "addVoteToSelection"
  | "removeVoteFromSelection"
  | "readVoteTally"
  | "linkToElement"
  | "cropEditor"
  | "wrapSelectionInFrame"
  | "toggleShapeSwitch"
  | "togglePolygon";

export type PanelComponentProps = {
  elements: readonly ExcalidrawElement[];
  // UIAppState (not AppState) because PanelComponents only re-render when
  // the UI does — reading UI-stripped props (zoom, scroll, …) would render
  // stale values; subscribe via useAppStateValue for those instead
  appState: UIAppState;
  updateData: <T = any>(formData?: T) => void;
  appProps: ExcalidrawProps;
  data?: Record<string, any>;
  app: AppClassProperties;
  renderAction: (
    name: ActionName,
    data?: PanelComponentProps["data"],
  ) => React.JSX.Element | null;
};

export interface Action<TData = any> {
  name: ActionName;
  label:
    | string
    | ((
        elements: readonly ExcalidrawElement[],
        appState: Readonly<UIAppState>,
        app: AppClassProperties,
      ) => string);
  keywords?: string[];
  icon?:
    | React.ReactNode
    | ((
        appState: UIAppState,
        elements: readonly ExcalidrawElement[],
      ) => React.ReactNode);
  PanelComponent?: React.FC<PanelComponentProps>;
  perform: ActionFn<TData>;
  keyPriority?: number;
  keyTest?: (
    event: React.KeyboardEvent | KeyboardEvent,
    appState: AppState,
    elements: readonly ExcalidrawElement[],
    app: AppClassProperties,
  ) => boolean;
  predicate?: (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    appProps: ExcalidrawProps,
    app: AppClassProperties,
  ) => boolean;
  checked?: (appState: Readonly<UIAppState>) => boolean;
  trackEvent:
    | false
    | {
        category:
          | "toolbar"
          | "element"
          | "canvas"
          | "export"
          | "history"
          | "menu"
          | "collab"
          | "hyperlink"
          | "search_menu"
          | "shape_switch"
          /*
           * Firo's own. The category list is closed for the same reason the action
           * names are — it is an analytics taxonomy, and an unconstrained one stops
           * being a taxonomy. These two are added rather than opening the union,
           * because the two file actions are genuinely export and import and belong
           * beside the existing export actions.
           */
          | "file"
          /*
           * Facilitation is its own bucket rather than `collab`, and the reason is
           * that "facilitator" is a *role* here, not a mode: the same person is
           * placing dots they are also collecting. Folding them into `collab` would
           * make the eventual v2 — presence, follow-me, votes attributed to a real
           * participant — indistinguishable from a session with one person in it.
           */
          | "facilitation";
        action?: string;
        predicate?: (
          appState: Readonly<AppState>,
          elements: readonly ExcalidrawElement[],
          value: any,
        ) => boolean;
      };
  /** if set to `true`, allow action to be performed in viewMode.
   *  Defaults to `false` */
  viewMode?: boolean;
  /** if set to `true`, the action counts as canvas navigation and remains
   *  available in the non-interactive editor when
   *  `interaction: { enabled: { navigation: true } }`. Defaults to `false` */
  navigation?: boolean;
}
