/**
 * The renderer benchmark page.
 *
 * ## How it is mounted
 *
 * Not as a separate HTML file. `vite` dev serves any HTML-accepting request it
 * does not recognise through its SPA fallback, so `/bench.html` was rewritten to
 * `/index.html` and the benchmark silently measured *the app* -- a page that
 * looked fine, mounted an editor, and reported numbers for something else
 * entirely. `curl` asked for any content type rather than HTML, so it got the
 * real file and the bug survived being checked from a terminal.
 *
 * (This comment once spelled out that Accept header literally. The resulting
 * two-asterisk-slash sequence terminated the comment early and the file
 * stopped parsing -- worth remembering every time a doc comment quotes a glob,
 * a regex or a media type.)
 * the bug survived being checked from the command line.
 *
 * So the bench mounts from the real entry point behind `?bench=1`, dynamically
 * imported behind `import.meta.env.DEV`. Vite replaces that flag at build time,
 * so the branch is dead in production and neither this file nor the scene
 * generator reaches the bundle. The app path is untouched.
 *
 * ## What this measures, and what it deliberately does not
 *
 * It mounts the real editor with a generated scene and exposes a small control
 * surface on `window.__bench` for the Playwright driver. It measures the
 * **inherited** renderer, which is the baseline every Phase 2 spike is a diff
 * against.
 *
 * It is not the app: no router, no local-storage restore, no library panel, no
 * share dialog, no collaboration. Those add per-frame work that has nothing to
 * do with rendering, and including them would make every number noisier and less
 * attributable.
 */
