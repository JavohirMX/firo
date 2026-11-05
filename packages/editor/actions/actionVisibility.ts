import type { ExcalidrawElement } from "@firo/element/types";

import { getSelectedElements } from "../scene";

import { register } from "./register";

import type { UIAppState } from "../types";

type VisibilityFlag = "hiddenUntilRevealed" | "hideInPresentation";

const allFlagged = (
  flag: VisibilityFlag,
  elements: readonly ExcalidrawElement[],
  state: Readonly<UIAppState>,
): boolean => {
  const selected = getSelectedElements(elements, state);
  return (
    selected.length > 0 &&
    selected.every((element) => element.customData?.[`firo.${flag}`] === true)
  );
};

const makeVisibilityAction = (
  name: "toggleHiddenUntilRevealed" | "toggleHideInPresentation",
  flag: VisibilityFlag,
  label: "labels.hideUntilReveal" | "labels.hideInPresentation",
) =>
  register({
    name,
    label,
    viewMode: false,
    trackEvent: { category: "element" },
    predicate: (elements, state, props) =>
      !state.viewModeEnabled &&
      !!props.onSetElementVisibility &&
      getSelectedElements(elements, state).length > 0,
    checked: (state, elements = []) => allFlagged(flag, elements, state),
    perform: (elements, state, _data, app) => {
      // Predicates are menu filters, not an execution boundary. Direct calls
      // must refuse read-only state and absent host capability too.
      if (state.viewModeEnabled || !app.props.onSetElementVisibility) {
        return false;
      }
      const selected = getSelectedElements(elements, state);
      if (selected.length) {
        app.props.onSetElementVisibility(
          selected.map((element) => element.id),
          flag,
          !allFlagged(flag, elements, state),
        );
      }
      // The host mutates the document and pulls the editor projection. Editing
      // customData here would be ignored by BoardSync's editor-owned diff.
      return false;
    },
  });

export const actionToggleHiddenUntilRevealed = makeVisibilityAction(
  "toggleHiddenUntilRevealed",
  "hiddenUntilRevealed",
  "labels.hideUntilReveal",
);
export const actionToggleHideInPresentation = makeVisibilityAction(
  "toggleHideInPresentation",
  "hideInPresentation",
  "labels.hideInPresentation",
);
