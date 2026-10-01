/**
 * The benchmark driver.
 *
 * Starts nothing itself -- the dev server is a separate, long-lived process,
 * because starting and stopping Vite around every measurement would put a module
 * graph compile inside the number. This file assumes a server is already up and
 * refuses to guess: a benchmark that silently measures a 404 page is worse than
 * one that refuses to run.
 *
 * ## How a measurement is taken
 *
 * 1. Load the bench page with a scene described in the query string.
 * 2. Wait for the editor to report ready, then for the first paint to settle.
 * 3. Ask the page to start sampling frame intervals.
 * 4. Inject **real** input through Playwright -- a pointer drag for pan, a wheel
 *    for zoom -- so it travels the browser's event pipeline rather than a
 *    synthetic dispatch that skips hit testing.
 * 5. Collect the report.
 *
 * Step 4 is the one that matters. Calling a render function directly would time
 * that function and miss every reason a canvas app actually stutters: event
 * handling, state updates, reconciliation, and compositing.
 */
import {
  launchBenchBrowser,
  readCanvasRenderer,
  type CanvasRenderer,
} from "./browser.js";

import type { sceneStats } from "./scene.js";

import type { Browser, Page } from "playwright";

import type { SceneProfile } from "./scene.js";

export type FrameReport = {
  frames: number;
  durations: number[];
  /** Wall-clock ms actually sampled. Independent of `durations`. */
  elapsedMs: number;
  p50: number;
  p95: number;
  max: number;
  fps: number;
  dropped: number;
};

export type BenchOptions = {
  /** Scene size. */
  count: number;
  /**
   * Launch windowed so the canvas gets hardware acceleration. Off by default
   * because headless is scriptable and this opens a window.
   */
  gpu?: boolean;
  profile: SceneProfile;
  seed: number;
  /**
   * Omit to derive the world size from `count` (see `worldSizeFor`), which is
   * what holds on-screen density constant.
   *
   * The first version pinned this to 20,000 px, which silently overrode the
   * derivation: the page then spread 10,000 elements over a 20 km square, drew
   * about 26 of them, and reported a confident 60.0 fps. A measurement that
   * ignores its own workload model is worse than no measurement, because it
   * looks like an answer.
   */
  worldSize?: number;
  /** Excalidraw `roughness`. 1 is the default; 0 skips roughjs entirely. */
  roughness?: number;
  /** Viewport size. Fixed by default so two runs are comparable. */
  viewport: { width: number; height: number };
  /** How long to sample, per scenario. */
  sampleMs: number;
  /** Base URL of an already-running dev server. */
  baseUrl: string;
  /** Zoom levels for the criterion-5 sweep. Empty to skip it. */
  zoomLevels?: readonly number[];
  /** Sample window per zoom level. */
  zoomSampleMs?: number;
};

export type ZoomLevelReport = {
  /** The zoom asked for. */
  requested: number;
  /** The zoom the editor actually applied, which may be clamped. */
  applied: number | null;
  frames: FrameReport;
};

export type ScenarioReport = {
  name: string;
  frames: FrameReport;
  /** Heap while the scenario ran, if the browser reports it. */
  heapBytes: number | null;
};

export type RunReport = {
  options: BenchOptions;
  scene: ReturnType<typeof sceneStats>;
  scenarios: ScenarioReport[];
  /** Criterion 5. Empty unless a zoom sweep was requested. */
  zoom: ZoomLevelReport[];
  /** Heap after everything, with caches warm. The "idle" figure. */
  idleHeapBytes: number | null;
  /** Chrome version, so a number is attributable to a renderer build. */
  userAgent: string;
  /**
   * What actually rasterised the canvas. Read back from the page, not assumed
   * from the launch flags, because headless Chromium accepts `--enable-gpu` and
   * still lands on SwiftShader.
   */
  renderer: CanvasRenderer;
};

const DEFAULTS = {
  viewport: { width: 1280, height: 800 },
  sampleMs: 3000,
  baseUrl: "http://localhost:3000",
};

/* -------------------------------------------------------------------------- */
/* Page interaction                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Pan by dragging with the space bar held.
 *
 * Excalidraw's canvas pans on space+drag or middle-drag. Space+drag is used
 * because Playwright can hold a modifier across a drag without a raw input
 * event, which is one fewer thing to trust.
 */
export const pan = async (page: Page, durationMs: number, distancePx = 400) => {
  const { width, height } = page.viewportSize() ?? DEFAULTS.viewport;
  const startX = Math.round(width / 2);
  const startY = Math.round(height / 2);
  const steps = Math.max(2, Math.round(durationMs / 16));

  await page.keyboard.down("Space");
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // A back-and-forth sweep rather than a straight drag: a straight drag runs off
  // the content and then measures an empty canvas, which flatters the result.
  for (let step = 0; step < steps; step += 1) {
    const phase = (step / steps) * Math.PI * 2;
    await page.mouse.move(
      startX + Math.cos(phase) * distancePx,
      startY + Math.sin(phase) * distancePx,
    );
  }
  await page.mouse.up();
  await page.keyboard.up("Space");
};

