/**
 * Deterministic scene generation for renderer benchmarks.
 *
 * ## Why determinism is the whole point of this file
 *
 * The Phase 2 spikes are comparative. "Does one canvas beat two?" is only
 * answerable if both variants render **the same scene**, and "same scene" means
 * byte-identical, not statistically similar. A generator that uses `Math.random`
 * produces a different board every run, so a 4 fps difference between two runs
 * becomes indistinguishable from a 0.2 fps regression, and a real 20% regression
 * hides inside the noise.
 *
 * So: a seeded PRNG, no `Math.random` anywhere, stable element ids, and a
 * spatial distribution that does not change with the count. Two runs of the same
 * options produce `JSON.stringify`-identical output, and there is a test that
 * asserts exactly that.
 *
 * ## Why this builds inherited Excalidraw elements, not `@firo/schema` elements
 *
 * The spikes measure the **inherited** renderer as the baseline, and that
 * renderer consumes `ExcalidrawElement`. Generating our own schema types here
 * would produce a scene the baseline cannot draw, which would make every
 * comparison meaningless.
 *
 * When the renderer moves to `@firo/schema` types (Phase 3/4), this file needs a
 * second mode rather than an edit — the profile and distribution logic are
 * independent of the element shape, only the factory is not.
 *
 * ## Why the profiles exist
 *
 * One number is not a measurement. `count` rectangles is the easy case, and a
 * board that is 10,000 rectangles does not exist. The profiles bracket the real
 * number: the easy end, the realistic middle, and the two pathological ends
 * (text-heavy, which is where canvas text layout blows the budget, and
 * overlap-heavy, which defeats naive culling).
 */
import {
  newElement,
  newFreeDrawElement,
  newLinearElement,
  newTextElement,
} from "@firo/element";
import { pointFrom } from "@firo/math";

import type { LocalPoint, Radians } from "@firo/math";
import type { ExcalidrawElement } from "@firo/element/types";

/**
 * mulberry32: a 32-bit PRNG.
 *
 * Chosen over `Math.random` because the output is a pure function of the seed,
 * and over a heavier generator because this runs 10,000+ times per scene and the
 * statistical quality needed here is "not correlated enough to matter".
 */
