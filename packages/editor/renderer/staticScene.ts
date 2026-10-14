import {
  applyDarkModeFilter,
  COLOR_WHITE,
  FRAME_STYLE,
  THEME,
  throttleRAF,
} from "@firo/common";
import { isElementLink } from "@firo/element";
import { createPlaceholderEmbeddableLabel } from "@firo/element";
import { getBoundTextElement } from "@firo/element";
import {
  isEmbeddableElement,
  isIframeLikeElement,
  isTextElement,
} from "@firo/element";
import {
  elementOverlapsWithFrame,
  getTargetFrame,
  shouldApplyFrameClip,
} from "@firo/element";

import {
  getRenderElementWithPositionOverride,
  resolveElementRenderState,
  renderElement,
} from "@firo/element";

import { getElementAbsoluteCoords } from "@firo/element";

import type { ElementRenderState } from "@firo/element";

import type {
  ElementsMap,
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
  NonDeletedExcalidrawElement,
} from "@firo/element/types";

import {
  EXTERNAL_LINK_IMG,
  ELEMENT_LINK_IMG,
  getLinkHandleFromCoords,
} from "../components/hyperlink/helpers";

import {
  bootstrapCanvas,
  getNormalizedCanvasDimensions,
  snapScrollToDevicePixels,
} from "./helpers";

import type {
  StaticCanvasRenderConfig,
  StaticSceneRenderConfig,
} from "../scene/types";
import type { StaticCanvasAppState, Zoom, GridType } from "../types";

const GridLineColor = {
  [THEME.LIGHT]: {
    bold: "#dddddd",
    regular: "#e5e5e5",
  },
  [THEME.DARK]: {
    bold: applyDarkModeFilter("#dddddd"),
    regular: applyDarkModeFilter("#e5e5e5"),
  },
} as const;

const GridDotColor = {
  [THEME.LIGHT]: "#b8b8b8",
  [THEME.DARK]: applyDarkModeFilter("#b8b8b8"),
} as const;

const GridCrossColor = {
  [THEME.LIGHT]: "#cccccc",
  [THEME.DARK]: applyDarkModeFilter("#cccccc"),
} as const;

export const calculateEffectiveGridSize = (
  gridSize: number,
  zoomValue: number,
): number => {
  let scaleMultiplier = 1;
  if (Number.isFinite(zoomValue) && zoomValue > 0 && gridSize > 0) {
    while (
      gridSize * scaleMultiplier * zoomValue < 15 &&
      scaleMultiplier < 1e8
    ) {
      scaleMultiplier *= 5;
    }
    while (
      gridSize * scaleMultiplier * zoomValue > 80 &&
      scaleMultiplier > 1e-8
    ) {
      scaleMultiplier /= 5;
    }
  }
  return gridSize * scaleMultiplier;
};

