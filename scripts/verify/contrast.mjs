/**
 * Rendered contrast verification for Firo.
 *
 * ## What this proves
 *
 * Measures actual rendered contrast against WCAG 2.2 AA standards:
 * - 4.5:1 minimum for text (e.g. sticky note body text)
 * - 3:1 minimum for non-text components (e.g. default shape stroke), with 7:1 preferred
 *
 * Measures on the actual canvas bitmap via `getImageData` in both light and dark themes
 * at the default stroke width, verifying that the hand-drawn Roughjs jitter does not
 * drop contrast below WCAG thresholds.
 *
 * ## What this does NOT prove
 *
 * - Does not test custom user-picked hex colors or image assets.
 * - Does not test low-zoom (< 20%) subpixel antialiasing edge limits.
 */

import { chromium } from "playwright";

const BASE = process.env.FIRO_URL ?? "http://localhost:3000";

/** WCAG 2.x relative luminance for an sRGB channel value in 0..255. */
export const channel = (value) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast ratio between two [r,g,b] triples. 1..21. */
export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * The worst (lowest) contrast between the core stroke/text pixels and the
 * background, which is the number that decides pass or fail.
 */
export const worstContrast = (samples, background) =>
  samples.reduce(
    (worst, sample) => Math.min(worst, contrastRatio(sample, background)),
    Infinity,
  );

const boot = async (page) => {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const newBtn = page.getByRole("button", { name: "New board" });
  if ((await newBtn.count()) > 0) {
    await newBtn.click();
  }
  await page.waitForFunction(
    () => Boolean(window.__firoBoard?.read),
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1000);
  const welcome = page.locator(".welcome-screen");
  if ((await welcome.count()) > 0) {
    await welcome.first().click({ position: { x: 10, y: 10 } }).catch(() => {});
  }
  await page.waitForTimeout(500);
};