export const makeRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A seeded random source with the helpers a generator actually wants. */
class Rng {
  constructor(private readonly next: () => number) {}

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    // `max` inclusive. `Math.floor` on a float < 1 cannot exceed the range, so
    // there is no modulo and no bias at the top of the interval.
    return Math.floor(this.float(min, max + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /**
   * A fresh value in [0, 1).
   *
   * Public because a caller legitimately needs the raw value for a
   * threshold comparison, and reaching into the private field to get it would
   * mean every such caller is one refactor away from a compile error.
   */
  unit(): number {
    return this.next();
  }

  /**
   * A value in [-pi, pi), branded as an angle.
   *
   * The cast is at the boundary on purpose. `Radians` is a nominal brand over
   * `number` that exists to stop someone passing degrees by mistake; the one
   * legitimate place to cross it is code that is generating radians, which is
   * this. Widening the brand to anything numeric would delete the check.
   */
  angle(): Radians {
    return this.float(-Math.PI, Math.PI) as Radians;
  }
}

export type SceneProfile =
  /** Every element a rectangle. The easy end, and a floor to measure against. */
  | "uniform-rectangles"
  /**
   * A board that looks like a board: mostly shapes, a real number of arrows and
   * text, some freedraw, spread out.
   */
  | "realistic"
  /** Text-dominated. The profile that decides whether text needs a raster LoD. */
  | "text-heavy"
  /**
   * Everything stacked in one region. The profile that defeats naive culling,
   * because every element intersects the viewport no matter where you pan.
   */
  | "overlap-heavy";

export type SceneOptions = {
  count: number;
  /**
   * Defaults to 1. A different seed is a different board, not a variation on
   * this one — which is deliberate, so a "seed sweep" is an explicit act.
   */
  seed?: number;
  profile?: SceneProfile;
  /**
   * World extent in px. Elements are spread across this square, so a typical
   * 1280x800 viewport at 100% zoom sees roughly
   * `viewportArea / worldSize^2` of them.
   *
   * Does not scale with `count`: growing the board grows the *density*, so a
   * 10k-element scene is denser than a 1k one rather than more spread out. That
   * is deliberate — density is what stresses the renderer, and a scene that
   * merely gets wider would make culling look better than it is.
   */
  worldSize?: number;
  /**
   * Excalidraw's `roughness`, from 0 (clean) to 2 (roughest). Default 1.
   *
   * ## Why this is a generator option and not a renderer flag
   *
   * Because `roughness` is what decides whether a shape needs roughjs at all.
   * At 0 Excalidraw draws a plain geometric path; at 1 and 2 it generates a
   * jittered rough shape. So setting it to 0 is not "the same scene drawn
   * differently" -- it is a *different render path*, and it is exactly what the
   * Level of Detail work proposes for low zoom.
   *
   * That makes it the cleanest available probe of how much of the renderer's
   * cost is roughjs. Comparing roughness 1 against roughness 0 on an identical
   * scene answers the question Phase 2 task 2.3 is really asking, without
   * writing any renderer yet.
   */
  roughness?: number;
};

const DEFAULT_SEED = 1;

/**
 * The expected number of elements visible in a 1280x800 viewport.
 *
 * Not a rendering budget -- a *workload* target. Around 400 visible elements is
 * enough that per-frame work is dominated by drawing rather than by measurement
 * overhead, and few enough to be comparable to what a person actually sees on a
 * busy board.
 */
export const TARGET_VISIBLE_ELEMENTS = 400;

/** The viewport the target is defined against. */
const TARGET_VIEWPORT_AREA = 1280 * 800;

/**
 * World size that puts ~`TARGET_VISIBLE_ELEMENTS` on screen.
 *
 * Density is held constant across scene sizes, so a measurement at 1k elements
 * and one at 10k measure the same per-frame load. Deriving it rather than
 * hard-coding a number is what makes that true by construction: a fixed world
 * size means a 200-element scene has a handful on screen and a 10,000-element
 * scene has a few dozen, so both measure a nearly empty canvas and the number
 * says nothing about the renderer.
 */
const derivedWorldSize = (count: number): number =>
  Math.round(
    Math.sqrt((TARGET_VIEWPORT_AREA * count) / TARGET_VISIBLE_ELEMENTS),
  );

/**
 * How much `overlap-heavy` compresses the world.
 *
 * 20x, so a 10,000-element board occupies a region small enough that essentially
 * every element is in the viewport no matter where you pan. That is the whole
 * point of the profile: it is the case a spatial index cannot rescue.
 */
const OVERLAP_COMPRESSION = 20;

/** The floor, so a tiny scene is still a scene rather than a single pile. */
const MIN_WORLD_SIZE = 500;

/**
 * The world size actually used, profile compression included.
 *
 * ## Why this is one function
 *
 * `generateScene` compresses `overlap-heavy` by 20x while `expectedVisible`
 * originally read the *uncompressed* size, so the reported visible count was off
 * by a factor of 20 for exactly the profile whose whole purpose is to be dense.
 * The estimate has to be derived from the same value the generator uses, so both
 * call this.
 *
 * An explicit `worldSize` is honoured as given, compression included. That is
 * deliberate: an explicit value is a caller who knows what they want, and
 * silently rescaling it would be worse than the original bug.
 */
export const worldSizeFor = (options: SceneOptions): number => {
  if (options.worldSize !== undefined) {
    return options.worldSize;
  }
  const derived = derivedWorldSize(options.count);
  return options.profile === "overlap-heavy"
    ? Math.max(MIN_WORLD_SIZE, Math.round(derived / OVERLAP_COMPRESSION))
    : Math.max(MIN_WORLD_SIZE, derived);
};

/** The world size for a scene of `count` elements at the target density. */
export const defaultWorldSize = (count: number): number =>
  Math.max(MIN_WORLD_SIZE, derivedWorldSize(count));

/**
 * The fixed timestamp every generated element carries.
 *
 * A constant, not "now". `newElement` stamps `updated` and `created` with
 * `getUpdatedTimestamp()`, so a scene built twice differs even with a fixed PRNG
 * seed.
 */
const FIXED_TIMESTAMP = 1704067200000; // 2024-01-01T00:00:00Z

/** Element ids are derived from the index, so they are stable and unique. */
const idFor = (index: number): string =>
  `bench-${index.toString(36).padStart(6, "0")}`;

/**
 * Make one constructed element deterministic.
 *
 * ## Why this pass exists rather than passing every volatile field to the factory
 *
 * The element constructors randomise two things by default: `seed` via
 * `randomInteger()`, and `updated`/`created` via `getUpdatedTimestamp()`. Both
 * can be overridden, but relying on that means the determinism of a benchmark
 * scene depends on the internals of a constructor in a package we are actively
 * refactoring — and the day someone changes that default, every benchmark
 * silently becomes non-comparable with no visible symptom.
 *
 * `seed` is the dangerous one. It is not cosmetic: it seeds roughjs, so an
 * unstable `seed` means the two renderer variants draw *different shapes* for
 * the same logical element. The fps numbers stay plausible and the comparison
 * quietly stops meaning anything.
 *
 * So the guarantee is owned here, explicitly, over every volatile field.
 */
const seal = <T extends ExcalidrawElement>(element: T, index: number): T =>
  ({
    ...element,
    id: idFor(index),
    /*
     * A hash of the index, so shapes differ from each other but not between
     * runs. `seed` is the roughjs generator seed; reusing one value for the whole
     * scene would give every element an identical jitter pattern, which is both
     * unrealistic and flattering to any cache keyed on the shape.
     *
     * Offset by one so the first element gets a non-zero seed. A zero seed is
     * legal for roughjs but is a degenerate input, and leaving one element of
     * every scene in a special case is a trap for whoever debugs a shape that
     * looks wrong.
     */
    seed: ((index + 1) * 2654435761) % 2147483647,
    version: 1,
    versionNonce: 1,
    created: FIXED_TIMESTAMP,
    updated: FIXED_TIMESTAMP,
  } as T);

const makeText = (rng: Rng, x: number, y: number) =>
  newTextElement({
    x,
    y,
    // Long enough to wrap, short enough not to dominate layout cost. Real boards
    // have short labels; a generator that emits paragraphs measures a
    // worst case nobody has.
    text: `Label — the quick brown fox jumps over the lazy dog`,
    width: rng.float(80, 240),
    autoResize: true,
  });

const makeArrow = (rng: Rng, x: number, y: number) => {
  const dx = rng.float(60, 200);
  const dy = rng.float(-60, 60);
  return newLinearElement({
    type: "arrow",
    x,
    y,
    width: dx,
    height: dy,
    points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(dx, dy)],
  });
};

const makeFreeDraw = (rng: Rng, x: number, y: number) => {
  const pointCount = rng.int(8, 32);
  const points: LocalPoint[] = [];
  for (let i = 0; i < pointCount; i += 1) {
    points.push(pointFrom<LocalPoint>(i * 6, rng.float(-12, 12)));
  }
  const last = points[points.length - 1];
  return newFreeDrawElement({
    type: "freedraw",
    x,
    y,
    width: last[0],
    height: 24,
    points,
    simulatePressure: true,
  });
};

const makeShape = (
  rng: Rng,
  x: number,
  y: number,
  type: "rectangle" | "ellipse" | "diamond",
  roughness: number,
) =>
  newElement({
    type,
    x,
    y,
    roughness,
    width: rng.float(40, 220),
    height: rng.float(40, 180),
    // A minority are rotated, because rotated bounds are what a spatial index
    // gets wrong and a scene of axis-aligned boxes never finds out.
    angle: rng.chance(0.15) ? rng.angle() : (0 as Radians),
  });

/**
 * The shape mix for a profile, as cumulative probabilities.
 *
 * Written as thresholds rather than a weighted pick so the distribution is
 * readable and the RNG is called the same number of times regardless of branch —
 * which keeps the sequence stable if a probability is later tuned.
 */
const MIXES: Record<
  SceneProfile,
  { shape: number; arrow: number; text: number; freedraw: number }
> = {
  "uniform-rectangles": { shape: 1, arrow: 0, text: 0, freedraw: 0 },
  // Roughly what a workshop board looks like: mostly shapes, a fifth arrows
  // (Miro boards are full of them), a sixth text, some hand-drawn.
  realistic: { shape: 0.6, arrow: 0.2, text: 0.15, freedraw: 0.05 },
  "text-heavy": { shape: 0.2, arrow: 0.1, text: 0.65, freedraw: 0.05 },
  "overlap-heavy": { shape: 0.5, arrow: 0.2, text: 0.25, freedraw: 0.05 },
};

export const generateScene = (options: SceneOptions): ExcalidrawElement[] => {
  const {
    count,
    seed = DEFAULT_SEED,
    profile = "realistic",
    roughness = 1,
  } = options;

  const worldSize = worldSizeFor(options);

  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(
      `Scene count must be a non-negative integer, got ${count}.`,
    );
  }

