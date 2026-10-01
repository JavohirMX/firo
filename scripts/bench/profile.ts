/**
 * CPU profiling of the renderer.
 *
 * ## Why this profiles twice and diffs
 *
 * A single CPU profile of a dense frame tells you what is slow, but not what is
 * *slow because there are many elements*. Every profile contains the same fixed
 * work -- React, event dispatch, the editor's own bookkeeping -- and that work
 * is present whether the board holds 400 notes or 10,000.
 *
 * So this profiles a light scene and a dense scene with identical settings, and
 * reports the difference. A function whose self-time barely moves between the two
 * is fixed overhead and is not the problem. A function whose self-time scales with
 * the element count is per-element cost, and that is the list worth reading.
 *
 * This matters because the whole Phase 2 decision rests on one ratio: how much of
 * the per-element cost is fixed loop overhead versus actual drawing. The profile
 * answers it directly, where reasoning about it has been wrong twice.
 */
import { launchBenchBrowser } from "./browser.js";
import { pan, settle } from "./harness.js";

import type { Browser, CDPSession, Page } from "playwright";

export type ProfileOptions = {
  baseUrl: string;
  /** Launch windowed for hardware acceleration. See `browser.ts`. */
  gpu?: boolean;
  count: number;
  /**
   * World size. This is the lever that sets how many elements are on screen:
   * a small world in a large viewport means everything is visible.
   */
  worldSize: number;
  viewport: { width: number; height: number };
  /** How long to profile while panning. */
  durationMs: number;
  /** Chrome sampling interval, in microseconds. */
  samplingIntervalUs: number;
};

export type FunctionCost = {
  name: string;
  /** Where it lives, collapsed to something readable. */
  where: string;
  /** Self time in ms, summed across all samples. */
  selfMs: number;
  /**
   * Inclusive time in ms: this function plus everything it called. Left at 0 by
   * the self-time pass, which does not walk the tree. Kept separate from
   * `selfMs` rather than overloading it, because a field that means two
   * different things depending on which pass filled it in is how a report ends
   * up labelling per-sample numbers as per-frame.
   */
  inclMs: number;
  samples: number;
};

export type ProfileReport = {
  label: string;
  worldSize: number;
  /** Expected elements on screen, from the scene's own model. */
  expectedVisible: number;
  /** Frames the profiler saw, for context on the totals. */
  frames: number;
  totalSelfMs: number;
  /**
   * Sum of inclusive time across all functions. Larger than `totalSelfMs`,
   * because a sample is counted once per distinct function on its stack. It is
   * a scale figure, not a frame time: do not divide it by anything and call the
   * result milliseconds per frame.
   */
  totalInclMs: number;
  /** The root-to-node chain that owns the most sampled time, outermost first. */
  heaviestPath: string[];
  /** Flat self-time pass, ranked by self time. */
  functions: FunctionCost[];
  /** Tree pass, ranked by inclusive time. Same shape, different meaning. */
  inclusive: FunctionCost[];
};

const DEFAULTS: ProfileOptions = {
  baseUrl: "http://localhost:3000",
  count: 10000,
  worldSize: 500,
  viewport: { width: 1280, height: 800 },
  durationMs: 4000,
  samplingIntervalUs: 100,
};

/* -------------------------------------------------------------------------- */
/* Profiling                                                                   */
/* -------------------------------------------------------------------------- */

export type CpuProfile = {
  nodes: {
    id: number;
    callFrame: { functionName: string; url: string; lineNumber: number };
    children?: number[];
  }[];
  samples?: number[];
  timeDeltas?: number[];
};

/**
 * Collapse a profile URL into something readable.
 *
 * A bundle URL carries a hash and a query string, and the same function can
 * appear under two of them. Keeping the path and dropping the rest makes two
 * profiles comparable and the output short enough to read.
 */
const whereOf = (url: string, lineNumber: number): string => {
  if (!url) {
    return "(native)";
  }
  const clean = url.split("?")[0].split("#")[0];
  const file = clean.split("/").pop() ?? clean;
  if (
    clean.startsWith("http://localhost") &&
    clean.includes("/node_modules/")
  ) {
    return `node_modules/${clean.split("/node_modules/")[1]}`;
  }
  if (clean.startsWith("http://localhost")) {
    return `${file}:${lineNumber + 1}`;
  }
  return file;
};

