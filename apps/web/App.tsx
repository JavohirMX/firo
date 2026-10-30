import {
  Excalidraw,
  CaptureUpdateAction,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
  useApp,
  useExcalidrawActionManager,
  useExcalidrawSetAppState,
  useExcalidrawStateValue,
  TOOLS,
  getToolShortcut,
  getSelectionStickyNoteSize,
  STICKY_NOTE_SIZE_PRESETS,
  SelectedShapeActions,
  actionZoomIn,
  actionZoomOut,
  actionResetZoom,
  actionZoomToFit,
  actionToggleGridMode,
  DocBlockOverlay,
  renderDocBlock,
  viewportCoordsToSceneCoords,
  type MobileExtraTool,
} from "@firo/editor";
import {
  CreationRail,
  NavToolbar,
  BoardMenu,
  Inspector,
  SelectionToolbar,
  RAIL_TOOL_ICONS,
  DuplicateIcon,
  LockIcon,
  UnlockIcon,
  BringToFrontIcon,
  TrashIcon,
  CommentIcon,
  TagIcon,
  LinkIcon,
  ConvertIcon,
  ActivityIcon,
  ActivityFeed,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
} from "@firo/ui";

import { trackEvent } from "@firo/editor/analytics";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@firo/editor/components/CommandPalette/CommandPalette";
import { getConversionTypeFromElements } from "@firo/editor/components/ConvertElementTypePopup";
import { ErrorDialog } from "@firo/editor/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@firo/editor/components/OverwriteConfirm/OverwriteConfirm";
import { openConfirmModal } from "@firo/editor/components/OverwriteConfirm/OverwriteConfirmState";
import { ShareableLinkDialog } from "@firo/editor/components/ShareableLinkDialog";
import Trans from "@firo/editor/components/Trans";
import {
  APP_NAME,
  EVENT,
  DEFAULT_STICKY_NOTE_BG,
  MIRO_STICKY_NOTE_COLORS,
  MIRO_PASTEL_STICKY_NOTE_PALETTE,
  VERSION_TIMEOUT,
  capitalizeString,
  debounce,
  getVersion,
  getFrame,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  isDevEnv,
  isWritableElement,
  arrayToMap,
} from "@firo/common";
import polyfill from "@firo/editor/polyfill";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadFromBlob } from "@firo/editor/data/blob";
import { t } from "@firo/editor/i18n";
import { getNormalizedZoom } from "@firo/editor/scene";
import { getViewportForZoomWithScrollConstraints } from "@firo/editor/viewport";

import { isElementLink } from "@firo/element";
import {
  getCommonBounds,
  getSelectedElements,
  showSelectedShapeActions,
  isStickyNoteElement,
  getBoundTextElement,
  updateStickyNoteLayout,
  syncStickyNoteInk,
} from "@firo/element";
import {
  bumpElementVersions,
  restoreAppState,
  restoreElements,
} from "@firo/editor/data/restore";
import { newElementWith, setElementContentDrawer } from "@firo/element";
import { isInitializedImageElement } from "@firo/element";
import {
  embeddableURLValidator,
  getEmbedLink,
  getEmbedProviderName,
} from "@firo/element";
import clsx from "clsx";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@firo/editor/data/library";

import {
  EmbedDialog,
  EmojiPanel,
  ExportModal,
  ImportModal,
  type EmbedValidation,
  type ExportTab,
  type ImportFileInfo,
} from "@firo/ui";

import {
  exportToBlob,
  exportToCanvas,
  exportToPdf,
  exportToSvg,
} from "@firo/utils/export";

import { mintBoardId } from "@firo/board";

import {
  createFiroDoc,
  getAssetBytes,
  putAsset,
  type FiroDoc,
  type Mutation,
} from "@firo/doc";

import {
  createDocBlockRecord,
  docBlockRecordToFiroRecord,
  docBlockRecordFromFiroRecord,
  serializeDocBlockNode,
  parseDocBlockJson,
  createDefaultDocBlockNode,
  DOC_BLOCK_COLLECTION_ID,
} from "@firo/records";
import { VOTE_COLLECTION_ID } from "@firo/facilitation";
import {
  createDocBlockCollection,
  isDocBlockRecord,
  serializeBoard,
  type DocBlockRecord,
} from "@firo/schema";
import { newElement } from "@firo/element";

import type { AccessibilityTreeItem, ActivityFeedItem } from "@firo/ui";

import type { RailToolItem, RailToolType } from "@firo/ui";

import type { RestoredDataState } from "@firo/editor/data/restore";
import type {
  FileId,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@firo/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  DataURL,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  UIAppState,
  ExcalidrawProps,
} from "@firo/editor/types";
import type { ResolutionType } from "@firo/common/utility-types";
import type { ResolvablePromise } from "@firo/common/utils";

import { changedDocBlockIds } from "./board/docContentSync";
import {
  canAutoFit,
  computeFitView,
  selectionRevealScrollX,
} from "./board/initialFit";

import { clearActivity, listActivity } from "./board/activity";

import CustomStats from "./CustomStats";
import { Provider, useAtomValue, appJotaiStore } from "./app-jotai";
import {
  ACCESSIBILITY_TREE_DEBOUNCE_MS,
  STORAGE_KEYS,
  SYNC_BROWSER_TABS_TIMEOUT,
} from "./app_constants";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { FacilitatorBar } from "./components/FacilitatorBar";
import { TimerSetupDialog } from "./components/TimerSetupDialog";
import { VotingPanel } from "./components/VotingPanel";
import { FramesPanel } from "./components/FramesPanel";
import { BulkStickyDialog } from "./components/BulkStickyDialog";
import { viewportCenter } from "./board/stickyBulk";
import { createStickyStack } from "./board/stickyStack";
import { createHighlighterSession } from "./board/highlighter";

import { StickyNoteOptionsDialog } from "./components/StickyNoteOptionsDialog";
import {
  applyStickyOption,
  STICKY_SIZE_PRESET_KEYS,
} from "./board/stickyNoteOptions";
import { subscribeToDialogRequests } from "./board/uiRequests";
import { SaveStatusIndicator } from "./components/SaveStatusIndicator";
import { VersionHistoryModal } from "./components/VersionHistoryModal";
import { ProjectionView } from "./components/ProjectionView";
import { CommentLayer, type CommentTarget } from "./components/CommentLayer";
import { VoteBadges } from "./components/VoteBadges";
import { TagLayer } from "./components/TagLayer";
import { RemoteCursorLayer } from "./components/RemoteCursorLayer";
import { CollabBar, type ConnectionStatus } from "./components/CollabBar";
import { ConnectedShareModal } from "./components/ConnectedShareModal";
import { TemplateModal } from "./components/TemplateModal";
import { SaveTemplateDialog } from "./components/SaveTemplateDialog";
import { AuthDialog } from "./components/AuthDialog";
import { syncSession, useSyncSession } from "./sync/session";
import { AIAssistantModal } from "./components/AIAssistantModal";

import {
  CollabProvider,
  resolveShareToken,
  type CollaboratorInfo,
} from "./board/collabProvider";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import { Minimap } from "./components/Minimap";
import { AccessibilityLayer } from "./components/AccessibilityLayer";

import { importFromBackend } from "./data";

import { updateStaleImageStatuses } from "./data/FileManager";
import { FileStatusStore } from "./data/fileStatusStore";
import { importFromLocalStorage } from "./data/localStorage";

import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
  localStorageQuotaExceededAtom,
} from "./data/LocalData";
import { isBrowserStorageStateNewer } from "./data/tabSync";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { useIsOffline } from "./useIsOffline";
import { getPreferredLanguage } from "./app-language/language-detector";
import { useAppLangCode } from "./app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState,
} from "./components/DebugCanvas";

import {
  attachBoard,
  boardDoc,
  boardElements,
  boardRestored,
  commitBoard,
  refreshBoard,
} from "./board/board";

import {
  facilitatorActions,
  facilitatorCommandPaletteItems,
  facilitatorHelpRows,
} from "./board/facilitatorActions";
import { recordCommandPaletteItems } from "./board/recordActions";
import { getActiveBoard, renameBoard, setActiveBoard } from "./board/library";
import { isMinimapShortcut } from "./board/chromeShortcuts";
import {
  readRailLayout,
  reorderRailTools,
  restoreRailTool,
  unpinRailTool,
  writeRailLayout,
} from "./board/railLayout";
import { homeUrl } from "./board/routes";
import { toAccessibilityItems, toElementsMap } from "./board/accessibility";
import {
  applyReducedMotion,
  readReducedMotion,
  writeReducedMotion,
} from "./board/reducedMotion";

import {
  downloadBoard,
  exportBoard,
  exportBoardDirectory,
  exportPackagedBoard,
  importBoardFile,
  pickBinaryFile,
  type ExportResult,
  type PackagedExportResult,
} from "./board/files";

import { exportStickyNotesToCsv, exportRecordsToCsv } from "./board/csv";
import { convertFiroToExcalidraw } from "./board/excalidraw";
import { exportFramesToZip } from "./board/batchExport";
import { generateMiroCreationScript } from "./board/miro";
import { injectAssetsIntoEditor, uint8ArrayToDataUrl } from "./board/assets";
import { canPickDirectory, writeFiroDirectory } from "./board/firoDownload";
import { createBoard } from "./board/library";
import { boardUrl } from "./board/routes";

import "./index.scss";

import type { PenStyle } from "./board/highlighter";

import type { JSX } from "react";

import type { RailLayout } from "./board/railLayout";

polyfill();

window.FIRO_THROTTLE_RENDER = true;

declare global {
  interface BeforeInstallPromptEventChoiceResult {
    outcome: "accepted" | "dismissed";
  }

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<BeforeInstallPromptEventChoiceResult>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let pwaEvent: BeforeInstallPromptEvent | null = null;

// Adding a listener outside of the component as it may (?) need to be
// subscribed early to catch the event.
//
// Also note that it will fire only if certain heuristics are met (user has
// used the app for some time, etc.)
window.addEventListener(
  "beforeinstallprompt",
  (event: BeforeInstallPromptEvent) => {
    // prevent Chrome <= 67 from automatically showing the prompt
    event.preventDefault();
    // cache for later use
    pwaEvent = event;
  },
);

let isSelfEmbedding = false;

if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
    // ignore
  }
}

const shareableLinkConfirmDialog = {
  title: t("overwriteConfirm.modal.shareableLink.title"),
  description: (
    <Trans
      i18nKey="overwriteConfirm.modal.shareableLink.description"
      bold={(text) => <strong>{text}</strong>}
      br={() => <br />}
    />
  ),
  actionLabel: t("overwriteConfirm.modal.shareableLink.button"),
  color: "danger",
} as const;

const initializeScene = async (opts: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}): Promise<
  { scene: ExcalidrawInitialDataState | null } & (
    | { isExternalScene: true; id: string; key: string }
    | { isExternalScene: false; id?: null; key?: null }
  )
