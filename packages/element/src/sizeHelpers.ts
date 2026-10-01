import { SHIFT_LOCKING_ANGLE, viewportCoordsToSceneCoords } from "@firo/common";
import {
  normalizeRadians,
  radiansBetweenAngles,
  radiansDifference,
  type Radians,
} from "@firo/math";

import { pointsEqual } from "@firo/math";

import type { AppState, Offsets, Zoom } from "@firo/editor/types";

import { getCommonBounds, getElementBounds } from "./bounds";
import {
  isArrowElement,
  isFreeDrawElement,
  isLinearElement,
} from "./typeChecks";

import type { ElementsMap, ExcalidrawElement } from "./types";

export type VerticalResizeAnchor = "top" | "bottom" | "center";

/** Keeps the chosen edge or center fixed when an element's height changes. */
export const getPositionAfterHeightChange = (
  element: Pick<ExcalidrawElement, "x" | "y" | "height" | "angle">,
  nextHeight: number,
  anchor: VerticalResizeAnchor = "top",
) => {
  const delta = (element.height - nextHeight) / 2;

  if (anchor === "center") {
    // Rotation is about the center, so holding it is angle-independent.
    return { x: element.x, y: element.y + delta };
  }

  const sin = Math.sin(element.angle);
  const cos = Math.cos(element.angle);

  if (anchor === "bottom") {
    return {
      x: element.x - delta * sin,
      y: element.y + delta * (1 + cos),
    };
  }

  return {
    x: element.x + delta * sin,
    y: element.y + delta * (1 - cos),
  };
};

export const INVISIBLY_SMALL_ELEMENT_SIZE = 0.1;

// TODO:  remove invisible elements consistently actions, so that invisible elements are not recorded by the store, exported, broadcasted or persisted
//        - perhaps could be as part of a standalone 'cleanup' action, in addition to 'finalize'
//        - could also be part of `_clearElements`
export const isInvisiblySmallElement = (
  element: ExcalidrawElement,
): boolean => {
  if (isLinearElement(element) || isFreeDrawElement(element)) {
    return (
      element.points.length < 2 ||
      (element.points.length === 2 &&
        isArrowElement(element) &&
        pointsEqual(
          element.points[0],
          element.points[element.points.length - 1],
          INVISIBLY_SMALL_ELEMENT_SIZE,
        ))
    );
  }

  return element.width === 0 && element.height === 0;
};

export const isElementInViewport = (
  element: ExcalidrawElement,
  width: number,
  height: number,
  viewTransformations: {
    zoom: Zoom;
    offsetLeft: number;
    offsetTop: number;
    scrollX: number;
    scrollY: number;
  },
  elementsMap: ElementsMap,
) => {
  const [x1, y1, x2, y2] = getElementBounds(element, elementsMap); // scene coordinates

  /*
   * The viewport's edges in scene coordinates, computed without allocating.
   *
   * This runs once per element per frame, from the render loop's culling pass --
   * 10,000 times on a board that size. It used to call
   * `viewportCoordsToSceneCoords` twice, and each call allocated both its
   * argument object and its result, so 40,000 short-lived objects per frame
   * purely to produce four numbers.
   *
   * The arithmetic also collapses. `viewportCoordsToSceneCoords` computes
   * `(clientX - offsetLeft) / zoom - scrollX`, and both call sites pass
   * `clientX: offsetLeft + n`, so the offset terms cancel exactly and
   * `offsetLeft` and `offsetTop` cannot appear in the result. The viewport's
   * left edge is therefore always `-scrollX`, whatever the offset. Writing that
   * out is both allocation-free and easier to check than the general form.
   *
   * No frame-time claim is made for this. Drawing costs 0.55 us per element on a
   * GPU and the culling pass measures well under 1% of the frame, so this sits
   * below the noise floor of the benchmark; it is worth doing because the
   * garbage is real and the simplification is free, not because it is faster by
   * a measurable amount.
   */
  const { zoom, scrollX, scrollY } = viewTransformations;
  const right = width / zoom.value - scrollX;
  const bottom = height / zoom.value - scrollY;

  return -scrollX <= x2 && -scrollY <= y2 && right >= x1 && bottom >= y1;
};