export function aggregate(profile: CpuProfile): FunctionCost[] {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  // sampleTime[i] is the time spent in samples[i]'s node since the previous sample
  const deltas = profile.timeDeltas ?? [];
  const samples = profile.samples ?? [];

  const totals = new Map<string, FunctionCost>();

  for (const [index, nodeId] of samples.entries()) {
    const deltaUs = deltas[index] ?? 0;
    const ms = deltaUs / 1000;
    const node = byId.get(nodeId);
    if (!node) {
      continue;
    }
    const { functionName, url, lineNumber } = node.callFrame;
    const where = whereOf(url, lineNumber);
    // Anonymous frames are numerous and rarely the story. Grouped, not dropped:
    // a whole bucket of them is itself a finding.
    const name = functionName || "(anonymous)";
    const key = `${name}|${where}`;
    const entry = totals.get(key) ?? {
      name,
      where,
      selfMs: 0,
      inclMs: 0,
      samples: 0,
    };
    entry.selfMs += ms;
    entry.samples += 1;
    totals.set(key, entry);
  }

  return [...totals.values()].sort((a, b) => b.selfMs - a.selfMs);
}

/**
 * Self time alone cannot answer "where does the frame go".
 *
 * Self time says a function was *on the stack* when a sample was taken. It does
 * not say what that function was *responsible for*. A blit that costs 5 us
 * attributed to `setTransform` looks identical to one attributed to whatever
 * called it, and the two call for completely different fixes.
 *
 * Inclusive time sums a function together with everything it called, so
 * `renderScene` owning 60 ms of a 66 ms frame is a statement about the frame,
 * not about one instruction. The two views disagree often enough that reading
 * only one of them is reading half the profile.
 *
 * ## Recursion
 *
 * Naively walking the tree and adding each node's self time to every ancestor
 * double-counts: `renderScene -> renderElements -> renderScene` would charge the
 * inner `renderScene` twice. A node already on the current path is skipped, so
 * each sample contributes to each *distinct* function at most once.
 */
export function inclusive(profile: CpuProfile): {
  totals: FunctionCost[];
  heaviestPath: string[];
} {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const deltas = profile.timeDeltas ?? [];
  const samples = profile.samples ?? [];

  // Parent links, so a sample can be walked up its stack.
  const parentOf = new Map<number, number>();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) {
      parentOf.set(child, node.id);
    }
  }

  const totals = new Map<string, FunctionCost>();
  // The stack of the single most expensive sample. A ranked list says which
  // functions cost; this says what the frame was actually doing, which is the
  // question a list cannot answer.
  let heaviestMs = 0;
  let heaviestPath: string[] = [];

  for (const [index, nodeId] of samples.entries()) {
    const ms = (deltas[index] ?? 0) / 1000;
    if (ms <= 0 || !byId.has(nodeId)) {
      continue;
    }

    /*
     * Charge this sample to every distinct function on its stack, once.
     *
     * Walking the tree and adding each node's self time to every ancestor is the
     * obvious implementation and it is wrong: a recursive call reappears as a
     * node with its ancestors' time already folded in, so the function gets
     * charged again for time it was not on the stack for. Chrome reports the
     * render loop as genuinely recursive, so that is the normal shape here, not
     * a corner case.
     *
     * Charging per sample per distinct function has no such fold to double, and
     * it means the total for any one function can never exceed the time actually
     * sampled -- which is the invariant worth being able to assert.
     */
    const onStack = new Set<number>();
    const stack: string[] = [];
    let current: number | undefined = nodeId;

    while (current !== undefined && !onStack.has(current)) {
      onStack.add(current);
      const node = byId.get(current);
      if (!node) {
        break;
      }
      const name = node.callFrame.functionName || "(anonymous)";
      const where = whereOf(node.callFrame.url, node.callFrame.lineNumber);
      const key = `${name}|${where}`;
      const entry = totals.get(key) ?? {
        name,
        where,
        selfMs: 0,
        inclMs: 0,
        samples: 0,
      };
      entry.inclMs += ms;
      totals.set(key, entry);
      stack.push(`${name} (${where})`);
      current = parentOf.get(current);
    }

    // `stack` is innermost first; the report reads outermost first.
    if (ms > heaviestMs) {
      heaviestMs = ms;
      heaviestPath = stack.reverse();
    }
  }

  const list = [...totals.values()].sort((a, b) => b.inclMs - a.inclMs);
  return { totals: list, heaviestPath };
}

