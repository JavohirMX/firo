/**
 * Chrome tracing of the renderer, for the 10% zoom stall.
 *
 * ## Why this exists when there is already a profiler
 *
 * Criterion 5 fails at 10% zoom — about 3.3 fps against 101 fps at 50% — and the JS
 * CPU profiler has now said *twice* that the cost is not in the renderer's code. At
 * that zoom a profile attributes 81–93% of the frame to `(idle)` and `(program)`,
 * and every individual JS function stays under 3%.
 *
 * `(program)` is not a place. It is the profiler's label for time on the main thread
 * that belongs to no JavaScript frame: browser-internal work. And that is exactly the
 * question, because the whole stall may be browser work the renderer never asked for.
 *
 * So this uses CDP `Tracing` with the `devtools.timeline` categories, which report
 * named browser events — `Paint`, `RasterTask`, `Commit`, `LayerTree`,
 * `ImageDecodeTask`, `UpdateLayerTree`, `DrawFrame` — with real durations. It is the
 * instrument that can see what a sampling profiler cannot name.
 *
 * ## What it is honest about
 *
 * **Timeline events are not frames.** Several events nest inside one another's time,
 * so the sum of every event's duration can exceed the wall clock by a wide margin.
 * This module reports the top events *by total duration* and says so, rather than
 * presenting a percentage of the frame that does not mean anything. Comparing two
 * zoom levels side by side is the sound reading; a single percentage is not.
 *
 * **It is a Chrome trace, so it is a Chromium trace.** Nothing here is specific to
 * Chromium's event names, and the finding is about this browser on this machine.
 *
 * **It measures, it does not conclude.** A trace says where time went. Whether the
 * thing it found is worth changing is a judgement, and the plan's own lesson — that a
 * ranked profile is not a substitute for a control — applies to this output too.
 */

import { launchBenchBrowser, readCanvasRenderer } from "./browser.js";
import { pan, settle } from "./harness.js";

import type { Browser, CDPSession, Page } from "playwright";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/** One event as CDP delivers it. Timestamps are microseconds, monotonic. */
export type TraceEvent = {
  name: string;
  /** Trace domain, e.g. `disabled-by-default-devtools.timeline`. */
  cat?: string;
  ph: "B" | "E" | "X" | "I" | string;
  ts: number;
  dur?: number;
  pid?: number;
  tid?: number;
  args?: Record<string, unknown>;
};

/** Total time attributed to one event name. */
export type EventCost = {
  name: string;
  count: number;
  /** Sum of `dur` across every occurrence, in milliseconds. */
  totalMs: number;
  /** Longest single occurrence, in milliseconds. */
  maxMs: number;
};

export type TraceReport = {
  /** What this run is a report *of* — "zoom 0.1" or "zoom 0.5". */
  label: string;
  /** What the page's canvas was actually rasterised by, since it changes the answer. */
  renderer: string;
  /** Wall clock of the traced window. */
  windowMs: number;
  /** Events seen, and how many carried a duration. */
  events: number;
  timed: number;
  /** By total duration, descending. */
  costs: EventCost[];
  /**
   * The single longest event, for naming the mechanism when one dominates.
   */
  longest: EventCost | null;
};

/* -------------------------------------------------------------------------- */
/* Aggregation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Sum durations by event name.
 *
 * `B`/`E` pairs are turned into one event of the pair's duration, because CDP emits
 * them as separate entries and counting only the `B` would report a duration of zero
 * for every nested event — which is most of them.
 *
 * `X` events carry their own duration and are used directly.
 *
 * `I` (instant) events have no duration and are counted but not timed. They are
 * things like `TracingStartedInBrowser` and `DrawFrame`'s marker variants, and
 * including their absence-from-the-timing would make the count look like a bug.
 */