export const strokeGrid = (
  context: CanvasRenderingContext2D,
  /** grid cell pixel size */
  gridSize: number,
  /** setting to 1 will disble bold lines */
  gridStep: number,
  scrollX: number,
  scrollY: number,
  zoom: Zoom,
  theme: StaticCanvasRenderConfig["theme"],
  width: number,
  height: number,
  scale: number,
  gridType: GridType = "dots",
) => {
  const effectiveGridSize = calculateEffectiveGridSize(gridSize, zoom.value);
  const offsetX = (scrollX % effectiveGridSize) - effectiveGridSize;
  const offsetY = (scrollY % effectiveGridSize) - effectiveGridSize;

  context.save();

  if (gridType === "dots") {
    const dotRadius = 1.5 / zoom.value;
    context.fillStyle = GridDotColor[theme];
    context.beginPath();
    for (
      let x = offsetX;
      x < offsetX + width + effectiveGridSize * 2;
      x += effectiveGridSize
    ) {
      for (
        let y = offsetY;
        y < offsetY + height + effectiveGridSize * 2;
        y += effectiveGridSize
      ) {
        context.moveTo(x + dotRadius, y);
        context.arc(x, y, dotRadius, 0, Math.PI * 2);
      }
    }
    context.fill();
    context.restore();
    return;
  }

  if (gridType === "crosses") {
    const arm = 3.5 / zoom.value;
    context.lineWidth = 1 / zoom.value;
    context.strokeStyle = GridCrossColor[theme];
    context.beginPath();
    for (
      let x = offsetX;
      x < offsetX + width + effectiveGridSize * 2;
      x += effectiveGridSize
    ) {
      for (
        let y = offsetY;
        y < offsetY + height + effectiveGridSize * 2;
        y += effectiveGridSize
      ) {
        context.moveTo(x - arm, y);
        context.lineTo(x + arm, y);
        context.moveTo(x, y - arm);
        context.lineTo(x, y + arm);
      }
    }
    context.stroke();
    context.restore();
    return;
  }

  if (gridType === "isometric") {
    const minX = offsetX - effectiveGridSize;
    const maxX = offsetX + width + effectiveGridSize * 2;
    const minY = offsetY - effectiveGridSize;
    const maxY = offsetY + height + effectiveGridSize * 2;

    const s = 1 / Math.sqrt(3);
    const stepY = (2 * effectiveGridSize) / Math.sqrt(3);

    context.lineWidth = 1 / zoom.value;
    context.strokeStyle = GridLineColor[theme].regular;
    context.beginPath();

    // 1. Vertical lines
    for (let x = offsetX; x <= maxX; x += effectiveGridSize) {
      context.moveTo(x, minY);
      context.lineTo(x, maxY);
    }

    // 2. Diagonal lines at +30 degrees (slope s)
    const cMin1 = minY - scrollY - s * (maxX - scrollX);
    const cMax1 = maxY - scrollY - s * (minX - scrollX);
    const startC1 = Math.floor(cMin1 / stepY) * stepY;
    for (let c = startC1; c <= cMax1; c += stepY) {
      const y1 = scrollY + s * (minX - scrollX) + c;
      const y2 = scrollY + s * (maxX - scrollX) + c;
      context.moveTo(minX, y1);
      context.lineTo(maxX, y2);
    }

    // 3. Diagonal lines at -30 degrees (slope -s)
    const cMin2 = minY - scrollY + s * (minX - scrollX);
    const cMax2 = maxY - scrollY + s * (maxX - scrollX);
    const startC2 = Math.floor(cMin2 / stepY) * stepY;
    for (let c = startC2; c <= cMax2; c += stepY) {
      const y1 = scrollY - s * (minX - scrollX) + c;
      const y2 = scrollY - s * (maxX - scrollX) + c;
      context.moveTo(minX, y1);
      context.lineTo(maxX, y2);
    }

    context.stroke();
    context.restore();
    return;
  }

  // gridType === "lines"
  const spaceWidth = 1 / zoom.value;
  const devicePixels = zoom.value * scale;

  const snap = (position: number, maxWidthInCssPixels: number) => {
    const widthInDevicePixels = Math.min(
      scale,
      maxWidthInCssPixels * devicePixels,
    );
    if (widthInDevicePixels < 1) {
      return { position, lineWidth: widthInDevicePixels / devicePixels };
    }
    const wholeWidth = Math.round(widthInDevicePixels);
    const center = wholeWidth % 2 ? 0.5 : 0;
    return {
      position:
        (Math.round(position * devicePixels - center) + center) / devicePixels,
      lineWidth: wholeWidth / devicePixels,
    };
  };

  // vertical lines
  for (
    let x = offsetX;
    x < offsetX + width + effectiveGridSize * 2;
    x += effectiveGridSize
  ) {
    const gridIndex = Math.round((x - scrollX) / effectiveGridSize);
    const isBold = gridStep > 1 && Math.abs(gridIndex) % gridStep === 0;

    const { position, lineWidth } = snap(x, isBold ? 4 : 1);
    context.lineWidth = lineWidth;
    const lineDash = [lineWidth * 3, spaceWidth + (lineWidth + spaceWidth)];

    context.beginPath();
    context.setLineDash(isBold ? [] : lineDash);
    context.strokeStyle = isBold
      ? GridLineColor[theme].bold
      : GridLineColor[theme].regular;
    context.moveTo(position, offsetY - effectiveGridSize);
    context.lineTo(
      position,
      Math.ceil(offsetY + height + effectiveGridSize * 2),
    );
    context.stroke();
  }

  // horizontal lines
  for (
    let y = offsetY;
    y < offsetY + height + effectiveGridSize * 2;
    y += effectiveGridSize
  ) {
    const gridIndex = Math.round((y - scrollY) / effectiveGridSize);
    const isBold = gridStep > 1 && Math.abs(gridIndex) % gridStep === 0;

    const { position, lineWidth } = snap(y, isBold ? 4 : 1);
    context.lineWidth = lineWidth;
    const lineDash = [lineWidth * 3, spaceWidth + (lineWidth + spaceWidth)];

    context.beginPath();
    context.setLineDash(isBold ? [] : lineDash);
    context.strokeStyle = isBold
      ? GridLineColor[theme].bold
      : GridLineColor[theme].regular;
    context.moveTo(offsetX - effectiveGridSize, position);
    context.lineTo(
      Math.ceil(offsetX + width + effectiveGridSize * 2),
      position,
    );
    context.stroke();
  }

  context.restore();
};

