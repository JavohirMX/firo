/**
 * Asking the React shell to open a dialog, from code that is not React.
 *
 * ## Why this exists
 *
 * Registered actions are created in `board.ts`, which runs outside the
 * component tree, so an action's `perform` cannot call a `setState` it does
 * not have. The alternatives are worse: a DOM `CustomEvent` is invisible to
 * the type system and to tests, and routing through `appState.openDialog`
 * would teach the editor about Firo's dialogs, which is the wrong direction
 * for the fork's layering.
 *
 * So this is the smallest possible bridge: a named request, a subscribe, an
 * unsubscribe. The action publishes; `App.tsx` subscribes once and turns the
 * request into ordinary React state. Nothing here knows what a dialog looks
 * like, and nothing in a dialog knows the request existed.
 *
 * ## Why names and not callbacks
 *
 * If the action held the opener as a closure, the action list — which is
 * rebuilt on every registration — would capture a stale one. A name is looked
 * up against the *current* subscribers at fire time, so a re-render can never
 * strand a dialog behind a dead reference.
 */

/** The dialogs an action can ask the shell to open. Closed union, on purpose. */
export type UiDialogRequest = "timerSetup" | "bulkStickyNotes" | "votingPanel";

type Listener = (request: UiDialogRequest) => void;

const listeners = new Set<Listener>();

/** Ask the shell to open a dialog. A no-op when the shell is not mounted. */
export const requestDialog = (request: UiDialogRequest): void => {
  for (const listener of listeners) {
    listener(request);
  }
};

/**
 * Listen for dialog requests. Returns the unsubscribe; the shell's effect
 * cleanup calls it, so an unmounted app can never be asked to open anything.
 */
export const subscribeToDialogRequests = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
