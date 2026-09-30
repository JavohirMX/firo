import { VERSIONS } from "@firo/common";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@firo/element/types";

import {
  diamondFixture,
  ellipseFixture,
  rectangleFixture,
} from "./elementFixture";

export const diagramFixture = {
  type: "excalidraw",
  version: VERSIONS.firo,
  // Firo writes its own source identifier. Upstream wrote its own origin
  // here, which made every exported scene claim to come from excalidraw.com.
  source: "firo",
  elements: [diamondFixture, ellipseFixture, rectangleFixture],
  appState: {
    viewBackgroundColor: "#ffffff",
    gridModeEnabled: false,
  },
  files: {},
};

export const diagramFactory = ({
  overrides = {},
  elementOverrides = {} as Partial<ExcalidrawElement>,
} = {}) => ({
  ...diagramFixture,
  elements: [
    {
      ...diamondFixture,
      ...elementOverrides,
      isDeleted: elementOverrides.isDeleted ?? false,
    } as NonDeletedExcalidrawElement,
    {
      ...ellipseFixture,
      ...elementOverrides,
      isDeleted: elementOverrides.isDeleted ?? false,
    } as NonDeletedExcalidrawElement,
    {
      ...rectangleFixture,
      ...elementOverrides,
      isDeleted: elementOverrides.isDeleted ?? false,
    } as NonDeletedExcalidrawElement,
  ],
  ...overrides,
});

export default diagramFixture;
