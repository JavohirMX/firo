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
  SelectedShapeActions,
  actionZoomIn,
  actionZoomOut,
  actionResetZoom,
  actionZoomToFit,
  actionToggleGridMode,
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
  ActivityIcon,
  ActivityFeed,
} from "@firo/ui";

import { trackEvent } from "@firo/editor/analytics";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@firo/editor/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@firo/editor/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@firo/editor/components/OverwriteConfirm/OverwriteConfirm";
import { openConfirmModal } from "@firo/editor/components/OverwriteConfirm/OverwriteConfirmState";
import { ShareableLinkDialog } from "@firo/editor/components/ShareableLinkDialog";
import Trans from "@firo/editor/components/Trans";
import {
  APP_NAME,
  EVENT,
  VERSION_TIMEOUT,
  capitalizeString,
  debounce,
  getVersion,
  getFrame,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  isDevEnv,
} from "@firo/common";
import polyfill from "@firo/editor/polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadFromBlob } from "@firo/editor/data/blob";
import { t } from "@firo/editor/i18n";

import { isElementLink } from "@firo/element";
import {
  getCommonBounds,
  getSelectedElements,
  showSelectedShapeActions,
} from "@firo/element";
import {
  bumpElementVersions,
  restoreAppState,
  restoreElements,
} from "@firo/editor/data/restore";
import { newElementWith } from "@firo/element";
import { isInitializedImageElement } from "@firo/element";
import clsx from "clsx";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@firo/editor/data/library";

import type { ActivityFeedItem } from "@firo/ui";

import type { RailToolItem, RailToolType } from "@firo/ui";

import type { RestoredDataState } from "@firo/editor/data/restore";
import type {
  FileId,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@firo/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
  ExcalidrawProps,
} from "@firo/editor/types";
import type { ResolutionType } from "@firo/common/utility-types";
import type { ResolvablePromise } from "@firo/common/utils";

import { clearActivity, listActivity } from "./board/activity";

import CustomStats from "./CustomStats";
import { Provider, useAtomValue, appJotaiStore } from "./app-jotai";
import { STORAGE_KEYS, SYNC_BROWSER_TABS_TIMEOUT } from "./app_constants";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { FacilitatorBar } from "./components/FacilitatorBar";
import { SaveStatusIndicator } from "./components/SaveStatusIndicator";
import { ProjectionView } from "./components/ProjectionView";
import { CommentLayer } from "./components/CommentLayer";
import { TagLayer } from "./components/TagLayer";
import { RemoteCursorLayer } from "./components/RemoteCursorLayer";
import { CollabBar, type ConnectionStatus } from "./components/CollabBar";
import { ShareModal } from "./components/ShareModal";
import {
  CollabProvider,
  resolveShareToken,
  type CollaboratorInfo,
} from "./board/collabProvider";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import { Minimap } from "./components/Minimap";

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

import { facilitatorCommandPaletteItems } from "./board/facilitatorActions";
import { recordCommandPaletteItems } from "./board/recordActions";
import { getActiveBoard } from "./board/library";
import { isMinimapShortcut } from "./board/chromeShortcuts";
import {
  readRailLayout,
  reorderRailTools,
  restoreRailTool,
  unpinRailTool,
  writeRailLayout,
} from "./board/railLayout";
import { homeUrl } from "./board/routes";

import "./index.scss";

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
]);