export const frameClip = (
  frame: ExcalidrawFrameLikeElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState,
) => {
  context.translate(frame.x + appState.scrollX, frame.y + appState.scrollY);
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(
      0,
      0,
      frame.width,
      frame.height,
      FRAME_STYLE.radius / appState.zoom.value,
    );
  } else {
    context.rect(0, 0, frame.width, frame.height);
  }
  context.clip();
  context.translate(
    -(frame.x + appState.scrollX),
    -(frame.y + appState.scrollY),
  );
};

type LinkIconCanvas = HTMLCanvasElement & { zoom: number };

const linkIconCanvasCache: {
  regularLink: LinkIconCanvas | null;
  elementLink: LinkIconCanvas | null;
} = {
  regularLink: null,
  elementLink: null,
};

const renderLinkIcon = (
  element: NonDeletedExcalidrawElement,
  context: CanvasRenderingContext2D,
  appState: StaticCanvasAppState,
  elementsMap: ElementsMap,
  renderState: ElementRenderState,
) => {
  if (element.link && !appState.selectedElementIds[element.id]) {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
    const [x, y, width, height] = getLinkHandleFromCoords(
      [
        x1 + renderState.offset.x,
        y1 + renderState.offset.y,
        x2 + renderState.offset.x,
        y2 + renderState.offset.y,
      ],
      element.angle,
      appState,
    );
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    context.save();
    context.translate(appState.scrollX + centerX, appState.scrollY + centerY);
    context.rotate(element.angle);

    const canvasKey = isElementLink(element.link)
      ? "elementLink"
      : "regularLink";

    let linkCanvas = linkIconCanvasCache[canvasKey];

    if (!linkCanvas || linkCanvas.zoom !== appState.zoom.value) {
      linkCanvas = Object.assign(document.createElement("canvas"), {
        zoom: appState.zoom.value,
      });
      linkCanvas.width = width * window.devicePixelRatio * appState.zoom.value;
      linkCanvas.height =
        height * window.devicePixelRatio * appState.zoom.value;
      linkIconCanvasCache[canvasKey] = linkCanvas;

      const linkCanvasCacheContext = linkCanvas.getContext("2d")!;
      linkCanvasCacheContext.scale(
        window.devicePixelRatio * appState.zoom.value,
        window.devicePixelRatio * appState.zoom.value,
      );

      // Seed a sane default so a corrupted color (silently rejected by the
      // canvas) falls back to white instead of a stale fillStyle.
      linkCanvasCacheContext.fillStyle = COLOR_WHITE;
      linkCanvasCacheContext.fillStyle =
        appState.viewBackgroundColor || COLOR_WHITE;

      linkCanvasCacheContext.fillRect(0, 0, width, height);

      if (canvasKey === "elementLink") {
        linkCanvasCacheContext.drawImage(ELEMENT_LINK_IMG, 0, 0, width, height);
      } else {
        linkCanvasCacheContext.drawImage(
          EXTERNAL_LINK_IMG,
          0,
          0,
          width,
          height,
        );
      }

      linkCanvasCacheContext.restore();
    }
    context.globalAlpha = renderState.opacity;
    context.drawImage(linkCanvas, x - centerX, y - centerY, width, height);
    context.restore();
  }
};
const _renderStaticScene = ({
  canvas,
  rc,
  elementsMap,
  allElementsMap,
  visibleElements,
  scale,
  appState: unsnappedAppState,
  renderConfig,
}: StaticSceneRenderConfig) => {
  if (canvas === null) {
    return;
  }

  const { renderGrid = true, isExporting } = renderConfig;
  // export draws vectors, not cached bitmaps — nothing to keep on the grid
  const appState = isExporting
    ? unsnappedAppState
    : snapScrollToDevicePixels(unsnappedAppState, scale);

  const [normalizedWidth, normalizedHeight] = getNormalizedCanvasDimensions(
    canvas,
    scale,
  );

  const context = bootstrapCanvas({
    canvas,
    scale,
    normalizedWidth,
    normalizedHeight,
    theme: appState.theme,
    isExporting,
    viewBackgroundColor: appState.viewBackgroundColor,
  });

  // Apply zoom
  context.scale(appState.zoom.value, appState.zoom.value);

  // Grid
  if (renderGrid) {
    strokeGrid(
      context,
      appState.gridSize,
      appState.gridStep,
      appState.scrollX,
      appState.scrollY,
      appState.zoom,
      renderConfig.theme,
      normalizedWidth / appState.zoom.value,
      normalizedHeight / appState.zoom.value,
      scale,
      appState.gridType,
    );
  }

  const groupsToBeAddedToFrame = new Set<string>();

  visibleElements.forEach((element) => {
    if (
      element.groupIds.length > 0 &&
      appState.frameToHighlight &&
      appState.selectedElementIds[element.id] &&
      (elementOverlapsWithFrame(
        element,
        appState.frameToHighlight,
        elementsMap,
      ) ||
        element.groupIds.find((groupId) => groupsToBeAddedToFrame.has(groupId)))
    ) {
      element.groupIds.forEach((groupId) =>
        groupsToBeAddedToFrame.add(groupId),
      );
    }
  });

  const inFrameGroupsMap = new Map<string, boolean>();

  const getRenderState = (element: ExcalidrawElement) =>
    resolveElementRenderState(
      element,
      elementsMap,
      renderConfig,
      allElementsMap,
    );

  const clipElementToFrame = (
    element: NonDeletedExcalidrawElement,
    renderState: ElementRenderState,
  ) => {
    if (
      !(element.frameId || appState.frameToHighlight?.id) ||
      !appState.frameRendering.enabled ||
      !appState.frameRendering.clip
    ) {
      return;
    }
    const targetFrame = getTargetFrame(element, elementsMap, appState);
    if (!targetFrame) {
      return;
    }
    const frameState = getRenderState(targetFrame);
    const frame = getRenderElementWithPositionOverride(
      targetFrame,
      frameState.offset,
    );
    const isTranslated = (state: ElementRenderState) =>
      state.offset.x !== 0 || state.offset.y !== 0;
    if (
      (element.frameId === frame.id &&
        (isTranslated(renderState) || isTranslated(frameState))) ||
      shouldApplyFrameClip(
        getRenderElementWithPositionOverride(element, renderState.offset),
        frame,
        appState,
        elementsMap,
        inFrameGroupsMap,
      )
    ) {
      frameClip(frame, context, renderConfig, appState);
    }
  };

  // Paint visible elements
  visibleElements
    .filter((el) => !isIframeLikeElement(el))
    .forEach((element) => {
      try {
        if (
          isTextElement(element) &&
          element.containerId &&
          elementsMap.has(element.containerId)
        ) {
          // will be rendered with the container
          return;
        }

        context.save();
        const boundTextElement = getBoundTextElement(element, elementsMap);

        const renderState = getRenderState(element);
        clipElementToFrame(element, renderState);
        renderElement(
          element,
          elementsMap,
          allElementsMap,
          rc,
          context,
          renderConfig,
          appState,
          renderState,
        );

        if (boundTextElement) {
          renderElement(
            boundTextElement,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );
        }

        context.restore();

        if (!isExporting && renderConfig.renderLinks !== false) {
          renderLinkIcon(element, context, appState, elementsMap, renderState);
        }
      } catch (error: any) {
        console.error(
          error,
          element.id,
          element.x,
          element.y,
          element.width,
          element.height,
        );
      }
    });

  // render embeddables on top
  visibleElements
    .filter((el) => isIframeLikeElement(el))
    .forEach((element) => {
      try {
        const renderState = getRenderState(element);
        context.save();
        clipElementToFrame(element, renderState);
        renderElement(
          element,
          elementsMap,
          allElementsMap,
          rc,
          context,
          renderConfig,
          appState,
          renderState,
        );

        if (
          isIframeLikeElement(element) &&
          (isExporting ||
            (isEmbeddableElement(element) &&
              renderConfig.embedsValidationStatus.get(element.id) !== true)) &&
          element.width &&
          element.height
        ) {
          const label = {
            ...createPlaceholderEmbeddableLabel(element),
            // Synthetic visual: resolve overrides and frame opacity through
            // its owner, without creating another animation target.
            id: element.id,
            frameId: element.frameId,
          };
          renderElement(
            label,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );
        }
        if (!isExporting && renderConfig.renderLinks !== false) {
          renderLinkIcon(element, context, appState, elementsMap, renderState);
        }
        context.restore();
      } catch (error: any) {
        console.error(error);
      }
    });

  // render pending nodes for flowcharts
  renderConfig.pendingFlowchartNodes?.forEach((element) => {
    try {
      renderElement(
        element,
        elementsMap,
        allElementsMap,
        rc,
        context,
        renderConfig,
        appState,
      );
    } catch (error) {
      console.error(error);
    }
  });
};

/** throttled to animation framerate */
export const renderStaticSceneThrottled = throttleRAF(
  (config: StaticSceneRenderConfig) => {
    _renderStaticScene(config);
  },
);

/**
 * Static scene is the non-ui canvas where we render elements.
 */
export const renderStaticScene = (
  renderConfig: StaticSceneRenderConfig,
  throttle?: boolean,
) => {
  if (throttle) {
    renderStaticSceneThrottled(renderConfig);
    return;
  }

  _renderStaticScene(renderConfig);
};
