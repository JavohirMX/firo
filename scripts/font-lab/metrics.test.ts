import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  MIN_STROKE_PX,
  contrastRatio,
  createMask,
  downsample,
  effectiveContrast,
  hairlineFraction,
  inkCoverage,
  inkRetained,
  shapeFidelity,
  trim,
} from "./metrics";

import { CONTROL, FACES, FONT_SIZE, LABELS, ZOOMS } from "./fonts";

const labDir = path.resolve(__dirname);
const repoRoot = path.resolve(labDir, "..", "..");

/** A solid bar `width` x `height`, fully inked. */
const bar = (
  width: number,
  height: number,
  value = 255,
): ReturnType<typeof createMask> => {
  const mask = createMask(width, height);
  mask.alpha.fill(value);
  return mask;
};

/** A vertical bar `strokePx` wide and `height` tall, centred in a padded box. */
const stroke = (strokePx: number, height: number, pad = 4) => {
  const mask = createMask(strokePx + pad * 2, height + pad * 2);
  for (let y = pad; y < pad + height; y++) {
    for (let x = pad; x < pad + strokePx; x++) {
      mask.alpha[y * mask.width + x] = 255;
    }
  }
  return mask;
};

describe("inkCoverage", () => {
  it("counts a fully inked mask as 1", () => {
    expect(inkCoverage(bar(8, 8))).toBe(1);
  });

  it("counts an empty mask as 0", () => {
    expect(inkCoverage(createMask(8, 8))).toBe(0);
  });

  it("ignores anti-aliasing below the ink threshold", () => {
    // The failure mode this guards: a face whose glyphs are mostly faint fringe
    // would score as legible if a 30%-coverage pixel counted as a stroke.
    const mask = createMask(10, 10);
    mask.alpha.fill(100); // below INK_THRESHOLD
    expect(inkCoverage(mask)).toBe(0);
  });

  it("is proportional to ink", () => {
    const mask = createMask(10, 10);
    for (let i = 0; i < 25; i++) {
      mask.alpha[i] = 255;
    }
    expect(inkCoverage(mask)).toBeCloseTo(0.25, 6);
  });
});

describe("trim", () => {
  it("crops to the ink bounding box", () => {
    const mask = createMask(20, 20);
    for (let y = 5; y < 9; y++) {
      for (let x = 7; x < 12; x++) {
        mask.alpha[y * 20 + x] = 255;
      }
    }
    const cropped = trim(mask);
    expect(cropped?.width).toBe(5);
    expect(cropped?.height).toBe(4);
    expect(inkCoverage(cropped!)).toBe(1);
  });

  it("returns null when there is no ink", () => {
    // Null rather than an empty mask, so a caller cannot divide by a zero-sized
    // mask and report a confident NaN instead of a missing measurement.
    expect(trim(createMask(4, 4))).toBeNull();
  });
});

describe("downsample", () => {
  it("averages rather than samples, so a checkerboard does not vanish", () => {
    // Nearest-neighbour sampling on this input picks alternating pixels and
    // returns all-black, which would make a thin-stemmed reference look solid.
    const mask = createMask(4, 4);
    for (let i = 0; i < 16; i++) {
      mask.alpha[i] = i % 2 === 0 ? 255 : 0;
    }
    const small = downsample(mask, 2, 2);
    expect(small.alpha[0]).toBeCloseTo(128, 0);
    expect(small.alpha[1]).toBeCloseTo(128, 0);
    expect(small.alpha[2]).toBeCloseTo(128, 0);
    expect(small.alpha[3]).toBeCloseTo(128, 0);
  });

  it("preserves a uniform mask's value", () => {
    expect(downsample(bar(8, 8, 200), 4, 4).alpha.every((v) => v === 200)).toBe(
      true,
    );
  });

  it("scales the dimensions it was asked for", () => {
    const small = downsample(bar(16, 16), 5, 3);
    expect(small.width).toBe(5);
    expect(small.height).toBe(3);
  });
});

