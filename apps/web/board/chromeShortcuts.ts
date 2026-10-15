import { isWritableElement } from "@firo/common";

/**
 * Keyboard for the chrome the host owns.
 *
 * ## Why this is not in the editor's shortcut registry
 *
 * The editor owns the canvas, so it owns the keys for canvas commands: every
 * tool letter in `packages/editor/components/Tools.tsx` and every chord on an
 * action in `packages/editor/actions/`. The minimap is not a canvas concept —
 * `apps/web/components/Minimap.tsx` draws it, `App.tsx` holds its
 * `minimapVisible` state, and the editor is never told it exists. Putting `M`
 * in the editor registry would mean teaching `@firo/editor` about a host
 * component, which is the coupling [ADR-0022](../../../docs/adr/0022-ui-package-owns-the-chrome.md)
 * exists to avoid.
 *
 * So the host owns its own chrome keys, and there is still one registry per
 * owner: one for tools, one for actions, and this one. It holds a single key.
 *
 * ## The guard
 *
 * `isWritableElement` is the editor's own predicate — `App.tsx` bails on it
 * before dispatching any action. Reusing it here is what stops a bare `m` typed
 * into a comment composer, a board title or a record cell from toggling the
 * map. Anything weaker and the shortcut would fire from inside text editing.
 *
 * ## `event.code`, not `event.key`
 *
 * The physical key, not the produced character: on a non-Latin layout the key
 * Miro puts minimap on is still the same key. This is the one deliberate
 * asymmetry — tool letters stay on `event.key` so they follow the layout's
 * letters, while chrome keys follow the position.
 */
export const isMinimapShortcut = (event: KeyboardEvent): boolean => {
  if (event.code !== "KeyM") {
    return false;
  }
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }
  if (event.repeat) {
    return false;
  }
  return !isWritableElement(event.target);
};