/**
 * Zoom with the wheel.
 *
 * The harder case, and the one the exit criterion names (10% to 400% with no
 * frame over 100 ms). Every wheel tick invalidates the bitmap cache at a new
 * scale, so this measures re-rasterisation rather than blitting.
 */
const wheelZoom = async (page: Page, durationMs: number) => {
  const { width, height } = page.viewportSize() ?? DEFAULTS.viewport;
  const x = Math.round(width / 2);
  const y = Math.round(height / 2);
  const ticks = Math.max(2, Math.round(durationMs / 50));
  await page.mouse.move(x, y);

  for (let tick = 0; tick < ticks; tick += 1) {
    // Alternate direction so the zoom sweeps a range and returns, exercising
    // cache eviction in both directions.
    await page.mouse.wheel(0, tick % 2 === 0 ? -120 : 120);
  }
};

/**
 * A controlled zoom sweep, for exit criterion 5: 10% to 400%, no frame over 100 ms.
 *
 * Each level is *set* rather than nudged by a wheel gesture. A wheel reports
 * whatever fraction the browser chose, which varies per platform and per device
 * pixel ratio, so a wheel sweep cannot land on 0.1 or 4.0 -- the two levels the
 * criterion actually names.
 *
 * ## The first version of this measured nothing
 *
 * It set the zoom, waited, and sampled. But a canvas that is not changing does
 * not repaint, so every sampled interval was just rAF cadence: a flat 16.7 ms at
 * every level, including 100% on a scene that costs 133 ms to actually draw. The
 * numbers looked like a pass and proved nothing.
 *
 * So each level now pans continuously *while* sampling. That is what a person
 * does at a given zoom -- they move around the board -- and it forces a real
 * repaint every frame, so the number is the cost of rendering at that zoom.
 */
const zoomSweep = async (
  page: Page,
  levels: readonly number[],
  sampleMsPerLevel: number,
): Promise<ZoomLevelReport[]> => {
  const reports: ZoomLevelReport[] = [];

  for (const level of levels) {
    await page.evaluate((zoom) => {
      (
        window as unknown as {
          __bench: { setZoom: (v: number) => void };
        }
      ).__bench.setZoom(zoom);
    }, level);

    // Let the re-rasterisation finish and the caches refill, so this measures the
    // board settled at that zoom rather than the zoom step itself.
    await page.waitForTimeout(500);

    const applied = await page.evaluate(() =>
      (
        window as unknown as { __bench: { getZoom: () => number | null } }
      ).__bench.getZoom(),
    );

    // Sample while panning, so frames actually render.
    const [frames] = await Promise.all([
      page.evaluate(
        (ms) =>
          (
            window as unknown as {
              __bench: { measure: (ms: number) => Promise<FrameReport> };
            }
          ).__bench.measure(ms),
        sampleMsPerLevel,
      ),
      pan(page, sampleMsPerLevel, 250),
    ]);

    reports.push({ requested: level, applied, frames });
  }

  return reports;
};

/** Let the browser settle: fonts loaded, shape cache filled, rAF quiet. */
export const settle = async (page: Page) => {
  await page.waitForFunction(
    () => {
      const bench = (window as { __bench?: { ready(): boolean } }).__bench;
      return bench?.ready() === true;
    },
    undefined,
    { timeout: 60_000 },
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // A few idle frames so the first interaction is not also the first paint.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let remaining = 10;
        const step = () =>
          remaining-- > 0 ? requestAnimationFrame(step) : resolve();
        requestAnimationFrame(step);
      }),
  );
};

/* -------------------------------------------------------------------------- */
/* Run                                                                         */
/* -------------------------------------------------------------------------- */

