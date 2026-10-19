import { CaptureUpdateAction } from "@firo/element";

import {
  getConversionTypeFromElements,
  convertElementTypePopupAtom,
} from "../components/ConvertElementTypePopup";
import { editorJotaiStore } from "../editor-jotai";
import { getSelectedElements } from "../scene";

import { register } from "./register";

export const actionToggleShapeSwitch = register({
  name: "toggleShapeSwitch",
  label: "labels.shapeSwitch",
  icon: () => null,
  viewMode: false,
  trackEvent: {
    category: "shape_switch",
    action: "toggle",
  },
  keywords: ["change", "switch", "swap"],
  perform(elements, appState, _, app) {
    editorJotaiStore.set(convertElementTypePopupAtom, {
      type: "panel",
    });

    return {
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  predicate: (elements, appState) => {
    const selected = getSelectedElements(elements, appState);
    return (
      selected.length > 0 &&
      !selected.some((el) => el.locked) &&
      getConversionTypeFromElements(selected) !== null
    );
  },
});
