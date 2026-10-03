/**
 * The 12 px legibility lab.
 *
 * ## What this measures, and what it deliberately does not
 *
 * ADR-0013 rejected six hand-drawn faces "because they were never evaluated
 * against real rendered output". Requirement 4 says the contrast of a face at
 * the default stroke width "must be *measured* on rendered output, not
 * assumed". ADR-0017 unblocked both: the inherited Excalidraw renderer is real
 * rendered output, and it renders text on a 2D canvas with a CSS font string
 * under a zoom transform.
 *
 * So this drives that same path. Not a DOM: a `<canvas>`, `ctx.font =
 * "<size>px <family>"`, `fillText`, under `ctx.scale(devicePixelRatio * zoom)`.
 * That is what `packages/element/src/renderElement.ts` does, and matching it
 * means the numbers describe the same rasterisation the product uses.
 *
 * What it does *not* include is roughjs. Roughness jitters shape outlines, and a
 * text element is filled rather than stroked, so roughness never reaches the
 * glyph -- it reaches the boxes around it. Measuring jittered boxes and
 * attributing the result to the typeface would confuse the two.
 *
 * ## Division of labour
 *
 * The page draws and returns masks. It computes no metrics.
 *
 * That split is the design: the only thing a browser can do that Node cannot is
 * rasterise glyphs, so that is the only thing it is asked to do. Every number is
 * produced by `./metrics.ts`, in Node, by the same functions the tests pin.
 * An earlier draft computed the metrics in the page and carried a second copy of
 * each function inside a serialised closure, which is a way of guaranteeing the
 * two copies drift apart.
 *
 * The one exception is the reference downsample: the page renders each label at
 * 16x and averages it back down to the measured box, because that is a step in
 * *producing* the reference image rather than a judgement about it.
 *
 * ## Why windowed
 *
 * Headless Chromium on macOS rasterises through SwiftShader, which changes glyph
 * rendering. This repo has already invalidated a set of measurements for exactly
 * that reason (ADR-0017: 4.76 us/element against 0.55 us/element). The same
 * failure here would be quieter and no less wrong -- a software-rasterised 6 px
 * glyph is a different glyph. `--headless` exists to make the mistake
 * deliberately, and the report prints the renderer next to the numbers either way
 * so a software run cannot be filed as a hardware one.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  launchBenchBrowser,
  readCanvasRenderer,
  type CanvasRenderer,
} from "../bench/browser.js";

import {
  effectiveContrast,
  inkCoverage,
  inkRetained,
  shapeFidelity,
  hairlineFraction,
  trim,
  type Mask,
} from "./metrics.js";
import {
  CONTROL,
  FACES,
  FONT_SIZE,
  LABELS,
  REFERENCE_SCALE,
  THEMES,
  ZOOMS,
  type Face,
} from "./fonts.js";

import type { Browser, Page } from "playwright";

export type LabelMetrics = {
  labelId: string;
  kind: string;
  text: string;
  /** False means the browser substituted the face and the row must not be read. */
  loaded: boolean;
  /** True when the face drew no ink at all, so every number here is a stand-in. */
  empty: boolean;
  /** Fraction of the measured box that carries glyph ink. Diagnostic. */
  inkCoverage: number;
  /** This face's own ink retained, against its own 16x reference. 1.0 = all. */
  inkRetained: number;
  /** Closeness to the 16x letterforms. 0..1, higher is a closer match. */
  shapeFidelity: number;
  /**
   * Share of the label's ink drawn thinner than the rasteriser can hold, 0..1.
   *
   * 1 is the failure case: the face has nothing but hairlines at 12 px.
   */
  hairlineFraction: number;
  /** Mean ink coverage among ink pixels: the anti-aliasing tax. */
  meanCoverage: number;
  /** Delivered contrast as a fraction of the palette contrast. 1.0 = full. */
  contrastRatio: number;
};