export const runBenchmark = async (
  overrides: Partial<BenchOptions> = {},
): Promise<RunReport> => {
  const options: BenchOptions = {
    count: 1000,
    profile: "realistic",
    seed: 1,

    ...DEFAULTS,
    ...overrides,
  };

  const url = new URL("/?bench=1", options.baseUrl);
  url.searchParams.set("count", String(options.count));
  url.searchParams.set("profile", options.profile);
  url.searchParams.set("seed", String(options.seed));
  if (options.worldSize !== undefined) {
    url.searchParams.set("world", String(options.worldSize));
  }
  if (options.roughness !== undefined) {
    url.searchParams.set("roughness", String(options.roughness));
  }

  const browser: Browser = await launchBenchBrowser(options.gpu ?? false);
  try {
    const page = await browser.newPage({ viewport: options.viewport });

    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    const response = await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    if (!response?.ok()) {
      throw new Error(
        `bench page did not load: HTTP ${response?.status()} at ${url.toString()}. ` +
          `Is the dev server running? Start it with "yarn start".`,
      );
    }

    await settle(page);

    const scene = await page.evaluate(() => {
      const bench = (window as { __bench?: { stats: () => unknown } }).__bench;
      return bench?.stats() ?? null;
    });
    if (!scene) {
      throw new Error("bench page mounted but reported no scene statistics");
    }

    const scenarios: ScenarioReport[] = [];

    for (const [name, drive] of [
      ["pan", pan],
      ["wheel-zoom", wheelZoom],
    ] as const) {
      // Start the sampler, then drive. The page's `measure` resolves after
      // `sampleMs`, so the driver's own duration is the same window -- the input
      // has to cover it or there are idle frames counted as fast frames.
      const [frames, heapBytes] = await Promise.all([
        page.evaluate(
          (ms) =>
            (
              window as unknown as {
                __bench: { measure: (ms: number) => Promise<FrameReport> };
              }
            ).__bench.measure(ms),
          options.sampleMs,
        ),
        drive(page, options.sampleMs),
      ]);
      scenarios.push({ name, frames, heapBytes: heapBytes as number | null });
    }

    // Criterion 5 last, after the pan and zoom scenarios, so it runs against
    // caches already warm rather than adding a cold-start confound.
    const zoomReport =
      options.zoomLevels && options.zoomLevels.length
        ? await zoomSweep(
            page,
            options.zoomLevels,
            options.zoomSampleMs ?? 1200,
          )
        : [];

    // Idle heap: after the work, with caches warm. The exit criterion is "under
    // 500 MB idle", and "idle" is only meaningful once the caches have settled
    // rather than before they have been filled by work.
    await page.waitForTimeout(1000);
    const idleHeapBytes = await page.evaluate(() => {
      const bench = (
        window as { __bench?: { heap(): { usedBytes: number } | null } }
      ).__bench;
      return bench?.heap()?.usedBytes ?? null;
    });

    if (consoleErrors.length) {
      // Not fatal -- the editor logs benign warnings -- but they belong in the
      // report, because a page error during a measurement makes the number
      // untrustworthy and the cause is usually visible in the log.
      console.error(
        `  page reported ${consoleErrors.length} error(s); first: ${consoleErrors[0]}`,
      );
    }

    return {
      options,
      scene: scene as RunReport["scene"],
      scenarios,
      zoom: zoomReport,
      idleHeapBytes,
      userAgent: await page.evaluate(() => navigator.userAgent),
      renderer: await readCanvasRenderer(browser),
    };
  } finally {
    await browser.close();
  }
};

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

const MB = 1024 * 1024;

