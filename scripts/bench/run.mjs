/**
 * The benchmark CLI entry point.
 *
 * ## Why this is `.mjs` and bundles before running
 *
 * The harness is TypeScript, like the rest of the repo. Running it needs a TS
 * runner, and the honest options were: add `tsx` as a dependency, or bundle with
 * the esbuild that is already present as a vite dependency.
 *
 * Bundling wins. It adds no dependency and no lockfile entry, and the repo's
 * existing build scripts are plain `.js` for the same reason -- `scripts/buildBase.js`
 * and friends are not TypeScript either. The cost is a ~40 ms bundle step per
 * invocation, which is irrelevant next to a measurement that takes seconds.
 *
 * Node's own `--experimental-strip-types` was the other candidate and does not
 * work: it strips types but does not rewrite a `.js` import specifier to the
 * `.ts` file behind it, so `import "./harness.js"` fails to resolve.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const ROOT = new URL("../..", import.meta.url).pathname;

/** Parse `--key value` and `--flag` out of argv. */
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

/**
 * Build into the repo, not into the system temp directory.
 *
 * Node resolves a bare import like `playwright` by walking up from the importing
 * file. A bundle in `/tmp/firo-bench-*` therefore cannot find the repo's
 * `node_modules` and fails with ERR_MODULE_NOT_FOUND -- and `playwright` is
 * marked external on purpose, since bundling the driver breaks its browser
 * launch. `node_modules/.cache` is inside the repo, already gitignored, and
 * resolves correctly.
 */
const CACHE = join(ROOT, "node_modules", ".cache", "firo-bench");

const bundle = async (entry) => {
  await mkdir(CACHE, { recursive: true });
  const outfile = join(CACHE, "harness.mjs");
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    // The harness is a measurement tool; it runs on this machine's Node, so
    // there is no reason to target a browser baseline.
    target: `node${process.versions.node.split(".")[0]}`,
    // `playwright` is a runtime import, not something to bundle. Bundling it
    // would inline the driver and break its browser launch.
    external: ["playwright"],
    // Workspace packages are aliased by vite, not by esbuild, and the harness
    // only needs the scene generator -- which imports element factories. Those
    // resolve through the tsconfig paths, so the paths have to be honoured here.
    tsconfig: join(ROOT, "tsconfig.json"),
    logLevel: "warning",
  });
  return { outfile };
};

/**
 * Profile mode: `node scripts/bench/run.mjs --profile`
 *
 * A separate path rather than a flag on the benchmark run, because the two
 * answer different questions. The benchmark asks "how fast", the profiler asks
 * "why", and mixing them tends to produce a number with a story attached before
 * the story is earned.
 */
const profile = async () => {
  const { dir, outfile } = await bundle(join(ROOT, "scripts", "bench", "profile.ts"));
  try {
    const { profileScenes, formatProfile } = await import(pathToFileURL(outfile).href);
    const report = await profileScenes({
      baseUrl: arg("url", "http://localhost:3000"),
      count: Number.parseInt(arg("count", "10000"), 10),
      durationMs: Number.parseInt(arg("ms", "4000"), 10),
      gpu: flag("gpu"),
      ...(arg("profile-zoom", "") ? { zoom: Number.parseFloat(arg("profile-zoom", "")) } : {}),
      samplingIntervalUs: Number.parseInt(arg("interval", "100"), 10),
    });
    console.log("");
    console.log(`  ${new Date().toISOString()}`);
    console.log(formatProfile(report));
    if (flag("json")) {
      console.log("");
      console.log(JSON.stringify(report, null, 2));
    }
  } finally {
    // Left in place; see the note in `bundle`.
  }
};