import { StrictMode, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";

import { CaptureUpdateAction } from "@firo/element";

import { Excalidraw } from "@firo/editor";

import type {
  ExcalidrawImperativeAPI,
  NormalizedZoomValue,
} from "@firo/editor/types";

import { generateScene, sceneStats } from "../../scripts/bench/scene";

import type { SceneProfile, SceneStats } from "../../scripts/bench/scene";

/* -------------------------------------------------------------------------- */
/* Options, from the query string                                               */
/* -------------------------------------------------------------------------- */

const params = new URLSearchParams(window.location.search);

const intParam = (name: string, fallback: number): number => {
  const raw = params.get(name);
  if (raw === null) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
};

export const BENCH_OPTIONS = {
  count: intParam("count", 1000),
  seed: intParam("seed", 1),
  profile: (params.get("profile") ?? "realistic") as SceneProfile,
  /**
   * Undefined unless the query string supplies one, and that is load-bearing.
   *
   * `generateScene` derives the world size from `count` when this is absent, so a
   * default of 20,000 here silently overrides the derivation and spreads 10,000
   * elements over a 20 km square. The page then draws about 26 of them and reports
   * a steady 60 fps -- which is what the first two baseline runs did before it was
   * caught.
   */
  worldSize: params.has("world") ? intParam("world", 0) : undefined,
  /**
   * 0 draws a plain geometric path; 1 and 2 generate a jittered rough shape.
   *
   * Comparing the two on an identical scene is how much of the renderer's cost
   * is roughjs, and it is the Level of Detail question before any LoD code
   * exists.
   */
  roughness: intParam("roughness", 1),
  /**
   * Frames discarded before sampling.
   *
   * The first paint includes font loading, the shape cache filling, and roughjs's
   * first call into a cold JIT. Counting that as steady state is how a benchmark
   * reports a number nobody can reproduce.
   */
  warmup: intParam("warmup", 20),
};

/* -------------------------------------------------------------------------- */
/* The imperative API holder                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Module scope, not React state.
 *
 * The driver polls `ready()` from outside React, and routing that through state
 * would mean the driver waits for a re-render to observe a mount that already
 * happened. One mutable holder, written by the editor's own callback and read by
 * the driver, has no such coupling.
 */
let excalidrawApi: ExcalidrawImperativeAPI | null = null;

/** Scene composition, so a reported number always states what it measured. */
let scene: SceneStats | null = null;

/* -------------------------------------------------------------------------- */
/* Frame sampling                                                              */
/* -------------------------------------------------------------------------- */

const FRAME_BUDGET_MS = 1000 / 60;

export type FrameReport = {
  /** Frames observed, after warmup. */
  frames: number;
  /** Inter-frame durations in ms, sorted ascending. */
  durations: number[];
  /*
   * Mean inter-frame duration in ms. This is the primary cost signal, and the
   * percentiles below are secondary, for a reason that is easy to get wrong.
   *
   * rAF timestamps land on the vsync grid, so every *individual* duration is
   * rounded up to the next 16.67 ms multiple. Below one budget that is
   * invisible. Well above it, the rounding becomes the dominant term in the
   * measurement: at a true 70 ms frame cost the reported interval is 83.3 ms,
   * and percentiles computed off such samples resolve in 16.7 ms steps. Three
   * runs of one build at one zoom reported p50 values of 16.7, 133.3 and 200.0
   * ms -- spread that describes the grid, not the renderer.
   *
   * The mean is not quantised, because the grid phase does not repeat. What it
   * costs instead is sample size: a 3 s window at 80 ms per frame collects
   * about 37 samples, so a window has to be long enough to collect a few
   * hundred before the mean is worth quoting at all.
   */
  meanMs: number;
  p50: number;
  p95: number;
  max: number;
  /** Sustained frames per second, derived from the mean interval. */
  fps: number;
  /** Frames longer than one 60 Hz budget. */
  dropped: number;
};

const percentile = (sorted: readonly number[], p: number): number => {
  if (!sorted.length) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[index];
};

const summarise = (durations: number[]): FrameReport => {
  const sorted = [...durations].sort((a, b) => a - b);
  const total = durations.reduce((sum, d) => sum + d, 0);
  const meanMs = durations.length ? total / durations.length : 0;
  return {
    frames: durations.length,
    durations: sorted,
    meanMs,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? 0,
    fps: meanMs ? 1000 / meanMs : 0,
    /*
     * A dropped frame is one that *missed* a refresh, not one that landed a
     * microsecond late.
     *
     * The naive definition -- "longer than 1000/60 ms" -- is wrong, and wrong in
     * a way that looks like a bug in the renderer. At a vsync lock every interval
     * is nominally 16.667 ms, so floating-point jitter puts roughly half of them
     * marginally above the threshold. The first run of this harness reported 77
     * dropped frames at a steady 60.0 fps and p95 of 16.8 ms, which is
     * self-contradictory and was purely this arithmetic.
     *
     * A refresh is missed when the interval exceeds *two* budgets: the frame took
     * at least one whole extra vsync period. The 1.5x threshold sits comfortably
     * between "exactly on the boundary" and "genuinely late", so ordinary jitter
     * on either side cannot flip the count.
     */
    dropped: durations.filter((d) => d > FRAME_BUDGET_MS * 1.5).length,
  };
};

/* -------------------------------------------------------------------------- */
/* Driver surface                                                              */
/* -------------------------------------------------------------------------- */

type PendingMeasurement = {
  resolve: (report: FrameReport) => void;
  durations: number[];
  last: number;
  warmupLeft: number;
};

export type BenchSurface = {
  options: typeof BENCH_OPTIONS;
  stats: () => SceneStats | null;
  ready: () => boolean;
  heap: () => { usedBytes: number; limitBytes: number } | null;
  measure: (durationMs: number) => Promise<FrameReport>;
  /**
   * Set the viewport zoom, exactly.
   *
   * A wheel gesture cannot produce a controlled sweep: it reports whatever
   * fraction the browser chose, which differs per platform, per device pixel
   * ratio and per gesture. Criterion 5 names specific levels -- 10% to 400% --
   * so the levels have to be set rather than nudged.
   *
   * `Zoom` is a plain readonly `{ value }`, so this needs no constructor and no
   * reach into the editor's internals.
   */
  setZoom: (value: number) => void;
  /** The current zoom, as the editor reports it. */
  getZoom: () => number | null;
  frameBudgetMs: number;
};

const installDriverSurface = () => {
  let pending: PendingMeasurement | null = null;

  /*
   * One rAF loop for the page's lifetime rather than one per measurement.
   *
   * A loop started per measurement would be racing the frame it is trying to
   * measure, and would attribute its own scheduling delay to the renderer. It
   * also cannot be cancelled cleanly, so a second measurement would end up with
   * two loops racing each other.
   */
  const tick = (now: number) => {
    const current = pending;
    if (current) {
      if (current.warmupLeft > 0) {
        current.warmupLeft -= 1;
      } else if (current.last !== 0) {
        current.durations.push(now - current.last);
      }
      current.last = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const heap = () => {
    // `performance.memory` is Chromium-only and non-standard. Null where the
    // browser withholds it, rather than a fabricated zero -- a zero would read as
    // "no memory used" and sail past a 500 MB budget.
    const memory = (
      performance as Performance & {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      }
    ).memory;
    return memory
      ? { usedBytes: memory.usedJSHeapSize, limitBytes: memory.jsHeapSizeLimit }
      : null;
  };

  const surface: BenchSurface = {
    options: BENCH_OPTIONS,
    stats: () => scene,
    ready: () => excalidrawApi !== null,
    heap,
    /**
     * Sample frame intervals for `durationMs`.
     *
     * This only starts and stops the sampler. The input is injected from
     * outside so it goes through the browser's real event pipeline rather than a
     * synthetic dispatch that skips hit testing and event delegation -- the
     * things a canvas app is actually slow at.
     */
    measure: (durationMs: number) => {
      const durations: number[] = [];
      const warmupLeft = BENCH_OPTIONS.warmup;
      return new Promise<FrameReport>((resolve) => {
        pending = { resolve, durations, last: 0, warmupLeft };
        setTimeout(() => {
          if (pending) {
            pending = null;
            resolve(summarise(durations));
          }
        }, durationMs);
      });
    },
    setZoom: (value: number) => {
      excalidrawApi?.updateScene({
        appState: { zoom: { value: value as NormalizedZoomValue } },
        // Never recorded: the sweep is a viewport change, not an edit, and
        // capturing it would put every zoom step in the undo stack.
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    getZoom: () => {
      const state = excalidrawApi?.getAppState();
      return state ? state.zoom.value : null;
    },
    frameBudgetMs: FRAME_BUDGET_MS,
  };

  (window as unknown as { __bench: BenchSurface }).__bench = surface;
  return surface;
};

/* -------------------------------------------------------------------------- */
/* The page                                                                    */
/* -------------------------------------------------------------------------- */

const Bench = () => {
  const sceneOptions = {
    count: BENCH_OPTIONS.count,
    seed: BENCH_OPTIONS.seed,
    profile: BENCH_OPTIONS.profile,
    worldSize: BENCH_OPTIONS.worldSize,
    roughness: BENCH_OPTIONS.roughness,
  };

  /*
   * `useMemo` is load-bearing, not an optimisation.
   *
   * A new array identity on every render makes the editor re-run element
   * reconciliation each time, which is exactly the per-frame work the benchmark
   * is trying to attribute to rendering. The scene depends only on the query
   * string, which cannot change without a reload.
   */
  const elements = useMemo(
    () => generateScene(sceneOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneOptions is
    // rebuilt on every render from module constants; the query string is immutable
    // for the life of the page, so these four values are the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      BENCH_OPTIONS.count,
      BENCH_OPTIONS.seed,
      BENCH_OPTIONS.profile,
      BENCH_OPTIONS.worldSize,
      BENCH_OPTIONS.roughness,
    ],
  );

  scene = sceneStats(elements, sceneOptions);

  const initialData = useCallback(() => ({ elements }), [elements]);

  const onExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI | null) => {
    excalidrawApi = api;
  }, []);

  return (
    <Excalidraw
      initialData={initialData}
      onExcalidrawAPI={onExcalidrawAPI}
      viewModeEnabled={false}
      zenModeEnabled={false}
      gridModeEnabled={false}
    />
  );
};

/* -------------------------------------------------------------------------- */
/* Mount                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Mount the benchmark instead of the app.
 *
 * Called from the real entry point, so the surface is installed before React
 * mounts and the driver can poll `ready()` rather than racing the first paint.
 */
export const mountBench = (rootElement: HTMLElement) => {
  installDriverSurface();
  createRoot(rootElement).render(
    <StrictMode>
      <Bench />
    </StrictMode>,
  );
};

/** Whether this page load asked for the benchmark. */
export const wantsBench = (search: string): boolean =>
  new URLSearchParams(search).get("bench") === "1";