  const rng = new Rng(makeRng(seed));
  const mix = MIXES[profile];
  const elements: ExcalidrawElement[] = [];

  for (let index = 0; index < count; index += 1) {
    const x = rng.float(0, worldSize);
    const y = rng.float(0, worldSize);

    const roll = rng.unit();
    let element: ExcalidrawElement;
    if (roll < mix.shape) {
      /*
       * `uniform-rectangles` is the one profile that must not vary the shape,
       * because its whole purpose is to be the easy end of the bracket. Without
       * this branch a "uniform rectangles" scene is a mix of three shapes and the
       * profile quietly measures the wrong thing.
       */
      const type =
        profile === "uniform-rectangles"
          ? "rectangle"
          : rng.chance(0.6)
          ? "rectangle"
          : rng.chance(0.5)
          ? "ellipse"
          : "diamond";
      element = makeShape(rng, x, y, type, roughness);
    } else if (roll < mix.shape + mix.arrow) {
      element = makeArrow(rng, x, y);
    } else if (roll < mix.shape + mix.arrow + mix.text) {
      element = makeText(rng, x, y);
    } else {
      element = makeFreeDraw(rng, x, y);
    }
    elements.push(seal(element, index));
  }

  return elements;
};

/**
 * Scene statistics, for reporting a measurement in context.
 *
 * A bare "58 fps" is not a result. Which profile, how many elements, how many
 * distinct types, and how spread out — that is what makes two numbers
 * comparable six months apart.
 */
