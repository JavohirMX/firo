import { STORAGE_KEYS } from "../app_constants";

/**
 * Reduced motion, as a per-session setting.
 *
 * ## Why a setting and not just the media query
 *
 * `docs/trd/09-accessibility.md` is explicit: "A **setting**, not only a
 * `prefers-reduced-motion` media query. Users need it per-session, not per-OS."
 * Someone may want the chrome to sit still for one presentation without
 * changing an OS preference that follows them onto every other application.
 *
 * ## Why `sessionStorage` and not `localStorage`
 *
 * The requirement is *per session*, and `sessionStorage` is exactly that: it
 * survives a reload within the tab and is gone when the tab closes. Persisting
 * it would turn a per-session preference into a per-machine one, which is the
 * behaviour the TRD tells us not to build.
 *
 * ## Where the effect lives
 *
 * This module owns the preference and the class name; the class itself is
 * styled in `@firo/ui`'s `theme.scss`, beside the media query it mirrors. The
 * host applies it to the document element, because the app owns the document
 * and `@firo/ui` deliberately does not reach for one.
 */

/** The class that collapses motion, defined in `@firo/ui`'s `theme.scss`. */
export const REDUCED_MOTION_CLASS = "firo-reduced-motion";

/**
 * Read the setting. Never throws — storage can be unavailable (private mode, a
 * blocked origin), and a preference that cannot be read is not an error worth
 * failing a render over.
 */
export const readReducedMotion = (): boolean => {
  try {
    return (
      window.sessionStorage.getItem(STORAGE_KEYS.SESSION_REDUCED_MOTION) === "1"
    );
  } catch {
    return false;
  }
};

/** Persist the setting for the rest of the session. */
export const writeReducedMotion = (enabled: boolean): void => {
  try {
    if (enabled) {
      window.sessionStorage.setItem(STORAGE_KEYS.SESSION_REDUCED_MOTION, "1");
    } else {
      window.sessionStorage.removeItem(STORAGE_KEYS.SESSION_REDUCED_MOTION);
    }
  } catch {
    // Deliberately silent: the class is already applied for this session.
  }
};

/**
 * Apply the setting to a document. The root is a parameter so it can be tested
 * against a jsdom document without touching the global one.
 */
export const applyReducedMotion = (
  enabled: boolean,
  root: Document = document,
): void => {
  root.documentElement.classList.toggle(REDUCED_MOTION_CLASS, enabled);
};
