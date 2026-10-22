import { CaptureUpdateAction } from "@firo/element";

import { register } from "./register";

import type { AppState } from "../types";

/**
 * The canvas lane's creation rows (ADR-0033). They act at the context menu's
 * anchor rather than at the pointer or the viewport centre. The menu hands
 * the anchor over as the action's form data — it clears `contextMenu`
 * before the action runs — and only these actions receive it, so the other
 * rows' form data stays untouched.
 */
export const CONTEXT_MENU_ANCHOR_ACTIONS: ReadonlySet<string> = new Set([
  "addTextAtAnchor",
  "addStickyNoteAtAnchor",
  "addCommentAtAnchor",
]);

type Anchor = { x: number; y: number };

const resolveAnchor = (
  formData: unknown,
  appState: Readonly<AppState>,
): Anchor | null => {
  if (
    formData &&
    typeof (formData as Anchor).x === "number" &&
    typeof (formData as Anchor).y === "number"
  ) {
    return formData as Anchor;
  }
  const menu = appState.contextMenu;
  return menu ? { x: menu.anchorX, y: menu.anchorY } : null;
};

export const actionAddTextAtAnchor = register({
  name: "addTextAtAnchor",
  label: "labels.addTextAtAnchor",
  keywords: ["text", "create", "insert"],
  viewMode: false,
  trackEvent: { category: "canvas" },
  perform: (elements, appState, formData, app) => {
    const anchor = resolveAnchor(formData, appState);
    if (!anchor) {
      return false;
    }
    // the text tool's free-creation path: a text element at the point,
    // in edit mode
    app.text.startTextEditing({
      sceneX: anchor.x,
      sceneY: anchor.y,
      container: null,
      textElement: null,
      insertAtParentCenter: false,
      autoEdit: false,
    });
    return {
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

export const actionAddStickyNoteAtAnchor = register({
  name: "addStickyNoteAtAnchor",
  label: "labels.addStickyNoteAtAnchor",
  keywords: ["sticky", "note", "create", "insert"],
  viewMode: false,
  trackEvent: { category: "canvas" },
  perform: (elements, appState, formData, app) => {
    const anchor = resolveAnchor(formData, appState);
    if (!anchor) {
      return false;
    }
    app.miroSticky.createStickyNoteAt(anchor.x, anchor.y);
    return {
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

export const actionAddCommentAtAnchor = register({
  name: "addCommentAtAnchor",
  label: "labels.addCommentAtAnchor",
  keywords: ["comment", "pin", "create", "insert"],
  viewMode: false,
  trackEvent: { category: "canvas" },
  predicate: (elements, appState, appProps) =>
    typeof appProps.onAddCommentAtPoint === "function",
  perform: (elements, appState, formData, app) => {
    const anchor = resolveAnchor(formData, appState);
    if (!anchor) {
      return false;
    }
    // the host owns the composer; the editor only hands over the anchor
    app.props.onAddCommentAtPoint?.(anchor);
    return false;
  },
});

export const actionToggleSelectionDimensions = register({
  name: "toggleSelectionDimensions",
  label: "labels.toggleSelectionDimensions",
  keywords: ["dimensions", "size", "selection", "measure"],
  viewMode: true,
  trackEvent: {
    category: "canvas",
    predicate: (appState) => !appState.showSelectionDimensions,
  },
  perform: (elements, appState) => ({
    appState: {
      ...appState,
      showSelectionDimensions: !appState.showSelectionDimensions,
    },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  }),
  checked: (appState) => appState.showSelectionDimensions,
});