const capture = async (
  page: Page,
  cdp: CDPSession,
  options: ProfileOptions,
): Promise<CpuProfile> => {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", {
    interval: options.samplingIntervalUs,
  });
  await cdp.send("Profiler.start");
  // Pan while profiling, so the profile contains drawing rather than idle rAF.
  await pan(page, options.durationMs, 300);
  const { profile } = await cdp.send("Profiler.stop");
  return profile as unknown as CpuProfile;
};

/* -------------------------------------------------------------------------- */
/* Run                                                                         */
/* -------------------------------------------------------------------------- */

const openScene = async (
  browser: Browser,
  options: ProfileOptions,
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
      `bench page did not load: HTTP ${response?.status()} at ${url.toString()}. Is the dev server running?`,
    );
  }
  await settle(page);
  return page;
};

export const profileScenes = async (
  overrides: Partial<ProfileOptions> = {},
): Promise<{
  light: ProfileReport;
  dense: ProfileReport;
  delta: FunctionCost[];
}> => {
  const options = { ...DEFAULTS, ...overrides };

  const browser = await launchBenchBrowser(options.gpu ?? false);
  try {
    const toReport = (
      label: string,
      worldSize: number,
      expectedVisible: number,
      profile: CpuProfile,
    ): ProfileReport => {
      const functions = aggregate(profile);
      const incl = inclusive(profile);
      return {
        label,
        worldSize,
        expectedVisible,
        frames: (profile.samples ?? []).length,
        totalSelfMs: functions.reduce((sum, f) => sum + f.selfMs, 0),
        totalInclMs: incl.totals.reduce((sum, f) => sum + f.inclMs, 0),
        heaviestPath: incl.heaviestPath,
        functions,
        inclusive: incl.totals,
      };
    };

    // Light: a large world, so only a few hundred elements are on screen.
    const lightPage = await openScene(browser, { ...options, worldSize: 5060 });
    const lightCdp = await lightPage.context().newCDPSession(lightPage);
    const lightProfile = await capture(lightPage, lightCdp, options);
    await lightPage.close();

    // Dense: everything visible.
    const densePage = await openScene(browser, options);
    const denseCdp = await densePage.context().newCDPSession(densePage);
    const denseProfile = await capture(densePage, denseCdp, options);
    await densePage.close();

    const light = toReport("light", 5060, 400, lightProfile);
    const dense = toReport(
      "dense",
      options.worldSize,
      options.count,
      denseProfile,
    );

    /*
     * The diff, which is the actual output.
     *
     * Self time is normalised per frame so the two profiles are comparable even
     * though the dense scene produced fewer frames in the same wall-clock window
     * -- a scene that takes 133 ms per frame simply has fewer samples, and
     * comparing raw totals would understate its per-frame cost by exactly the
     * ratio that matters.
     */
    const byKey = new Map(
      light.functions.map((f) => [`${f.name}|${f.where}`, f]),
    );
    const denseByKey = new Map(
      dense.functions.map((f) => [`${f.name}|${f.where}`, f]),
    );
    const keys = new Set([...byKey.keys(), ...denseByKey.keys()]);

    const delta: FunctionCost[] = [];
    for (const key of keys) {
      const lightMs = (byKey.get(key)?.selfMs ?? 0) / Math.max(1, light.frames);
      const denseMs =
        (denseByKey.get(key)?.selfMs ?? 0) / Math.max(1, dense.frames);
      delta.push({
        name: denseByKey.get(key)?.name ?? byKey.get(key)?.name ?? "(unknown)",
        where: denseByKey.get(key)?.where ?? byKey.get(key)?.where ?? "",
        selfMs: denseMs - lightMs,
        samples:
          (denseByKey.get(key)?.samples ?? 0) - (byKey.get(key)?.samples ?? 0),
      });
    }
    delta.sort((a, b) => b.selfMs - a.selfMs);

    return { light, dense, delta };
  } finally {
    await browser.close();
  }
};

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