describe("hairlineFraction", () => {
  it("is 1 when nothing is thicker than one pixel", () => {
    // Every stroke in the mask is hairline, so one erosion empties it.
    expect(hairlineFraction(stroke(1, 20))).toBeCloseTo(1, 6);
  });

  it("is 0 for a solid block, because nothing in it is hairline", () => {
    // This is the property the distance transform bought and erosion did not
    // have. A solid 12x12 block has a thin *boundary*, and under erosion that
    // boundary counted against it -- the old scheme scored a solid block as 31%
    // hairline, which is nonsense. Every pixel of a 12x12 block is at least 2 px
    // from the edge except the outer ring, and the outer ring is 6 px from the
    // far side, so nothing here is hairline at all.
    expect(hairlineFraction(bar(12, 12))).toBe(0);
  });

  it("draws the line at MIN_STROKE_PX, not at 1px", () => {
    // 1 px is hairline, 2 px is not, and 2 px is the documented threshold. If
    // someone moves MIN_STROKE_PX these first two assertions are what should fail
    // first, so they read the constant rather than hard-coding the boundary.
    expect(hairlineFraction(stroke(1, 20))).toBeCloseTo(1, 6);
    expect(hairlineFraction(stroke(MIN_STROKE_PX, 20))).toBe(0);
  });

  it("calls a wide stem fully solid", () => {
    expect(hairlineFraction(stroke(6, 20))).toBe(0);
  });

  it("reacts to a hairline in the mask, which a depth-of-erosion scheme misses", () => {
    // The failure this metric exists to catch. Eroding repeatedly and reporting
    // how deep the mask survives is a maximum over the mask: a 5px stem keeps a
    // core long after a 1px stem beside it has gone, so that scheme reports a
    // comfortable thickness for a label whose ascender is one pixel wide.
    const withHairline = createMask(21, 29);
    const allThick = createMask(21, 29);
    for (let y = 4; y < 25; y++) {
      for (let x = 2; x < 7; x++) {
        withHairline.alpha[y * 21 + x] = 255;
      }
      withHairline.alpha[y * 21 + 15] = 255; // the hairline
      for (let x = 2; x < 8; x++) {
        allThick.alpha[y * 21 + x] = 255; // the same ink as one 6px stem
      }
    }
    // Identical ink: 5px stem plus a 1px hairline, against a single 6px stem.
    // The only difference is whether any of it was drawn too thin to hold.
    expect(inkCoverage(withHairline)).toBeCloseTo(inkCoverage(allThick), 6);
    expect(hairlineFraction(withHairline)).toBeGreaterThan(
      hairlineFraction(allThick) + 0.1,
    );
  });

  it("returns 0 for no ink rather than dividing by zero", () => {
    expect(hairlineFraction(createMask(10, 10))).toBe(0);
  });
});

describe("inkRetained", () => {
  it("is 1 when the measurement matches its reference", () => {
    expect(inkRetained(bar(10, 10, 255), bar(10, 10, 255))).toBeCloseTo(1, 6);
  });

  it("is below 1 when ink is lost", () => {
    const measured = createMask(10, 10);
    for (let i = 0; i < 50; i++) {
      measured.alpha[i] = 255;
    }
    expect(inkRetained(measured, bar(10, 10, 255))).toBeCloseTo(0.5, 6);
  });

  it("is 0 rather than NaN when the reference is empty", () => {
    // The division that would otherwise produce NaN, which formats as "NaN" in
    // a report and reads as a measurement of a face that does not exist.
    const measured = bar(4, 4, 255);
    expect(inkRetained(measured, createMask(4, 4))).toBe(0);
  });
});

describe("shapeFidelity", () => {
  it("is 1 for a mask against itself", () => {
    expect(shapeFidelity(bar(8, 8), bar(8, 8))).toBeCloseTo(1, 6);
  });

  it("is 0 when there is no ink to compare", () => {
    expect(shapeFidelity(createMask(4, 4), bar(4, 4))).toBe(0);
  });

  it("falls as the letterforms drift from the reference", () => {
    // Two masks of the same size, as the lab compares them: the page sends the
    // 16x reference already averaged down to the measured grid, so no resampling
    // happens and this is a straight per-pixel difference.
    //
    // Solid blocks are the wrong example here -- stretching a 2px bar to 3px
    // repeats a column and changes nothing, so two different stem widths compare
    // equal. What a small rendering actually loses is internal detail: counters
    // filling in and joins closing up.
    const reference = createMask(12, 12);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        // A ring with a hollow centre.
        reference.alpha[y * 12 + x] =
          x < 2 || x > 9 || y < 2 || y > 9 ? 255 : 0;
      }
    }
    const filled = createMask(12, 12);
    filled.alpha.fill(255);

    expect(shapeFidelity(filled, reference)).toBeLessThan(0.9);
    expect(shapeFidelity(filled, reference)).toBeGreaterThan(0.5);
  });

  it("is blind to a baseline shift, because trimming removes one", () => {
    // Pinned deliberately. The measured mask is drawn at 12 px and the reference
    // at 16x, so their baselines cannot land on the same row. Trimming first is
    // what makes the comparison about letterform shape rather than about where
    // the layout put the line -- but it also means a *gross* vertical
    // misalignment would score 1.0. That is the intended trade, and anyone
    // widening this metric has to revisit this test.
    const reference = stroke(3, 20);
    const shifted = createMask(reference.width, reference.height);
    for (let y = 0; y < reference.height - 1; y++) {
      for (let x = 0; x < reference.width; x++) {
        shifted.alpha[y * reference.width + x] =
          reference.alpha[(y + 1) * reference.width + x];
      }
    }
    expect(shapeFidelity(shifted, reference)).toBeCloseTo(1, 6);
  });
});