export type PanelReport = {
  faceId: string;
  face: string;
  role: Face["role"];
  theme: string;
  zoom: number;
  /** Every label in the panel reported its face loaded. */
  allLoaded: boolean;
  labels: LabelMetrics[];
  /** Screenshot path relative to the out directory. */
  screenshot: string;
};

export type LabReport = {
  generatedAt: string;
  fontSize: number;
  referenceScale: number;
  /** Device pixel ratio the page reported. 2 means a Retina panel. */
  devicePixelRatio: number;
  renderer: CanvasRenderer;
  userAgent: string;
  panels: PanelReport[];
};

export type LabOptions = {
  /** Where the vendored face binaries live. */
  fontDir: URL;
  /** Directory screenshots and `report.json` are written into. */
  outDir: URL;
  viewport: { width: number; height: number };
  /** Windowed by default. See the note at the top of this file. */
  headless?: boolean;
  /**
   * Device pixels per CSS pixel.
   *
   * 2 by default, because that is what a Retina user gets and the product's
   * audience is not majority non-Retina. Not read from the host: a run has to be
   * reproducible on a machine whose display differs from the author's.
   */
  deviceScaleFactor?: number;
  /** Restrict the run to these face ids. Defaults to all of them. */
  only?: readonly string[];
};

/* -------------------------------------------------------------------------- */
/* Page shell                                                                  */
/* -------------------------------------------------------------------------- */

const MIME: Record<string, { mime: string; format: string }> = {
  ".ttf": { mime: "font/ttf", format: "truetype" },
  ".otf": { mime: "font/otf", format: "opentype" },
  ".woff2": { mime: "font/woff2", format: "woff2" },
  ".woff": { mime: "font/woff", format: "woff" },
};

const describeFont = (name: string): { mime: string; format: string } =>
  MIME[name.slice(name.lastIndexOf(".")).toLowerCase()] ?? {
    mime: "application/octet-stream",
    format: "truetype",
  };

/**
 * Serve the faces as data URLs.
 *
 * Inlined rather than referenced by `file://` because the page lives at
 * `about:blank` with no base URL, and a font URL that fails to resolve does not
 * throw -- it silently falls back, which would produce a confident measurement
 * of the system font. Inlining removes the failure mode; `document.fonts.check`
 * then confirms what actually loaded.
 */
const inlineFont = async (path: URL): Promise<string> => {
  const bytes = await readFile(path);
  const { mime } = describeFont(fileURLToPath(path));
  return `data:${mime};base64,${bytes.toString("base64")}`;
};

const buildHtml = (
  faces: readonly Face[],
  fonts: readonly string[],
): string => {
  const rules = faces
    .map((face, index) => {
      const { format } = describeFont(face.file);
      return [
        "@font-face {",
        `  font-family: "${face.cssFamily}";`,
        `  src: url("${fonts[index]}") format("${format}");`,
        "  font-weight: 400;",
        "  font-style: normal;",
        // `block`, not `swap`. Under `swap` the browser draws a fallback for the
        // few milliseconds the face takes to load, and we could screenshot that
        // instead of the face.
        "  font-display: block;",
        "}",
      ].join("\n");
    })
    .join("\n");

  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8"><title>firo font lab</title>',
    "<style>",
    rules,
    "html, body { margin: 0; padding: 0; background: #808080; }",
    "#stage { display: inline-block; }",
    "canvas { display: block; }",
    "</style></head>",
    '<body><div id="stage"><canvas id="c"></canvas></div></body></html>',
  ].join("\n");
};

/* -------------------------------------------------------------------------- */
/* Page-side work: render, and nothing else                                     */
/* -------------------------------------------------------------------------- */

/** What the page hands back per label. Masks only -- no verdicts. */
type WireMeasurement = {
  labelId: string;
  loaded: boolean;
  /** Base64 of the measured alpha mask, already trimmed. */
  measured: { width: number; height: number; alpha: string };
  /** The 16x reference, trimmed and averaged down to the measured box. */
  reference: { width: number; height: number; alpha: string };
};