export const WebCreationRail = ({ appState }: { appState: UIAppState }) => {
  const app = useApp();
  const actionManager = useExcalidrawActionManager();
  const activeToolType = appState.activeTool.type as RailToolType;

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
    const label = capitalizeString(t(`toolBar.${id}`));
    const shortcut = getToolShortcut(id);
    return {
      id,
      icon: RAIL_TOOL_ICONS[id],
      label: shortcut ? `${label} (${shortcut})` : label,
    };
  };

  const tools: RailToolItem[] = [
    pointerItem,
    ...layout.order.filter((id) => id in TOOLS).map(buildRailTool),
  ];
  const hiddenTools: RailToolItem[] = layout.unpinned
    .filter((id) => id in TOOLS)
    .map(buildRailTool);

  return (
    <CreationRail
      tools={tools}
      hiddenTools={hiddenTools}
      activeTool={activeToolType}
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

        const now = Date.now();
        const lastClick = lastClickRef.current;
        const isDoubleClick =
          lastClick?.tool === tool && now - lastClick.time < 350;
        lastClickRef.current = { tool, time: now };

        const isShift = Boolean(event?.shiftKey) || isShiftPressedRef.current;
        isShiftPressedRef.current = false;

        trackEvent("toolbar", tool, "ui");

        if (CREATION_TOOLS.has(tool)) {
          // Double-clicking or shift-clicking locks the tool for continuous creation;
          // single-clicking defaults to Miro-style one-time placement reverting to selection.
          const locked = isDoubleClick || isShift;
          app.setActiveTool({ type: tool as any, locked });
        } else if (app.state.activeTool.type !== tool) {
          app.setActiveTool({ type: tool as any });
        }
      }}
      onPointerDownTool={(tool, event) => {
        isShiftPressedRef.current = event.shiftKey;
        app.toolDrag.handleButtonPointerDown(tool as any, event.nativeEvent);
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
  const actionManager = useExcalidrawActionManager();
  const zoomValue = useExcalidrawStateValue((state) => state.zoom.value) ?? 1;

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
        minimapEnabled={minimapVisible}
        isMinimapOpen={minimapVisible}
        onToggleMinimap={onToggleMinimap}
      />
    </div>
  );
};

const WebBoardMenu = () => {
  const setAppState = useExcalidrawSetAppState();
  return (
    <BoardMenu
      boardName={getActiveBoard()?.name ?? "Untitled"}
      onOpenHome={() => {
        window.location.assign(homeUrl());
      }}
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
const WebSelectionToolbar = ({
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
          id: "tags",
          label: "Tags",
          icon: <TagIcon />,
          pressed: tagEditorOpen,
          onClick: () => setTagEditorOpen((open) => !open),
        },
        {
          id: "duplicate",
          label: "Duplicate",
          icon: <DuplicateIcon />,
          onClick: () => run(actionManager.actions.duplicateSelection),
        },
        {
          id: "lock",
          label: allLocked ? "Unlock" : "Lock",
          icon: allLocked ? <UnlockIcon /> : <LockIcon />,
          pressed: allLocked,
          onClick: () => run(actionManager.actions.toggleElementLock),
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
  const [commentTarget, setCommentTarget] = useState<string | null>(null);
  const [minimapVisible, setMinimapVisible] = useState(false);
  const [activityFeedOpen, setActivityFeedOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);

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

      if (shareToken && (!boardId || boardId === "default")) {
        const resolved = await resolveShareToken(shareToken);
        if (resolved?.boardId) {
          boardId = resolved.boardId;
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

      if (isInitialLoad) {
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
        // on fresh load, clear unused files from IDB (from previous
        // session)
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

    if (appState.activeTool?.type) {
      collabProviderRef.current?.setLocalTool(appState.activeTool.type);
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
      })}
    >
      <Excalidraw
        defaultChromeEnabled={false}
        renderCreationRailUI={(_isMobile, appState) => (
          <WebCreationRail appState={appState} />
        )}
        renderNavigationUI={(_isMobile, appState) => (
          <WebNavToolbar
            appState={appState}
            minimapVisible={minimapVisible}
            onToggleMinimap={() => setMinimapVisible((v) => !v)}
          />
        )}
        renderBoardMenuUI={() => <WebBoardMenu />}
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
            <SaveStatusIndicator />
            <FacilitatorBar />
          </CollabBar>
        )}
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
        <ProjectionView excalidrawAPI={excalidrawAPI} />
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
        <RemoteCursorLayer
          excalidrawAPI={excalidrawAPI}
          collaborators={collaborators}
        />
        <ShareModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
        />
        <ActivityFeed
          isOpen={activityFeedOpen}
          onClose={() => setActivityFeedOpen(false)}
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
          refresh={() => forceRefresh((prev) => !prev)}
        />
        <AppWelcomeScreen />
        <OverwriteConfirmDialog>
          <OverwriteConfirmDialog.Actions.ExportToImage />
          <OverwriteConfirmDialog.Actions.SaveToDisk />
        </OverwriteConfirmDialog>
        <AppFooter onChange={() => excalidrawAPI?.refresh()} />

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