const pct = (value: number, total: number): string =>
  total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "  -  ";

export const formatProfile = (
  report: Awaited<ReturnType<typeof profileScenes>>,
  topN = 18,
): string => {
  const lines: string[] = [];
  const { light, dense, delta } = report;

  lines.push("");
  lines.push("  CPU PROFILE — dense vs light, per frame, self time");
  lines.push("");
  lines.push(
    `  light  ~${light.expectedVisible} visible   ${light.frames} samples   ` +
      `${(light.totalSelfMs / Math.max(1, light.frames)).toFixed(
        2,
      )} ms self time`,
  );
  lines.push(
    `  dense  ~${dense.expectedVisible} visible   ${dense.frames} samples   ` +
      `${(dense.totalSelfMs / Math.max(1, dense.frames)).toFixed(
        2,
      )} ms self time`,
  );
  lines.push("");

  const densePerFrame = dense.totalSelfMs / Math.max(1, dense.frames);
  lines.push("  DENSE SCENE, SELF TIME — share of everything sampled");
  lines.push(`  ${"ms/sample".padStart(10)}${"share".padStart(8)}  function`);
  lines.push(`  ${"-".repeat(66)}`);
  for (const fn of dense.functions.slice(0, topN)) {
    const ms = fn.selfMs / Math.max(1, dense.frames);
    lines.push(
      `  ${ms.toFixed(2).padStart(10)}${pct(ms, densePerFrame).padStart(8)}  ${
        fn.name
      }  (${fn.where})`,
    );
  }

  /*
   * Inclusive time, which is the view that says what is *responsible* for the
   * frame rather than what was on the stack when a sample landed.
   *
   * These totals are not a frame time and must not be divided into one. A
   * sample on a stack six frames deep is counted once for each of those six
   * functions, so the column sums to more than the wall clock by design.
   */
  lines.push("");
  lines.push("  DENSE SCENE, INCLUSIVE TIME — who owns the frame");
  lines.push(`  ${"ms".padStart(10)}${"share".padStart(8)}  function`);
  lines.push(`  ${"-".repeat(66)}`);
  const inclTotal = Math.max(1, dense.totalInclMs);
  for (const fn of dense.inclusive.slice(0, topN)) {
    lines.push(
      `  ${fn.inclMs.toFixed(0).padStart(10)}${pct(
        fn.inclMs,
        inclTotal,
      ).padStart(8)}  ${fn.name}  (${fn.where})`,
    );
  }

  if (dense.heaviestPath.length) {
    lines.push("");
    lines.push("  HEAVIEST CALL PATH (the frame, outermost first)");
    for (const frame of dense.heaviestPath.slice(0, 10)) {
      lines.push(`    ${frame}`);
    }
  }

  const deltaTotal = delta.reduce((sum, d) => sum + Math.max(0, d.selfMs), 0);
  lines.push("");
  lines.push("  PER-ELEMENT COST — dense minus light, per sample (the answer)");
  lines.push(`  ${"ms/sample".padStart(10)}${"share".padStart(8)}  function`);
  lines.push(`  ${"-".repeat(66)}`);
  for (const fn of delta.slice(0, topN)) {
    if (fn.selfMs <= 0) {
      continue;
    }
    lines.push(
      `  ${fn.selfMs.toFixed(2).padStart(10)}${pct(
        fn.selfMs,
        deltaTotal,
      ).padStart(8)}  ${fn.name}  (${fn.where})`,
    );
  }
  lines.push("");
  lines.push(
    "  Only functions that grow with element count appear here. Anything absent is fixed overhead.",
  );

  return lines.join("\n");
};
