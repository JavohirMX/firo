/**
 * Legibility metrics, as pure functions over a glyph mask.
 *
 * ## Why a number at all
 *
 * ADR-0013 requirement 4 says a replacement face must be *measured on rendered
 * output*. Requirement 3 says it must be legible at 12 px. Screenshots answer
 * "what does it look like", which is a question a reader answers by taste. These
 * functions answer "how much of this face survived being drawn at 12 px", which
 * is a question about the rasteriser.
 *
 * The measurement that matters is not the absolute amount of ink a face puts
 * down -- a script face legitimately puts down less ink than a geometric sans,
 * and calling that illegible would be measuring the design rather than the
 * rendering. What matters is how much of the face's *own* ink survives the
 * downscale, so every metric here is normalised against a reference rendering of
 * the same string in the same face at 16x scale, box-downsampled to the target
 * box. The reference is what the face looks like when size is not a constraint.
 *
 * ## What is deliberately not here
 *
 * No OCR and no human rating. A face that OCRs badly at 12 px is a face that
 * people read badly at 12 px, but adding an OCR dependency to decide a font
 * would trade a licence problem for a dependency problem. These three metrics
 * describe the rasterisation; the screenshots let a person look at it.
 */

/** A glyph mask: one alpha value per pixel, row-major. */
export type Mask = {
  width: number;
  height: number;
  /** Length `width * height`. Alpha only, 0..255. */
  alpha: Uint8Array;
};

export const createMask = (width: number, height: number): Mask => ({
  width,
  height,
  alpha: new Uint8Array(width * height),
});

/**
 * A pixel counts as ink above this coverage. Below it, it is anti-aliasing.
 *
 * 0.5 rather than something smaller, and the reason is that at 12 px almost
 * nothing reaches full opacity. A 1 px stem is drawn at roughly half coverage
 * over most of its length, so a threshold low enough to catch it would also
 * catch the fringe around every other stroke, and the metric would be
 * measuring antialiasing rather than the typeface. See `hairlineFraction` for
 * why that pushed the stroke-width question to a distance transform instead.
 */
export const INK_THRESHOLD = 128;

/** Crop to the tight bounding box of ink. Returns null when there is no ink. */
export const trim = (mask: Mask): Mask | null => {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.alpha[y * mask.width + x] >= INK_THRESHOLD) {
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
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      alpha[y * width + x] = mask.alpha[(minY + y) * mask.width + (minX + x)];
    }
  }
  return { width, height, alpha };
};

/**
 * Ink coverage: the fraction of pixels that carry a glyph, not a fringe.
 *
 * Fraction rather than count, because two faces set the same string at
 * different widths and a raw count would mostly measure how wide the face is.
 */
export const inkCoverage = (mask: Mask): number => {
  let ink = 0;
  for (const value of mask.alpha) {
    if (value >= INK_THRESHOLD) {
      ink++;
    }
  }
  return ink / mask.alpha.length;
};

/**
 * Box-downsample a mask to a target size, averaging over integer blocks.
 *
 * This is how the reference is built: draw the same string in the same face at
 * 16x and average each block back down. Nearest-neighbour sampling would
 * alias the reference against the measurement and quietly flatter whichever
 * face has thicker stems.
 */
export const downsample = (
  mask: Mask,
  targetWidth: number,
  targetHeight: number,
): Mask => {
  const out = createMask(targetWidth, targetHeight);
  if (mask.width === 0 || mask.height === 0) {
    return out;
  }

  for (let ty = 0; ty < targetHeight; ty++) {
    const y0 = Math.floor((ty * mask.height) / targetHeight);
    const y1 = Math.max(
      y0 + 1,
      Math.floor(((ty + 1) * mask.height) / targetHeight),
    );

    for (let tx = 0; tx < targetWidth; tx++) {
      const x0 = Math.floor((tx * mask.width) / targetWidth);
      const x1 = Math.max(
        x0 + 1,
        Math.floor(((tx + 1) * mask.width) / targetWidth),
      );

      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1 && y < mask.height; y++) {
        for (let x = x0; x < x1 && x < mask.width; x++) {
          sum += mask.alpha[y * mask.width + x];
          count++;
        }
      }
      out.alpha[ty * targetWidth + tx] = count ? Math.round(sum / count) : 0;
    }
  }
  return out;
};

/** Alpha of `mask` at `x`, `y`, or 0 outside the bounds. */
const at = (mask: Mask, x: number, y: number): number =>
  x < 0 || y < 0 || x >= mask.width || y >= mask.height
    ? 0
    : mask.alpha[y * mask.width + x];

