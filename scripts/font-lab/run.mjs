/**
 * The font lab CLI entry point.
 *
 * ## Why this is `.mjs` and bundles before running
 *
 * The lab is TypeScript like the rest of the repo, and the repo has no TS
 * runner. Same reasoning, and mostly the same wording, as
 * `scripts/bench/run.mjs`: bundle with the esbuild that is already present as a
 * vite dependency rather than adding `tsx` and a lockfile entry.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

const ROOT = new URL("../..", import.meta.url).pathname;
const LAB = join(ROOT, "scripts", "font-lab");

/** Parse `--key value` and `--flag` out of argv. */
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

/**
 * Build into the repo, not the system temp directory.
 *
 * `playwright` is marked external, so the bundle resolves it by walking up from
 * its own location; a bundle outside the repo finds no `node_modules`. Same
 * constraint, and same reasoning, as `scripts/bench/run.mjs`.
 */
const CACHE = join(ROOT, "node_modules", ".cache", "firo-font-lab");

const bundle = async (entry) => {
  await mkdir(CACHE, { recursive: true });
  const outfile = join(CACHE, "lab.mjs");
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: `node${process.versions.node.split(".")[0]}`,
    // Bundling the Playwright driver inlines it and breaks the browser launch.
    external: ["playwright"],
    logLevel: "warning",
  });
  return outfile;
};

const main = async () => {
  const outDir = join(LAB, arg("out", "out"));
  await mkdir(outDir, { recursive: true });

  const only = arg("only", "");
  const outfile = await bundle(join(LAB, "lab.ts"));

  const { runLab, formatReport } = await import(pathToFileURL(outfile).href);

  /*
   * `--headless` inverts the default rather than turning it on, because a
   * software rasteriser silently changes what a glyph is. See the note at the
   * top of `lab.ts`; the report prints the renderer either way.
   */
  const report = await runLab({
    fontDir: pathToFileURL(`${LAB}/`),
    outDir: pathToFileURL(`${outDir}/`),
    viewport: {
      width: Number.parseInt(arg("width", "900"), 10),
      height: Number.parseInt(arg("height", "420"), 10),
    },
    headless: flag("headless"),
    deviceScaleFactor: Number.parseInt(arg("dpr", "2"), 10),
    ...(only ? { only: only.split(",").map((id) => id.trim()) } : {}),
  });

  console.log("");
  console.log("  12 PX LEGIBILITY LAB — ADR-0013 requirement 3, on rendered output");
  console.log(formatReport(report));

  await writeFile(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  if (report.renderer.kind === "software") {
    console.log("");
    console.log("  WARNING: the canvas was rasterised in software (SwiftShader).");
    console.log("  Glyph rendering differs from a GPU. Do not file these as the");
    console.log("  hardware figures, and do not compare them against a windowed run.");
  }
};

main().catch((error) => {
  console.error("");
  console.error(`  font lab failed: ${error?.message ?? error}`);
  console.error("");
  process.exit(1);
});