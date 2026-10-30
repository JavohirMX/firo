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
/**
 * How long the accessibility tree waits before rebuilding.
 *
 * [`docs/trd/09-accessibility.md`](../../docs/trd/09-accessibility.md) says the
 * tree is "rebuilt on document change, debounced to ~200 ms. Not per frame." A
 * 10,000-element board re-announced on every drag frame would be unusable with
 * a screen reader, so this is a correctness parameter, not a tuning knob.
 */
export const ACCESSIBILITY_TREE_DEBOUNCE_MS = 200;

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
  // The rail's arrangement. A per-user UI preference like the theme, so it
  // belongs here rather than in the IndexedDB store that holds boards (ADR-0005
  // rejected `localStorage` for *board payloads* on size and sync cost; a few
  // dozen tool ids are neither large nor on a hot path).
  LOCAL_STORAGE_RAIL_LAYOUT: "firo-rail-layout",
  // The board home's view mode and sort order: the same kind of per-user chrome
  // preference as the rail layout above, and the same reasoning applies.
  LOCAL_STORAGE_HOME_VIEW: "firo-home-view",
  // Reduced motion, per session. Deliberately *session* storage, not local:
  // trd/09 asks for a setting that does not follow the user between sessions
  // the way an OS preference would.
  SESSION_REDUCED_MOTION: "firo-reduced-motion",
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