/**
 * Render every label in a panel and return one measurement per label.
 *
 * Serialised into the page by `page.evaluate`, so it cannot close over anything
 * from this module. `Face`/`LabOptions` types are structural here for the same
 * reason.
 */
const renderPanel = async (input: {
  family: string;
  background: string;
  ink: string;
  fontSize: number;
  zoom: number;
  referenceScale: number;
  labels: { id: string; text: string }[];
}): Promise<{
  dpr: number;
  rows: WireMeasurement[];
  panelWidth: number;
  panelHeight: number;
}> => {
  const canvas = document.getElementById("c") as HTMLCanvasElement;
  const stage = document.getElementById("stage") as HTMLDivElement;
  const dpr = window.devicePixelRatio || 1;

  await document.fonts.load(`${input.fontSize}px "${input.family}"`);
  await document.fonts.load(
    `${input.fontSize * input.referenceScale}px "${input.family}"`,
  );
  await document.fonts.ready;

  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  /*
   * One draw primitive, used for both the screenshot and the measurement.
   *
   * The transform is the app's: `scale(devicePixelRatio * zoom)` with the font
   * string left at 12 px. That is why 50% zoom is a real case rather than a
   * picture of a smaller picture -- the font size never changes, so at 0.5 the
   * rasteriser is asked for 6 effective device px per em. Zooming out does not
   * scale a bitmap here; it asks for smaller text.
   */
  const draw = (
    texts: { text: string; size: number }[],
    scale: number,
  ): void => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = input.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = input.ink;

    for (const item of texts) {
      ctx.font = `${item.size}px "${input.family}"`;
      ctx.fillText(
        item.text,
        Math.ceil(item.size * 1.5),
        baselines.get(item) ?? 0,
      );
    }
  };

  /**
   * Lay the items out and record where each baseline lands.
   *
   * Sizing has to precede painting -- resizing the backing store clears it -- so
   * the layout is computed first and the paint is a second pass over the same
   * numbers. Doing it in one pass meant painting into a canvas that was about to
   * be cleared, which is why this is two functions rather than one.
   */
  const baselines = new Map<{ text: string; size: number }, number>();

  const layout = (
    texts: { text: string; size: number }[],
  ): { width: number; height: number } => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${input.fontSize}px "${input.family}"`;

    let cursor = 0;
    let widest = 0;
    for (const item of texts) {
      ctx.font = `${item.size}px "${input.family}"`;
      const m = ctx.measureText(item.text);
      const ascent = m.actualBoundingBoxAscent || item.size * 0.8;
      const descent = m.actualBoundingBoxDescent || item.size * 0.25;
      // A board node has padding around its label. Reproducing the proportions
      // matters more than the exact numbers: the eye judges a label in context.
      const baseline = cursor + Math.ceil(item.size * 0.95) + ascent;
      baselines.set(item, baseline);
      cursor = baseline + Math.ceil(item.size * 0.55) + descent;
      widest = Math.max(widest, m.width);
    }
    return {
      width: Math.ceil(widest + input.fontSize * 3),
      height: Math.ceil(cursor + input.fontSize * 0.75),
    };
  };

  /** Size the backing store to a CSS box at `scale`, preserving the app's transform. */
  const size = (box: { width: number; height: number }, scale: number) => {
    canvas.width = Math.max(1, Math.ceil(box.width * dpr * scale));
    canvas.height = Math.max(1, Math.ceil(box.height * dpr * scale));
    canvas.style.width = `${box.width}px`;
    canvas.style.height = `${box.height}px`;
  };

  /** Tight bounding box of non-background pixels, in device pixels. */
  const trimToInk = (
    image: ImageData,
  ): { width: number; height: number; alpha: Uint8Array } | null => {
    const br = parseInt(input.background.slice(1, 3), 16);
    const bg = parseInt(input.background.slice(3, 5), 16);
    const bb = parseInt(input.background.slice(5, 7), 16);
    let minX = image.width;
    let minY = image.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const p = (y * image.width + x) * 4;
        if (
          image.data[p] !== br ||
          image.data[p + 1] !== bg ||
          image.data[p + 2] !== bb
        ) {
          if (x < minX) {
            minX = x;
          }
          if (x > maxX) {
            maxX = x;
          }
          if (y < minY) {
            minY = y;
          }
          if (y > maxY) {
            maxY = y;
          }
        }
      }
    }
    if (maxX < 0) {
      return null;
    }
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const alpha = new Uint8Array(width * height);
    const ir = parseInt(input.ink.slice(1, 3), 16);
    const ig = parseInt(input.ink.slice(3, 5), 16);
    const ib = parseInt(input.ink.slice(5, 7), 16);
    const span = Math.abs(ir - br) + Math.abs(ig - bg) + Math.abs(ib - bb) || 1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const src = ((minY + y) * image.width + (minX + x)) * 4;
        const delta =
          Math.abs(image.data[src] - br) +
          Math.abs(image.data[src + 1] - bg) +
          Math.abs(image.data[src + 2] - bb);
        alpha[y * width + x] = Math.min(255, Math.round((delta / span) * 255));
      }
    }
    return { width, height, alpha };
  };

  const read = (scale: number) => {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return trimToInk(image);
  };

  const rows: WireMeasurement[] = [];

  for (const label of input.labels) {
    const loaded = document.fonts.check(
      `${input.fontSize}px "${input.family}"`,
    );
    const item = { text: label.text, size: input.fontSize };

    // Measured: the label at the requested zoom.
    size(layout([item]), input.zoom);
    draw([item], input.zoom);
    const measured = read(input.zoom);

    // Reference: the same label at 16x, averaged back down to the measured box.
    size(layout([item]), input.referenceScale);
    draw([item], input.referenceScale);
    const big = read(input.referenceScale);

    if (!measured || !big) {
      rows.push({
        labelId: label.id,
        loaded,
        measured: { width: 1, height: 1, alpha: "" },
        reference: { width: 1, height: 1, alpha: "" },
      });
      continue;
    }

    rows.push({
      labelId: label.id,
      loaded,
      measured: {
        width: measured.width,
        height: measured.height,
        alpha: bytesToBase64(measured.alpha),
      },
      reference: {
        width: measured.width,
        height: measured.height,
        // The page-side downsample: render big, average each block back to the
        // measured grid. Nearest-neighbour would alias the reference against the
        // measurement and flatter whichever face has the thicker stems.
        alpha: bytesToBase64(
          averageTo(
            measured.width,
            measured.height,
            big.width,
            big.height,
            big.alpha,
          ),
        ),
      },
    });
  }

  // The screenshot panel: every label together, in board context, at this zoom.
  const all = input.labels.map((label) => ({
    text: label.text,
    size: input.fontSize,
  }));
  const panelBox = layout(all);
  size(panelBox, input.zoom);
  draw(all, input.zoom);
  stage.style.width = `${panelBox.width}px`;
  stage.style.height = `${panelBox.height}px`;

  return {
    dpr,
    rows,
    panelWidth: panelBox.width,
    panelHeight: panelBox.height,
  };

  function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function averageTo(
    tw: number,
    th: number,
    sw: number,
    sh: number,
    src: Uint8Array,
  ): Uint8Array {
    const out = new Uint8Array(tw * th);
    for (let ty = 0; ty < th; ty++) {
      const y0 = Math.floor((ty * sh) / th);
      const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * sh) / th));
      for (let tx = 0; tx < tw; tx++) {
        const x0 = Math.floor((tx * sw) / tw);
        const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * sw) / tw));
        let sum = 0;
        let count = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            sum += src[y * sw + x];
            count++;
          }
        }
        out[ty * tw + tx] = count ? Math.round(sum / count) : 0;
      }
    }
    return out;
  }
};

/* -------------------------------------------------------------------------- */
/* Run                                                                         */
/* -------------------------------------------------------------------------- */

const decodeMask = (wire: {
  width: number;
  height: number;
  alpha: string;
}): Mask => ({
  width: wire.width,
  height: wire.height,
  alpha: new Uint8Array(Buffer.from(wire.alpha, "base64")),
});

export const runLab = async (options: LabOptions): Promise<LabReport> => {
  const faces = FACES.filter((face) =>
    options.only ? options.only.includes(face.id) : true,
  );
  if (!faces.length) {
    throw new Error(`no faces matched ${JSON.stringify(options.only)}`);
  }

  const fonts = await Promise.all(
    faces.map((face) => inlineFont(new URL(face.file, options.fontDir))),
  );

  const browser: Browser = await launchBenchBrowser(!options.headless);
  try {
    /*
     * `deviceScaleFactor: 2`, stated rather than inherited.
     *
     * Playwright's default is 1, which renders 12 px text into 12 device pixels
     * on a panel that has twice the pixels to draw on. Every face then fails for
     * the same reason and the comparison measures the renderer's scale factor
     * instead of the typeface. A Retina user -- which is who this measurement is
     * for -- sees 24 device pixels for 12 px of text, and that is what the first
     * run of this lab was silently measuring against.
     *
     * `--dpr` exists to reproduce the non-Retina case deliberately, which is a
     * real case and a much harsher one, rather than by omission.
     */
    const page: Page = await browser.newPage({
      viewport: options.viewport,
      deviceScaleFactor: options.deviceScaleFactor,
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.setContent(buildHtml(faces, fonts), { waitUntil: "load" });

    const panels: PanelReport[] = [];
    let dpr = 1;

    for (const face of faces) {
      for (const theme of THEMES) {
        for (const zoom of ZOOMS) {
          const wire = await page.evaluate(renderPanel, {
            family: face.cssFamily,
            background: theme.background,
            ink: theme.ink,
            fontSize: FONT_SIZE,
            zoom,
            referenceScale: REFERENCE_SCALE,
            labels: LABELS.map(({ id, text }) => ({ id, text })),
          });
          dpr = wire.dpr;

          const screenshot = `${face.id}__${theme.id}__z${String(zoom).replace(
            ".",
            "",
          )}.png`;
          await writeFile(
            join(fileURLToPath(options.outDir), screenshot),
            await page.locator("#stage").screenshot(),
          );

          panels.push({
            faceId: face.id,
            face: face.label,
            role: face.role,
            theme: theme.id,
            zoom,
            allLoaded: wire.rows.every((row) => row.loaded),
            screenshot,
            labels: wire.rows.map((row) => {
              const label = LABELS.find((l) => l.id === row.labelId);
              const measured = trim(decodeMask(row.measured));
              const reference = decodeMask(row.reference);

              /*
               * A face that drew no ink produces no bounding box to trim to.
               *
               * The substitutions below are not there to keep the loop going --
               * a panel with an empty mask throws further down, so the run cannot
               * report a number for a face that never loaded. They are here so the
               * per-row work stays total, and the `empty` flag below is what makes
               * the row visibly not-a-measurement to whoever reads the JSON.
               */
              if (!measured) {
                return {
                  labelId: row.labelId,
                  kind: label?.kind ?? "",
                  text: label?.text ?? "",
                  loaded: row.loaded,
                  empty: true,
                  inkCoverage: 0,
                  inkRetained: 0,
                  shapeFidelity: 0,
                  hairlineFraction: 0,
                  meanCoverage: 0,
                  contrastRatio: 0,
                };
              }

              const contrast = effectiveContrast(
                measured,
                theme.ink,
                theme.background,
              );

              return {
                labelId: row.labelId,
                kind: label?.kind ?? "",
                text: label?.text ?? "",
                loaded: row.loaded,
                empty: false,
                inkCoverage: inkCoverage(measured),
                inkRetained: inkRetained(measured, reference),
                shapeFidelity: shapeFidelity(measured, reference),
                hairlineFraction: hairlineFraction(measured),
                meanCoverage: contrast.meanCoverage,
                contrastRatio: contrast.ratio,
              };
            }),
          });
        }
      }
    }

    if (errors.length) {
      console.error(
        `  page reported ${errors.length} error(s); first: ${errors[0]}`,
      );
    }

    /*
     * A row with no ink is unmeasured, not bad. It reads as zeros, and zeros are
     * the best possible score on three of the four metrics, so a face that failed
     * to load would otherwise top the table it was supposed to be judged in.
     */
    const blank = panels.flatMap((panel) =>
      panel.labels.filter((label) => label.empty).map((label) => label.labelId),
    );
    if (blank.length) {
      throw new Error(
        `${blank.length} label(s) drew no ink at all (${[
          ...new Set(blank),
        ].join(", ")}). That is a font that did not load, not a legible one.`,
      );
    }

    const substituted = panels.filter((panel) => !panel.allLoaded);
    if (substituted.length) {
      throw new Error(
        `these faces did not load, so their rows measure a fallback and are not ` +
          `readable: ${substituted
            .map((p) => `${p.face} (${p.theme} @ ${p.zoom})`)
            .join(", ")}`,
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      fontSize: FONT_SIZE,
      referenceScale: REFERENCE_SCALE,
      devicePixelRatio: dpr,
      renderer: await readCanvasRenderer(browser),
      userAgent: await page.evaluate(() => navigator.userAgent),
      panels,
    };
  } finally {
    await browser.close();
  }
};

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

/** Mean of a per-label field, across one panel. */
const mean = (panel: PanelReport, pick: (m: LabelMetrics) => number): number =>
  panel.labels.reduce((sum, m) => sum + pick(m), 0) / panel.labels.length;

export const formatReport = (report: LabReport): string => {
  const lines: string[] = [];

  lines.push(`  ${report.generatedAt}`);
  lines.push(
    `  font size ${report.fontSize}px  |  reference ${report.referenceScale}x  |  dpr ${report.devicePixelRatio}`,
  );
  lines.push(
    `  canvas    ${report.renderer.kind.toUpperCase()}  ${
      report.renderer.raw || "(not reported)"
    }`,
  );
  lines.push(
    `  browser   ${report.userAgent.replace(/^.*?(Chrome\/[\d.]+).*$/, "$1")}`,
  );
  lines.push("");
  lines.push("  ADR-0013 requirement 3/4, measured on rendered output:");
  lines.push(
    "    inkRetained   this face's own ink still present at 12 px (1.00 = all of it)",
  );
  lines.push(
    "    fidelity      match to the same face at 16 px (1.00 = same letterforms)",
  );
  lines.push(
    "    hairline      share of ink too thin to hold, 0..1 (1 = all hairlines)",
  );
  lines.push(
    "    contrast      delivered contrast as a fraction of palette contrast",
  );
  lines.push("");

  const header =
    `  ${"face".padEnd(21)}${"theme".padEnd(7)}${"zoom".padStart(5)}` +
    `${"inkRet".padStart(9)}${"fidelity".padStart(10)}${"hairline".padStart(
      10,
    )}` +
    `${"contrast".padStart(10)}`;
  lines.push(header);
  lines.push(`  ${"-".repeat(header.length - 2)}`);

  for (const panel of report.panels) {
    lines.push(
      `  ${panel.face.padEnd(21)}${panel.theme.padEnd(7)}${`${Math.round(
        panel.zoom * 100,
      )}%`.padStart(5)}` +
        `${mean(panel, (m) => m.inkRetained)
          .toFixed(3)
          .padStart(9)}` +
        `${mean(panel, (m) => m.shapeFidelity)
          .toFixed(3)
          .padStart(10)}` +
        `${mean(panel, (m) => m.hairlineFraction)
          .toFixed(2)
          .padStart(10)}` +
        `${mean(panel, (m) => m.contrastRatio)
          .toFixed(3)
          .padStart(10)}`,
    );
  }

  lines.push("");
  lines.push(
    `  Control is ${CONTROL.label} (the current DEFAULT_FONT_FAMILY).`,
  );
  lines.push(
    "  Screenshots are in the out directory, one per face/theme/zoom.",
  );

  return lines.join("\n");
};