describe("contrast", () => {
  it("computes the WCAG extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 6);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#1e1e1e", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#1e1e1e"),
      9,
    );
  });

  it("delivers the nominal contrast for fully opaque ink", () => {
    const result = effectiveContrast(bar(6, 6, 255), "#1e1e1e", "#ffffff");
    expect(result.nominal).toBeCloseTo(contrastRatio("#1e1e1e", "#ffffff"), 6);
    expect(result.ratio).toBeCloseTo(1, 2);
  });

  it("delivers less than nominal for anti-aliased ink", () => {
    // ADR-0013 requirement 4: the contrast a face delivers at 12 px is not the
    // contrast its palette entry implies, because no stem reaches full coverage.
    const faded = bar(6, 6, 128);
    const result = effectiveContrast(faded, "#1e1e1e", "#ffffff");
    expect(result.meanCoverage).toBeCloseTo(128 / 255, 6);
    expect(result.delivered).toBeLessThan(result.nominal);
    expect(result.ratio).toBeLessThan(1);
  });

  it("delivers nothing for no ink rather than a full ratio", () => {
    // A face that failed to load reports no ink. Reporting ratio 1 here would
    // let an unloaded face post the best contrast in the table.
    expect(
      effectiveContrast(createMask(4, 4), "#1e1e1e", "#ffffff").ratio,
    ).toBe(0);
  });
});

describe("the lab configuration", () => {
  it("carries the control face so a candidate has something to beat", () => {
    expect(CONTROL.role).toBe("control");
    expect(FACES.some((face) => face.role === "control")).toBe(true);
  });

  it("tests the size ADR-0013 names and the zoom where small text fails first", () => {
    expect(FONT_SIZE).toBe(12);
    expect(ZOOMS).toContain(0.5);
  });

  it("measures every label category the brief names", () => {
    const kinds = LABELS.map((label) => label.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "heading",
        "five-word phrase",
        "single word",
        "numeric label",
      ]),
    );
  });

  it("pairs every binary with a licence file that exists on disk", () => {
    // AGENTS.md permits a font binary only when its licence text is committed
    // alongside it. This is that rule, applied to the lab's own fonts.
    const missing = FACES.filter(
      (face) =>
        !fs.existsSync(path.join(labDir, face.file)) ||
        !fs.existsSync(path.join(labDir, face.licence)),
    ).map((face) => face.id);
    expect(missing).toEqual([]);
  });

  it("pairs every licence file with a binary, so a licence cannot outlive its font", () => {
    const orphans = fs
      .readdirSync(path.join(labDir, "fonts"))
      .filter((name) => name.endsWith("-OFL.txt"))
      .filter((name) => {
        const stem = name.slice(0, -"-OFL.txt".length);
        return !fs
          .readdirSync(path.join(labDir, "fonts"))
          .some(
            (file) =>
              file.startsWith(`${stem}-`) && /\.(ttf|otf|woff2?)$/i.test(file),
          );
      });
    expect(orphans).toEqual([]);
  });

  it("uses a licence copy identical to the one committed with the shipped control", () => {
    const lab = fs.readFileSync(path.join(labDir, "fonts", "Nunito-OFL.txt"));
    const shipped = fs.readFileSync(
      path.join(repoRoot, "packages", "editor", "fonts", "Nunito", "OFL.txt"),
    );
    expect(lab.equals(shipped)).toBe(true);
  });

  it("has a unique id and cssFamily per face", () => {
    // A duplicate family would make two candidates render identically and the
    // comparison would report a difference in the typeface that is really a
    // collision in this manifest.
    expect(new Set(FACES.map((face) => face.id)).size).toBe(FACES.length);
    expect(new Set(FACES.map((face) => face.cssFamily)).size).toBe(
      FACES.length,
    );
  });
});