> => {
  const searchParams = new URLSearchParams(window.location.search);
  const id = searchParams.get("id");
  const jsonBackendMatch = window.location.hash.match(
    /^#json=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/,
  );
  const externalUrlMatch = window.location.hash.match(/^#url=(.*)$/);

  const localDataState = importFromLocalStorage();

  /*
   * The board, before anything reads it.
   *
   * Storage is IndexedDB and therefore asynchronous, so the document cannot be
   * populated by the time this function runs. Awaited here, where the initial scene
   * is already a promise the editor waits on, so the canvas is created with the board
   * in it rather than empty and then filling in.
   *
   * Doing it in the background instead would open every board on a flash of blank
   * canvas, which on a large board lasts long enough to look like the work was lost.
   * Nothing renders until this resolves.
   */
  await boardRestored();

  let scene: Omit<
    RestoredDataState,
    // we're not storing files in the scene database/localStorage, and instead
    // fetch them async from a different store
    "files"
  > & {
    scrollToContent?: boolean;
  } = {
    elements: restoreElements(localDataState?.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState(localDataState?.appState, null),
  };

  const isExternalScene = !!(id || jsonBackendMatch);
  if (isExternalScene) {
    if (
      // don't prompt if scene is empty
      !scene.elements.length ||
      // otherwise, prompt whether user wants to override current scene
      (await openConfirmModal(shareableLinkConfirmDialog))
    ) {
      if (jsonBackendMatch) {
        const imported = await importFromBackend(
          jsonBackendMatch[1],
          jsonBackendMatch[2],
        );

        scene = {
          elements: bumpElementVersions(
            restoreElements(imported.elements, null, {
              repairBindings: true,
              deleteInvisibleElements: true,
            }),
            localDataState?.elements,
          ),
          appState: restoreAppState(
            imported.appState,
            // local appState when importing from backend to ensure we restore
            // localStorage user settings which we do not persist on server.
            localDataState?.appState,
          ),
        };
      }
      scene.scrollToContent = true;
      window.history.replaceState({}, APP_NAME, window.location.origin);
    } else {
      // https://github.com/excalidraw/excalidraw/issues/1919
      if (document.hidden) {
        return new Promise((resolve, reject) => {
          window.addEventListener(
            "focus",
            () => initializeScene(opts).then(resolve).catch(reject),
            {
              once: true,
            },
          );
        });
      }

      window.history.replaceState({}, APP_NAME, window.location.origin);
    }
  } else if (externalUrlMatch) {
    window.history.replaceState({}, APP_NAME, window.location.origin);

    const url = externalUrlMatch[1];
    try {
      const request = await fetch(window.decodeURIComponent(url));
      const data = await loadFromBlob(await request.blob(), null, null);
      if (
        !scene.elements.length ||
        (await openConfirmModal(shareableLinkConfirmDialog))
      ) {
        return { scene: data, isExternalScene };
      }
    } catch (error: any) {
      return {
        scene: {
          appState: {
            errorMessage: t("alerts.invalidSceneUrl"),
          },
        },
        isExternalScene,
      };
    }
  }

  /*
   * Elements come from the document model, not from LocalData.
   *
   * This is the seam where the two halves of the app meet. Everything above this
   * line assembles a scene out of Excalidraw's own storage; from here on the
   * document model is authoritative and the editor is a view of it.
   *
   * An empty projection is *not* treated as "no board": on a first run the
   * document is empty, and falling back to LocalData there would quietly restore
   * a board the document does not have — the exact two-sources-of-truth problem
   * this is meant to end.
   */
  const boardOwned = boardElements();
  if (boardOwned.length > 0) {
    // `restoreElements` returns a mutable, ordered array; the projection builds a
    // fresh one per call, so there is nothing to share and nothing to freeze.
    scene = {
      ...scene,
      elements: restoreElements(boardOwned, null, { repairBindings: true }),
    };
  }

  if (scene) {
    return isExternalScene && jsonBackendMatch
      ? {
          scene,
          isExternalScene,
          id: jsonBackendMatch[1],
          key: jsonBackendMatch[2],
        }
      : { scene, isExternalScene: false };
  }
  return { scene: null, isExternalScene: false };
};

/**
 * Shape and note creation tools that default to Miro-style one-time placement:
 * selecting the tool places it in one-time mode (`locked: false`), so stamping or
 * drawing on the canvas automatically reverts to Select mode upon element completion
 * unless explicitly locked via double-click or shift-click.
 */
export const CREATION_TOOLS = new Set<RailToolType>([
  "stickynote",
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "text",
  "frame",
  "docblock",
]);

/**
 * Fit the viewport to a set of elements, leaving room for the board chrome.
 * Only the viewport changes, never the elements, so shared documents keep
 * their world coordinates.
 */
const fitViewToElements = (
  api: ExcalidrawImperativeAPI,
  elements: readonly { x: number; y: number; width: number; height: number }[],
) => {
  const fit = computeFitView(api.getAppState(), elements);
  if (!fit) {
    return;
  }
  api.updateScene({
    appState: {
      zoom: { value: fit.zoom as never },
      scrollX: fit.scrollX,
      scrollY: fit.scrollY,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
};

/** The sticky size presets in flyout order: small to large. */

export const WebCreationRail = ({
  appState,
  commentMode = false,
  onToggleCommentMode,
  docBlockMode = false,
  onToggleDocBlockMode,
  onOpenTemplates,
  onOpenAI,
  onToggleEmoji,
  highlighterSession,
  onOpenBulkSticky,
  onCreateStickyStack,
  readOnlyRole = null,
}: {
  appState: UIAppState;
  /** viewer/commenter share links: only navigation (and, for commenters, comments). */
  readOnlyRole?: string | null;
  commentMode?: boolean;
  onToggleCommentMode?: () => void;
  docBlockMode?: boolean;
  onToggleDocBlockMode?: () => void;
  onOpenTemplates?: () => void;
  onOpenAI?: () => void;
  onToggleEmoji?: () => void;
  /** Shared with the palette commands (the phone path: no rail there). */
  highlighterSession?: ReturnType<typeof createHighlighterSession>;
  onOpenBulkSticky?: () => void;
  onCreateStickyStack?: () => void;
}) => {
  const app = useApp();
  const actionManager = useExcalidrawActionManager();
  const setAppState = useExcalidrawSetAppState();
  const activeToolType = appState.activeTool.type as RailToolType;

  // Shapes and lines are one family (ADR-0031): the family's active member is
  // whichever of the five was last chosen, so a stored tool lights the slot.
  type ShapeSubTool = "rectangle" | "diamond" | "ellipse" | "arrow" | "line";
  // Highlighter, smart pen and precision eraser are not Firo tools, and a
  // flyout member ships only with its target (ADR-0031) — so the family stops
  // at the four modes the registry actually has.
  type PenSubTool = "freedraw" | "highlighter" | "eraser" | "laser" | "lasso";

  interface SubToolsState {
    shapes: ShapeSubTool;
    pen: PenSubTool;
  }

  const [subTools, setSubTools] = useState<SubToolsState>({
    shapes: "rectangle",
    pen: "freedraw",
  });

  // The highlighter is a freedraw preset (apps/web/board/highlighter.ts).
  // While it is on, the live tool is "freedraw" and the next stroke defaults
  // are overridden; leaving it restores the user's own pen style.
  const highlighterRef = useRef(
    highlighterSession ?? createHighlighterSession(),
  );
  const endHighlighter = () => {
    const restore = highlighterRef.current.leave();
    if (restore) {
      setAppState(restore as any);
    }
  };
  const startHighlighter = () => {
    const style = highlighterRef.current.enter(
      app.state as unknown as PenStyle,
    );
    setAppState(style as any);
    setSubTools((prev) => ({ ...prev, pen: "highlighter" }));
    app.setActiveTool({ type: "freedraw" });
  };

  // Keep subTools synchronized with live activeTool
  useEffect(() => {
    const live = appState.activeTool.type;
    if (highlighterRef.current.active && live !== "freedraw") {
      // another tool was chosen (keyboard, rail or palette): give the user's
      // own pen settings back so they don't leak into other tools
      endHighlighter();
    }
    if (highlighterRef.current.active && live === "freedraw") {
      setSubTools((prev) =>
        prev.pen === "highlighter" ? prev : { ...prev, pen: "highlighter" },
      );
      return;
    }
    if (
      live === "rectangle" ||
      live === "diamond" ||
      live === "ellipse" ||
      live === "arrow" ||
      live === "line"
    ) {
      setSubTools((prev) =>
        prev.shapes === live ? prev : { ...prev, shapes: live },
      );
    } else if (
      live === "freedraw" ||
      live === "eraser" ||
      live === "laser" ||
      live === "lasso"
    ) {
      setSubTools((prev) =>
        prev.pen === live ? prev : { ...prev, pen: live },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState.activeTool.type, appState.currentItemOpacity]);

  const lastClickRef = useRef<{ tool: RailToolType; time: number } | null>(
    null,
  );
  const isShiftPressedRef = useRef(false);

  // The arrangement is a per-user preference, so the host owns it and the rail
  // only renders what it is handed
  // ([ADR-0029](../../docs/adr/0029-the-rail-is-a-per-user-arrangement.md)). Read synchronously
  // on mount, so the first paint is already the user's order, not the default.
  const [layout, setLayout] = useState<RailLayout>(readRailLayout);

  useEffect(() => {
    writeRailLayout(layout);
  }, [layout]);

  /**
   * Select and Hand are one entry — Miro's cursor, two tools.
   *
   * The glyph follows the active mode, both ids light the entry up, and it is
   * pinned: it cannot be dragged and it offers no Unpin. Clicking it while it is
   * *active* switches to the other mode, which is the toggle Miro's single
   * control performs; from any other tool it simply selects.
   */
  const pointerTool: RailToolType =
    activeToolType === "hand" ? "hand" : "selection";
  const pointerItem: RailToolItem = {
    id: "selection",
    label: `${capitalizeString(t("toolBar.selection"))} (${getToolShortcut(
      "selection",
    )}) / ${capitalizeString(t("toolBar.hand"))} (${getToolShortcut("hand")})`,
    icon: RAIL_TOOL_ICONS[pointerTool],
    pinned: true,
    activeOn: ["selection", "hand"],
  };

  const buildRailTool = (id: RailToolType): RailToolItem => {
    if (id === "shapes") {
      const activeSub = subTools.shapes ?? "rectangle";
      const activeLabel = capitalizeString(t(`toolBar.${activeSub}`));
      const activeShortcut = getToolShortcut(activeSub);
      return {
        id: "shapes",
        kind: "family",
        label: `${activeLabel} (${activeShortcut || "R"})`,
        icon: RAIL_TOOL_ICONS[activeSub] || RAIL_TOOL_ICONS.shapes,
        activeOn: [
          "shapes",
          "rectangle",
          "diamond",
          "ellipse",
          "arrow",
          "line",
        ],
        activeSubTool: activeSub,
        flyoutItems: [
          {
            id: "rectangle",
            label: capitalizeString(t("toolBar.rectangle")),
            icon: RAIL_TOOL_ICONS.rectangle,
            shortcut: getToolShortcut("rectangle"),
          },
          {
            id: "diamond",
            label: capitalizeString(t("toolBar.diamond")),
            icon: RAIL_TOOL_ICONS.diamond,
            shortcut: getToolShortcut("diamond"),
          },
          {
            id: "ellipse",
            label: capitalizeString(t("toolBar.ellipse")),
            icon: RAIL_TOOL_ICONS.ellipse,
            shortcut: getToolShortcut("ellipse"),
          },
          {
            id: "arrow",
            label: capitalizeString(t("toolBar.arrow")),
            icon: RAIL_TOOL_ICONS.arrow,
            shortcut: getToolShortcut("arrow"),
          },
          {
            id: "line",
            label: capitalizeString(t("toolBar.line")),
            icon: RAIL_TOOL_ICONS.line,
            shortcut: getToolShortcut("line"),
          },
        ],
      };
    }

    if (id === "pen") {
      const activeSub = subTools.pen ?? "freedraw";
      const activeLabel =
        activeSub === "highlighter"
          ? "Highlighter"
          : capitalizeString(t(`toolBar.${activeSub}`));
      // Lasso is the one member without a key yet; `getToolShortcut` renders
      // the absence as the string "undefined", so ask the registry first.
      const activeShortcut =
        activeSub !== "highlighter" && TOOLS[activeSub].letterKey
          ? getToolShortcut(activeSub)
          : "";
      return {
        id: "pen",
        kind: "family",
        label: activeShortcut
          ? `${activeLabel} (${activeShortcut})`
          : activeLabel,
        icon: RAIL_TOOL_ICONS[activeSub] || RAIL_TOOL_ICONS.pen,
        activeOn: [
          "pen",
          "freedraw",
          "eraser",
          "laser",
          "lasso",
          "highlighter",
        ],
        activeSubTool: activeSub,
        flyoutItems: [
          {
            id: "freedraw",
            label: capitalizeString(t("toolBar.freedraw")),
            icon: RAIL_TOOL_ICONS.freedraw,
            shortcut: getToolShortcut("freedraw"),
          },
          {
            id: "highlighter",
            label: "Highlighter",
            icon: RAIL_TOOL_ICONS.highlighter,
          },
          {
            id: "eraser",
            label: capitalizeString(t("toolBar.eraser")),
            icon: RAIL_TOOL_ICONS.eraser,
            shortcut: getToolShortcut("eraser"),
          },
          {
            id: "laser",
            label: capitalizeString(t("toolBar.laser")),
            icon: RAIL_TOOL_ICONS.laser,
            shortcut: getToolShortcut("laser"),
          },
          {
            id: "lasso",
            label: capitalizeString(t("toolBar.lasso")),
            icon: RAIL_TOOL_ICONS.lasso,
          },
        ],
      };
    }

    if (id === "templates") {
      return {
        id: "templates",
        kind: "surface",
        label: capitalizeString(t("toolBar.templates")),
        icon: RAIL_TOOL_ICONS.templates,
        activeOn: [],
      };
    }

    if (id === "stickynote") {
      return {
        id: "stickynote",
        kind: "options",
        label: `${capitalizeString(t("toolBar.stickynote"))} (N)`,
        icon: RAIL_TOOL_ICONS.stickynote,
        activeOn: ["stickynote"],
        optionGroups: [
          {
            id: "colour",
            label: t("colorPicker.colors"),
            layout: "swatches",
            items: Object.entries(MIRO_STICKY_NOTE_COLORS).map(
              ([name, color]) => ({
                id: name,
                // `yellowDark` is spoken as "Yellow dark", not "YellowDark".
                label: capitalizeString(
                  name.replace(/([A-Z])/g, " $1").toLowerCase(),
                ),
                color,
                selected:
                  appState.currentItemStickynoteBackgroundColor === color,
              }),
            ),
          },
          {
            /*
             * The default size for the *next* note (parity matrix row 20).
             * The preset values are the selection toolbar's own, so the
             * flyout and the toolbar can never disagree about how big "L" is.
             */
            id: "size",
            label: "Size",
            layout: "list",
            items: STICKY_SIZE_PRESET_KEYS.map((key) => ({
              id: `size-${key}`,
              label: `${key.toUpperCase()} — ${
                STICKY_NOTE_SIZE_PRESETS[key]
              } px`,
              selected: appState.currentItemStickynoteSize === key,
            })),
          },
          {
            id: "create",
            label: "Create",
            layout: "list",
            items: [
              {
                id: "bulk-create",
                label: "Bulk create…",
                kind: "action" as const,
              },
              {
                id: "stack-create",
                label: "Sticky stack",
                kind: "action" as const,
              },
            ],
          },
        ],
      };
    }

    if (id === "comment") {
      return {
        id: "comment",
        label: `${capitalizeString(t("toolBar.comment"))} (C)`,
        icon: RAIL_TOOL_ICONS.comment,
        activeOn: ["comment"],
      };
    }

    if (id === "docblock") {
      return {
        id: "docblock",
        label: "Document",
        icon: RAIL_TOOL_ICONS.docblock,
        activeOn: ["docblock"],
      };
    }

    if (id === "media") {
      return {
        id: "media",
        kind: "surface",
        label: "Emoji",
        icon: RAIL_TOOL_ICONS.media,
        activeOn: [],
      };
    }

    if (id === "ai") {
      return {
        id: "ai",
        kind: "surface",
        label: "AI Assistant",
        icon: RAIL_TOOL_ICONS.ai,
        activeOn: [],
      };
    }

    const toolKey = id in TOOLS ? (id as keyof typeof TOOLS) : undefined;
    const label = toolKey
      ? capitalizeString(t(`toolBar.${toolKey}`))
      : capitalizeString(id);
    const shortcut = toolKey ? getToolShortcut(toolKey) : undefined;
    return {
      id,
      icon: RAIL_TOOL_ICONS[id],
      label: shortcut ? `${label} (${shortcut})` : label,
    };
  };

  const isKnownTool = (id: RailToolType) =>
    id in TOOLS ||
    [
      "shapes",
      "pen",
      "templates",
      "comment",
      "docblock",
      "ai",
      "media",
    ].includes(id);

  // Read-only roles only get tools that work for them (the pointer, and
  // Comment for commenters), instead of buttons that silently do nothing.
  const isAllowedForRole = (id: RailToolType) =>
    !readOnlyRole || (readOnlyRole === "commenter" && id === "comment");
  const tools: RailToolItem[] = [
    pointerItem,
    ...layout.order
      .filter(isKnownTool)
      .filter(isAllowedForRole)
      .map(buildRailTool),
  ];
  const hiddenTools: RailToolItem[] = readOnlyRole
    ? []
    : layout.unpinned.filter(isKnownTool).map(buildRailTool);

  return (
    <CreationRail
      tools={tools}
      hiddenTools={hiddenTools}
      showCatalog={!readOnlyRole}
      canUndo={!readOnlyRole}
      canRedo={!readOnlyRole}
      activeTool={
        commentMode ? "comment" : docBlockMode ? "docblock" : activeToolType
      }
      onReorder={(order) =>
        setLayout((current) => reorderRailTools(current, order))
      }
      onUnpin={(tool) => setLayout((current) => unpinRailTool(current, tool))}
      onRestore={(tool) =>
        setLayout((current) => restoreRailTool(current, tool))
      }
      onSelectTool={(tool, event) => {
        if (tool === "selection" || tool === "hand") {
          /*
           * One control, two modes. The *live* tool decides which way to
           * toggle: clicking the cursor while it is already the cursor moves to
           * the other half of it, and clicking it from any other tool selects.
           * That is Miro's cursor behaviour, and it is why Select and Hand are
           * one rail entry rather than two
           * ([ADR-0029](../../docs/adr/0029-the-rail-is-a-per-user-arrangement.md)).
           */
          const live = app.state.activeTool.type;
          const pointerActive = live === "selection" || live === "hand";
          const next: RailToolType =
            pointerActive && live === "selection" ? "hand" : "selection";
          trackEvent("toolbar", next, "ui");
          app.setActiveTool({ type: next as any });
          return;
        }

        if (
          readOnlyRole &&
          !(readOnlyRole === "commenter" && tool === "comment")
        ) {
          return;
        }

        if (tool === "comment") {
          onToggleCommentMode?.();
          return;
        }

        if (tool === "docblock") {
          onToggleDocBlockMode?.();
          return;
        }

        if (tool === "highlighter") {
          trackEvent("toolbar", "highlighter", "ui");
          startHighlighter();
          return;
        }

        if (tool === "freedraw" && highlighterRef.current.active) {
          // the ordinary pen was chosen explicitly: back to the user's style
          endHighlighter();
          setSubTools((prev) => ({ ...prev, pen: "freedraw" }));
        }

        if (tool === "templates") {
          onOpenTemplates?.();
          return;
        }

        if (tool === "ai") {
          onOpenAI?.();
          return;
        }

        if (tool === "media") {
          onToggleEmoji?.();
          return;
        }

        let targetTool: RailToolType = tool;
        if (tool === "shapes") {
          targetTool = subTools.shapes;
        } else if (tool === "pen") {
          targetTool = subTools.pen;
        }

        // Update subtool tracker
        if (
          targetTool === "rectangle" ||
          targetTool === "diamond" ||
          targetTool === "ellipse" ||
          targetTool === "arrow" ||
          targetTool === "line"
        ) {
          setSubTools((prev) => ({
            ...prev,
            shapes: targetTool as ShapeSubTool,
          }));
        } else if (
          targetTool === "freedraw" ||
          targetTool === "eraser" ||
          targetTool === "laser" ||
          targetTool === "lasso"
        ) {
          setSubTools((prev) => ({
            ...prev,
            pen: targetTool as PenSubTool,
          }));
        }

        const now = Date.now();
        const lastClick = lastClickRef.current;
        const isDoubleClick =
          lastClick?.tool === targetTool && now - lastClick.time < 350;
        lastClickRef.current = { tool: targetTool, time: now };

        const isShift = Boolean(event?.shiftKey) || isShiftPressedRef.current;
        isShiftPressedRef.current = false;

        trackEvent("toolbar", targetTool, "ui");

        if (CREATION_TOOLS.has(targetTool)) {
          // Double-clicking or shift-clicking locks the tool for continuous creation;
          // single-clicking defaults to Miro-style one-time placement reverting to selection.
          const locked = isDoubleClick || isShift;
          app.setActiveTool({ type: targetTool as any, locked });
        } else if (app.state.activeTool.type !== targetTool) {
          app.setActiveTool({ type: targetTool as any });
        }
      }}
      onPointerDownTool={(tool, event) => {
        if (
          tool === "highlighter" ||
          (tool === "pen" && subTools.pen === "highlighter")
        ) {
          // the highlighter starts on click (a style preset), not on drag
          return;
        }
        let targetTool = tool;
        if (tool === "shapes") {
          targetTool = subTools.shapes ?? "rectangle";
        } else if (tool === "pen") {
          targetTool = (subTools.pen ?? "freedraw") as typeof tool;
        }
        isShiftPressedRef.current = event.shiftKey;
        app.toolDrag.handleButtonPointerDown(
          targetTool as any,
          event.nativeEvent,
        );
      }}
      onOpenSurface={(surface) => {
        if (surface === "templates") {
          onOpenTemplates?.();
        } else if (surface === "ai") {
          onOpenAI?.();
        } else if (surface === "media") {
          onToggleEmoji?.();
        }
      }}
      onSelectOption={(tool, option) => {
        if (tool !== "stickynote") {
          return;
        }
        applyStickyOption(option, {
          actionManager,
          setAppState,
          app,
          onOpenBulkSticky,
          onCreateStickyStack,
        });
      }}
      onUndo={() => {
        if (actionManager.actions.undo) {
          actionManager.executeAction(actionManager.actions.undo);
        }
      }}
      onRedo={() => {
        if (actionManager.actions.redo) {
          actionManager.executeAction(actionManager.actions.redo);
        }
      }}
    />
  );
};

export const WebNavToolbar = ({
  appState,
  minimapVisible,
  onToggleMinimap,
}: {
  appState: UIAppState;
  minimapVisible: boolean;
  onToggleMinimap: () => void;
}) => {
  const app = useApp();
  const actionManager = useExcalidrawActionManager();
  const zoomValue = useExcalidrawStateValue((state) => state.zoom.value) ?? 1;
  const [isFullscreen, setIsFullscreen] = useState(
    () => !!document.fullscreenElement,
  );

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  /*
   * The zoom readout's menu stops run the same constrained viewport math as
   * the editor's own zoom actions (centre-anchored, lock-aware), not a bare
   * `zoom.value` write — see `actionResetZoom` for the pattern.
   */
  const onZoomTo = (nextZoomValue: number) => {
    app.requestUnfollow();
    const fullState = app.state;
    app.setAppState({
      ...getViewportForZoomWithScrollConstraints(
        {
          viewportX: fullState.width / 2 + fullState.offsetLeft,
          viewportY: fullState.height / 2 + fullState.offsetTop,
          nextZoom: getNormalizedZoom(nextZoomValue),
        },
        fullState,
      ),
    });
  };

  const onToggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  };

  const selected = app.scene
    .getNonDeletedElements()
    .filter((element) => appState.selectedElementIds[element.id]);
  const bounds = selected.length > 0 ? getCommonBounds(selected) : null;
  const selectionSize = bounds
    ? {
        width: Math.round(bounds[2] - bounds[0]),
        height: Math.round(bounds[3] - bounds[1]),
      }
    : null;

  return (
    <div className="firo-nav-wrapper">
      {minimapVisible && <Minimap onClose={onToggleMinimap} />}
      <NavToolbar
        zoom={zoomValue}
        onZoomIn={() => actionManager.executeAction(actionZoomIn)}
        onZoomOut={() => actionManager.executeAction(actionZoomOut)}
        onResetZoom={() => actionManager.executeAction(actionResetZoom)}
        onZoomToFit={() => actionManager.executeAction(actionZoomToFit)}
        gridEnabled={appState.gridModeEnabled}
        gridType={appState.gridType}
        onToggleGrid={() => actionManager.executeAction(actionToggleGridMode)}
        onSelectGridType={(type) =>
          actionManager.executeAction(actionToggleGridMode, "ui", type)
        }
        onHideGrid={() =>
          actionManager.executeAction(actionToggleGridMode, "ui", false)
        }
        showSelectionDimensions={appState.showSelectionDimensions}
        onToggleSelectionDimensions={() =>
          app.setAppState({
            showSelectionDimensions: !appState.showSelectionDimensions,
          })
        }
        minimapEnabled={minimapVisible}
        isMinimapOpen={minimapVisible}
        onToggleMinimap={onToggleMinimap}
        onZoomTo={onZoomTo}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        selectionSize={selectionSize}
      />
    </div>
  );
};

/**
 * ADR-0036 §3: the embed dialog's validation rules. Add is enabled only for
 * an https URL on the provider allow-list; raw HTML is never accepted; an
 * unsupported web URL earns the reason plus an "Open link" action.
 */
const validateEmbedUrl = (raw: string): EmbedValidation => {
  const input = raw.trim();
  if (/[<>]/.test(input)) {
    return {
      ok: false,
      reason:
        "Raw HTML can't be embedded - paste the provider's page URL instead.",
    };
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "Enter a full https URL." };
  }
  if (url.protocol !== "https:") {
    return {
      ok: false,
      isWebUrl: url.protocol === "http:",
      reason: "Only https URLs can be embedded.",
    };
  }
  if (!embeddableURLValidator(input, undefined)) {
    return {
      ok: false,
      isWebUrl: true,
      reason: "That provider isn't supported.",
    };
  }
  const resolved = getEmbedLink(input);
  if (!resolved) {
    return {
      ok: false,
      isWebUrl: true,
      reason: "That link can't be embedded.",
    };
  }
  return {
    ok: true,
    provider: getEmbedProviderName(
      ("link" in resolved ? resolved.link : null) ?? input,
    ),
  };
};

const WebBoardMenu = () => {
  const setAppState = useExcalidrawSetAppState();
  /*
   * The active board is resolved once at routing and cached in the library
   * module, so the name lives in local state here; a rename refreshes both
   * the cache (exports and the home list read it) and this label.
   */
  const [boardName, setBoardName] = useState(
    () => getActiveBoard()?.name ?? "Untitled",
  );
  const onRenameBoard = async (name: string) => {
    const active = getActiveBoard();
    if (!active) {
      return;
    }
    const updated = await renameBoard(active.id, name);
    if (updated) {
      setActiveBoard(updated);
      setBoardName(updated.name ?? name);
    }
  };
  return (
    <BoardMenu
      boardName={boardName}
      onOpenHome={() => {
        window.location.assign(homeUrl());
      }}
      onRenameBoard={getActiveBoard() ? onRenameBoard : undefined}
      onOpenMenu={() => {
        setAppState((prevState) => ({
          openMenu: prevState.openMenu === "canvas" ? null : "canvas",
        }));
      }}
    />
  );
};

/**
 * The right-side inspector. It hosts the editor's own property controls —
 * `SelectedShapeActions` — rather than re-implementing them, so there is one
 * copy of "how a stroke colour is edited"
 * ([ADR-0025](../../docs/adr/0025-the-host-reuses-the-editors-property-controls.md)).
 */
const WebInspector = ({ appState }: { appState: UIAppState }) => {
  const app = useApp();
  const actionManager = useExcalidrawActionManager();
  const elements = app.scene.getNonDeletedElements();

  if (!showSelectedShapeActions(appState, elements)) {
    return null;
  }

  // A document block has no stroke, fill or text styling to edit, so the
  // generic shape panel only gets in the way of it.
  const selected = elements.filter((el) => appState.selectedElementIds[el.id]);
  if (
    selected.length > 0 &&
    selected.every((el) => el.customData?.isDocBlock)
  ) {
    return null;
  }

  return (
    <Inspector>
      <SelectedShapeActions
        appState={appState}
        elementsMap={app.scene.getNonDeletedElementsMap()}
        renderAction={actionManager.renderAction}
        app={app}
      />
    </Inspector>
  );
};

/**
 * The floating selection toolbar, anchored to the selection's top edge. The
 * anchor is computed in container coordinates — `(scene + scroll) * zoom` — so
 * it tracks pan and zoom without a viewport offset, because the overlay and the
 * canvas share an origin.
 */
export const WebSelectionToolbar = ({
  appState,
  onComment,
}: {
  appState: UIAppState;
  onComment: (elementId: string) => void;
}) => {
  const app = useApp();
  const actionManager = useExcalidrawActionManager();
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [stickySizeOpen, setStickySizeOpen] = useState(false);
  const [stickyFontSizeOpen, setStickyFontSizeOpen] = useState(false);
  const [stickyColorOpen, setStickyColorOpen] = useState(false);
  const [stickyAlignOpen, setStickyAlignOpen] = useState(false);

  // The popover is not modal, so Escape is its only dismissal key that is not
  // a choice. A pointer outside it deliberately does not close it: the tag
  // popover next door behaves the same way.
  useEffect(() => {
    if (
      !stickySizeOpen &&
      !stickyFontSizeOpen &&
      !stickyColorOpen &&
      !stickyAlignOpen
    ) {
      return;
    }
    const ownerDocument = app.ownerDocument;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStickySizeOpen(false);
        setStickyFontSizeOpen(false);
        setStickyColorOpen(false);
        setStickyAlignOpen(false);
      }
    };
    ownerDocument.addEventListener("keydown", onKeyDown);
    return () => ownerDocument.removeEventListener("keydown", onKeyDown);
  }, [
    stickySizeOpen,
    stickyFontSizeOpen,
    stickyColorOpen,
    stickyAlignOpen,
    app.ownerDocument,
  ]);

  const selected = getSelectedElements(
    app.scene.getNonDeletedElements(),
    appState,
  );

  if (
    appState.viewModeEnabled ||
    appState.editingTextElement ||
    !selected.length
  ) {
    return null;
  }

  const [minX, minY, maxX] = getCommonBounds(selected);
  const { zoom, scrollX, scrollY } = app.state;
  const x = ((minX + maxX) / 2 + scrollX) * zoom.value;
  const y = (minY + scrollY) * zoom.value;

  const allLocked = selected.every((element) => element.locked);
  // `null` unless every selected element is a sticky note, which is also the
  // rule for showing the size control (ADR-0040 §2).
  const stickySize = getSelectionStickyNoteSize(selected);
  const allStickyNotes =
    selected.length > 0 && selected.every(isStickyNoteElement);

  const getSceneElementsMap = () =>
    typeof app.scene.getNonDeletedElementsMap === "function"
      ? app.scene.getNonDeletedElementsMap()
      : arrayToMap(app.scene.getNonDeletedElements());

  const elementsMap = getSceneElementsMap();
  const firstSticky = allStickyNotes ? selected[0] : null;
  const firstLabel = firstSticky
    ? getBoundTextElement(firstSticky, elementsMap)
    : null;
  const isAutoFontSize = firstLabel
    ? firstLabel.autoFontSize !== false
    : (firstSticky?.customData?.autoFontSize as boolean | undefined) !== false;
  const currentFontSize = firstLabel?.fontSize ?? 20;
  const currentTextAlign = firstLabel?.textAlign ?? "center";
  const currentStickyColor =
    firstSticky?.backgroundColor ?? DEFAULT_STICKY_NOTE_BG;

  const handleStickyFontSizeChange = (size: "auto" | number) => {
    const sceneElementsMap = getSceneElementsMap();
    const notes = selected.filter(isStickyNoteElement);
    for (const note of notes) {
      const label = getBoundTextElement(note, sceneElementsMap);
      if (size === "auto") {
        if (label) {
          app.scene.mutateElement(label, { autoFontSize: true });
        }
        app.scene.mutateElement(note, {
          customData: { ...note.customData, autoFontSize: true },
        });
        updateStickyNoteLayout(note, app.scene, {
          autoFontSize: true,
          bindings: { simultaneouslyUpdated: notes },
        });
      } else {
        if (label) {
          app.scene.mutateElement(label, {
            autoFontSize: false,
            baseFontSize: size,
            fontSize: size,
          });
        }
        app.scene.mutateElement(note, {
          customData: { ...note.customData, autoFontSize: false },
        });
        updateStickyNoteLayout(note, app.scene, {
          baseFontSize: size,
          autoFontSize: false,
          bindings: { simultaneouslyUpdated: notes },
        });
      }
    }
    app.scene.triggerUpdate();
    setStickyFontSizeOpen(false);
  };

  const handleStickyColorChange = (color: string) => {
    const notes = selected.filter(isStickyNoteElement);
    for (const note of notes) {
      app.scene.mutateElement(note, { backgroundColor: color });
    }
    const allEls =
      typeof app.scene.getElementsIncludingDeleted === "function"
        ? app.scene.getElementsIncludingDeleted()
        : app.scene.getNonDeletedElements();
    syncStickyNoteInk(allEls, getSceneElementsMap());
    app.scene.triggerUpdate();
    setStickyColorOpen(false);
  };

  const handleStickyTextAlignChange = (align: "left" | "center" | "right") => {
    const sceneElementsMap = getSceneElementsMap();
    const notes = selected.filter(isStickyNoteElement);
    for (const note of notes) {
      const label = getBoundTextElement(note, sceneElementsMap);
      if (label) {
        app.scene.mutateElement(label, { textAlign: align });
        updateStickyNoteLayout(note, app.scene, {
          bindings: { simultaneouslyUpdated: notes },
        });
      }
    }
    app.scene.triggerUpdate();
    setStickyAlignOpen(false);
  };

  // Conversion has a target only for the generic and linear families; a sticky
  // note or a frame gets no control rather than a disabled one.
  const canConvert = getConversionTypeFromElements(selected) !== null;

  const run = (
    action: typeof actionManager.actions[keyof typeof actionManager.actions],
  ) => {
    if (action) {
      actionManager.executeAction(action);
    }
  };

  const currentTags = Array.from(
    new Set(selected.flatMap((el) => el.tags || [])),
  );

  const handleAddTag = (raw: string) => {
    const tag = raw.trim().replace(/^#/, "");
    if (!tag) {
      return;
    }
    for (const el of selected) {
      const existing = el.tags || [];
      if (!existing.includes(tag)) {
        app.scene.mutateElement(el, { tags: [...existing, tag] });
      }
    }
    setTagDraft("");
  };

  const handleRemoveTag = (tag: string) => {
    for (const el of selected) {
      const existing = el.tags || [];
      if (existing.includes(tag)) {
        app.scene.mutateElement(el, {
          tags: existing.filter((t) => t !== tag),
        });
      }
    }
  };

  return (
    <SelectionToolbar
      x={x}
      y={y}
      items={[
        ...(canConvert && !allLocked
          ? [
              {
                id: "convert",
                label: t("labels.shapeSwitch"),
                icon: <ConvertIcon />,
                onClick: () => run(actionManager.actions.toggleShapeSwitch),
              },
            ]
          : []),
        // Link edits exactly one element's hyperlink; with several selected
        // there is no honest target, and a locked element cannot be edited,
        // so the control is absent.
        ...(selected.length === 1 && !selected[0].locked
          ? [
              {
                id: "link",
                label: selected[0].link
                  ? t("labels.link.edit")
                  : t("labels.link.create"),
                icon: <LinkIcon />,
                pressed: Boolean(selected[0].link),
                onClick: () => run(actionManager.actions.hyperlink),
              },
            ]
          : []),
        ...(allStickyNotes && !allLocked
          ? [
              {
                id: "sticky-font-size",
                label: isAutoFontSize
                  ? "Font size (Auto)"
                  : `Font size (${Math.round(currentFontSize)})`,
                icon: (
                  <span className="firo-selection-toolbar__font-size">
                    Aa {isAutoFontSize ? "Auto" : Math.round(currentFontSize)} ↕
                  </span>
                ),
                expanded: stickyFontSizeOpen,
                popover: (
                  <div
                    className="firo-selection-toolbar__popover-menu"
                    role="menu"
                    aria-label="Font size"
                  >
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={isAutoFontSize}
                      className="firo-selection-toolbar__popover-item"
                      onClick={() => handleStickyFontSizeChange("auto")}
                    >
                      <span className="firo-selection-toolbar__popover-key">
                        Aa
                      </span>
                      <span>Auto</span>
                      {isAutoFontSize && (
                        <span className="firo-selection-toolbar__popover-check">
                          ✓
                        </span>
                      )}
                    </button>
                    <div className="firo-selection-toolbar__popover-divider" />
                    {[12, 14, 16, 20, 24, 28, 32, 36, 44, 60].map((size) => (
                      <button
                        key={size}
                        type="button"
                        role="menuitemradio"
                        aria-checked={
                          !isAutoFontSize &&
                          Math.round(currentFontSize) === size
                        }
                        className="firo-selection-toolbar__popover-item"
                        onClick={() => handleStickyFontSizeChange(size)}
                      >
                        <span className="firo-selection-toolbar__popover-key">
                          {size}
                        </span>
                        <span>{size} px</span>
                        {!isAutoFontSize &&
                          Math.round(currentFontSize) === size && (
                            <span className="firo-selection-toolbar__popover-check">
                              ✓
                            </span>
                          )}
                      </button>
                    ))}
                  </div>
                ),
                onClick: () => {
                  setStickyFontSizeOpen((open) => !open);
                  setStickyAlignOpen(false);
                  setStickyColorOpen(false);
                  setStickySizeOpen(false);
                },
              },
              {
                id: "sticky-text-align",
                label: `Text align (${currentTextAlign})`,
                icon:
                  currentTextAlign === "left" ? (
                    <TextAlignLeftIcon />
                  ) : currentTextAlign === "right" ? (
                    <TextAlignRightIcon />
                  ) : (
                    <TextAlignCenterIcon />
                  ),
                expanded: stickyAlignOpen,
                popover: (
                  <div
                    className="firo-selection-toolbar__popover-menu"
                    role="menu"
                    aria-label="Text align"
                  >
                    {(["left", "center", "right"] as const).map((align) => (
                      <button
                        key={align}
                        type="button"
                        role="menuitemradio"
                        aria-checked={currentTextAlign === align}
                        className="firo-selection-toolbar__popover-item"
                        onClick={() => handleStickyTextAlignChange(align)}
                      >
                        <span className="firo-selection-toolbar__popover-key">
                          {align === "left" ? (
                            <TextAlignLeftIcon />
                          ) : align === "right" ? (
                            <TextAlignRightIcon />
                          ) : (
                            <TextAlignCenterIcon />
                          )}
                        </span>
                        <span style={{ textTransform: "capitalize" }}>
                          {align}
                        </span>
                        {currentTextAlign === align && (
                          <span className="firo-selection-toolbar__popover-check">
                            ✓
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ),
                onClick: () => {
                  setStickyAlignOpen((open) => !open);
                  setStickyFontSizeOpen(false);
                  setStickyColorOpen(false);
                  setStickySizeOpen(false);
                },
              },
            ]
          : []),
        ...(stickySize && !allLocked
          ? [
              {
                id: "sticky-size",
                label: `${t("labels.stickyNoteSize")} (${stickySize})`,
                icon: (
                  <span className="firo-selection-toolbar__size">
                    {stickySize}
                  </span>
                ),
                expanded: stickySizeOpen,
                popover: (
                  <div
                    className="firo-selection-toolbar__popover-menu"
                    role="menu"
                    aria-label={t("labels.stickyNoteSize")}
                  >
                    {(["s", "m", "l"] as const).map((preset) => {
                      const key = preset.toUpperCase();
                      return (
                        <button
                          key={preset}
                          type="button"
                          role="menuitemradio"
                          aria-checked={stickySize === key}
                          className="firo-selection-toolbar__popover-item"
                          onClick={() => {
                            actionManager.executeAction(
                              actionManager.actions.changeStickyNoteSize,
                              "ui",
                              preset,
                            );
                            setStickySizeOpen(false);
                          }}
                        >
                          <span className="firo-selection-toolbar__popover-key">
                            {key}
                          </span>
                          <span>
                            {t(
                              preset === "s"
                                ? "labels.stickyNoteSizeSmall"
                                : preset === "m"
                                ? "labels.stickyNoteSizeMedium"
                                : "labels.stickyNoteSizeLarge",
                            )}
                          </span>
                          <span className="firo-selection-toolbar__popover-detail">
                            {STICKY_NOTE_SIZE_PRESETS[preset]} px
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ),
                onClick: () => {
                  setStickySizeOpen((open) => !open);
                  setStickyFontSizeOpen(false);
                  setStickyColorOpen(false);
                  setStickyAlignOpen(false);
                },
              },
              {
                id: "sticky-color",
                label: "Color",
                icon: (
                  <span
                    className="firo-selection-toolbar__color-swatch"
                    style={{ backgroundColor: currentStickyColor }}
                  />
                ),
                expanded: stickyColorOpen,
                popover: (
                  <div
                    className="firo-selection-toolbar__color-palette"
                    role="menu"
                    aria-label="Sticky note colors"
                  >
                    {MIRO_PASTEL_STICKY_NOTE_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        role="menuitemradio"
                        aria-checked={
                          currentStickyColor.toLowerCase() ===
                          color.toLowerCase()
                        }
                        className="firo-selection-toolbar__color-option"
                        style={{ backgroundColor: color }}
                        title={color}
                        aria-label={`Color ${color}`}
                        onClick={() => handleStickyColorChange(color)}
                      />
                    ))}
                  </div>
                ),
                onClick: () => {
                  setStickyColorOpen((open) => !open);
                  setStickyFontSizeOpen(false);
                  setStickySizeOpen(false);
                  setStickyAlignOpen(false);
                },
              },
            ]
          : []),
        {
          id: "tags",
          label: "Tags",
          icon: <TagIcon />,
          pressed: tagEditorOpen,
          onClick: () => setTagEditorOpen((open) => !open),
        },
        /*
         * Comment, only for a single element.
         *
         * A thread lives on exactly one element, so with several selected there
         * is no honest answer to "which one" and no sensible default — the
         * alternative, commenting the group, is a different feature (a thread
         * with several anchors) that the schema does not have. With one selected
         * the question does not arise.
         */
        ...(selected.length === 1
          ? [
              {
                id: "comment",
                label: "Comment",
                icon: <CommentIcon />,
                onClick: () => onComment(selected[0].id),
              },
            ]
          : []),
        {
          id: "lock",
          label: allLocked ? "Unlock" : "Lock",
          icon: allLocked ? <UnlockIcon /> : <LockIcon />,
          pressed: allLocked,
          onClick: () => run(actionManager.actions.toggleElementLock),
        },
        {
          id: "duplicate",
          label: "Duplicate",
          icon: <DuplicateIcon />,
          onClick: () => run(actionManager.actions.duplicateSelection),
        },
        {
          id: "front",
          label: "Bring to front",
          icon: <BringToFrontIcon />,
          onClick: () => run(actionManager.actions.bringToFront),
        },
        {
          id: "delete",
          label: "Delete",
          icon: <TrashIcon />,
          onClick: () => run(actionManager.actions.deleteSelectedElements),
        },
      ]}
    >
      {tagEditorOpen && (
        <div
          className="firo-tag-popover"
          data-testid="tag-editor-popover"
          onClick={(e) => e.stopPropagation()}
        >
          {currentTags.length > 0 && (
            <div className="firo-tag-popover__chips">
              {currentTags.map((tag) => (
                <span key={tag} className="firo-tag-popover__chip">
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    title={`Remove tag #${tag}`}
                    data-testid={`remove-tag-${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <form
            className="firo-tag-popover__form"
            onSubmit={(e) => {
              e.preventDefault();
              handleAddTag(tagDraft);
            }}
          >
            <input
              type="text"
              placeholder="Add a tag…"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              autoFocus
              data-testid="tag-input"
            />
            <button
              type="submit"
              disabled={!tagDraft.trim()}
              data-testid="tag-submit"
            >
              Add
            </button>
          </form>
        </div>
      )}
    </SelectionToolbar>
  );
};

/**
 * Create a new doc block record in the document's records store
 * and place its projection element on the board (§10.5).
 */
export const insertDocBlockOnBoard = (
  getDocument: () => FiroDoc,
  excalidrawAPI?: ExcalidrawImperativeAPI | null,
  point?: { x: number; y: number },
): { record: DocBlockRecord; element: NonDeletedExcalidrawElement } => {
  const doc = getDocument();
  const currentBoardId = (doc.read().meta?.id as string) || "board-1";
  const collections = doc.read().collections;
  const mutations: Mutation[] = [];

  if (!collections.some((c) => c.id === DOC_BLOCK_COLLECTION_ID)) {
    mutations.push({
      kind: "createCollection",
      collection: createDocBlockCollection(currentBoardId),
    });
  }

  const created = createDocBlockRecord({
    title: "Untitled Document",
  });
  // On a narrow screen a new block at its default width would run off the
  // edge, or force a zoom where its text is tiny. Size the new block to the
  // viewport instead (existing blocks are never resized).
  const view = excalidrawAPI?.getAppState();
  const fitWidth = view
    ? Math.floor(view.width / view.zoom.value - 32)
    : created.dimensions.width;
  const fitHeight = view
    ? Math.floor((view.height * 0.6) / view.zoom.value)
    : created.dimensions.height;
  const docBlock = {
    ...created,
    dimensions: {
      ...created.dimensions,
      width: Math.max(240, Math.min(created.dimensions.width, fitWidth)),
      height: Math.max(200, Math.min(created.dimensions.height, fitHeight)),
    },
  };
  const firoRecord = docBlockRecordToFiroRecord(docBlock);
  mutations.push({
    kind: "createRecord",
    record: firoRecord,
  });

  doc.commit(mutations);

  let x = point?.x;
  let y = point?.y;

  if (x === undefined || y === undefined) {
    if (excalidrawAPI) {
      const appState = excalidrawAPI.getAppState();
      x =
        -appState.scrollX +
        appState.width / 2 / appState.zoom.value -
        docBlock.dimensions.width / 2;
      y =
        -appState.scrollY +
        appState.height / 2 / appState.zoom.value -
        docBlock.dimensions.height / 2;
    } else {
      x = 100;
      y = 100;
    }
  }

  const element = newElement({
    type: "rectangle",
    x,
    y,
    width: docBlock.dimensions.width,
    height: docBlock.dimensions.height,
    strokeColor: "#1e1e1e",
    backgroundColor: docBlock.styling.backgroundColor ?? "#ffffff",
    fillStyle: "solid",
    strokeWidth: 1,
    roughness: 0,
    roundness: { type: 3 },
    customData: {
      isDocBlock: true,
      recordId: firoRecord.id,
    },
  });
  const docBlockElement = {
    ...element,
    recordId: firoRecord.id,
  } as unknown as NonDeletedExcalidrawElement;

  if (excalidrawAPI) {
    const currentElements = excalidrawAPI.getSceneElements();
    excalidrawAPI.updateScene({
      elements: [
        ...currentElements,
        ...restoreElements([docBlockElement as any], null),
      ],
      appState: {
        selectedElementIds: { [docBlockElement.id]: true },
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }

  return { record: docBlock, element: docBlockElement };
};

const ExcalidrawWrapper = () => {
  const excalidrawAPI = useExcalidrawAPI();

  const [errorMessage, setErrorMessage] = useState("");

  /*
   * Which element a comment is being written about.
   *
   * Held here rather than in the comment layer because the *trigger* is the
   * selection toolbar, a sibling — the editor owns selection, so it owns the
   * question "what is selected", and the layer only owns "where does the pin go".
   */
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(
    null,
  );
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const syncState = useSyncSession();
  useEffect(() => {
    void syncSession.refresh();
  }, []);
  const closeAuthDialog = useCallback(() => setAuthDialogOpen(false), []);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [timerSetupOpen, setTimerSetupOpen] = useState(false);
  const [votingPanelOpen, setVotingPanelOpen] = useState(false);
  const [framesPanelOpen, setFramesPanelOpen] = useState(false);
  const [bulkStickyOpen, setBulkStickyOpen] = useState(false);
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // The highlighter freedraw preset; shared by the rail flyout and the palette
  // commands (the phone path, where the rail is not mounted).
  const highlighterSession = useMemo(() => createHighlighterSession(), []);
  const startHighlighterFromPalette = () => {
    if (!excalidrawAPI) {
      return;
    }
    const style = highlighterSession.enter(
      excalidrawAPI.getAppState() as unknown as PenStyle,
    );
    excalidrawAPI.updateScene({ appState: style as any });
    excalidrawAPI.setActiveTool({ type: "freedraw" });
  };
  const endHighlighterFromPalette = () => {
    if (!excalidrawAPI) {
      return;
    }
    const restore = highlighterSession.leave();
    if (restore) {
      excalidrawAPI.updateScene({ appState: restore as any });
    }
    excalidrawAPI.setActiveTool({ type: "freedraw" });
  };
  // Leaving freedraw by any route (tool key, mobile toolbar, palette) hands the
  // user's own pen style back, so the preset never leaks into other tools.
  useEffect(() => {
    if (!excalidrawAPI) {
      return undefined;
    }
    return excalidrawAPI.onChange((_els, st) => {
      if (highlighterSession.active && st.activeTool.type !== "freedraw") {
        const restore = highlighterSession.leave();
        if (restore) {
          excalidrawAPI.updateScene({ appState: restore as any });
        }
      }
    });
  }, [excalidrawAPI, highlighterSession]);
  const emojiPickCount = useRef(0);
  const [stickyOptionsOpen, setStickyOptionsOpen] = useState(false);

  /*
   * Registered actions live outside the React tree, so they ask for these
   * dialogs by name and the shell turns the request into state. One
   * subscription for the app's life; the unsubscribe keeps an unmounted app
   * from being asked to open anything.
   */
  useEffect(
    () =>
      subscribeToDialogRequests((request) => {
        if (request === "timerSetup") {
          setTimerSetupOpen(true);
        } else if (request === "bulkStickyNotes") {
          setBulkStickyOpen(true);
        } else if (request === "votingPanel") {
          setVotingPanelOpen(true);
        } else if (request === "framesPanel") {
          setFramesPanelOpen(true);
        }
      }),
    [],
  );
  const [commentMode, setCommentMode] = useState(false);
  const [docBlockMode, setDocBlockMode] = useState(false);
  const [activeDocBlockId, setActiveDocBlockId] = useState<string | null>(null);
  /**
   * The doc block the user just closed while it was still the selected
   * element. Selecting a doc block opens its editor, so without this the
   * editor reopens the instant Escape or a commit closes it.
   */
  const dismissedDocBlockIdRef = useRef<string | null>(null);
  const activeDocBlockIdRef = useRef<string | null>(null);
  activeDocBlockIdRef.current = activeDocBlockId;

  // Paint committed doc block content on the canvas when it is not being
  // edited. The overlay covers the block while editing, so draw the plain
  // shape then.
  useEffect(() => {
    setElementContentDrawer((element, context) => {
      const recordId = element.customData?.recordId as string | undefined;
      if (!recordId || recordId === activeDocBlockIdRef.current) {
        return false;
      }
      const firoRecord = boardDoc()
        .read()
        .records.find((r) => r.id === recordId);
      if (!firoRecord) {
        return false;
      }
      const typed = docBlockRecordFromFiroRecord(firoRecord);
      let node = createDefaultDocBlockNode();
      if (typed.contentJson) {
        try {
          node = parseDocBlockJson(JSON.parse(typed.contentJson));
        } catch {
          // unreadable content: show the empty document
        }
      }
      renderDocBlock(context, typed, node, 0, 0, element.width, element.height);
      return true;
    });
    return () => setElementContentDrawer(null);
  }, []);
  // A collaborator's committed doc content arrives as a record change, but the
  // canvas caches each element's drawing by version. Touch the matching
  // element when a doc block's stored content changes so it repaints.
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    const seen = new Map<string, string>();
    const readContent = () => {
      const out = new Map<string, string>();
      for (const r of boardDoc().read().records) {
        if (r.collectionId === DOC_BLOCK_COLLECTION_ID) {
          out.set(
            r.id,
            String(docBlockRecordFromFiroRecord(r).contentJson ?? ""),
          );
        }
      }
      return out;
    };
    readContent().forEach((v, k) => seen.set(k, v));
    return boardDoc().subscribe(() => {
      const next = readContent();
      const changed = changedDocBlockIds(
        seen,
        next,
        activeDocBlockIdRef.current,
      );
      if (!changed.size) {
        return;
      }
      excalidrawAPI.updateScene({
        elements: excalidrawAPI.getSceneElementsIncludingDeleted().map((el) =>
          changed.has(el.customData?.recordId as string)
            ? newElementWith(el, {
                customData: { ...el.customData, contentRev: Date.now() },
              })
            : el,
        ),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });
  }, [excalidrawAPI]);

  const lastCanvasClickRef = useRef<{
    time: number;
    x: number;
    y: number;
  } | null>(null);

  const handleUpdateDocBlockRecord = useCallback(
    (recordId: string, updatedDoc: any, updatedTitle?: string) => {
      const doc = boardDoc();
      const existing = doc.read().records.find((r) => r.id === recordId);
      if (!existing) {
        return;
      }
      const typed = docBlockRecordFromFiroRecord(existing);
      const nextTitle = updatedTitle !== undefined ? updatedTitle : typed.title;
      const updatedTyped: DocBlockRecord = {
        ...typed,
        title: nextTitle,
        ...(updatedDoc
          ? {
              contentJson: JSON.stringify(serializeDocBlockNode(updatedDoc)),
            }
          : {}),
        updated: Date.now(),
      };
      const updatedFiroRecord = docBlockRecordToFiroRecord(updatedTyped);

      doc.commit([
        {
          kind: "updateRecords",
          updates: [
            {
              id: recordId,
              changes: {
                values: updatedFiroRecord.values,
                updated: updatedFiroRecord.updated,
              },
            },
          ],
        },
      ]);
    },
    [],
  );

  const createDocBlockAt = useCallback(
    (point?: { x: number; y: number }) => {
      const { record, element } = insertDocBlockOnBoard(
        boardDoc,
        excalidrawAPI,
        point,
      );
      setActiveDocBlockId(record.id);
      // On a narrow screen the new block can be wider than the viewport. Fit
      // the view to it rather than resizing the shared document.
      if (excalidrawAPI) {
        const view = excalidrawAPI.getAppState();
        const needsFit =
          element.width * view.zoom.value > view.width * 0.95 ||
          element.height * view.zoom.value > view.height * 0.7;
        if (needsFit) {
          fitViewToElements(excalidrawAPI, [element]);
        }
      }
      return { record, element };
    },
    [excalidrawAPI],
  );

  const handleCommitDocBlock = useCallback(
    (updatedDoc: any, updatedTitle?: string) => {
      if (activeDocBlockId) {
        handleUpdateDocBlockRecord(activeDocBlockId, updatedDoc, updatedTitle);
      }
      dismissedDocBlockIdRef.current = activeDocBlockId;
      // The canvas caches each element's drawing by version, so touch the
      // element to make it repaint with the committed content.
      if (activeDocBlockId && excalidrawAPI) {
        excalidrawAPI.updateScene({
          elements: excalidrawAPI.getSceneElementsIncludingDeleted().map((el) =>
            el.customData?.recordId === activeDocBlockId
              ? newElementWith(el, {
                  customData: { ...el.customData, contentRev: Date.now() },
                })
              : el,
          ),
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
      setActiveDocBlockId(null);
    },
    [activeDocBlockId, handleUpdateDocBlockRecord, excalidrawAPI],
  );

  const handleDiscardDocBlock = useCallback(() => {
    dismissedDocBlockIdRef.current = activeDocBlockId;
    setActiveDocBlockId(null);
  }, [activeDocBlockId]);

  const handleChangeDocBlock = useCallback(
    (updatedDoc: any, updatedTitle?: string) => {
      if (activeDocBlockId) {
        handleUpdateDocBlockRecord(activeDocBlockId, updatedDoc, updatedTitle);
      }
    },
    [activeDocBlockId, handleUpdateDocBlockRecord],
  );

  const handleCloseDocBlock = useCallback(() => {
    dismissedDocBlockIdRef.current = activeDocBlockId;
    setActiveDocBlockId(null);
  }, [activeDocBlockId]);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportModalTab, setExportModalTab] = useState<ExportTab>("image");
  const [importPendingFile, setImportPendingFile] = useState<{
    info: ImportFileInfo;
    bytes: Uint8Array;
  } | null>(null);
  const [minimapVisible, setMinimapVisible] = useState(false);
  const [activityFeedOpen, setActivityFeedOpen] = useState(false);
  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const activityFeedDialogRef = useRef<HTMLDivElement>(null);

  const handleExportImage = useCallback(
    async (opts: {
      format: "png" | "jpg" | "svg";
      scale: number;
      background: boolean;
      selectionOnly: boolean;
      embedScene: boolean;
    }) => {
      if (!excalidrawAPI) {
        return;
      }
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      const boardName = getActiveBoard()?.name || "board";
      const selectedIds = appState.selectedElementIds || {};
      const elementsToExport = opts.selectionOnly
        ? elements.filter((el) => selectedIds[el.id])
        : elements;

      if (opts.format === "svg") {
        const svg = await exportToSvg({
          elements: elementsToExport,
          appState: {
            ...appState,
            exportBackground: opts.background,
            viewBackgroundColor: appState.viewBackgroundColor,
            exportScale: opts.scale,
          },
          files,
        });
        const svgStr = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgStr], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${boardName}.svg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        return;
      }

      const canvas = await exportToCanvas({
        elements: elementsToExport,
        appState: {
          ...appState,
          // JPEG has no alpha channel, so the scene is always composited
          // onto the canvas background.
          exportBackground: opts.format === "jpg" ? true : opts.background,
          exportScale: opts.scale,
          exportEmbedScene: opts.format === "png" && opts.embedScene,
        },
        files,
      });
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${boardName}.${opts.format}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        },
        opts.format === "jpg" ? "image/jpeg" : "image/png",
        opts.format === "jpg" ? 0.92 : undefined,
      );
    },
    [excalidrawAPI],
  );

  const handleCopyImage = useCallback(
    async (opts: {
      format: "png" | "svg";
      scale: number;
      background: boolean;
      selectionOnly: boolean;
    }) => {
      if (!excalidrawAPI) {
        return;
      }
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      const selectedIds = appState.selectedElementIds || {};
      const elementsToExport = opts.selectionOnly
        ? elements.filter((el) => selectedIds[el.id])
        : elements;

      if (opts.format === "svg") {
        const svg = await exportToSvg({
          elements: elementsToExport,
          appState: {
            ...appState,
            exportBackground: opts.background,
            viewBackgroundColor: appState.viewBackgroundColor,
            exportScale: opts.scale,
          },
          files,
        });
        const svgStr = new XMLSerializer().serializeToString(svg);
        await navigator.clipboard.writeText(svgStr);
        return;
      }

      const blob = await exportToBlob({
        elements: elementsToExport,
        appState: {
          ...appState,
          exportBackground: opts.background,
          exportScale: opts.scale,
        },
        files,
        mimeType: "image/png",
      });
      if (blob && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
      }
    },
    [excalidrawAPI],
  );

  const handleExportPdf = useCallback(
    async (opts: { mode: "frames" | "single"; background: boolean }) => {
      if (!excalidrawAPI) {
        return;
      }
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      const boardName = getActiveBoard()?.name || "board";
      const frames = elements.filter(
        (el) => el.type === "frame" && !el.isDeleted,
      ) as any[];

      const blob = await exportToPdf({
        elements,
        appState: {
          ...appState,
          exportBackground: opts.background,
          name: boardName,
        },
        files,
        exportMode:
          opts.mode === "frames" ? "multi-page-frames" : "single-page",
        frames,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${boardName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    [excalidrawAPI],
  );

  const handleExportArchive = useCallback(
    async (opts: { format: "firo" | "directory" }) => {
      const doc = boardDoc();
      const boardName = getActiveBoard()?.name || "board";

      if (opts.format === "firo") {
        let result: ExportResult | PackagedExportResult = exportBoard(doc);
        if (!result.ok && result.reason === "assets-not-carried") {
          result = await exportPackagedBoard(doc, {
            readAsset: async (hash) => {
              const bytes = await getAssetBytes(hash);
              return bytes ? new Uint8Array(bytes) : null;
            },
          });
        }
        if (result.ok) {
          downloadBoard({ ...result, filename: `${boardName}.firo` });
        } else {
          excalidrawAPI?.setToast({
            message: `Export failed: ${result.detail}`,
            closable: true,
            duration: 5000,
          });
        }
        return;
      }

      if (opts.format === "directory") {
        if (!canPickDirectory()) {
          excalidrawAPI?.setToast({
            message:
              "Folder export is not supported by your browser. Use .firo archive instead.",
            closable: true,
            duration: 5000,
          });
          return;
        }
        await exportBoardDirectory(doc, {
          readAsset: async (hash) => {
            const bytes = await getAssetBytes(hash);
            return bytes ? new Uint8Array(bytes) : null;
          },
          write: (files) =>
            writeFiroDirectory(files, { suggestedName: boardName }),
        });
      }
    },
    [excalidrawAPI],
  );

  const handleExportCsv = useCallback(
    (opts: { target: "stickies" | "records" }) => {
      const doc = boardDoc();
      const boardName = getActiveBoard()?.name || "board";

      if (opts.target === "stickies") {
        const csvStr = exportStickyNotesToCsv(doc);
        const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${boardName}-stickies.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        return;
      }

      if (opts.target === "records") {
        const csvStr = exportRecordsToCsv(doc);
        const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${boardName}-records.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    },
    [],
  );

  const handleExportExcalidraw = useCallback(() => {
    const doc = boardDoc();
    const boardName = getActiveBoard()?.name || "board";
    const scene = convertFiroToExcalidraw(doc.read());
    const jsonStr = JSON.stringify(scene, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${boardName}.excalidraw`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  const handleExportMiroScript = useCallback(() => {
    const doc = boardDoc();
    const elements = doc.read().elements;
    const script = generateMiroCreationScript(elements);
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(script);
      excalidrawAPI?.setToast({
        message:
          "Miro script copied to clipboard! Paste it into your Miro browser console.",
        closable: true,
        duration: 8000,
      });
    }
  }, [excalidrawAPI]);

  const handleExportBatchFrames = useCallback(
    async (opts: { format: "png" | "svg"; scale: number }) => {
      if (!excalidrawAPI) {
        return;
      }
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      const boardName = getActiveBoard()?.name || "board";

      const zipBlob = await exportFramesToZip({
        elements,
        appState,
        files,
        format: opts.format,
        scale: opts.scale,
      });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${boardName}-frames.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    [excalidrawAPI],
  );

  const ingestImportedAssets = useCallback(
    async (
      assets: Map<
        string,
        { hash: string; bytes: Uint8Array; mimeType: string }
      >,
    ) => {
      if (!excalidrawAPI || !assets || assets.size === 0) {
        return;
      }
      await injectAssetsIntoEditor(excalidrawAPI, assets);
      try {
        const filesMap: Record<FileId, BinaryFileData> = {};
        for (const asset of assets.values()) {
          const dataURL = await uint8ArrayToDataUrl(
            asset.bytes,
            asset.mimeType,
          );
          filesMap[asset.hash as FileId] = {
            id: asset.hash as FileId,
            dataURL: dataURL as DataURL,
            mimeType: asset.mimeType as any,
            created: Date.now(),
            lastRetrieved: Date.now(),
          };
        }
        await LocalData.fileStorage.saveFiles({
          elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
          files: filesMap,
        });
      } catch (e) {
        console.warn("Failed to persist imported assets to fileStorage", e);
      }
    },
    [excalidrawAPI],
  );

  const handleStartImport = useCallback(
    async (filename: string, bytes: Uint8Array) => {
      if (!excalidrawAPI) {
        return;
      }
      const doc = boardDoc();
      const existingElements = doc
        .read()
        .elements.filter((el) => !el.isDeleted);

      const nameLower = filename.toLowerCase();
      let format: ImportFileInfo["format"] = "firo";
      if (nameLower.endsWith(".rtb")) {
        format = "rtb";
      } else if (nameLower.endsWith(".excalidraw")) {
        format = "excalidraw";
      } else if (nameLower.endsWith(".csv")) {
        format = "csv";
      } else if (nameLower.endsWith(".json")) {
        format = "json";
      }

      // If board is empty, directly load!
      if (existingElements.length === 0) {
        const result = await importBoardFile(doc, bytes, {
          putAsset: async (hash, data) => {
            await putAsset(hash, data as never, undefined);
          },
          force: true,
        });
        if (result.ok) {
          if (result.assets && result.assets.size > 0) {
            await ingestImportedAssets(result.assets);
          }
          excalidrawAPI.setToast({
            message: `Board loaded (${result.elements} elements)!`,
            closable: true,
            duration: 4000,
          });
        } else {
          excalidrawAPI.setToast({
            message: `Import failed: ${result.detail}`,
            closable: true,
            duration: 6000,
          });
        }
        return;
      }

      // Board has existing content: open smart ImportModal!
      setImportPendingFile({
        info: {
          name: filename,
          sizeBytes: bytes.byteLength,
          format,
        },
        bytes,
      });
    },
    [excalidrawAPI, ingestImportedAssets],
  );

  const handleImportInsert = useCallback(async () => {
    if (!importPendingFile || !excalidrawAPI) {
      return;
    }
    const doc = boardDoc();
    const result = await importBoardFile(doc, importPendingFile.bytes, {
      putAsset: async (hash, data) => {
        await putAsset(hash, data as never, undefined);
      },
      insertMode: "insert",
    });
    if (result.ok) {
      if (result.assets && result.assets.size > 0) {
        await ingestImportedAssets(result.assets);
      }
      excalidrawAPI.setToast({
        message: `Inserted ${result.elements} elements onto current board!`,
        closable: true,
        duration: 4000,
      });
    } else {
      excalidrawAPI.setToast({
        message: `Insert failed: ${result.detail}`,
        closable: true,
        duration: 6000,
      });
    }
    setImportPendingFile(null);
  }, [importPendingFile, excalidrawAPI, ingestImportedAssets]);

  const handleImportReplace = useCallback(async () => {
    if (!importPendingFile || !excalidrawAPI) {
      return;
    }
    const doc = boardDoc();
    const result = await importBoardFile(doc, importPendingFile.bytes, {
      putAsset: async (hash, data) => {
        await putAsset(hash, data as never, undefined);
      },
      insertMode: "replace",
      force: true,
    });
    if (result.ok) {
      if (result.assets && result.assets.size > 0) {
        await ingestImportedAssets(result.assets);
      }
      excalidrawAPI.setToast({
        message: `Board replaced (${result.elements} elements)!`,
        closable: true,
        duration: 4000,
      });
    } else {
      excalidrawAPI.setToast({
        message: `Replace failed: ${result.detail}`,
        closable: true,
        duration: 6000,
      });
    }
    setImportPendingFile(null);
  }, [importPendingFile, excalidrawAPI, ingestImportedAssets]);

  const handleImportOpenNew = useCallback(async () => {
    if (!importPendingFile) {
      return;
    }
    const { id, mutation } = mintBoardId();
    const newDoc = createFiroDoc();
    newDoc.commit([mutation]);
    const result = await importBoardFile(newDoc, importPendingFile.bytes, {
      putAsset: async (hash, data) => {
        await putAsset(hash, data as never, undefined);
      },
      force: true,
    });
    if (result.ok) {
      const read = newDoc.read();
      const metaName = read.meta?.name;
      const boardName =
        typeof metaName === "string" &&
        metaName.trim() &&
        metaName !== "Untitled board"
          ? metaName
          : importPendingFile.info.name.replace(/\.[^/.]+$/, "");
      const payload = JSON.stringify(serializeBoard(read));
      await createBoard({
        id,
        name: boardName,
        payload,
      });
      setImportPendingFile(null);
      window.location.assign(boardUrl(id));
    } else {
      excalidrawAPI?.setToast({
        message: `Import failed: ${result.detail}`,
        closable: true,
        duration: 6000,
      });
      setImportPendingFile(null);
    }
  }, [importPendingFile, excalidrawAPI]);

  const handleMenuImport = useCallback(async () => {
    const picked = await pickBinaryFile(
      ".firo,.rtb,.excalidraw,.json,.csv,.zip,application/json,application/zip,application/octet-stream,text/csv",
    );
    if (!picked) {
      return;
    }
    await handleStartImport(picked.name, picked.bytes);
  }, [handleStartImport]);

  const handleMenuRefresh = useCallback(() => {
    forceRefresh((prev) => !prev);
  }, []);

  const handleMenuExport = useCallback(() => {
    setExportModalTab("image");
    setExportModalOpen(true);
  }, []);

  const handleMenuVersionHistory = useCallback(() => {
    setVersionHistoryOpen(true);
  }, []);

  const handleFooterChange = useCallback(() => {
    excalidrawAPI?.refresh();
  }, [excalidrawAPI]);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const onDrop = async (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) {
        return;
      }
      const file = files[0];
      const name = file.name.toLowerCase();
      if (
        name.endsWith(".firo") ||
        name.endsWith(".rtb") ||
        name.endsWith(".excalidraw") ||
        name.endsWith(".csv") ||
        (name.endsWith(".json") && !name.endsWith(".excalidrawlib"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        const bytes = new Uint8Array(await file.arrayBuffer());
        handleStartImport(file.name, bytes);
      }
    };

    window.addEventListener("dragover", onDragOver, false);
    window.addEventListener("drop", onDrop, { capture: true });
    return () => {
      window.removeEventListener("dragover", onDragOver, false);
      window.removeEventListener("drop", onDrop, { capture: true });
    };
  }, [handleStartImport]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isWritableElement(event.target)) {
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        (event.key === "e" || event.key === "E")
      ) {
        event.preventDefault();
        setExportModalTab("image");
        setExportModalOpen(true);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key.toLowerCase() === "c" && !event.shiftKey) {
        event.preventDefault();
        setCommentMode((prev) => !prev);
      } else if (event.key === "Escape") {
        setCommentMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  /*
   * The accessibility tree's contents.
   *
   * Rebuilt from the scene on document change, debounced to 200 ms, never per
   * frame ([`docs/trd/09-accessibility.md`](../../docs/trd/09-accessibility.md)).
   * Held as state rather than derived on every render because the rebuild walks
   * every element, and this component re-renders on selection, theme and
   * collaboration changes.
   */
  const [accessibilityItems, setAccessibilityItems] = useState<
    AccessibilityTreeItem[]
  >([]);

  const refreshAccessibilityItems = useMemo(
    () =>
      debounce((elements: readonly OrderedExcalidrawElement[]) => {
        const live = elements.filter((element) => !element.isDeleted);
        setAccessibilityItems(toAccessibilityItems(live, toElementsMap(live)));
      }, ACCESSIBILITY_TREE_DEBOUNCE_MS),
    [],
  );

  /*
   * Reduced motion is a per-session setting, so it is applied on mount from
   * storage rather than only reacting to the OS preference. See
   * `board/reducedMotion.ts`.
   */
  useEffect(() => {
    applyReducedMotion(readReducedMotion());
  }, []);

  const refreshActivity = useCallback(async () => {
    const metaId = boardDoc().read().meta?.id;
    const currentBoardId = typeof metaId === "string" ? metaId : "default";
    const list = await listActivity({ boardId: currentBoardId });
    setActivities(list);
  }, []);

  useEffect(() => {
    if (activityFeedOpen) {
      void refreshActivity();
    }
  }, [activityFeedOpen, refreshActivity]);

  /**
   * `M` toggles the minimap — Miro's binding, and one of the two keys Miro has
   * for a feature Firo already had but never bound (the other is `G` for the
   * grid, which lives on the editor's action because the editor draws the grid).
   *
   * The minimap is host chrome, so its key is owned here rather than in the
   * editor's registry; `board/chromeShortcuts.ts` carries the predicate and the
   * reasoning. The listener mirrors `CommentLayer`'s Escape handler — `window`,
   * because the same key should work whether or not the canvas has focus.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isMinimapShortcut(event)) {
        return;
      }
      event.preventDefault();
      setMinimapVisible((visible) => !visible);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();

  const [langCode, setLangCode] = useAppLangCode();

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    trackEvent("load", "frame", getFrame());
    // Delayed so that the app has a time to load the latest SW
    setTimeout(() => {
      trackEvent("load", "version", getVersion());
    }, VERSION_TIMEOUT);
  }, []);

  const collabProviderRef = useRef<CollabProvider | null>(null);
  const [collabStatus, setCollabStatus] =
    useState<ConnectionStatus>("connecting");
  const [collaborators, setCollaborators] = useState<
    readonly CollaboratorInfo[]
  >([]);

  const [shareRole, setShareRole] = useState<string | null>(null);
  const isReadOnlyShare = shareRole === "viewer" || shareRole === "commenter";
  const createStack = useCallback(() => {
    if (excalidrawAPI && !isReadOnlyShare) {
      createStickyStack(excalidrawAPI);
    }
  }, [excalidrawAPI, isReadOnlyShare]);

  useEffect(() => {
    let isCancelled = false;

    const setupCollab = async () => {
      const shareMatch =
        typeof window !== "undefined"
          ? window.location.pathname.match(/^\/s\/([^/]+)/)
          : null;
      const shareToken = shareMatch ? shareMatch[1] : null;

      let boardId =
        (boardDoc().read().meta?.id as string | undefined) ||
        getActiveBoard()?.id ||
        "default";

      if (shareToken) {
        const resolved = await resolveShareToken(shareToken);
        if (resolved?.boardId && (!boardId || boardId === "default")) {
          boardId = resolved.boardId;
        }
        if (resolved?.role && !isCancelled) {
          setShareRole(resolved.role);
        }
      }

      if (isCancelled) {
        return undefined;
      }

      const provider = new CollabProvider({
        boardId,
        shareToken,
        doc: boardDoc(),
      });

      collabProviderRef.current = provider;

      const unsubStatus = provider.onStatusChange((status) => {
        setCollabStatus(status === "disconnected" ? "offline" : status);
      });
      const unsubCollabs = provider.onCollaboratorsChange((collabs) => {
        setCollaborators(collabs);
      });

      return () => {
        unsubStatus();
        unsubCollabs();
        provider.destroy();
        collabProviderRef.current = null;
      };
    };

    const cleanupPromise = setupCollab();

    return () => {
      isCancelled = true;
      void cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, []);

  /*
   * View mode swallows canvas pointer-downs, so the editor's own
   * `onPointerDown` never fires for a commenter. Commenters may still place
   * comments (server rule: they may write only the `comments` partition), so
   * catch the click here while comment mode is armed.
   */
  useEffect(() => {
    if (!commentMode || shareRole !== "commenter" || !excalidrawAPI) {
      return undefined;
    }
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.("canvas.interactive")) {
        return;
      }
      const state = excalidrawAPI.getAppState();
      const point = viewportCoordsToSceneCoords(event, state);
      setCommentTarget({ point: { x: point.x, y: point.y } });
      setCommentMode(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [commentMode, shareRole, excalidrawAPI]);

  /*
   * The mobile toolbar is the generic editor's, so the board's own tools reach
   * it as extra "More tools" entries. Same rules as the desktop rail: read-only
   * share roles get no creation tools, commenters keep Comment.
   */
  const mobileExtraTools = useMemo(() => {
    const canCreate = !isReadOnlyShare;
    const canComment = canCreate || shareRole === "commenter";
    const tools: MobileExtraTool[] = [];
    if (canComment) {
      tools.push({
        id: "comment",
        label: "Comment",
        icon: RAIL_TOOL_ICONS.comment as JSX.Element,
        selected: commentMode,
        onSelect: () => {
          setCommentMode((mode) => !mode);
          setDocBlockMode(false);
        },
      });
    }
    if (canCreate) {
      tools.push(
        {
          id: "docblock",
          label: "Document",
          icon: RAIL_TOOL_ICONS.docblock as JSX.Element,
          selected: docBlockMode,
          onSelect: () => {
            setDocBlockMode((mode) => !mode);
            setCommentMode(false);
          },
        },
        {
          id: "stickyoptions",
          label: "Sticky options…",
          icon: RAIL_TOOL_ICONS.stickynote as JSX.Element,
          onSelect: () => {
            /*
             * Mirror the desktop flyout: its options belong to the sticky
             * slot, so the tool is always active when they show. The colour
             * action resolves its domain from the active tool, so picking a
             * colour here must mean "sticky" too, not whatever tool was up.
             */
            excalidrawAPI?.setActiveTool({ type: "stickynote" });
            setStickyOptionsOpen(true);
          },
        },
        {
          id: "templates",
          label: "Templates",
          icon: RAIL_TOOL_ICONS.templates as JSX.Element,
          onSelect: () => setTemplateModalOpen(true),
        },
        {
          id: "ai",
          label: "AI Assistant",
          icon: RAIL_TOOL_ICONS.ai as JSX.Element,
          onSelect: () => setAiModalOpen(true),
        },
      );
    }
    return tools;
  }, [isReadOnlyShare, shareRole, commentMode, docBlockMode, excalidrawAPI]);

  /*
   * A board opens at scroll 0,0, which hides content that sits near the origin
   * behind the chrome or off the edge on a phone (templates start there). No
   * view is stored per board, so fit the view once, when content first shows up
   * in the opening seconds (local load or first sync). Stop as soon as the
   * user has panned or zoomed, or after the window, so a first shape drawn on
   * an empty board never moves the view.
   */
  const collabConnected = collabStatus === "connected";
  useEffect(() => {
    if (!excalidrawAPI) {
      return undefined;
    }
    let done = false;
    // The window starts when the board connects, so a slow first sync still
    // gets fitted. Any pointer or key input by the user ends it.
    const startedAt = Date.now();
    const stop = () => {
      done = true;
    };
    window.addEventListener("pointerdown", stop, true);
    window.addEventListener("keydown", stop, true);
    const off = excalidrawAPI.onChange((elements, state) => {
      if (done) {
        return;
      }
      if (!canAutoFit(state, Date.now() - startedAt)) {
        done = true;
        return;
      }
      const live = elements.filter((el) => !el.isDeleted);
      if (live.length === 0) {
        return;
      }
      done = true;
      fitViewToElements(excalidrawAPI, live);
    });
    return () => {
      off();
      window.removeEventListener("pointerdown", stop, true);
      window.removeEventListener("keydown", stop, true);
    };
    // Re-arm once when the board connects: content that syncs in after the
    // opening window is still framed, until the user touches the canvas.
  }, [excalidrawAPI, collabConnected]);

  /*
   * A selection restored on load can sit under the docked Properties panel.
   * In the opening seconds, and only until the user touches the canvas, slide
   * the view sideways once so the selected shapes end up beside the panel. The
   * selection is kept. Nothing moves during later manipulation.
   */
  useEffect(() => {
    if (!excalidrawAPI) {
      return undefined;
    }
    let done = false;
    const startedAt = Date.now();
    const stop = () => {
      done = true;
    };
    window.addEventListener("pointerdown", stop, true);
    window.addEventListener("keydown", stop, true);
    const off = excalidrawAPI.onChange((elements, state) => {
      if (done) {
        return;
      }
      if (
        Date.now() - startedAt > 8000 ||
        state.newElement ||
        state.editingTextElement
      ) {
        done = true;
        return;
      }
      const ids = state.selectedElementIds ?? {};
      const picked = elements.filter((el) => !el.isDeleted && ids[el.id]);
      const panel = document.querySelector(".firo-inspector");
      if (picked.length === 0 || !panel) {
        return;
      }
      const z = state.zoom.value;
      const minX = Math.min(...picked.map((el) => el.x));
      const maxX = Math.max(...picked.map((el) => el.x + el.width));
      const minY = Math.min(...picked.map((el) => el.y));
      const maxY = Math.max(...picked.map((el) => el.y + el.height));
      const toX = (x: number) => (x + state.scrollX) * z + state.offsetLeft;
      const toY = (y: number) => (y + state.scrollY) * z + state.offsetTop;
      const rect = panel.getBoundingClientRect();
      const dx = selectionRevealScrollX(
        {
          left: toX(minX),
          right: toX(maxX),
          top: toY(minY),
          bottom: toY(maxY),
        },
        {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        },
        z,
      );
      done = true;
      if (dx !== 0) {
        excalidrawAPI.updateScene({
          appState: { scrollX: state.scrollX + dx },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
    });
    return () => {
      off();
      window.removeEventListener("pointerdown", stop, true);
      window.removeEventListener("keydown", stop, true);
    };
  }, [excalidrawAPI]);

  const isCollaborating = collabStatus === "connected";
  /**
   * Follow-mode viewport status. Presence arrives with the v2 sync server
   * (ADR-0002), so there is no followed user to display in v1 and this frame is
   * always `null`. It is kept as an explicit `null` rather than deleted so the
   * `renderTopRightUI` contract stays unchanged for v2.
   */
  const viewportStatusFrame = null;

  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  const isOffline = useIsOffline();
  const viewModeEnabled = useExcalidrawStateValue(
    (state) => state.viewModeEnabled,
  );

  const liveMessage = useMemo(() => {
    if (errorMessage) {
      return errorMessage;
    }
    if (localStorageQuotaExceeded) {
      return t("alerts.localStorageQuotaExceeded");
    }
    if (isCollaborating && isOffline) {
      return t("alerts.collabOfflineWarning");
    }
    if (viewModeEnabled) {
      return "View mode active";
    }
    return undefined;
  }, [
    errorMessage,
    localStorageQuotaExceeded,
    isCollaborating,
    isOffline,
    viewModeEnabled,
  ]);

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  const [, forceRefresh] = useState(false);

  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();

      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = {
          data: [],
        };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [excalidrawAPI]);

  // ---------------------------------------------------------------------------
  // Hoisted loadImages
  // ---------------------------------------------------------------------------
  const loadImages = useCallback(
    (data: ResolutionType<typeof initializeScene>, isInitialLoad = false) => {
      if (!data.scene || !excalidrawAPI) {
        return;
      }

      const fileIds =
        data.scene.elements?.reduce((acc, element) => {
          if (isInitializedImageElement(element)) {
            return acc.concat(element.fileId);
          }
          return acc;
        }, [] as FileId[]) || [];

      /**
       * External (shareable-link) scenes previously loaded their images from
       * Firebase. Firo has no backend in v1 — share links arrive with the
       * self-hosted sync server in v2 (ADR-0008), and asset storage moves to
       * content-addressed files on the server's disk
       * (docs/trd/08-server-and-auth.md). Until then an external scene loads
       * its elements but not its images.
       */
      if (data.isExternalScene) {
        if (fileIds.length) {
          FileStatusStore.updateStatuses(
            fileIds.map((id) => [id, "error"] as [FileId, "error"]),
          );
        }
        return;
      }

      if (fileIds.length) {
        LocalData.fileStorage
          .getFiles(fileIds)
          .then(async ({ loadedFiles, erroredFiles }) => {
            if (loadedFiles.length) {
              excalidrawAPI.addFiles(loadedFiles);
            }
            updateStaleImageStatuses({
              excalidrawAPI,
              erroredFiles,
              elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
            });
          });
      }

      if (isInitialLoad) {
        // on fresh load, clear unused files from IDB (from previous session)
        LocalData.fileStorage.clearObsoleteFiles({
          currentFileIds: fileIds,
        });
      }
    },
    [excalidrawAPI],
  );

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    /*
     * Attach before the scene resolves, not after.
     *
     * `initialData` is applied by the editor on its first render, and that fires
     * the change event. A sync attached afterwards would see those changes with
     * no baseline to compare against and commit the initial board straight back
     * to the document — harmless once, but it stamps `updated` on every element
     * at load and makes the first real edit indistinguishable from setup.
     */
    const detachBoard = attachBoard(excalidrawAPI);

    initializeScene({ excalidrawAPI }).then(async (data) => {
      loadImages(data, /* isInitialLoad */ true);
      initialStatePromiseRef.current.promise.resolve(data.scene);
    });

    const onHashChange = async (event: HashChangeEvent) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        excalidrawAPI.updateScene({ appState: { isLoading: true } });

        initializeScene({ excalidrawAPI }).then((data) => {
          loadImages(data);
          if (data.scene) {
            excalidrawAPI.updateScene({
              elements: restoreElements(data.scene.elements, null, {
                repairBindings: true,
              }),
              appState: restoreAppState(data.scene.appState, null),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
        });
      }
    };

    const syncData = debounce(() => {
      if (isTestEnv()) {
        return;
      }
      if (!document.hidden) {
        // don't sync if local state is newer or identical to browser state
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = importFromLocalStorage();
          setLangCode(getPreferredLanguage());
          excalidrawAPI.updateScene({
            ...localDataState,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          LibraryIndexedDBAdapter.load().then((data) => {
            if (data) {
              excalidrawAPI.updateLibrary({
                libraryItems: data.libraryItems,
              });
            }
          });
        }

        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currFiles = excalidrawAPI.getFiles();
          const fileIds =
            elements?.reduce((acc, element) => {
              if (
                isInitializedImageElement(element) &&
                // only load and update images that aren't already loaded
                !currFiles[element.fileId]
              ) {
                return acc.concat(element.fileId);
              }
              return acc;
            }, [] as FileId[]) || [];
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const onUnload = () => {
      LocalData.flushSave();
    };

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        LocalData.flushSave();
      }
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false,
      );
      // Detach the document before the editor goes away. A leaked sync keeps a
      // document subscription alive and pushes into an editor that no longer
      // exists, which surfaces as an error on every keystroke after a hot reload
      // rather than at the moment of the leak.
      detachBoard();
    };
  }, [excalidrawAPI, setLangCode, loadImages]);

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();

      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          excalidrawAPI.getSceneElements(),
        )
      ) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          preventUnload(event);
        } else {
          console.warn(
            "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
          );
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [excalidrawAPI]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    /*
     * The document model sees every change first.
     *
     * Before `LocalData`, because the document is the source of truth and
     * anything that fails downstream is a problem with the app's own storage, not
     * with the board. And it is safe to call on every change: `BoardSync`
     * recognises its own writes coming back and commits nothing for them, which
     * is what stops this from being a feedback loop.
     */
    commitBoard();

    /*
     * The accessibility tree mirrors the document, debounced. Refreshed here
     * rather than derived from `app.scene` on every render because the rebuild
     * is O(elements), and this is the point at which the scene actually
     * changed.
     */
    refreshAccessibilityItems(elements);

    const selectedIds = Object.keys(appState.selectedElementIds || {}).filter(
      (id) => appState.selectedElementIds[id],
    );
    if (selectedIds.length === 1) {
      const selected = elements.find((el) => el.id === selectedIds[0]);
      const recordId =
        (selected?.customData?.recordId as string | undefined) ||
        ((selected as any)?.recordId as string | undefined);
      if (
        recordId &&
        (selected?.customData?.isDocBlock || selected?.type === "rectangle")
      ) {
        const doc = boardDoc();
        const record = doc.read().records.find((r) => r.id === recordId);
        if (
          record &&
          (record.collectionId === DOC_BLOCK_COLLECTION_ID ||
            isDocBlockRecord(record))
        ) {
          if (
            activeDocBlockId !== recordId &&
            dismissedDocBlockIdRef.current !== recordId
          ) {
            setActiveDocBlockId(recordId);
          }
        }
      }
    }
    // Once the dismissed block is no longer the only selection, selecting it
    // again should open it.
    if (
      dismissedDocBlockIdRef.current &&
      !(
        selectedIds.length === 1 &&
        elements.find((el) => el.id === selectedIds[0])?.customData
          ?.recordId === dismissedDocBlockIdRef.current
      )
    ) {
      dismissedDocBlockIdRef.current = null;
    }

    if (appState.activeTool?.type) {
      collabProviderRef.current?.setLocalTool(appState.activeTool.type);
    }

    if (appState.openDialog?.name === "imageExport") {
      excalidrawAPI?.updateScene({ appState: { openDialog: null } });
      setExportModalTab("image");
      setExportModalOpen(true);
    }

    // this check is redundant, but since this is a hot path, it's best
    // not to evaludate the nested expression every time
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (excalidrawAPI) {
          let didChange = false;

          const elements = excalidrawAPI
            .getSceneElementsIncludingDeleted()
            .map((element) => {
              if (
                LocalData.fileStorage.shouldUpdateImageElementStatus(element)
              ) {
                const newElement = newElementWith(element, { status: "saved" });
                if (newElement !== element) {
                  didChange = true;
                }
                return newElement;
              }
              return element;
            });

          if (didChange) {
            excalidrawAPI.updateScene({
              elements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }
        }
      });
    }

    // Render the debug scene if the debug canvas is available
    if (debugCanvasRef.current && excalidrawAPI) {
      debugRenderer(
        debugCanvasRef.current,
        appState,
        elements,
        window.devicePixelRatio,
      );
    }
  };

  const [latestShareableLink, setLatestShareableLink] = useState<string | null>(
    null,
  );

  // ---------------------------------------------------------------------------
  // onExport — intercepts file save to wait for pending image loads
  // ---------------------------------------------------------------------------
  const onExport: Required<ExcalidrawProps>["onExport"] = useCallback(
    async function* () {
      let snapshot = FileStatusStore.getSnapshot();
      const { pending, total } = FileStatusStore.getPendingCount(
        snapshot.value,
      );
      if (pending === 0) {
        return;
      }

      yield {
        type: "progress",
        progress: (total - pending) / total,
        message: `Loading images (${total - pending}/${total})...`,
      };

      while (true) {
        snapshot = await FileStatusStore.pull(snapshot.version);
        const { pending: nowPending, total: nowTotal } =
          FileStatusStore.getPendingCount(snapshot.value);

        yield {
          type: "progress",
          progress: (nowTotal - nowPending) / nowTotal,
          message: `Loading images (${nowTotal - nowPending}/${nowTotal})...`,
        };

        if (nowPending === 0) {
          await new Promise((r) => setTimeout(r, 500));
          yield {
            type: "progress",
            message: `Preparing export...`,
          };
          return;
        }
      }
    },
    [],
  );

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => excalidrawAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  // const onExport = () => {
  //   return new Promise((r) => setTimeout(r, 2500));
  //   // console.log("onExport");
  // };

  // browsers generally prevent infinite self-embedding, there are
  // cases where it still happens, and while we disallow self-embedding
  // by not whitelisting our own origin, this serves as an additional guard
  if (isSelfEmbedding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <h1>I'm not a pretzel!</h1>
      </div>
    );
  }

  return (
    <div
      style={{ height: "100%" }}
      className={clsx("firo-app", {
        "is-collaborating": isCollaborating,
        "is-comment-mode": commentMode,
      })}
    >
      <Excalidraw
        defaultChromeEnabled={false}
        suppressWelcomeScreen={boardDoc()
          .read()
          .collections.some(
            (c) =>
              c.id !== VOTE_COLLECTION_ID && c.id !== DOC_BLOCK_COLLECTION_ID,
          )}
        onSaveSelectionAsTemplate={
          isReadOnlyShare ? undefined : () => setSaveTemplateOpen(true)
        }
        onAddComment={
          isReadOnlyShare && shareRole !== "commenter"
            ? undefined
            : (target) => setCommentTarget(target)
        }
        renderCreationRailUI={(_isMobile, appState) => (
          <WebCreationRail
            appState={appState}
            readOnlyRole={isReadOnlyShare ? shareRole : null}
            commentMode={commentMode}
            onToggleCommentMode={() => {
              setCommentMode((mode) => !mode);
              setDocBlockMode(false);
            }}
            docBlockMode={docBlockMode}
            onToggleDocBlockMode={() => {
              setDocBlockMode((mode) => !mode);
              setCommentMode(false);
            }}
            onOpenTemplates={() => setTemplateModalOpen(true)}
            onOpenAI={() => setAiModalOpen(true)}
            onToggleEmoji={() => setEmojiOpen((open) => !open)}
            highlighterSession={highlighterSession}
            onOpenBulkSticky={() => setBulkStickyOpen(true)}
            onCreateStickyStack={createStack}
          />
        )}
        renderNavigationUI={(_isMobile, appState) => (
          <WebNavToolbar
            appState={appState}
            minimapVisible={minimapVisible}
            onToggleMinimap={() => setMinimapVisible((v) => !v)}
          />
        )}
        renderBoardMenuUI={() => <WebBoardMenu />}
        renderHelpDialogExtra={() => {
          if (!excalidrawAPI) {
            return null;
          }
          /*
           * The rows are built from the registered actions on every open, so
           * the dialog can never advertise a chord the build no longer has
           * (parity matrix row 9: Firo's own chords were absent here).
           */
          const rows = facilitatorHelpRows(
            facilitatorActions(excalidrawAPI, boardDoc, refreshBoard),
          );
          if (rows.length === 0) {
            return null;
          }
          return (
            <>
              <h3>Facilitation</h3>
              <div className="HelpDialog__islands-container">
                <div className="HelpDialog__island">
                  <h4 className="HelpDialog__island-title">Running the room</h4>
                  <div className="HelpDialog__island-content">
                    {rows.map((row) => (
                      <div className="HelpDialog__shortcut" key={row.name}>
                        <div>{row.label}</div>
                        <div className="HelpDialog__key-container">
                          {row.chord.split("+").map((key) => (
                            <kbd className="HelpDialog__key" key={key}>
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          );
        }}
        renderInspectorUI={(_isMobile, appState) => (
          <WebInspector appState={appState} />
        )}
        renderSelectionUI={(_isMobile, appState) => (
          <WebSelectionToolbar
            appState={appState}
            onComment={setCommentTarget}
          />
        )}
        renderTopRightUI={() => (
          <CollabBar
            connectionStatus={isOffline ? "offline" : collabStatus}
            readOnlyRole={isReadOnlyShare ? shareRole : null}
            collaborators={collaborators}
            onOpenShare={() => setShareModalOpen(true)}
          >
            <button
              type="button"
              className="firo-collab-bar__btn"
              onClick={() => setActivityFeedOpen((open) => !open)}
              title="Activity history"
              aria-label="Activity history"
              data-testid="activity-feed-toggle"
              aria-expanded={activityFeedOpen}
              aria-haspopup="dialog"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                color: activityFeedOpen
                  ? "var(--firo-color-accent)"
                  : "inherit",
              }}
            >
              <ActivityIcon size={18} />
            </button>
            <SaveStatusIndicator
              collabStatus={isOffline ? "offline" : collabStatus}
              onClick={() => setVersionHistoryOpen(true)}
            />
            <FacilitatorBar />
          </CollabBar>
        )}
        onPointerDown={(_activeTool, pointerDownState) => {
          if (commentMode) {
            setCommentTarget({
              point: {
                x: pointerDownState.origin.x,
                y: pointerDownState.origin.y,
              },
            });
            setCommentMode(false);
          } else if (docBlockMode) {
            createDocBlockAt({
              x: pointerDownState.origin.x,
              y: pointerDownState.origin.y,
            });
            setDocBlockMode(false);
          } else {
            const now = Date.now();
            const last = lastCanvasClickRef.current;
            const isDouble = last && now - last.time < 350;
            lastCanvasClickRef.current = {
              time: now,
              x: pointerDownState.origin.x,
              y: pointerDownState.origin.y,
            };

            if (isDouble && excalidrawAPI) {
              const elements = excalidrawAPI.getSceneElements();
              const hit = elements.find(
                (el) =>
                  !el.isDeleted &&
                  ((el as any).recordId ||
                    el.customData?.recordId ||
                    el.customData?.isDocBlock) &&
                  pointerDownState.origin.x >= el.x &&
                  pointerDownState.origin.x <= el.x + el.width &&
                  pointerDownState.origin.y >= el.y &&
                  pointerDownState.origin.y <= el.y + el.height,
              );
              if (hit) {
                const recordId =
                  (hit.customData?.recordId as string | undefined) ||
                  ((hit as any).recordId as string | undefined);
                if (recordId) {
                  // An explicit click on the block always opens it.
                  dismissedDocBlockIdRef.current = null;
                  setActiveDocBlockId(recordId);
                }
              }
            }
          }
        }}
        onPointerUpdate={(payload) => {
          if (payload.pointer.tool === "laser") {
            collabProviderRef.current?.setLocalLaser(
              payload.pointer.x,
              payload.pointer.y,
            );
          } else {
            collabProviderRef.current?.setLocalCursor(
              payload.pointer.x,
              payload.pointer.y,
            );
          }
        }}
        viewportStatusFrame={viewportStatusFrame}
        onChange={onChange}
        onExport={onExport}
        initialData={initialStatePromiseRef.current.promise}
        isCollaborating={isCollaborating}
        mobileExtraTools={mobileExtraTools}
        viewModeEnabled={isReadOnlyShare}
        UIOptions={{
          canvasActions: {
            toggleTheme: true,
          },
        }}
        langCode={langCode}
        renderCustomStats={renderCustomStats}
        detectScroll={false}
        handleKeyboardGlobally={true}
        autoFocus={true}
        theme={editorTheme}
        onThemeChange={setAppTheme}
        onLinkOpen={(element, event) => {
          if (element.link && isElementLink(element.link)) {
            event.preventDefault();
            excalidrawAPI?.setViewport({
              target: element.link,
              fit: "scale-down",
              animation: true,
            });
          }
        }}
      >
        <AccessibilityLayer
          items={accessibilityItems}
          boardLabel={getActiveBoard()?.name}
          liveMessage={liveMessage}
        />
        <ProjectionView excalidrawAPI={excalidrawAPI} />
        {activeDocBlockId &&
          (() => {
            const doc = boardDoc();
            const firoRecord = doc
              .read()
              .records.find((r) => r.id === activeDocBlockId);
            if (!firoRecord) {
              return null;
            }
            const docBlockRecord = docBlockRecordFromFiroRecord(firoRecord);
            const currentElements = excalidrawAPI?.getSceneElements() ?? [];
            const projectionEl = currentElements.find(
              (el) =>
                !el.isDeleted &&
                (((el as any).recordId as string | undefined) ===
                  activeDocBlockId ||
                  el.customData?.recordId === activeDocBlockId),
            );
            const currentAppState = excalidrawAPI?.getAppState();
            const zoomVal = currentAppState?.zoom.value ?? 1;
            const scrollXVal = currentAppState?.scrollX ?? 0;
            const scrollYVal = currentAppState?.scrollY ?? 0;
            const layout = {
              x: projectionEl?.x ?? 0,
              y: projectionEl?.y ?? 0,
              width: projectionEl?.width ?? docBlockRecord.dimensions.width,
              height: projectionEl?.height ?? docBlockRecord.dimensions.height,
            };
            const fragment = (doc.rawYdoc ?? doc.ydoc).getXmlFragment(
              docBlockRecord.fragmentKey,
            );

            return (
              <DocBlockOverlay
                record={docBlockRecord}
                fragment={fragment}
                layout={layout}
                appState={{
                  zoom: { value: zoomVal },
                  scrollX: scrollXVal,
                  scrollY: scrollYVal,
                  offsetLeft: currentAppState?.offsetLeft,
                  offsetTop: currentAppState?.offsetTop,
                }}
                onCommit={handleCommitDocBlock}
                onDiscard={handleDiscardDocBlock}
                onChange={handleChangeDocBlock}
                onClose={handleCloseDocBlock}
              />
            );
          })()}
        <TagLayer
          excalidrawAPI={excalidrawAPI}
          onSelectTag={(tag) => {
            if (!excalidrawAPI) {
              return;
            }
            const elements = excalidrawAPI.getSceneElements();
            const matching = elements.filter(
              (el) => !el.isDeleted && el.tags?.includes(tag),
            );
            const selectedElementIds: Record<string, true> = {};
            for (const el of matching) {
              selectedElementIds[el.id] = true;
            }
            excalidrawAPI.updateScene({
              appState: { selectedElementIds },
            });
          }}
        />
        <CommentLayer
          excalidrawAPI={excalidrawAPI}
          composerTarget={commentTarget}
          onCloseComposer={() => setCommentTarget(null)}
        />
        <VoteBadges />
        <RemoteCursorLayer
          excalidrawAPI={excalidrawAPI}
          collaborators={collaborators}
        />
        <ConnectedShareModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          boardId={
            (boardDoc().read().meta?.id as string | undefined) ||
            getActiveBoard()?.id ||
            "default"
          }
          onSignIn={() => {
            setShareModalOpen(false);
            setAuthDialogOpen(true);
          }}
        />
        <AuthDialog
          isOpen={authDialogOpen}
          onClose={closeAuthDialog}
          onSignIn={(u, p) => syncSession.signIn(u, p)}
          onRegister={(u, p) => syncSession.register(u, p)}
        />
        <TimerSetupDialog
          isOpen={timerSetupOpen}
          onClose={() => setTimerSetupOpen(false)}
        />
        <EmojiPanel
          isOpen={emojiOpen && !isReadOnlyShare}
          onClose={() => {
            setEmojiOpen(false);
            emojiPickCount.current = 0;
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>(
                  '.firo-rail__item[aria-label="Emoji"]',
                )
                ?.focus(),
            );
          }}
          onPick={(emoji) => {
            if (!excalidrawAPI) {
              return;
            }
            // ADR-0036: visible canvas centre, 48px, cascading by 20px
            const center = viewportCenter(excalidrawAPI);
            // On phones the panel is a bottom sheet: centre the pick in the
            // part of the canvas it leaves visible.
            const panelTop = document
              .querySelector(".firo-emoji-panel")
              ?.getBoundingClientRect().top;
            if (window.innerWidth <= 600 && panelTop) {
              const st = excalidrawAPI.getAppState();
              center.y = (-st.scrollY + panelTop / 2) / st.zoom.value;
            }
            const offset = (emojiPickCount.current % 10) * 20;
            emojiPickCount.current += 1;
            excalidrawAPI.insertTextElement({
              sceneX: center.x + offset,
              sceneY: center.y + offset,
              text: emoji,
              fontSize: 48,
            });
          }}
        />
        <EmbedDialog
          isOpen={embedDialogOpen}
          onClose={() => setEmbedDialogOpen(false)}
          validateUrl={validateEmbedUrl}
          onAdd={(url) => {
            if (!excalidrawAPI) {
              return;
            }
            const center = viewportCenter(excalidrawAPI);
            const inserted = excalidrawAPI.insertEmbeddableElement({
              sceneX: center.x,
              sceneY: center.y,
              link: url,
            });
            if (!inserted) {
              return;
            }
            // Fit the new frame inside the visible canvas (keeping its aspect
            // ratio, never enlarging) and centre it on the viewport so it is
            // visible and selectable on small screens.
            const appState = excalidrawAPI.getAppState();
            const zoom = appState.zoom.value || 1;
            const maxW = (appState.width * 0.85) / zoom;
            const maxH = (appState.height * 0.6) / zoom;
            const scale = Math.min(
              1,
              maxW / inserted.width,
              maxH / inserted.height,
            );
            const w = inserted.width * scale;
            const h = inserted.height * scale;
            excalidrawAPI.updateScene({
              elements: excalidrawAPI.getSceneElements().map((el) =>
                el.id === inserted.id
                  ? {
                      ...el,
                      x: center.x - w / 2,
                      y: center.y - h / 2,
                      width: w,
                      height: h,
                    }
                  : el,
              ) as any,
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }}
        />
        <VotingPanel
          isOpen={votingPanelOpen}
          onClose={() => setVotingPanelOpen(false)}
          excalidrawAPI={excalidrawAPI}
        />
        <FramesPanel
          isOpen={framesPanelOpen}
          onClose={() => setFramesPanelOpen(false)}
          excalidrawAPI={excalidrawAPI}
        />
        <BulkStickyDialog
          isOpen={bulkStickyOpen}
          onClose={() => setBulkStickyOpen(false)}
          excalidrawAPI={excalidrawAPI}
        />
        <SaveTemplateDialog
          isOpen={saveTemplateOpen}
          onClose={() => setSaveTemplateOpen(false)}
          excalidrawAPI={excalidrawAPI}
        />
        <TemplateModal
          isOpen={templateModalOpen}
          onClose={() => setTemplateModalOpen(false)}
          excalidrawAPI={excalidrawAPI}
        />
        <ActivityFeed
          isOpen={activityFeedOpen}
          onClose={() => setActivityFeedOpen(false)}
          dialogRef={activityFeedDialogRef}
          entries={activities}
          onClear={async () => {
            const metaId = boardDoc().read().meta?.id;
            const currentBoardId =
              typeof metaId === "string" ? metaId : "default";
            await clearActivity(currentBoardId);
            setActivities([]);
          }}
          title="Board Activity"
        />
        <AppMainMenu
          isCollaborating={isCollaborating}
          theme={appTheme}
          refresh={handleMenuRefresh}
          onExport={handleMenuExport}
          onImport={handleMenuImport}
          onVersionHistory={handleMenuVersionHistory}
          syncUsername={
            syncState.status === "signedIn" ? syncState.user.username : null
          }
          onSignIn={
            syncState.status === "signedOut"
              ? () => setAuthDialogOpen(true)
              : undefined
          }
          onSignOut={
            syncState.status === "signedIn"
              ? () => void syncSession.signOut()
              : undefined
          }
        />
        <AppWelcomeScreen />
        <OverwriteConfirmDialog>
          <OverwriteConfirmDialog.Actions.ExportToImage />
          <OverwriteConfirmDialog.Actions.SaveToDisk />
        </OverwriteConfirmDialog>
        <AppFooter onChange={handleFooterChange} />

        {isCollaborating && isOffline && (
          <div className="alertalert--warning">
            {t("alerts.collabOfflineWarning")}
          </div>
        )}
        {localStorageQuotaExceeded && (
          <div className="alert alert--danger">
            {t("alerts.localStorageQuotaExceeded")}
          </div>
        )}
        {latestShareableLink && (
          <ShareableLinkDialog
            link={latestShareableLink}
            onCloseRequest={() => setLatestShareableLink(null)}
            setErrorMessage={setErrorMessage}
          />
        )}

        {errorMessage && (
          <ErrorDialog onClose={() => setErrorMessage("")}>
            {errorMessage}
          </ErrorDialog>
        )}

        <CommandPalette
          customCommandPaletteItems={[
            {
              label: t("labels.installPWA"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!pwaEvent,
              perform: () => {
                if (pwaEvent) {
                  pwaEvent.prompt();
                  pwaEvent.userChoice.then(() => {
                    // event cannot be reused, but we'll hopefully
                    // grab new one as the event should be fired again
                    pwaEvent = null;
                  });
                }
              },
            },
            /*
             * Reduced motion, toggled from the palette.
             *
             * The palette is "the accessibility backstop"
             * (trd/09): any function without a key of its own must be reachable
             * from it, and this one has none. The label states which way the
             * toggle will go rather than showing a checkmark the palette cannot
             * render.
             */
            {
              label: readReducedMotion()
                ? "Reduce motion: off"
                : "Reduce motion: on",
              category: DEFAULT_CATEGORIES.app,
              perform: () => {
                const next = !readReducedMotion();
                writeReducedMotion(next);
                applyReducedMotion(next);
              },
            },
            /*
             * The facilitator's commands, and they have to be listed here.
             *
             * A registered action does **not** reach the palette by itself:
             * `CommandPalette`'s `commandsFromActions` is a hand-written list of
             * `actionManager.actions.<name>`, so anything missing from it is
             * reachable only by its keyboard chord. That is an AC-8 failure for a
             * screen-reader user, and it is not hypothetical -- `exportFiroFile`
             * has been in the menu and absent from the palette for its whole life.
             *
             * These entries are derived from the same `Action` objects the chords
             * come from, so the palette entry and the keystroke cannot drift.
             */
            {
              // the highlighter is a freedraw preset; the palette is the phone
              // path since the rail is hidden there
              label: "Highlighter",
              category: DEFAULT_CATEGORIES.tools,
              predicate: () => !!excalidrawAPI && !isReadOnlyShare,
              perform: startHighlighterFromPalette,
            },
            {
              // Miro's sticky Stack, also the phone path (no rail there)
              label: "Sticky stack",
              category: DEFAULT_CATEGORIES.tools,
              predicate: () => !!excalidrawAPI && !isReadOnlyShare,
              perform: createStack,
            },
            {
              label: "Pen (your style)",
              category: DEFAULT_CATEGORIES.tools,
              predicate: () => !!excalidrawAPI && !isReadOnlyShare,
              perform: endHighlighterFromPalette,
            },
            {
              // ADR-0036 §1: the emoji flyout, also reachable on phone where
              // the rail is hidden
              label: "Emoji…",
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!excalidrawAPI && !isReadOnlyShare,
              perform: () => setEmojiOpen((open) => !open),
            },
            {
              // ADR-0036 §3: the in-app embed affordance
              label: "Add embed…",
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!excalidrawAPI,
              perform: () => setEmbedDialogOpen(true),
            },
            ...(excalidrawAPI
              ? facilitatorCommandPaletteItems(
                  excalidrawAPI,
                  boardDoc,
                  refreshBoard,
                )
              : []),
            ...(excalidrawAPI
              ? recordCommandPaletteItems(excalidrawAPI, boardDoc, refreshBoard)
              : []),
          ]}
        />
        {isVisualDebuggerEnabled() && excalidrawAPI && (
          <DebugCanvas
            appState={excalidrawAPI.getAppState()}
            scale={window.devicePixelRatio}
            ref={debugCanvasRef}
          />
        )}

        <ExportModal
          isOpen={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          defaultTab={exportModalTab}
          boardName={getActiveBoard()?.name || "board"}
          hasSelection={Boolean(
            excalidrawAPI &&
              Object.keys(excalidrawAPI.getAppState().selectedElementIds || {})
                .length > 0,
          )}
          frames={
            excalidrawAPI
              ?.getSceneElements()
              .filter((el) => el.type === "frame" && !el.isDeleted)
              .map((f) => ({ id: f.id, name: (f as any).name || "Frame" })) ||
            []
          }
          stickyNoteCount={
            excalidrawAPI
              ?.getSceneElements()
              .filter((el) => el.type === "stickynote" && !el.isDeleted)
              .length || 0
          }
          hasRecords={(boardDoc().read().records?.length ?? 0) > 0}
          onExportImage={handleExportImage}
          onCopyImage={handleCopyImage}
          onExportPdf={handleExportPdf}
          onExportArchive={handleExportArchive}
          onExportCsv={handleExportCsv}
          onExportExcalidraw={handleExportExcalidraw}
          onExportMiroScript={handleExportMiroScript}
          onExportBatchFrames={handleExportBatchFrames}
        />

        {importPendingFile && (
          <ImportModal
            isOpen={true}
            onClose={() => setImportPendingFile(null)}
            fileInfo={importPendingFile.info}
            onInsert={handleImportInsert}
            onReplace={handleImportReplace}
            onOpenNew={handleImportOpenNew}
          />
        )}

        <VersionHistoryModal
          isOpen={versionHistoryOpen}
          onClose={() => setVersionHistoryOpen(false)}
          boardId={
            (boardDoc().read().meta?.id as string | undefined) ||
            getActiveBoard()?.id ||
            "default"
          }
          doc={boardDoc()}
          collabStatus={isOffline ? "offline" : collabStatus}
          onRestore={() => {
            excalidrawAPI?.refresh();
          }}
        />

        <AIAssistantModal
          isOpen={aiModalOpen}
          onClose={() => setAiModalOpen(false)}
          doc={boardDoc()}
          selectedElements={
            excalidrawAPI
              ? (excalidrawAPI
                  .getSceneElements()
                  .filter(
                    (el) =>
                      !el.isDeleted &&
                      excalidrawAPI.getAppState().selectedElementIds[el.id],
                  ) as any)
              : []
          }
          onSuccess={() => {
            excalidrawAPI?.refresh();
          }}
        />
        <StickyNoteOptionsDialog
          isOpen={stickyOptionsOpen}
          onClose={() => setStickyOptionsOpen(false)}
          onOpenBulkSticky={() => setBulkStickyOpen(true)}
          onCreateStickyStack={createStack}
        />
      </Excalidraw>
    </div>
  );
};

const ExcalidrawApp = () => {
  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ExcalidrawAPIProvider>
          <ExcalidrawWrapper />
        </ExcalidrawAPIProvider>
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
