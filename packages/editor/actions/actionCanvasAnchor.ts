import { KEYS } from "@firo/common";
import { CaptureUpdateAction } from "@firo/element";

import { getSelectedElements } from "../scene";

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
    typeof appProps.onAddComment === "function",
  perform: (elements, appState, formData, app) => {
    const anchor = resolveAnchor(formData, appState);
    if (!anchor) {
      return false;
    }
    // the host owns the composer; the editor only hands over the anchor
    app.props.onAddComment?.({ point: anchor });
    return false;
  },
});

export const actionAddCommentOnElement = register({
  name: "addCommentOnElement",
  label: "labels.addCommentAtAnchor",
  keywords: ["comment", "pin", "create", "insert"],
  viewMode: false,
  trackEvent: { category: "element" },
  // a thread anchors to one element — the quick lane's rule (ADR-0033)
  predicate: (elements, appState, appProps) =>
    typeof appProps.onAddComment === "function" &&
    getSelectedElements(elements, appState).length === 1,
  perform: (elements, appState, _formData, app) => {
    const selected = getSelectedElements(elements, appState);
    if (selected.length !== 1) {
      return false;
    }
    app.props.onAddComment?.({ elementId: selected[0].id });
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

/**
 * The object lane's keyboard trigger (ADR-0033): `⌘ + Enter` opens the lane
 * for the current selection, anchored at the selection's top-left corner in
 * screen coordinates. With nothing selected it does nothing; while text is
 * being edited the editor's own binding wins, so the sticky quick-add keeps
 * working — the two uses are mode-scoped.
 */
export const actionOpenSelectionContextMenu = register({
  name: "openSelectionContextMenu",
  label: "labels.openContextMenu",
  keywords: ["context", "menu", "selection"],
  viewMode: false,
  trackEvent: { category: "element" },
  predicate: (elements, appState) =>
    getSelectedElements(elements, appState).length > 0,
  perform: (elements, appState, _formData, app) => {
    app.openSelectionContextMenu();
    return false;
  },
  keyTest: (event, appState, elements) =>
    event[KEYS.CTRL_OR_CMD] &&
    event.key === KEYS.ENTER &&
    !event.shiftKey &&
    !event.altKey &&
    !appState.editingTextElement &&
    getSelectedElements(elements, appState).length > 0,
});