export type SceneStats = {
  count: number;
  profile: SceneProfile;
  seed: number;
  worldSize: number;
  byType: Record<string, number>;
  /** Bounding box of every element, in board coordinates. */
  extent: { minX: number; minY: number; maxX: number; maxY: number };
  /** Expected elements inside a 1280x800 viewport at 100% zoom. */
  expectedVisible: number;
};

/**
 * How many elements the scene puts inside a 1280x800 viewport.
 *
 * Analytic, from area rather than from a culling query: `viewportArea /
 * worldArea * count`. It is the number that makes a measurement interpretable --
 * "60 fps at 10,000 elements" means something very different when 400 of them
 * are on screen than when 12 are, and reporting it next to the fps figure is the
 * difference between a result and a number.
 *
 * Approximate by construction. Elements are scattered uniformly, so this is the
 * expected value rather than the exact one; it is the right quantity to report
 * and the wrong one to assert on.
 */
export const expectedVisible = (options: SceneOptions): number => {
  const worldSize = worldSizeFor(options);
  const fraction = Math.min(1, TARGET_VIEWPORT_AREA / (worldSize * worldSize));
  return Math.round(options.count * fraction);
};

export const sceneStats = (
  elements: readonly ExcalidrawElement[],
  options: SceneOptions,
): SceneStats => {
  const byType: Record<string, number> = {};
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const element of elements) {
    byType[element.type] = (byType[element.type] ?? 0) + 1;
    // Width/height can be negative for a line running up and to the left, so the
    // extent is computed from both corners rather than assuming x + width > x.
    minX = Math.min(minX, element.x, element.x + element.width);
    maxX = Math.max(maxX, element.x, element.x + element.width);
    minY = Math.min(minY, element.y, element.y + element.height);
    maxY = Math.max(maxY, element.y, element.y + element.height);
  }

  return {
    count: elements.length,
    profile: options.profile ?? "realistic",
    seed: options.seed ?? DEFAULT_SEED,
    worldSize: worldSizeFor(options),
    byType,
    // An empty scene has no extent; zero rather than Infinity, so a consumer
    // printing the result does not print "Infinity".
    extent: elements.length
      ? { minX, minY, maxX, maxY }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    expectedVisible: expectedVisible(options),
  };
};
