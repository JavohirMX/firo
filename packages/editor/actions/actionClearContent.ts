import { arrayToMap } from "@firo/common";

import {
  CaptureUpdateAction,
  getBoundTextElement,
  newElementWith,
} from "@firo/element";

import type { ExcalidrawElement } from "@firo/element/types";

import { register } from "./register";

/**
 * Miro's object menu has "Clear content": the object stays, its text goes.
 * For a sticky, shape or labelled arrow the text is a bound text element, so
 * clearing removes that element and releases it from its container. A
 * standalone text element has no container to keep, so Delete is its action
 * and this one does not apply to it.
 */
const getClearable = (
  elements: readonly ExcalidrawElement[],
  selected: readonly ExcalidrawElement[],
) => {
  const elementsMap = arrayToMap(elements);
  const pairs: { container: ExcalidrawElement; text: ExcalidrawElement }[] = [];
  for (const container of selected) {
    if (container.type === "text" || container.locked) {
      continue;
    }
    const text = getBoundTextElement(container, elementsMap);
    if (text && !text.isDeleted) {
      pairs.push({ container, text });
    }
  }
  return pairs;
};

export const actionClearContent = register({
  name: "clearContent",
  label: "labels.clearContent",
  trackEvent: { category: "element" },
  viewMode: false,
  predicate: (elements, appState, _, app) =>
    getClearable(
      elements,
      app.scene.getSelectedElements({
        selectedElementIds: appState.selectedElementIds,
        includeBoundTextElement: false,
      }),
    ).length > 0,
  perform: (elements, appState, _, app) => {
    const pairs = getClearable(
      elements,
      app.scene.getSelectedElements({
        selectedElementIds: appState.selectedElementIds,
        includeBoundTextElement: false,
      }),
    );
    if (!pairs.length) {
      return false;
    }
    const textIds = new Set(pairs.map((p) => p.text.id));
    const containerIds = new Set(pairs.map((p) => p.container.id));
    return {
      elements: elements.map((element) => {
        if (textIds.has(element.id)) {
          return newElementWith(element, { isDeleted: true });
        }
        if (containerIds.has(element.id)) {
          return newElementWith(element, {
            boundElements: (element.boundElements ?? []).filter(
              (bound) => !textIds.has(bound.id),
            ),
          });
        }
        return element;
      }),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});