export const formatReport = (report: RunReport): string => {
  const lines: string[] = [];
  const { scene, options } = report;

  lines.push(
    `  scene     ${scene.count} elements, profile "${scene.profile}", seed ${scene.seed}`,
  );
  lines.push(
    `  spread    ${Math.round(
      scene.extent.maxX - scene.extent.minX,
    )} x ${Math.round(scene.extent.maxY - scene.extent.minY)} px`,
  );
  lines.push(
    `  types     ${Object.entries(scene.byType)
      .map(([type, n]) => `${type} ${n}`)
      .join(", ")}`,
  );
  lines.push(
    `  viewport  ${options.viewport.width}x${options.viewport.height}  |  sampled ${options.sampleMs}ms per scenario`,
  );
  lines.push(
    `  on-screen ~${scene.expectedVisible} of ${scene.count} elements in a ${scene.worldSize}px world`,
  );
  lines.push("");

  lines.push(
    `  ${"scenario".padEnd(8)}${"fps".padStart(7)}${"mean*".padStart(
      8,
    )}${"frames".padStart(8)}${"elapsed".padStart(9)}${"p50".padStart(
      8,
    )}${"p95".padStart(8)}${"max".padStart(8)}${"dropped".padStart(9)}`,
  );
  lines.push(`  ${"-".repeat(72)}`);
  for (const { name, frames } of report.scenarios) {
    lines.push(
      `  ${name.padEnd(8)}${frames.fps.toFixed(1).padStart(7)}` +
        `${frames.meanMs.toFixed(1).padStart(8)}${frames.frames
          .toString()
          .padStart(8)}` +
        `${(frames.elapsedMs / 1000).toFixed(1).padStart(9)}` +
        `${frames.p50.toFixed(1).padStart(8)}${frames.p95
          .toFixed(1)
          .padStart(8)}` +
        `${frames.max.toFixed(1).padStart(8)}${frames.dropped
          .toString()
          .padStart(9)}`,
    );
  }
  lines.push("");
  lines.push(
    "  fps is frames over wall clock, and is the figure to trust. mean* is",
  );
  lines.push(
    "  the mean gap between consecutive rAF callbacks: under a long block the",
  );
  lines.push(
    "  callback and the timeout run back to back, so it reports the gap after",
  );
  lines.push("  the block rather than the block itself.");

  lines.push("");
  if (report.zoom.length) {
    lines.push("");
    lines.push("  ZOOM SWEEP — criterion 5: 10% to 400%, no frame over 100 ms");
    lines.push(
      `  ${"zoom".padEnd(7)}${"applied".padStart(9)}${"fps".padStart(
        7,
      )}${"mean*".padStart(8)}${"frames".padStart(8)}${"max".padStart(
        8,
      )}${"over100ms".padStart(11)}`,
    );
    lines.push(`  ${"-".repeat(51)}`);
    for (const level of report.zoom) {
      const breaches = level.frames.durations.filter((d) => d > 100).length;
      const applied =
        level.applied === null ? "?" : `${Math.round(level.applied * 100)}%`;
      /*
       * A level that collected no frames has no result, and printing 0.0 for it
       * is the single most dangerous thing this report can do: 0.0 is the best
       * possible frame time, so an empty measurement reads as a perfect one.
       * That happened -- a level that starved to zero frames reported "0.0" and
       * the run still printed PASSES. A missing measurement must look missing.
       */
      if (level.frames.frames === 0) {
        lines.push(
          `  ${`${Math.round(level.requested * 100)}%`.padEnd(7)}` +
            `${applied.padStart(9)}` +
            `${"NO DATA".padStart(8)}` +
            `${"-".padStart(8)}` +
            `${"0".padStart(8)}` +
            `${"-".padStart(8)}` +
            `${"-".padStart(11)}`,
        );
        continue;
      }
      lines.push(
        `  ${`${Math.round(level.requested * 100)}%`.padEnd(7)}` +
          `${applied.padStart(9)}` +
          `${level.frames.fps.toFixed(2).padStart(7)}` +
          `${level.frames.meanMs.toFixed(1).padStart(8)}` +
          `${level.frames.frames.toString().padStart(8)}` +
          `${level.frames.max.toFixed(1).padStart(8)}` +
          `${breaches.toString().padStart(11)}`,
      );
    }

    /*
     * A pass requires evidence from every level the criterion names. A level with
     * no frames is not a fast level, it is an unmeasured one, and the verdict has
     * to say so rather than pass on the levels that happened to report.
     */
    const starved = report.zoom.filter((z) => z.frames.frames === 0);
    const worst = Math.max(...report.zoom.map((z) => z.frames.max));
    lines.push("");
    if (starved.length) {
      lines.push(
        `  CANNOT JUDGE criterion 5: no frames collected at ${starved
          .map((z) => `${Math.round(z.requested * 100)}%`)
          .join(", ")}.`,
      );
      lines.push(
        "  A level with no frames is unmeasured, not fast. The other levels'",
      );
      lines.push("  numbers say nothing about it.");
    } else if (worst <= 100) {
      lines.push(
        `  PASSES criterion 5: worst frame ${worst.toFixed(
          1,
        )} ms against a 100 ms budget.`,
      );
    } else {
      lines.push(
        `  FAILS criterion 5: worst frame ${worst.toFixed(
          1,
        )} ms against a 100 ms budget.`,
      );
    }
  }

  lines.push(
    `  heap      ${
      report.idleHeapBytes === null
        ? "unavailable"
        : `${(report.idleHeapBytes / MB).toFixed(1)} MB idle`
    }`,
  );
  lines.push(
    `  browser   ${report.userAgent.replace(/^.*?(Chrome\/[\d.]+).*$/, "$1")}`,
  );

  /*
   * The renderer line is not metadata. Every millisecond above depends on it: a
   * software blit measured 4.8 us and a hardware one is several times cheaper,
   * so a number printed without this is not comparable to any other machine's,
   * including a user's. A `--gpu` run that still reports software has failed, and
   * says so here rather than passing software figures off as hardware.
   */
  lines.push(
    `  canvas    ${report.renderer.kind.toUpperCase()}  ${
      report.renderer.raw || "(renderer not reported)"
    }`,
  );
  if (report.options.gpu && report.renderer.kind !== "gpu") {
    lines.push(
      "            WARNING: --gpu was requested but the canvas is not hardware",
    );
    lines.push(
      "            accelerated. These numbers are software-rasterised. Do not",
    );
    lines.push("            compare them against a GPU run.");
  }
  lines.push("");
  lines.push("  'dropped' counts frames over one 60 Hz budget (16.7 ms).");

  return lines.join("\n");
};
