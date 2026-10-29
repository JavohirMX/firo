import { KEYS } from "@firo/common";

/**
 * The eye dropper's key chords, shared by the binding (App's keydown) and the
 * tests that keep the cheat sheet's `eyeDropper` registry entry honest. The
 * printable view lives in `actions/shortcuts.ts` — two views of one entry.
 */
type KeyEventLike = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

/** `Shift+S` picks a stroke color from the canvas. */
export const isEyeDropperStrokeKey = (event: KeyEventLike): boolean =>
  event.key.toLocaleLowerCase() === KEYS.S &&
  event.shiftKey &&
  !event[KEYS.CTRL_OR_CMD];

/** `I` or `Shift+G` picks a background color from the canvas. */
export const isEyeDropperBackgroundKey = (event: KeyEventLike): boolean =>
  event.key === KEYS.I ||
  (event.key.toLocaleLowerCase() === KEYS.G && event.shiftKey);
