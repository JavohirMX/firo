import { describe, expect, it } from "vitest";

import {
  canAutoFit,
  computeFitView,
  INITIAL_FIT_WINDOW_MS,
} from "../initialFit";

const fresh = {
  width: 1280,
  height: 800,
  scrollX: 0,
  scrollY: 0,
  zoom: { value: 1 },
};

describe("canAutoFit", () => {
  it("allows a fresh, untouched view inside the opening window", () => {
    expect(canAutoFit(fresh, 0)).toBe(true);
    expect(canAutoFit(fresh, INITIAL_FIT_WINDOW_MS)).toBe(true);
  });

  it("stops after the opening window", () => {
    expect(canAutoFit(fresh, INITIAL_FIT_WINDOW_MS + 1)).toBe(false);
  });

  it("never moves a view the user has panned or zoomed", () => {
    expect(canAutoFit({ ...fresh, scrollX: 10 }, 0)).toBe(false);
    expect(canAutoFit({ ...fresh, scrollY: -3 }, 0)).toBe(false);
    expect(canAutoFit({ ...fresh, zoom: { value: 1.2 } }, 0)).toBe(false);
  });

  it("never moves the view while drawing or typing", () => {
    expect(canAutoFit({ ...fresh, newElement: {} }, 0)).toBe(false);
    expect(canAutoFit({ ...fresh, editingTextElement: {} }, 0)).toBe(false);
  });
});

describe("computeFitView", () => {
  it("returns null when there is nothing to fit", () => {
    expect(computeFitView(fresh, [])).toBeNull();
  });

  it("keeps zoom at 100% for content that already fits", () => {
    const fit = computeFitView(fresh, [
      { x: 0, y: 0, width: 400, height: 300 },
    ]);
    expect(fit?.zoom).toBe(1);
  });

  it("shrinks wide content to fit a phone and never zooms in past 100%", () => {
    const phone = { width: 390, height: 844 };
    const fit = computeFitView(phone, [
      { x: 0, y: 0, width: 800, height: 300 },
    ]);
    expect(fit).not.toBeNull();
    expect(fit!.zoom).toBeLessThan(1);
    // the content's screen width stays inside the viewport
    expect(800 * fit!.zoom).toBeLessThanOrEqual(phone.width);
  });

  it("centers the content in the free area beside the chrome", () => {
    const fit = computeFitView(fresh, [
      { x: 100, y: 100, width: 200, height: 100 },
    ])!;
    const screenCenterX = (200 + fit.scrollX) * fit.zoom;
    expect(screenCenterX).toBeCloseTo(96 + (1280 - 96 - 40) / 2, 5);
  });

  it("clamps the zoom floor for huge boards", () => {
    const fit = computeFitView(fresh, [
      { x: 0, y: 0, width: 100000, height: 100000 },
    ])!;
    expect(fit.zoom).toBe(0.1);
  });
});
