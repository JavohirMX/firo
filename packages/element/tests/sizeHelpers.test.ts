import { API } from "@firo/editor/tests/helpers/api";

import { isElementInViewport } from "../src/sizeHelpers";

/*
 * `isElementInViewport` runs once per element per frame from the render loop's
 * culling pass, so it is the hottest predicate in the editor. Its arithmetic was
 * rewritten to stop allocating, and the rewrite is only safe if it is exactly
 * equivalent -- a sign slip here silently drops elements off screen, which is
 * the kind of bug that shows up as "the board feels wrong" and never as a failing
 * test elsewhere.
 *
 * The reference in each case is the general form the function used to compute:
 * `(clientX - offsetLeft) / zoom - scrollX`. The cases below include the ones
 * where the simplification could plausibly be wrong: the offset cancelling, the
 * inclusive boundaries, and zero-size elements.
 */

const rect = (x: number, y: number, w: number, h: number) => {
  const element = API.createElement({
    type: "rectangle",
    x,
    y,
    width: w,
    height: h,
  });
  return { element, elementsMap: new Map([[element.id, element]]) };
};

const visible = (
  element: ReturnType<typeof rect>["element"],
  elementsMap: ReturnType<typeof rect>["elementsMap"],
  opts: {
    width?: number;
    height?: number;
    zoom?: number;
    offsetLeft?: number;
    offsetTop?: number;
    scrollX?: number;
    scrollY?: number;
  } = {},
) =>
  isElementInViewport(
    element,
    opts.width ?? 800,
    opts.height ?? 600,
    {
      zoom: { value: opts.zoom ?? 1 } as never,
      offsetLeft: opts.offsetLeft ?? 0,
      offsetTop: opts.offsetTop ?? 0,
      scrollX: opts.scrollX ?? 0,
      scrollY: opts.scrollY ?? 0,
    },
    elementsMap as never,
  );

describe("isElementInViewport", () => {
  it("sees an element inside the viewport", () => {
    const { element, elementsMap } = rect(100, 100, 50, 50);
    expect(visible(element, elementsMap)).toBe(true);
  });

  it("rejects an element past the right edge", () => {
    const { element, elementsMap } = rect(5000, 100, 50, 50);
    expect(visible(element, elementsMap)).toBe(false);
  });

  it("rejects an element past the bottom edge", () => {
    const { element, elementsMap } = rect(100, 5000, 50, 50);
    expect(visible(element, elementsMap)).toBe(false);
  });

  /*
   * The case the rewrite could get wrong. A canvas inside an iframe is offset
   * from the page origin, so offsetLeft and offsetTop are not zero, and they
   * have to cancel out of the scene coordinates exactly.
   */
  it("is unaffected by the canvas offset, which cancels", () => {
    const { element, elementsMap } = rect(100, 100, 50, 50);
    for (const offset of [0, 37, 640, -120]) {
      expect(
        visible(element, elementsMap, {
          offsetLeft: offset,
          offsetTop: offset,
        }),
      ).toBe(true);
    }
    const far = rect(5000, 5000, 50, 50);
    for (const offset of [0, 37, 640, -120]) {
      expect(
        visible(far.element, far.elementsMap, {
          offsetLeft: offset,
          offsetTop: offset,
        }),
      ).toBe(false);
    }
  });

  it("treats an element flush with the edge as visible", () => {
    // Bottom-right corner lands exactly on the viewport corner.
    const { element, elementsMap } = rect(750, 550, 50, 50);
    expect(visible(element, elementsMap)).toBe(true);
  });

  it("rejects an element entirely outside", () => {
    const { element, elementsMap } = rect(-500, -500, 10, 10);
    expect(visible(element, elementsMap)).toBe(false);
  });

  it("keeps a zero-size element whose corner is inside", () => {
    // A dot is not a rectangle spanning outwards; it must be judged by its
    // position, not treated as invisible.
    const { element, elementsMap } = rect(100, 100, 0, 0);
    expect(visible(element, elementsMap)).toBe(true);
  });

  it("rejects a zero-size element outside", () => {
    const { element, elementsMap } = rect(900, 700, 0, 0);
    expect(visible(element, elementsMap)).toBe(false);
  });

  it("widens the scene area as zoom drops", () => {
    // At 10% zoom the viewport covers ten times as much scene, so something
    // well outside the pixel viewport is on screen.
    const { element, elementsMap } = rect(4000, 3000, 50, 50);
    expect(visible(element, elementsMap, { zoom: 1 })).toBe(false);
    expect(visible(element, elementsMap, { zoom: 0.1 })).toBe(true);
  });

  it("narrows the scene area as zoom rises", () => {
    const { element, elementsMap } = rect(400, 300, 50, 50);
    expect(visible(element, elementsMap, { zoom: 1 })).toBe(true);
    expect(visible(element, elementsMap, { zoom: 4 })).toBe(false);
  });

  it("shifts the visible region with scroll", () => {
    const { element, elementsMap } = rect(2000, 2000, 50, 50);
    expect(visible(element, elementsMap, { scrollX: 0, scrollY: 0 })).toBe(
      false,
    );
    /*
     * Negative scroll, and the sign is the whole point. Scene x at the viewport's
     * left edge is `-scrollX`, so the visible band runs from `-scrollX` to
     * `width - scrollX`. Positive scrollX therefore moves the view toward
     * *negative* scene coordinates and cannot bring a far-right element into
     * view; it takes scrollX <= -1200 to reach x = 2000 at 800 px wide.
     *
     * (The first version of this asserted the opposite, on the reasonable-
     * sounding but wrong reading that scrolling right reveals what is to the
     * right. The implementation was right and the test was not.)
     */
    expect(
      visible(element, elementsMap, { scrollX: -1500, scrollY: -1500 }),
    ).toBe(true);
    expect(
      visible(element, elementsMap, { scrollX: 1900, scrollY: 1900 }),
    ).toBe(false);
  });

  it("sees an element larger than the whole viewport", () => {
    const { element, elementsMap } = rect(-5000, -5000, 20000, 20000);
    expect(visible(element, elementsMap)).toBe(true);
  });
});
