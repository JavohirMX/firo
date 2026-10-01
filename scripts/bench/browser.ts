import { chromium, type Browser } from "playwright";

/**
 * Launch the benchmark browser, and say which renderer it actually got.
 *
 * ## Why this is not a detail
 *
 * `chromium.launch()` with no options runs headless, and headless Chromium on
 * macOS rasterises in software via SwiftShader. A software blit of a cached
 * bitmap measured 4.8 us. The same blit on a GPU is well under 1 us.
 *
 * That is a factor of five on the single number the whole renderer plan turns
 * on, so a benchmark that does not report its renderer is a benchmark whose
 * result cannot be compared to any other machine's, including a real user's.
 *
 * So the renderer is not an assumption here, it is a measurement. `renderer()`
 * reads it back from the page and the report prints it next to the numbers. If a
 * run claims `--gpu` and comes back SwiftShader, that is a failed run and the
 * output says so rather than quietly reporting software numbers under a GPU
 * label.
 */

/** What the page's canvas is actually rasterised by. */
export type CanvasRenderer = {
  /** Raw string from the driver, e.g. "ANGLE (Google, Vulkan ... SwiftShader ...)". */
  raw: string;
  /** Best-effort label for humans. */
  kind: "gpu" | "software" | "unknown";
};

const classify = (raw: string): CanvasRenderer["kind"] => {
  const lower = raw.toLowerCase();
  // SwiftShader and llvmpipe are CPU rasterisers. Everything else that reports a
  // driver is treated as hardware, which is the optimistic reading; the raw
  // string is always printed so an optimistic misread is still visible.
  if (
    lower.includes("swiftshader") ||
    lower.includes("llvmpipe") ||
    lower.includes("software")
  ) {
    return "software";
  }
  if (
    lower.includes("angle") ||
    lower.includes("metal") ||
    lower.includes("direct3d")
  ) {
    return "gpu";
  }
  return "unknown";
};

export const launchBenchBrowser = async (gpu: boolean): Promise<Browser> => {
  if (!gpu) {
    return chromium.launch();
  }

  /*
   * Windowed rather than headless-with-flags.
   *
   * Headless Chromium will accept `--enable-gpu` and still come back on
   * SwiftShader, because there is no window to present to. Launching headed is
   * the reliable way to get a real context on macOS. The cost is a visible
   * window and no xvfb-style isolation, which is acceptable for a benchmark a
   * person is waiting on.
   */
  return chromium.launch({ headless: false });
};

/**
 * Ask a live page what its canvas is rasterised by.
 *
 * Uses `WEBGL_debug_renderer_info`, which is a debug extension and not
 * guaranteed to exist. Returns `unknown` rather than a guess when it does not.
 */
export const readCanvasRenderer = async (
  browser: Browser,
): Promise<CanvasRenderer> => {
  const page = await browser.newPage();
  try {
    const raw = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl");
      if (!gl) {
        return "";
      }
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (!ext) {
        return "";
      }
      return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    });
    return { raw, kind: raw ? classify(raw) : "unknown" };
  } finally {
    await page.close();
  }
};
