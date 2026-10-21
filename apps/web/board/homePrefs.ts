/**
 * The board home's view preferences: grid vs list, and the sort order.
 *
 * They are chrome preferences, not library data, so they live in localStorage
 * beside the rail layout (`STORAGE_KEYS.LOCAL_STORAGE_HOME_VIEW`), not in the
 * IndexedDB board store. Read once when the home mounts and written on every
 * change, so the home comes back the way the person left it.
 */

import { STORAGE_KEYS } from "../app_constants";

export interface HomePrefs {
  viewMode: "grid" | "list";
  sortBy: "lastOpened" | "created" | "name";
}

const DEFAULT_HOME_PREFS: HomePrefs = {
  viewMode: "grid",
  sortBy: "lastOpened",
};

/** The stored prefs, tolerating anything unreadable as the defaults. */
export const readHomePrefs = (): HomePrefs => {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_HOME_VIEW);
  } catch {
    return DEFAULT_HOME_PREFS;
  }
  if (!raw) {
    return DEFAULT_HOME_PREFS;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_HOME_PREFS;
    }
    const { viewMode, sortBy } = parsed as Record<string, unknown>;
    return {
      viewMode: viewMode === "list" ? "list" : "grid",
      sortBy: sortBy === "created" || sortBy === "name" ? sortBy : "lastOpened",
    };
  } catch {
    return DEFAULT_HOME_PREFS;
  }
};

/**
 * Persist a change. A blocked write (private mode, quota) loses the preference
 * but never the home, so it is swallowed rather than reported.
 */
export const writeHomePrefs = (prefs: HomePrefs): void => {
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_HOME_VIEW,
      JSON.stringify(prefs),
    );
  } catch {
    // See the comment above: a preference is not worth an error.
  }
};