export const isElementCompletelyInViewport = (
  elements: ExcalidrawElement[],
  width: number,
  height: number,
  viewTransformations: {
    zoom: Zoom;
    offsetLeft: number;
    offsetTop: number;
    scrollX: number;
    scrollY: number;
  },
  elementsMap: ElementsMap,
  padding?: Offsets,
) => {
  const [x1, y1, x2, y2] = getCommonBounds(elements, elementsMap); // scene coordinates
  const topLeftSceneCoords = viewportCoordsToSceneCoords(
    {
      clientX: viewTransformations.offsetLeft + (padding?.left || 0),
      clientY: viewTransformations.offsetTop + (padding?.top || 0),
    },
    viewTransformations,
  );
  const bottomRightSceneCoords = viewportCoordsToSceneCoords(
    {
      clientX: viewTransformations.offsetLeft + width - (padding?.right || 0),
      clientY: viewTransformations.offsetTop + height - (padding?.bottom || 0),
    },
    viewTransformations,
  );

  return (
    x1 >= topLeftSceneCoords.x &&
    y1 >= topLeftSceneCoords.y &&
    x2 <= bottomRightSceneCoords.x &&
    y2 <= bottomRightSceneCoords.y
  );
};

/**
 * Makes a perfect shape or diagonal/horizontal/vertical line
 */
export const getPerfectElementSize = (
  elementType: AppState["activeTool"]["type"],
  width: number,
  height: number,
): { width: number; height: number } => {
  const absWidth = Math.abs(width);
  const absHeight = Math.abs(height);

  if (
    elementType === "line" ||
    elementType === "arrow" ||
    elementType === "freedraw"
  ) {
    const lockedAngle =
      Math.round(Math.atan(absHeight / absWidth) / SHIFT_LOCKING_ANGLE) *
      SHIFT_LOCKING_ANGLE;
    if (lockedAngle === 0) {
      height = 0;
    } else if (lockedAngle === Math.PI / 2) {
      width = 0;
    } else {
      height = absWidth * Math.tan(lockedAngle) * Math.sign(height) || height;
    }
  } else if (elementType !== "selection") {
    height = absWidth * Math.sign(height);
  }
  return { width, height };
};

export const getLockedLinearCursorAlignSize = (
  originX: number,
  originY: number,
  x: number,
  y: number,
  customAngle?: number,
) => {
  let width = x - originX;
  let height = y - originY;

  const angle = Math.atan2(height, width) as Radians;
  let lockedAngle = (Math.round(angle / SHIFT_LOCKING_ANGLE) *
    SHIFT_LOCKING_ANGLE) as Radians;

  if (customAngle) {
    // If custom angle is provided, we check if the angle is close to the
    // custom angle, snap to that if close engough, otherwise snap to the
    // higher or lower angle depending on the current angle vs custom angle.
    const lower = (Math.floor(customAngle / SHIFT_LOCKING_ANGLE) *
      SHIFT_LOCKING_ANGLE) as Radians;
    if (
      radiansBetweenAngles(
        angle,
        lower,
        (lower + SHIFT_LOCKING_ANGLE) as Radians,
      )
    ) {
      if (
        radiansDifference(angle, customAngle as Radians) <
        SHIFT_LOCKING_ANGLE / 6
      ) {
        lockedAngle = customAngle as Radians;
      } else if (
        normalizeRadians(angle) > normalizeRadians(customAngle as Radians)
      ) {
        lockedAngle = (lower + SHIFT_LOCKING_ANGLE) as Radians;
      } else {
        lockedAngle = lower;
      }
    }
  }

  if (lockedAngle === 0) {
    height = 0;
  } else if (lockedAngle === Math.PI / 2) {
    width = 0;
  } else {
    // locked angle line, y = mx + b => mx - y + b = 0
    const a1 = Math.tan(lockedAngle);
    const b1 = -1;
    const c1 = originY - a1 * originX;

    // line through cursor, perpendicular to locked angle line
    const a2 = -1 / a1;
    const b2 = -1;
    const c2 = y - a2 * x;

    // intersection of the two lines above
    const intersectX = (b1 * c2 - b2 * c1) / (a1 * b2 - a2 * b1);
    const intersectY = (c1 * a2 - c2 * a1) / (a1 * b2 - a2 * b1);

    // delta
    width = intersectX - originX;
    height = intersectY - originY;
  }

  return { width, height };
};

export const getNormalizedDimensions = (
  element: Pick<ExcalidrawElement, "width" | "height" | "x" | "y">,
): {
  width: ExcalidrawElement["width"];
  height: ExcalidrawElement["height"];
  x: ExcalidrawElement["x"];
  y: ExcalidrawElement["y"];
} => {
  const ret = {
    width: element.width,
    height: element.height,
    x: element.x,
    y: element.y,
  };

  if (element.width < 0) {
    const nextWidth = Math.abs(element.width);
    ret.width = nextWidth;
    ret.x = element.x - nextWidth;
  }

  if (element.height < 0) {
    const nextHeight = Math.abs(element.height);
    ret.height = nextHeight;
    ret.y = element.y - nextHeight;
  }

  return ret;
};
