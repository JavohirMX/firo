import { describe, expect, it, vi } from "vitest";
import {
  MIN_ZOOM,
  DEFAULT_GRID_SIZE,
  DEFAULT_GRID_STEP,
  THEME,
} from "@firo/common";

import {
  calculateEffectiveGridSize,
  getAdaptiveGridParameters,
  strokeGrid,
} from "../renderer/staticScene";
import { actionToggleGridMode } from "../actions/actionToggleGridMode";
import { actionToggleObjectsSnapMode } from "../actions/actionToggleObjectsSnapMode";
import { getNormalizedZoom } from "../scene";

import type { AppState, NormalizedZoomValue, Zoom } from "../types";

describe("Adaptive multi-scale grid and zoom < 1%", () => {
  describe("MIN_ZOOM and normalization", () => {
    it("allows zoom down to 0.5% (0.005)", () => {
      expect(MIN_ZOOM).toBe(0.005);
      expect(getNormalizedZoom(0.005)).toBe(0.005);
      expect(getNormalizedZoom(0.001)).toBe(0.005);
    });
  });

  describe("getAdaptiveGridParameters and smooth multi-scale tiering", () => {
    it("provides clean 3x3 major and minor tiers with continuous alpha at zoom = 1", () => {
      const params = getAdaptiveGridParameters(DEFAULT_GRID_SIZE, 1);
      expect(params.majorGridSize).toBe(60);
      expect(params.minorGridSize).toBe(20);
      expect(params.ratio).toBe(3);
      expect(params.minorAlpha).toBeGreaterThan(0.3);
      expect(params.minorScreenSpacing).toBe(20);
      expect(params.majorScreenSpacing).toBe(60);
    });

    it("divides each major grid cell into a 3x3 subgrid across all zoom levels", () => {
      const testZooms = [
        0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 5,
        10, 20, 30,
      ];
      for (const zoom of testZooms) {
        const params = getAdaptiveGridParameters(DEFAULT_GRID_SIZE, zoom);
        expect(params.ratio).toBe(3);
        expect(params.majorGridSize / params.minorGridSize).toBeCloseTo(3, 5);
        expect(params.majorScreenSpacing).toBeGreaterThanOrEqual(25);
        expect(params.majorScreenSpacing).toBeLessThanOrEqual(95);
        expect(params.minorAlpha).toBeGreaterThanOrEqual(0);
        expect(params.minorAlpha).toBeLessThanOrEqual(1);
      }
    });

    it("exhibits smooth alpha continuity without jarring jumps across tier boundaries", () => {
      // Sample zoom continuously from 1.0 to 2.5 in fine increments
      let prevMinorAlpha = getAdaptiveGridParameters(
        DEFAULT_GRID_SIZE,
        1.0,
      ).minorAlpha;
      for (let z = 1.01; z <= 2.5; z += 0.01) {
        const params = getAdaptiveGridParameters(DEFAULT_GRID_SIZE, z);
        // Step delta in alpha between fine zoom changes should be small and gradual (< 0.1)
        if (params.minorGridSize === 20) {
          expect(Math.abs(params.minorAlpha - prevMinorAlpha)).toBeLessThan(
            0.1,
          );
        }
        prevMinorAlpha = params.minorAlpha;
      }
    });
  });

  describe("calculateEffectiveGridSize", () => {
    it("preserves default grid size at zoom = 1", () => {
      const effectiveSize = calculateEffectiveGridSize(DEFAULT_GRID_SIZE, 1);
      expect(effectiveSize).toBe(DEFAULT_GRID_SIZE);
      const screenSpacing = effectiveSize * 1;
      expect(screenSpacing).toBeGreaterThanOrEqual(15);
      expect(screenSpacing).toBeLessThanOrEqual(80);
    });

    it("bounds screen spacing between 15px and 80px at extreme low zoom (0.005)", () => {
      const zoom = 0.005;
      const effectiveSize = calculateEffectiveGridSize(DEFAULT_GRID_SIZE, zoom);
      const screenSpacing = effectiveSize * zoom;
      expect(screenSpacing).toBeGreaterThanOrEqual(15);
      expect(screenSpacing).toBeLessThanOrEqual(80);
      expect(effectiveSize).toBeGreaterThan(DEFAULT_GRID_SIZE);
    });

    it("bounds screen spacing between 15px and 80px at extreme high zoom (30)", () => {
      const zoom = 30;
      const effectiveSize = calculateEffectiveGridSize(DEFAULT_GRID_SIZE, zoom);
      const screenSpacing = effectiveSize * zoom;
      expect(screenSpacing).toBeGreaterThanOrEqual(15);
      expect(screenSpacing).toBeLessThanOrEqual(80);
      expect(effectiveSize).toBeLessThan(DEFAULT_GRID_SIZE);
    });

    it("bounds screen spacing across intermediate zoom levels", () => {
      const testZooms = [
        0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30,
      ];
      for (const zoom of testZooms) {
        const effectiveSize = calculateEffectiveGridSize(
          DEFAULT_GRID_SIZE,
          zoom,
        );
        const screenSpacing = effectiveSize * zoom;
        expect(screenSpacing).toBeGreaterThanOrEqual(15);
        expect(screenSpacing).toBeLessThanOrEqual(80);
      }
    });
  });

  describe("strokeGrid rendering", () => {
    const createMockContext = () => {
      return {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        setLineDash: vi.fn(),
        lineWidth: 1,
        fillStyle: "",
        strokeStyle: "",
      } as unknown as CanvasRenderingContext2D;
    };

    const baseZoom: Zoom = { value: 1 as NormalizedZoomValue };

    it("renders dots grid with arc and fill", () => {
      const ctx = createMockContext();
      strokeGrid(
        ctx,
        DEFAULT_GRID_SIZE,
        DEFAULT_GRID_STEP,
        0,
        0,
        baseZoom,
        THEME.LIGHT,
        200,
        200,
        1,
        "dots",
      );

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it("renders lines grid with lineTo and stroke", () => {
      const ctx = createMockContext();
      strokeGrid(
        ctx,
        DEFAULT_GRID_SIZE,
        DEFAULT_GRID_STEP,
        0,
        0,
        baseZoom,
        THEME.LIGHT,
        200,
        200,
        1,
        "lines",
      );

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it("renders crosses grid with arm markers", () => {
      const ctx = createMockContext();
      strokeGrid(
        ctx,
        DEFAULT_GRID_SIZE,
        DEFAULT_GRID_STEP,
        0,
        0,
        baseZoom,
        THEME.LIGHT,
        200,
        200,
        1,
        "crosses",
      );

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it("renders isometric grid with diagonal and vertical lines", () => {
      const ctx = createMockContext();
      strokeGrid(
        ctx,
        DEFAULT_GRID_SIZE,
        DEFAULT_GRID_STEP,
        0,
        0,
        baseZoom,
        THEME.LIGHT,
        200,
        200,
        1,
        "isometric",
      );

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it("remains bounded and performs finite iterations at zoom 0.005", () => {
      const ctx = createMockContext();
      const extremeZoom: Zoom = { value: 0.005 as NormalizedZoomValue };
      // Viewport width in scene units: 1920 / 0.005 = 384,000 units
      strokeGrid(
        ctx,
        DEFAULT_GRID_SIZE,
        DEFAULT_GRID_STEP,
        0,
        0,
        extremeZoom,
        THEME.LIGHT,
        384000,
        216000,
        1,
        "dots",
      );

      // Total dots should be bounded to visible screen (~30-60 in X, ~20-40 in Y)
      const arcCallCount = (ctx.arc as any).mock.calls.length;
      expect(arcCallCount).toBeGreaterThan(0);
      expect(arcCallCount).toBeLessThan(5000); // without adaptive grid it would be > 200,000,000!
    });
  });

  describe("actionToggleGridMode cycling", () => {
    const dummyAppState = {
      gridModeEnabled: false,
      gridType: undefined,
      objectsSnapModeEnabled: true,
    } as unknown as AppState;

    it("cycles through: off -> dots -> lines -> crosses -> isometric -> off", () => {
      // 1. Off -> Dots
      const res1 = actionToggleGridMode.perform(
        [],
        dummyAppState,
        undefined,
      ) as any;
      expect(res1.appState.gridModeEnabled).toBe(true);
      expect(res1.appState.gridType).toBe("dots");
      expect(res1.appState.objectsSnapModeEnabled).toBe(true);

      // 2. Dots -> Lines
      const res2 = actionToggleGridMode.perform(
        [],
        res1.appState,
        undefined,
      ) as any;
      expect(res2.appState.gridModeEnabled).toBe(true);
      expect(res2.appState.gridType).toBe("lines");
      expect(res2.appState.objectsSnapModeEnabled).toBe(true);

      // 3. Lines -> Crosses
      const res3 = actionToggleGridMode.perform(
        [],
        res2.appState,
        undefined,
      ) as any;
      expect(res3.appState.gridModeEnabled).toBe(true);
      expect(res3.appState.gridType).toBe("crosses");
      expect(res3.appState.objectsSnapModeEnabled).toBe(true);

      // 4. Crosses -> Isometric
      const res4 = actionToggleGridMode.perform(
        [],
        res3.appState,
        undefined,
      ) as any;
      expect(res4.appState.gridModeEnabled).toBe(true);
      expect(res4.appState.gridType).toBe("isometric");
      expect(res4.appState.objectsSnapModeEnabled).toBe(true);

      // 5. Isometric -> Off
      const res5 = actionToggleGridMode.perform(
        [],
        res4.appState,
        undefined,
      ) as any;
      expect(res5.appState.gridModeEnabled).toBe(false);
      expect(res5.appState.objectsSnapModeEnabled).toBe(true);

      // 6. Off -> Dots again
      const res6 = actionToggleGridMode.perform(
        [],
        res5.appState,
        undefined,
      ) as any;
      expect(res6.appState.gridModeEnabled).toBe(true);
      expect(res6.appState.gridType).toBe("dots");
      expect(res6.appState.objectsSnapModeEnabled).toBe(true);
    });

    it("supports explicit formData override", () => {
      const resExplicit = actionToggleGridMode.perform(
        [],
        dummyAppState,
        "crosses",
      ) as any;
      expect(resExplicit.appState.gridModeEnabled).toBe(true);
      expect(resExplicit.appState.gridType).toBe("crosses");
      expect(resExplicit.appState.objectsSnapModeEnabled).toBe(true);

      const resBool = actionToggleGridMode.perform(
        [],
        resExplicit.appState,
        false,
      ) as any;
      expect(resBool.appState.gridModeEnabled).toBe(false);
      expect(resBool.appState.objectsSnapModeEnabled).toBe(true);
    });

    it("coexists cleanly with actionToggleObjectsSnapMode without disabling grid", () => {
      const gridOnState = {
        gridModeEnabled: true,
        gridType: "dots",
        objectsSnapModeEnabled: false,
      } as unknown as AppState;

      const resSnap = actionToggleObjectsSnapMode.perform(
        [],
        gridOnState,
      ) as any;
      expect(resSnap.appState.objectsSnapModeEnabled).toBe(true);
      expect(resSnap.appState.gridModeEnabled).toBe(true);
    });
  });
});