/** Erode by one pixel using a separable 3x3 box. Alpha, not a boolean. */
export const erode = (mask: Mask): Mask => {
  const horizontal = createMask(mask.width, mask.height);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      horizontal.alpha[y * mask.width + x] = Math.min(
        at(mask, x - 1, y),
        at(mask, x, y),
        at(mask, x + 1, y),
      );
    }
  }

  const out = createMask(mask.width, mask.height);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      out.alpha[y * mask.width + x] = Math.min(
        at(horizontal, x, y - 1),
        at(horizontal, x, y),
        at(horizontal, x, y + 1),
      );
    }
  }
  return out;
};

/**
 * Run length through each ink pixel, horizontally and vertically.
 *
 * The stroke width at a pixel is `min(horizontalRun, verticalRun)`: a 1 px wide
 * vertical stem has a long vertical run and a 1 px horizontal one, so the
 * minimum is the stem; a 12 px square has 12 in both directions wherever you
 * stand inside it.
 *
 * ## Why not a distance transform
 *
 * A chamfer distance to the nearest edge is the textbook route to stroke width,
 * and an earlier version of this file used one. It is wrong for this question.
 * Distance-to-edge is small *at the edge of every stroke*, so it reports the
 * boundary of a 12 px square as hairlines and scores a solid block as 31%
 * hairline. Stroke width only equals twice that distance on the medial axis, and
 * recovering the medial axis means a skeletonisation pass whose failure modes are
 * worse than the problem.
 *
 * Run lengths need the answer at every pixel rather than on a skeleton, cost two
 * linear passes, and are exact for axis-aligned strokes -- which is what a stem
 * or a bar is. Two known approximations, both stated rather than corrected
 * because both are small and neither favours a candidate:
 *
 * - A diagonal reads thinner than it is, since neither its row run nor its
 *   column run spans the stroke.
 * - Where two strokes meet at a right angle -- the corner of an `o`, the join in
 *   an `n` -- both runs are long and the corner counts as thick even if the
 *   strokes are not. On a 1 px ring this is 4 of 60 pixels, so it costs about 7%
 *   of the metric and it under-reports the hairline share.
 */
const runLengths = (
  mask: Mask,
): { horizontal: Int32Array; vertical: Int32Array } => {
  const { width, height } = mask;
  const horizontal = new Int32Array(width * height);
  const vertical = new Int32Array(width * height);
  const ink = (i: number) => mask.alpha[i] >= INK_THRESHOLD;

  for (let y = 0; y < height; y++) {
    let run = 0;
    // Left to right, remembering where the current run started.
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (ink(i)) {
        run++;
      } else {
        for (let k = x - run; k < x; k++) {
          horizontal[y * width + k] = run;
        }
        run = 0;
      }
    }
    for (let k = width - run; k < width; k++) {
      horizontal[y * width + k] = run;
    }
  }

  for (let x = 0; x < width; x++) {
    let run = 0;
    for (let y = 0; y < height; y++) {
      const i = y * width + x;
      if (ink(i)) {
        run++;
      } else {
        for (let k = y - run; k < y; k++) {
          vertical[k * width + x] = run;
        }
        run = 0;
      }
    }
    for (let k = height - run; k < height; k++) {
      vertical[k * width + x] = run;
    }
  }

  return { horizontal, vertical };
};

/**
 * The fraction of the label's ink that is hairline at this size.
 *
 * A stroke's width is twice the distance transform at its thickest point, so the
 * share of ink sitting in strokes narrower than `MIN_STROKE_PX` is the share that
 * the rasteriser could not hold at this size. 0 means every stroke was at least
 * two pixels, 1 means none were.
 *
 * ## Why not erosion
 *
 * Eroding the whole mask and reporting how deep it survives measures the
 * **thickest** stroke, because erosion is a maximum over the mask: a 5 px stem
 * keeps a core long after a 1 px stem beside it has gone. That is the precise
 * failure this metric exists to catch, and an earlier version of this file made
 * it. The distance transform is a different statistic -- it is local to each
 * stroke -- so a single hairline registers even next to a thick stem.
 *
 * ## The threshold, and why 2 px
 *
 * A stroke whose width rounds below 2 px is one pixel of coverage spread over
 * two columns, i.e. roughly half opacity. That is what "drawn thinner than the
 * rasteriser can hold" means in practice, and it is the same half-coverage
 * figure `effectiveContrast` charges as an antialiasing tax, so the two metrics
 * agree about what a thin stroke costs.
 */
export const MIN_STROKE_PX = 2;

export const hairlineFraction = (mask: Mask): number => {
  const { horizontal, vertical } = runLengths(mask);

  let ink = 0;
  let hairline = 0;
  for (let i = 0; i < mask.alpha.length; i++) {
    if (mask.alpha[i] < INK_THRESHOLD) {
      continue;
    }
    ink++;
    const width = Math.min(horizontal[i], vertical[i]);
    if (width < MIN_STROKE_PX) {
      hairline++;
    }
  }
  return ink === 0 ? 0 : hairline / ink;
};