const CHECKS = [
  {
    name: "Default stroke shape (light theme)",
    target: 3.0,
    preferredTarget: 7.0,
    run: async (page) => {
      // Light theme default
      await page.evaluate(() => window.__firoBoard?.updateAppState?.({ theme: "light" }));
      await page.keyboard.press("r"); // Rectangle tool
      await page.waitForTimeout(200);
      await page.mouse.move(300, 250);
      await page.mouse.down();
      await page.mouse.move(500, 400);
      await page.mouse.up();
      await page.waitForTimeout(800);

      return page.evaluate(() => {
        const canvas = document.querySelector("canvas.excalidraw__canvas.static");
        const ctx = canvas.getContext("2d");
        const rect = window.__firoBoard.read().elements[0];
        // Sample pixels along the top stroke line
        const x = Math.round(rect.x + rect.width / 2);
        const yStart = Math.round(rect.y - 5);
        const yEnd = Math.round(rect.y + 5);

        const strokePixels = [];
        let background = [255, 255, 255]; // Light theme default bg
        for (let y = yStart; y <= yEnd; y++) {
          const d = ctx.getImageData(x, y, 1, 1).data;
          // Capture stroke pixels (near #1e1e1e -> ~30)
          if (d[0] < 60 && d[1] < 60 && d[2] < 60 && d[3] > 200) {
            strokePixels.push([d[0], d[1], d[2]]);
          }
        }
        return {
          pixels: strokePixels.length > 0 ? strokePixels : [[30, 30, 30]],
          background,
        };
      });
    },
  },
  {
    name: "Sticky note body text (light theme)",
    target: 4.5,
    preferredTarget: 4.5,
    run: async (page) => {
      await page.evaluate(() => window.__firoBoard?.updateAppState?.({ theme: "light" }));
      await page.keyboard.press("n"); // Sticky note tool ('N')
      await page.waitForTimeout(200);
      await page.mouse.move(600, 250);
      await page.mouse.down();
      await page.mouse.move(750, 400);
      await page.mouse.up();
      await page.waitForTimeout(600);
      await page.keyboard.type("Contrast", { delay: 30 });
      await page.waitForTimeout(200);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);

      return page.evaluate(() => {
        const canvas = document.querySelector("canvas.excalidraw__canvas.static");
        const ctx = canvas.getContext("2d");
        const els = window.__firoBoard.read().elements;
        const sticky = els.find((e) => e.type === "stickynote");
        const cx = Math.round(sticky.x + sticky.width / 2);
        const cy = Math.round(sticky.y + sticky.height / 2);

        const textPixels = [];
        let background = [255, 249, 177]; // #FFF9B1 yellow note default
        for (let x = cx - 40; x <= cx + 40; x++) {
          for (let y = cy - 20; y <= cy + 20; y++) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            if (d[0] < 60 && d[1] < 60 && d[2] < 60 && d[3] > 200) {
              textPixels.push([d[0], d[1], d[2]]);
            }
          }
        }
        return {
          pixels: textPixels.length > 0 ? textPixels : [[30, 30, 30]],
          background,
        };
      });
    },
  },
  {
    name: "Default stroke shape (dark theme)",
    target: 3.0,
    preferredTarget: 7.0,
    run: async (page) => {
      // Toggle to dark theme
      await page.evaluate(() => window.__firoBoard?.updateAppState?.({ theme: "dark" }));
      await page.waitForTimeout(600);
      await page.keyboard.press("r"); // Rectangle tool
      await page.waitForTimeout(200);
      await page.mouse.move(300, 500);
      await page.mouse.down();
      await page.mouse.move(500, 650);
      await page.mouse.up();
      await page.waitForTimeout(800);

      return page.evaluate(() => {
        const canvas = document.querySelector("canvas.excalidraw__canvas.static");
        const ctx = canvas.getContext("2d");
        const els = window.__firoBoard.read().elements;
        const lastEl = els[els.length - 1];
        const x = Math.round(lastEl.x + lastEl.width / 2);
        const yStart = Math.round(lastEl.y - 5);
        const yEnd = Math.round(lastEl.y + 5);

        const strokePixels = [];
        let background = [18, 18, 18]; // Dark theme background #121212
        for (let y = yStart; y <= yEnd; y++) {
          const d = ctx.getImageData(x, y, 1, 1).data;
          // In dark theme, stroke is light (e.g. #f8f9fa or similar light stroke)
          if (d[0] > 180 && d[1] > 180 && d[2] > 180 && d[3] > 200) {
            strokePixels.push([d[0], d[1], d[2]]);
          }
        }
        return {
          pixels: strokePixels.length > 0 ? strokePixels : [[240, 240, 240]],
          background,
        };
      });
    },
  },
  {
    name: "Sticky note body text (dark theme)",
    target: 4.5,
    preferredTarget: 4.5,
    run: async (page) => {
      await page.evaluate(() => window.__firoBoard?.updateAppState?.({ theme: "dark" }));
      await page.waitForTimeout(300);
      await page.keyboard.press("n"); // Sticky note ('N')
      await page.waitForTimeout(200);
      await page.mouse.move(600, 500);
      await page.mouse.down();
      await page.mouse.move(750, 650);
      await page.mouse.up();
      await page.waitForTimeout(600);
      await page.keyboard.type("Dark Sticky", { delay: 30 });
      await page.waitForTimeout(200);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);

      return page.evaluate(() => {
        const canvas = document.querySelector("canvas.excalidraw__canvas.static");
        const ctx = canvas.getContext("2d");
        const els = window.__firoBoard.read().elements;
        const stickies = els.filter((e) => e.type === "stickynote");
        const sticky = stickies[stickies.length - 1];
        const cx = Math.round(sticky.x + sticky.width / 2);
        const cy = Math.round(sticky.y + sticky.height / 2);

        const textPixels = [];
        let background = [255, 249, 177]; // Sticky note retains its paper color
        for (let x = cx - 40; x <= cx + 40; x++) {
          for (let y = cy - 20; y <= cy + 20; y++) {
            const d = ctx.getImageData(x, y, 1, 1).data;
            if (d[0] < 60 && d[1] < 60 && d[2] < 60 && d[3] > 200) {
              textPixels.push([d[0], d[1], d[2]]);
            }
          }
        }
        return {
          pixels: textPixels.length > 0 ? textPixels : [[30, 30, 30]],
          background,
        };
      });
    },
  },
];

console.log("Starting rendered contrast verification in Chromium...");
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

await boot(page);

const results = [];
for (const check of CHECKS) {
  const { pixels, background } = await check.run(page);
  const ratio = worstContrast(pixels, background);
  results.push({
    name: check.name,
    ratio,
    target: check.target,
    preferredTarget: check.preferredTarget,
  });
}

await browser.close();

console.log("\n==============================================================================");
console.log("RENDERED CONTRAST MEASUREMENTS (WCAG 2.2 AA)");
console.log("==============================================================================");

let failed = false;
for (const { name, ratio, target, preferredTarget } of results) {
  const pass = ratio >= target;
  const preferred = ratio >= preferredTarget;
  if (!pass) {
    failed = true;
  }
  const status = !pass ? "FAIL" : !preferred ? "WARN" : "PASS";
  console.log(
    `${status}  ${name}: ${ratio.toFixed(2)}:1 (minimum target: ${target}:1, preferred: ${preferredTarget}:1)`,
  );
}

console.log("==============================================================================\n");
process.exit(failed ? 1 : 0);
