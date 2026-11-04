/**
 * The board thumbnail (Miro parity row 1: the board bar and the home cards
 * carry a rendered preview of the board).
 *
 * Captured from the live scene after edits settle — debounced, never per
 * change — and persisted onto the board's library meta, which the home cards
 * already render. A failed or empty capture leaves the placeholder and never
 * blocks editing, the same degradation rule as template thumbnails
 * ([ADR-0038](../../../docs/adr/0038-templates-are-content.md) section 3).
 */
import type { AppState, BinaryFiles } from "@firo/editor/types";
import type { OrderedExcalidrawElement } from "@firo/element/types";

import { getActiveBoard, putBoardMeta, setActiveBoard } from "./library";

/** The thumbnail's budget: at most 320px on the scene's long edge. */
const THUMBNAIL_LONG_EDGE = 320;

/**
 * Quiet time before a capture. Long enough that drawing a diagram does not
 * render a preview per stroke; short enough that leaving the board after a
 * pause still finds a fresh one.
 */
export const BOARD_THUMBNAIL_DEBOUNCE_MS = 15_000;

/** Emitted on window after a capture lands; detail: { boardId, thumbnail }. */
export const BOARD_THUMBNAIL_EVENT = "firo:board-thumbnail";

type ExportToCanvas = (
  opts: Record<string, unknown>,
) => Promise<HTMLCanvasElement | null>;

interface PendingCapture {
  boardId: string;
  elements: readonly OrderedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
  /** Injected by tests; production leaves it to the dynamic import. */
  exportToCanvasImpl?: ExportToCanvas;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: PendingCapture | null = null;
let pendingFingerprint = "";
let lastFingerprint = "";

/**
 * Cheap change fingerprint: the live count plus the version-nonce sum. A
 * collision only means one skipped refresh, never a wrong write, so the
 * cheap sum wins over walking every element's fields.
 */
const sceneFingerprint = (
  elements: readonly OrderedExcalidrawElement[],
): string => {
  let live = 0;
  let nonceSum = 0;
  for (const element of elements) {
    if (!element.isDeleted) {
      live += 1;
      nonceSum = (nonceSum + (element.versionNonce ?? 0)) % 0xffffffff;
    }
  }
  return `${live}:${nonceSum}`;
};

/**
 * Render the scene into a small data URL. `exportToCanvas` is imported on
 * first use, like the template dialog's capture, so the export stack stays
 * out of the board's initial chunk. Undefined for an empty scene or a failed
 * render; the caller treats both as "keep the placeholder".
 */
export const captureBoardThumbnail = async (
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
  exportToCanvasImpl?: ExportToCanvas,
): Promise<string | undefined> => {
  const live = elements.filter((element) => !element.isDeleted);
  if (live.length === 0) {
    return undefined;
  }
  const bounds = live.reduce(
    (acc, element) => ({
      minX: Math.min(acc.minX, element.x),
      minY: Math.min(acc.minY, element.y),
      maxX: Math.max(acc.maxX, element.x + element.width),
      maxY: Math.max(acc.maxY, element.y + element.height),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const longEdge = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
  );
  const exportToCanvas =
    exportToCanvasImpl ??
    ((await import("@firo/editor"))
      .exportToCanvas as unknown as ExportToCanvas);
  const canvas = await exportToCanvas({
    elements: live,
    appState: {
      ...appState,
      exportBackground: true,
      exportScale:
        longEdge > 0 ? Math.min(1, THUMBNAIL_LONG_EDGE / longEdge) : 1,
      exportEmbedScene: false,
    },
    files,
  });
  return canvas?.toDataURL("image/png");
};

/** Run the pending capture now, if there is one; the debounce and tests use it. */
export const flushBoardThumbnail = async (): Promise<void> => {
  const capture = pending;
  pending = null;
  if (!capture) {
    return;
  }
  const fingerprint = `${capture.boardId}:${sceneFingerprint(
    capture.elements,
  )}`;
  if (fingerprint === lastFingerprint) {
    return;
  }
  try {
    const hasLive = capture.elements.some((element) => !element.isDeleted);
    const thumbnail = hasLive
      ? await captureBoardThumbnail(
          capture.elements,
          capture.appState,
          capture.files,
          capture.exportToCanvasImpl,
        )
      : undefined;
    if (!thumbnail) {
      if (!hasLive) {
        /*
         * The scene was emptied: keeping the last render would show a board
         * that no longer exists. A failed render of a live scene keeps the
         * previous preview instead (the degradation rule above).
         */
        const meta = await putBoardMeta({
          id: capture.boardId,
          thumbnail: undefined,
        });
        lastFingerprint = fingerprint;
        const active = getActiveBoard();
        if (active && active.id === capture.boardId) {
          setActiveBoard(meta);
        }
        window.dispatchEvent(
          new CustomEvent(BOARD_THUMBNAIL_EVENT, {
            detail: { boardId: capture.boardId, thumbnail: undefined },
          }),
        );
      }
      return;
    }
    const meta = await putBoardMeta({ id: capture.boardId, thumbnail });
    lastFingerprint = fingerprint;
    // Keep the route-time cache in step, so the board bar re-reads the same
    // record the home will.
    const active = getActiveBoard();
    if (active && active.id === capture.boardId) {
      setActiveBoard(meta);
    }
    window.dispatchEvent(
      new CustomEvent(BOARD_THUMBNAIL_EVENT, {
        detail: { boardId: capture.boardId, thumbnail },
      }),
    );
  } catch {
    // A failed capture leaves the placeholder; editing is never blocked.
  }
};

/**
 * Debounce a capture from the editor's change stream. The latest *scene*
 * wins: the change stream also fires for selection, cursor and collaborator
 * churn that leaves the elements untouched - on a live board that churn is
 * effectively continuous, so resetting the wait on every event would starve
 * the capture. Only a call whose scene fingerprint differs re-arms the
 * debounce; identical churn keeps the running wait.
 */
export const scheduleBoardThumbnail = (
  boardId: string,
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
  exportToCanvasImpl?: ExportToCanvas,
): void => {
  const fingerprint = `${boardId}:${sceneFingerprint(elements)}`;
  if (fingerprint === lastFingerprint) {
    return;
  }
  if (
    pending &&
    pending.boardId === boardId &&
    fingerprint === pendingFingerprint
  ) {
    return;
  }
  pendingFingerprint = fingerprint;
  pending = { boardId, elements, appState, files, exportToCanvasImpl };
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = null;
    void flushBoardThumbnail();
  }, BOARD_THUMBNAIL_DEBOUNCE_MS);
};

/** Test hook: drop the debounce and the change fingerprint. */
export const resetBoardThumbnailForTests = (): void => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pending = null;
  pendingFingerprint = "";
  lastFingerprint = "";
};
