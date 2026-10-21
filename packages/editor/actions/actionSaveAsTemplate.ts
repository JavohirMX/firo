import { getSelectedElements } from "../scene";

import { register } from "./register";

/**
 * Save the current selection as a template.
 *
 * The editor owns the menu row ([`ADR-0033`] recorded its measured position
 * in the object lane); the host owns everything else — the dialog, the
 * store, the gallery — because templates are host content, not editor state
 * ([`ADR-0038`]). So this action is a hand-off, in the shape the fork
 * already uses for host-supplied behaviour (`generateLinkForSelection`):
 * the action exists in the editor, and it appears only when the host passed
 * `onSaveSelectionAsTemplate`. Without the prop there is no store to save
 * into, and a menu row that cannot work is worse than no row.
 *
 * [`ADR-0033`]: ../../../docs/adr/0033-the-two-context-menu-lanes.md
 * [`ADR-0038`]: ../../../docs/adr/0038-templates-are-content.md
 */
export const actionSaveSelectionAsTemplate = register({
  name: "saveSelectionAsTemplate",
  label: "labels.saveSelectionAsTemplate",
  trackEvent: { category: "element" },
  predicate: (elements, appState, appProps) => {
    if (typeof appProps.onSaveSelectionAsTemplate !== "function") {
      return false;
    }
    if (appState.viewModeEnabled) {
      return false;
    }
    return getSelectedElements(elements, appState).length > 0;
  },
  perform: (_elements, _appState, _value, app) => {
    app.props.onSaveSelectionAsTemplate?.();
    // The dialog changes no editor state; the save itself touches no
    // document, no history and no undo step (ADR-0038 §4).
    return false;
  },
});
