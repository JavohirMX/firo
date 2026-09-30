// Time constants (ms)
export const SAVE_TO_LOCAL_STORAGE_TIMEOUT = 300;
export const INITIAL_SCENE_UPDATE_TIMEOUT = 5000;
export const FILE_UPLOAD_TIMEOUT = 300;
export const LOAD_IMAGES_TIMEOUT = 500;
export const DELETED_ELEMENT_TIMEOUT = 24 * 60 * 60 * 1000; // 1 day
// Multi-tab sync is localStorage events, not the Socket.IO server that used to
// need a 30 fps cursor cadence. Kept because it is still used.
export const SYNC_BROWSER_TABS_TIMEOUT = 50;

// should be aligned with MAX_ALLOWED_FILE_BYTES
export const FILE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024; // 4 MiB
// 1 year (https://stackoverflow.com/a/25201898/927631)
export const FILE_CACHE_MAX_AGE_SEC = 31536000;

/**
 * Where a board lives in the browser.
 *
 * These keys were renamed from `excalidraw*` to `firo*` in Phase 0. There was
 * no data to preserve — Firo has never shipped — so no migration is needed. If
 * that ever changes, a rename needs a read-old-key/write-new-key step here, and
 * the old key retained long enough to be read once.
 *
 * `__LEGACY_LOCAL_STORAGE_LIBRARY` is the exception and is deliberately *not*
 * renamed: it exists only so a pre-rename library can be read and migrated once.
 */
export const STORAGE_KEYS = {
  LOCAL_STORAGE_ELEMENTS: "firo",
  LOCAL_STORAGE_APP_STATE: "firo-state",
  LOCAL_STORAGE_COLLAB: "firo-collab",
  LOCAL_STORAGE_THEME: "firo-theme",
  LOCAL_STORAGE_DEBUG: "firo-debug",
  VERSION_DATA_STATE: "version-dataState",
  VERSION_FILES: "version-files",

  IDB_LIBRARY: "firo-library",

  // do not use apart from migrations
  __LEGACY_LOCAL_STORAGE_LIBRARY: "excalidraw-library",
} as const;

/**
 * Removed in Phase 0, and listed here so their absence is a decision rather
 * than an oversight.
 *
 * - `COOKIES.AUTH_STATE_COOKIE` and the `isExcalidrawPlusSignedUser` flag read
 *   it. It identified a signed-in Excalidraw+ user, a paid service Firo does not
 *   have. Accounts arrive in v2 with the self-hosted server (ADR-0008).
 * - `WS_EVENTS` and `WS_SUBTYPES` described the Socket.IO collaboration
 *   protocol. Replaced by Yjs in v2 (ADR-0002).
 * - `FIREBASE_STORAGE_PREFIXES` were the share-link and collab asset prefixes.
 *   Firebase is gone; assets move to content-addressed files on the v2 server's
 *   disk (docs/trd/08-server-and-auth.md).
 * - `CURSOR_SYNC_TIMEOUT` (33 ms, ~30 fps) and `SYNC_FULL_SCENE_INTERVAL_MS`
 *   were the collab cursor and scene-sync cadences. `SYNC_BROWSER_TABS_TIMEOUT`
 *   is a similar name but is *not* in this list: it is localStorage tab sync
 *   and is still used.
 * - `IDB_TTD_CHATS` stored the text-to-diagram AI chat history, removed with
 *   the AI feature (ADR-0012).
 */