/**
 * How much of the face's own ink is still there, against a reference rendering
 * of the same string at 16x.
 *
 * Values above 1 are possible and meaningful: a hand-drawn face can carry more
 * ink at small sizes than its own large rendering averages out to, because
 * hinting pushes stems to whole pixels. That is a gain, not a rounding error.
 */
export const inkRetained = (measured: Mask, reference: Mask): number => {
  const have = inkCoverage(measured);
  const want = inkCoverage(reference);
  return want === 0 ? 0 : have / want;
};

/**
 * Mean absolute difference between a rendering and its reference, normalised to
 * 0..1, so higher is a closer match to the large-size letterforms.
 *
 * Both masks are trimmed and resampled to a common box first: comparing two
 * different bounding boxes would mostly measure where the side bearings are.
 */
export const shapeFidelity = (measured: Mask, reference: Mask): number => {
  const a = trim(measured);
  const b = trim(reference);
  if (!a || !b) {
    return 0;
  }

  // Common box: the larger of the two, so neither is cropped to fit the other.
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);

  // Both sides must be resampled by the same operator, or the difference
  // measures the resampler rather than the letterforms.
  const ra = resampleTo(a, width, height);
  const rb = resampleTo(b, width, height);

  let total = 0;
  for (let i = 0; i < width * height; i++) {
    total += Math.abs(ra[i] - rb[i]);
  }
  return 1 - total / (width * height * 255);
};

/** Area-average resample of `mask` onto an exact target box. */
const resampleTo = (
  mask: Mask,
  targetWidth: number,
  targetHeight: number,
): Uint8Array => {
  if (mask.width === targetWidth && mask.height === targetHeight) {
    return mask.alpha;
  }
  const out = new Uint8Array(targetWidth * targetHeight);
  for (let ty = 0; ty < targetHeight; ty++) {
    const y0 = Math.floor((ty * mask.height) / targetHeight);
    const y1 = Math.max(
      y0 + 1,
      Math.floor(((ty + 1) * mask.height) / targetHeight),
    );
    for (let tx = 0; tx < targetWidth; tx++) {
      const x0 = Math.floor((tx * mask.width) / targetWidth);
      const x1 = Math.max(
        x0 + 1,
        Math.floor(((tx + 1) * mask.width) / targetWidth),
      );
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1 && y < mask.height; y++) {
        for (let x = x0; x < x1 && x < mask.width; x++) {
          sum += mask.alpha[y * mask.width + x];
          count++;
        }
      }
      out[ty * targetWidth + tx] = count ? Math.round(sum / count) : 0;
    }
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* Contrast                                                                    */
/* -------------------------------------------------------------------------- */

const channelLuminance = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance of an `#rrggbb` colour. */
export const relativeLuminance = (hex: string): number => {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
};

/** WCAG 2.x contrast ratio between two `#rrggbb` colours. 1..21. */
export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
};

/** Composited `#rrggbb` of ink of colour `ink` at `coverage` over `background`. */
export const composite = (
  ink: string,
  background: string,
  coverage: number,
): string => {
  const parse = (hex: string) => {
    const v = hex.replace("#", "");
    return [
      Number.parseInt(v.slice(0, 2), 16),
      Number.parseInt(v.slice(2, 4), 16),
      Number.parseInt(v.slice(4, 6), 16),
    ];
  };
  const [ir, ig, ib] = parse(ink);
  const [br, bg, bb] = parse(background);
  const mix = (i: number, b: number) =>
    Math.round(i * coverage + b * (1 - coverage));
  return `#${[mix(ir, br), mix(ig, bg), mix(ib, bb)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
};

/**
 * The contrast a label actually delivers, against the contrast it would deliver
 * if every ink pixel were fully opaque.
 *
 * ADR-0013 requirement 4 exists because roughjs jitter means an edge is never
 * exactly where the colour says it is. The same arithmetic applies to glyph
 * edges at 12 px, and it applies more strongly to a face with thin stems: the
 * stems never reach full coverage, so the delivered contrast is below the
 * palette contrast that the colour swatch implies.
 *
 * Reported as a ratio of the two, so 1.0 is "delivers its nominal contrast" and
 * 0.5 is "delivers half of it". This is the number requirement 4 asks for.
 */
export const effectiveContrast = (
  mask: Mask,
  ink: string,
  background: string,
): {
  nominal: number;
  delivered: number;
  ratio: number;
  meanCoverage: number;
} => {
  const nominal = contrastRatio(ink, background);

  let sum = 0;
  let count = 0;
  for (const value of mask.alpha) {
    if (value >= INK_THRESHOLD) {
      sum += value / 255;
      count++;
    }
  }
  const meanCoverage = count ? sum / count : 0;
  if (!count) {
    return { nominal, delivered: 1, ratio: 0, meanCoverage: 0 };
  }

  const delivered = contrastRatio(
    composite(ink, background, meanCoverage),
    background,
  );
  return { nominal, delivered, ratio: delivered / nominal, meanCoverage };
};