const main = async () => {
  const count = Number.parseInt(arg("count", "10000"), 10);
  const profile = arg("profile", "realistic");
  const sampleMs = Number.parseInt(arg("sample", "3000"), 10);
  const baseUrl = arg("url", "http://localhost:3000");
  /*
   * `--world` forces the world size instead of deriving it from the count. It is
   * the diagnostic that separates element *count* cost from shape *complexity*
   * cost: with everything on screen, uniform-rectangles and realistic differ only
   * in what is drawn, not in how much.
   */
  const roughnessArg = arg("roughness", "");
  /*
   * Criterion 5 names specific levels, so the sweep takes them explicitly rather
   * than a fixed list: a sweep that silently used the wrong levels would report a
   * pass it never tested.
   */
  const zoomArg = arg("zoom", "0.1,0.25,0.5,1,1.5,2,3,4");
  const zoomLevels = zoomArg
    .split(",")
    .map((v) => Number.parseFloat(v.trim()))
    .filter((v) => Number.isFinite(v));
  const worldArg = arg("world", "");
  const worldSize = worldArg ? Number.parseInt(worldArg, 10) : undefined;
  const viewport = {
    width: Number.parseInt(arg("width", "1280"), 10),
    height: Number.parseInt(arg("height", "800"), 10),
  };
  /*
   * `--gpu` launches windowed so the canvas is hardware accelerated.
   *
   * Headless Chromium rasterises in software (SwiftShader), where one blit costs
   * 4.8 us. That is the number the renderer plan currently turns on, and it is
   * several times more expensive than the same blit on a GPU -- so the plan's
   * sizing may be an artefact of the test environment rather than a real limit.
   * The report states which renderer it actually got, so this cannot quietly
   * report software figures under a GPU label.
   */
  const gpu = flag("gpu");

  const { dir, outfile } = await bundle(join(ROOT, "scripts", "bench", "harness.ts"));
  try {
    const { runBenchmark, formatReport } = await import(pathToFileURL(outfile).href);

    const report = await runBenchmark({
      count,
      profile,
      sampleMs,
      baseUrl,
      viewport,
      gpu,
      ...(worldSize !== undefined ? { worldSize } : {}),
      ...(roughnessArg ? { roughness: Number.parseInt(roughnessArg, 10) } : {}),
      ...(zoomArg ? { zoomLevels, zoomSampleMs: 1200 } : {}),
    });

    console.log("");
    console.log("  BASELINE — inherited Excalidraw renderer");
    console.log(`  ${new Date().toISOString()}`);
    console.log("");
    console.log(formatReport(report));

    if (flag("json")) {
      console.log("");
      console.log(JSON.stringify(report, null, 2));
    }
  } finally {
    // Left in place deliberately: it is inside node_modules/.cache, and
    // regenerating it costs ~40 ms.
  }
};

/**
 * Trace mode: `node scripts/bench/run.mjs --trace`
 *
 * A third path, for the same reason the profiler is a second one: the benchmark asks
 * "how fast", the profiler asks "why, in JavaScript", and this asks "where did the
 * time go that JavaScript does not own".
 *
 * That third question is the one the 10% zoom stall needs. The CPU profiler has said
 * twice that the cost is outside the renderer's code -- 81-93% of the frame as
 * `(idle)` and `(program)` -- and `(program)` is the profiler's label for browser work
 * with no JS frame attached. Only a Chrome trace names that work.
 */
const trace = async () => {
  const { outfile } = await bundle(join(ROOT, "scripts", "bench", "trace.ts"));
  try {
    const { traceScenes, formatTrace } = await import(pathToFileURL(outfile).href);
    const zooms = arg("zooms", "0.1,0.5")
      .split(",")
      .map((value) => Number.parseFloat(value.trim()))
      .filter((value) => Number.isFinite(value));

    const report = await traceScenes({
      baseUrl: arg("url", "http://localhost:3000"),
      count: Number.parseInt(arg("count", "10000"), 10),
      durationMs: Number.parseInt(arg("ms", "4000"), 10),
      gpu: !flag("headless"),
      zooms,
      ...(arg("world", "")
        ? { worldSize: Number.parseInt(arg("world", ""), 10) }
        : {}),
    });

    console.log("");
    console.log(`  ${new Date().toISOString()}`);
    console.log(formatTrace(report));

    if (flag("json")) {
      console.log("");
      console.log(JSON.stringify(report, null, 2));
    }
  } finally {
    // Left in place; see the note in `bundle`.
  }
};

if (flag("profile")) {
  profile().catch((error) => {
    console.error("");
    console.error(`  profile failed: ${error?.message ?? error}`);
    console.error("");
    process.exit(1);
  });
} else if (flag("trace")) {
  trace().catch((error) => {
    console.error("");
    console.error(`  trace failed: ${error?.message ?? error}`);
    console.error("");
    process.exit(1);
  });
} else {
  main().catch((error) => {
  console.error("");
    console.error(`  benchmark failed: ${error?.message ?? error}`);
    console.error("");
    process.exit(1);
  });
}