export const aggregateEvents = (events: readonly TraceEvent[]): EventCost[] => {
  const totals = new Map<string, EventCost>();
  /** Open `B` events, per thread. Nested pairs are a stack, not a single slot. */
  const open = new Map<string, { name: string; ts: number }[]>();

  const slot = (name: string): EventCost => {
    let cost = totals.get(name);
    if (!cost) {
      cost = { name, count: 0, totalMs: 0, maxMs: 0 };
      totals.set(name, cost);
    }
    return cost;
  };

  for (const event of events) {
    const thread = `${event.pid ?? 0}:${event.tid ?? 0}`;

    if (event.ph === "B") {
      const stack = open.get(thread) ?? [];
      stack.push({ name: event.name, ts: event.ts });
      open.set(thread, stack);
      slot(event.name).count += 1;
      continue;
    }

    if (event.ph === "E") {
      const stack = open.get(thread);
      const started = stack?.pop();
      if (!started) {
        // An `E` with no `B` on this thread. Counted as seen, not as timed, so a
        // truncated trace cannot inflate a duration.
        slot(event.name).count += 1;
        continue;
      }
      const cost = slot(started.name);
      const ms = Math.max(0, event.ts - started.ts) / 1000;
      cost.totalMs += ms;
      cost.maxMs = Math.max(cost.maxMs, ms);
      continue;
    }

    if (event.ph === "X") {
      const cost = slot(event.name);
      const ms = Math.max(0, event.dur ?? 0) / 1000;
      cost.totalMs += ms;
      cost.maxMs = Math.max(cost.maxMs, ms);
      continue;
    }

    // `I` and anything unrecognised: seen, not timed.
    slot(event.name).count += 1;
  }

  return [...totals.values()].sort((a, b) => b.totalMs - a.totalMs);
};

/* -------------------------------------------------------------------------- */
/* Capture                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Trace categories.
 *
 * `devtools.timeline` is the renderer-and-browser event set DevTools' performance panel
 * uses: paint, raster, commit, layer tree. The `disabled-by-default-` prefix is how
 * Chromium ships the useful ones, and it is not optional — without it the trace comes
 * back nearly empty, which looks like an absence of cost rather than an absence of
 * instrumentation.
 *
 * `v8.execute` and `blink.user_timing` are included so JavaScript shows up in the same
 * table as browser work. Not because it is expected to be large — the CPU profiler
 * already said it is not — but so the report can say "JS is a rounding error next to
 * `RunTask`" from one measurement rather than two.
 *
 * `RunTask` and `GPUTask` are the two that matter most for the stall, and both are in
 * the default set: `RunTask` is "the main thread did something" and is what
 * `(program)` decomposes into; `GPUTask` is the GPU process, which a JS CPU profile
 * cannot see at all.
 */
const CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "v8.execute",
  "blink.user_timing",
].join(",");

/**
 * Run the browser's own trace for the duration of `work`.
 *
 * Events arrive as they happen, on the CDP session, and are buffered here rather than
 * written to a file. The output this tool needs is a ranked table; a 40 MB `.json`
 * trace on disk would be more faithful and much less readable, and `chrome://tracing`
 * remains available to anyone who wants the raw thing.
 */
const withTrace = async <T>(
  cdp: CDPSession,
  work: () => Promise<T>,
): Promise<{ result: T; events: TraceEvent[] }> => {
  const events: TraceEvent[] = [];

  const onData = (payload: unknown): void => {
    const value = payload as { value?: TraceEvent[] };
    if (Array.isArray(value?.value)) {
      events.push(...value.value);
    }
  };

  cdp.on("Tracing.dataCollected", onData);

  try {
    /*
     * `categories`, the legacy string parameter, and not `traceConfig`.
     *
     * `traceConfig` is the modern form and it is the obvious choice, and this Chromium
     * build rejects it outright — every variant, including the bare
     * `{ includedCategories }`, returns `Protocol error (Tracing.start): Invalid
     * parameters`. Probed rather than assumed: four parameter shapes were tried against
     * a live browser and only the legacy string was accepted.
     *
     * So the string form is used, and the reason is here rather than in a commit
     * message, because the next person to modernise this will hit the same wall and
     * should not spend an hour on it. It produces the full event set — a control run
     * drew a canvas in a loop and returned `RunTask`, `GPUTask`, `Commit`, `PrePaint`,
     * `RasterTask`, `FireAnimationFrame`, `FunctionCall`, `UpdateLayer` and `Layerize`,
     * which is everything this report needs.
     */
    await cdp.send("Tracing.start", { categories: CATEGORIES });

    const result = await work();

    const complete = new Promise<void>((resolve) => {
      cdp.once("Tracing.tracingComplete", () => resolve());
    });
    await cdp.send("Tracing.end");
    await complete;

    return { result, events };
  } finally {
    cdp.off("Tracing.dataCollected", onData);
  }
};

/* -------------------------------------------------------------------------- */
/* Run                                                                         */
/* -------------------------------------------------------------------------- */

export type TraceOptions = {
  baseUrl: string;
  count: number;
  worldSize: number;
  /** Windowed, so the canvas gets a real GPU. See `browser.ts` for why this matters. */
  gpu: boolean;
  /** Zoom levels to trace at, one report each. */
  zooms: readonly number[];
  /** How long to trace at each zoom. */
  durationMs: number;
  viewport: { width: number; height: number };
};

