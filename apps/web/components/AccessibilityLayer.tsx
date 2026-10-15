import React from "react";

import { useExcalidrawAPI, useExcalidrawStateValue } from "@firo/editor";
import { AccessibilityTree } from "@firo/ui";

import type { AccessibilityTreeItem } from "@firo/ui";

/**
 * The board's accessibility tree, wired to the editor.
 *
 * The tree itself is `@firo/ui`'s (`AccessibilityTree`); this layer is the part
 * that knows about the editor: it reads the selection, and it turns an element
 * id back into a canvas selection.
 *
 * ## Why focusing an element selects it
 *
 * The tree is clipped to an off-screen pixel
 * (`packages/ui/src/components/AccessibilityTree.scss`), so a focused node
 * paints no visible focus ring of its own. Focusing therefore *selects* the
 * element, and the canvas draws its selection outline — which is the visible
 * focus indicator [`docs/trd/09-accessibility.md`](../../docs/trd/09-accessibility.md)
 * requires. Movement stays visible as well as announced.
 */
export const AccessibilityLayer: React.FC<{
  items: readonly AccessibilityTreeItem[];
  boardLabel?: string;
}> = ({ items, boardLabel }) => {
  const excalidrawAPI = useExcalidrawAPI();
  const selectedElementIds =
    useExcalidrawStateValue((state) => state.selectedElementIds) ?? {};

  /*
   * The element being text-edited, if any.
   *
   * Opening the text editor clears `selectedElementIds`, so keying "current"
   * on selection alone would make the tree report *nothing* as current while
   * the user is typing into a note. The editor's `editingTextElement` is the
   * bound *label*, whose container is the element the user is actually
   * working on — the same id the tree lists.
   */
  const editingId = useExcalidrawStateValue((state) => {
    const editing = state.editingTextElement;
    if (!editing) {
      return null;
    }
    return editing.containerId ?? editing.id;
  });

  const selectedId = editingId ?? Object.keys(selectedElementIds)[0] ?? null;

  const select = React.useCallback(
    (id: string) => {
      excalidrawAPI?.updateScene({
        appState: { selectedElementIds: { [id]: true } },
      });
    },
    [excalidrawAPI],
  );

  const clearSelection = React.useCallback(() => {
    excalidrawAPI?.updateScene({ appState: { selectedElementIds: {} } });
  }, [excalidrawAPI]);

  return (
    <AccessibilityTree
      items={items}
      boardLabel={boardLabel}
      selectedId={selectedId}
      onActivate={select}
      onFocusElement={select}
      onEscape={clearSelection}
    />
  );
};