const DEFAULTS: TraceOptions = {
  baseUrl: "http://localhost:3000",
  count: 10_000,
  worldSize: 1024,
  gpu: true,
  // The two ends of the finding: where it is slow, and where it is not. A trace at
  // only the slow zoom cannot be read, because there is nothing to compare it to.
  zooms: [0.1, 0.5],
  durationMs: 4000,
  viewport: { width: 1280, height: 800 },
};

const openScene = async (
  browser: Browser,
  options: TraceOptions,
): Promise<Page> => {
  const page = await browser.newPage({ viewport: options.viewport });
  const url = new URL("/", options.baseUrl);
  url.searchParams.set("bench", "1");
  url.searchParams.set("count", String(options.count));
  url.searchParams.set("world", String(options.worldSize));

  const response = await page.goto(url.toString(), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  if (!response?.ok()) {
    throw new Error(
      `bench page did not load: HTTP ${response?.status()} at ${url.toString()}. ` +
        `Is the dev server running?`,
    );
  }
  await settle(page);
  return page;
};

const setZoom = async (page: Page, zoom: number): Promise<void> => {
  await page.evaluate((value) => {
    (
      window as unknown as { __bench: { setZoom: (v: number) => void } }
    ).__bench.setZoom(value);
  }, zoom);
  /*
   * Settled *after* the zoom, deliberately.
   *
   * Arriving at a new zoom invalidates every cached bitmap, and that cost is real but
   * is not what is being measured — it happens once, and a user zooming to 10% pays it
   * once. Tracing it would put a one-off cost into a steady-state measurement.
   */
  await settle(page);
};

export const traceScenes = async (
  overrides: Partial<TraceOptions> = {},
): Promise<TraceReport[]> => {
  const options = { ...DEFAULTS, ...overrides };

  const browser = await launchBenchBrowser(options.gpu);
  try {
    const renderer = await readCanvasRenderer(browser);
    const reports: TraceReport[] = [];

    for (const zoom of options.zooms) {
      const page = await openScene(browser, options);
      try {
        await setZoom(page, zoom);
        const cdp = await page.context().newCDPSession(page);

        const { events } = await withTrace(cdp, () =>
          pan(page, options.durationMs, 300),
        );

        const costs = aggregateEvents(events).filter(
          (cost) => cost.totalMs > 0,
        );
        const timed = costs.filter((c) => c.totalMs > 0);

        reports.push({
          label: `zoom ${zoom}`,
          renderer: renderer.raw,
          windowMs: options.durationMs,
          events: events.length,
          timed: timed.length,
          costs: timed.slice(0, 12),
          longest: timed[0] ?? null,
        });
      } finally {
        await page.close();
      }
    }

    return reports;
  } finally {
    await browser.close();
  }
};

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

const pad = (value: string, width: number): string => value.padEnd(width);

export const formatTrace = (reports: readonly TraceReport[]): string => {
  const lines: string[] = [];

  lines.push("");
  lines.push("  CHROME TRACE — browser-internal work, by event name");
  lines.push("");
  lines.push(
    "  Durations are summed per event name and nest, so they can exceed the wall",
    "  clock. Read this as a ranking compared across zoom levels, not as a",
    "  percentage of a frame. A JS CPU profile cannot see any of these events.",
  );

  for (const report of reports) {
    lines.push("");
    lines.push(`  ${report.label}`);
    lines.push(`    canvas rasteriser: ${report.renderer}`);
    lines.push(
      `    traced ${report.windowMs} ms, ${report.events} events, ` +
        `${report.timed} timed names`,
    );
    lines.push("");
    lines.push(
      `    ${pad("event", 26)}${"count".padStart(8)}${"total ms".padStart(
        12,
      )}${"max ms".padStart(11)}`,
    );
    lines.push(`    ${"-".repeat(57)}`);

    for (const cost of report.costs) {
      lines.push(
        `    ${pad(cost.name, 26)}${String(cost.count).padStart(8)}` +
          `${cost.totalMs.toFixed(1).padStart(12)}` +
          `${cost.maxMs.toFixed(1).padStart(11)}`,
      );
    }

    if (report.costs.length === 0) {
      lines.push(
        "    (no timed events — the trace categories were not instrumented)",
      );
    }
  }

  lines.push("");
  return lines.join("\n");
};
