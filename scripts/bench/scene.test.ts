/**
 * The scene generator's own tests.
 *
 * ## Why a generator needs tests at all
 *
 * Because the benchmarks built on it are comparative, and a comparator that is
 * not identical on both sides produces a number that looks like a result and is
 * not one. The determinism test below is the difference between "58 fps, the
 * single canvas is slower" and "58 fps, possibly noise".
 *
 * These are cheap tests on pure functions. They are here because the failure mode
 * they guard against is invisible in the benchmark output: a scene that is 4%
 * different between runs still produces a plausible-looking fps figure.
 */
import { describe, expect, test } from "vitest";

import {
  defaultWorldSize,
  generateScene,
  makeRng,
  sceneStats,
  TARGET_VISIBLE_ELEMENTS,
} from "./scene.js";

describe("determinism", () => {
  test("the same options produce a byte-identical scene", () => {
    // The load-bearing assertion. If this fails, every A/B comparison in Phase 2
    // is measuring two different boards.
    const a = generateScene({ count: 500, seed: 7 });
    const b = generateScene({ count: 500, seed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("a different seed produces a different scene", () => {
    // The control. A generator that ignored the seed would pass the test above
    // while being useless for a seed sweep.
    const a = generateScene({ count: 200, seed: 1 });
    const b = generateScene({ count: 200, seed: 2 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  test("the default seed is stable across calls", () => {
    // Omitting the seed must not be a hidden source of variance.
    expect(JSON.stringify(generateScene({ count: 50 }))).toBe(
      JSON.stringify(generateScene({ count: 50 })),
    );
  });

  test("generation is repeatable in count: a prefix of a bigger scene matches", () => {
    // Holds because ids derive from the index and the PRNG sequence is a
    // function of call count -- *when the world size is pinned*. If a future
    // change makes element content depend on the total, this catches it.
    //
    // `worldSize` is explicit here on purpose: it is now derived from `count`, so
    // a 20-element scene and a 100-element scene use different worlds by design.
    // That is the density model working, not a regression.
    const opts = { seed: 3, worldSize: 8000 };
    const small = generateScene({ ...opts, count: 20 });
    const large = generateScene({ ...opts, count: 100 });
    expect(JSON.stringify(small)).toBe(JSON.stringify(large.slice(0, 20)));
  });

  test("timestamps are pinned, not merely equal between runs", () => {
    /*
     * The tests above CANNOT check this, which is why it is checked here.
     *
     * `getUpdatedTimestamp()` is `isTestEnv() ? 1 : Date.now()`. Inside vitest it
     * returns 1 every time, so two scenes generated seconds apart are identical
     * whether or not the generator pins the field -- the comparison passes by
     * construction, and the first test in this block is green for a generator
     * whose timestamps vary wildly in a real browser.
     *
     * The clock dependence only appears where the benchmarks actually run, so it
     * has to be asserted against the value rather than against another run.
     * Dropping `updated: FIXED_TIMESTAMP` from the seal must fail here; it does
     * not fail anything else in this file.
     */
    const [element] = generateScene({ count: 1, seed: 1 });
    expect(element.updated).toBe(1704067200000);
    expect(element.created).toBe(1704067200000);
  });

  test("seeds are pinned, because roughjs draws from them", () => {
    // The same reasoning, and a sharper consequence. `seed` is not cosmetic: it
    // is the roughjs generator seed, so an unstable value means two runs render
    // *different shapes* for the same logical element. The fps numbers stay
    // plausible and the comparison quietly stops meaning anything.
    const elements = generateScene({ count: 3, seed: 1 });
    // 2654435761 mod 2147483647 = 506952114, so index 0 gets that rather than a
    // degenerate zero.
    expect(elements.map((e) => e.seed)).toEqual([
      506952114,
      (2 * 2654435761) % 2147483647,
      (3 * 2654435761) % 2147483647,
    ]);
    expect(elements.every((e) => e.seed > 0)).toBe(true);
    // Distinct per element, so the jitter is not one repeated pattern.
    expect(new Set(elements.map((e) => e.seed)).size).toBe(3);
  });
});

describe("the PRNG", () => {
  test("is a pure function of its seed", () => {
    expect([makeRng(42), makeRng(42)].map((r) => r())).toEqual([
      makeRng(42)(),
      makeRng(42)(),
    ]);
  });

  test("stays in [0, 1)", () => {
    // An out-of-range value would put elements off the world or throw in
    // `rng.int`, and the failure would look like a renderer bug.
    const rng = makeRng(99);
    for (let i = 0; i < 5000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test("is not obviously biased", () => {
    // A crude uniformity check, and deliberately crude: this is a scene
    // generator, not a statistics library. It catches a broken generator, not a
    // bad one.
    const rng = makeRng(5);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 10000; i += 1) {
      buckets[Math.floor(rng() * 10)] += 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });
});

describe("density is held constant across scene sizes", () => {
  // The property that makes a 1k-element measurement comparable to a 10k one.
  // It is derived rather than hard-coded, so it needs asserting.

  test("the derived world puts the target number on screen", () => {
    for (const count of [1000, 10000, 50000]) {
      const stats = sceneStats(generateScene({ count }), { count });
      expect(stats.expectedVisible, `count ${count}`).toBe(
        TARGET_VISIBLE_ELEMENTS,
      );
    }
  });

  test("a scene smaller than the target shows all of itself", () => {
    // 200 elements cannot put 400 on screen. The world would have to be smaller
    // than the target density implies, so the estimate saturates at the count --
    // and the test has to say so, because "the target is a target" is the
    // difference between a documented cap and a bug.
    const stats = sceneStats(generateScene({ count: 200 }), { count: 200 });
    expect(stats.expectedVisible).toBe(200);
    expect(TARGET_VISIBLE_ELEMENTS).toBeGreaterThan(200);
  });

  test("a bigger scene gets a proportionally bigger world, not more density", () => {
    // sqrt, so area -- and therefore density -- is what stays fixed.
    expect(defaultWorldSize(10000) / defaultWorldSize(1000)).toBeCloseTo(
      Math.sqrt(10),
      1,
    );
  });

  test("the world never collapses below the floor", () => {
    // Below ~500px the elements are bigger than the world and the scene becomes a
    // single overlapping pile, which is the pathological case, not a small board.
    expect(defaultWorldSize(1)).toBeGreaterThanOrEqual(500);
    expect(defaultWorldSize(0)).toBeGreaterThanOrEqual(500);
  });

  test("expectedVisible is capped at the full count", () => {
    // overlap-heavy divides the world by 20, so the analytic estimate can exceed
    // the scene. It is an expectation; it cannot be more than what exists.
    const stats = sceneStats(
      generateScene({ count: 200, profile: "overlap-heavy" }),
      { count: 200, profile: "overlap-heavy" },
    );
    expect(stats.expectedVisible).toBeLessThanOrEqual(200);
  });
});

describe("scene shape", () => {
  test("produces exactly the requested number of elements", () => {
    // The two renderer variants must be measured on the same workload. An
    // off-by-one here is invisible in the fps number.
    for (const count of [0, 1, 7, 250]) {
      expect(generateScene({ count })).toHaveLength(count);
    }
  });

  test("rejects a nonsensical count", () => {
    expect(() => generateScene({ count: -1 })).toThrow(RangeError);
    expect(() => generateScene({ count: 1.5 })).toThrow(RangeError);
  });

  test("every element id is unique", () => {
    // Duplicate ids would collapse entries in the renderer's caches, so the
    // second variant would render fewer elements than the first and look faster.
    const elements = generateScene({ count: 2000 });
    expect(new Set(elements.map((e) => e.id)).size).toBe(2000);
  });

  test("elements are spread across the world, not stacked at the origin", () => {
    // Culling is only measured if there is somewhere to cull to. A scene
    // collapsed into one corner would make any spatial index look perfect.
    const elements = generateScene({ count: 500, worldSize: 20000 });
    const stats = sceneStats(elements, { count: 500, worldSize: 20000 });
    expect(stats.extent.maxX).toBeGreaterThan(15000);
    expect(stats.extent.maxY).toBeGreaterThan(15000);
  });

  test("overlap-heavy is genuinely denser", () => {
    // The profile exists to defeat culling, so it has to actually compress.
    // Measured by `expectedVisible`, not by the extent: at small counts the world
    // is smaller than the elements themselves, so the extent is dominated by
    // element size and stops being a measure of spread.
    // A count above the target, so the normal world does not saturate and the two
    // profiles are actually distinguishable. At 300 elements both saturate at the
    // count and the comparison proves nothing.
    const count = 3000;
    const normal = sceneStats(generateScene({ count }), { count });
    const dense = sceneStats(
      generateScene({ count, profile: "overlap-heavy" }),
      { count, profile: "overlap-heavy" },
    );
    expect(dense.expectedVisible).toBe(count);
    expect(normal.expectedVisible).toBe(TARGET_VISIBLE_ELEMENTS);
    expect(dense.expectedVisible / normal.expectedVisible).toBeGreaterThan(5);
  });
});

describe("profiles", () => {
  test("uniform-rectangles is only rectangles", () => {
    const stats = sceneStats(
      generateScene({ count: 300, profile: "uniform-rectangles" }),
      { count: 300, profile: "uniform-rectangles" },
    );
    expect(Object.keys(stats.byType)).toEqual(["rectangle"]);
  });

  test("realistic produces a mix with a majority of shapes", () => {
    const stats = sceneStats(
      generateScene({ count: 2000, profile: "realistic" }),
      { count: 2000, profile: "realistic" },
    );
    expect(Object.keys(stats.byType).length).toBeGreaterThan(2);
    const shapes =
      (stats.byType.rectangle ?? 0) +
      (stats.byType.ellipse ?? 0) +
      (stats.byType.diamond ?? 0);
    expect(shapes / 2000).toBeGreaterThan(0.45);
    expect((stats.byType.arrow ?? 0) / 2000).toBeGreaterThan(0.1);
  });

  test("text-heavy is actually text-heavy", () => {
    const stats = sceneStats(
      generateScene({ count: 2000, profile: "text-heavy" }),
      { count: 2000, profile: "text-heavy" },
    );
    expect((stats.byType.text ?? 0) / 2000).toBeGreaterThan(0.5);
  });

  test("a minority of shapes are rotated", () => {
    // Rotated bounds are what a spatial index gets wrong. A scene of
    // axis-aligned boxes never finds out, so the generator has to put them in.
    const elements = generateScene({ count: 1000 });
    const rotated = elements.filter((e) => e.angle !== 0).length;
    expect(rotated).toBeGreaterThan(50);
  });
});

describe("stats", () => {
  test("handles an empty scene without producing Infinity", () => {
    // Printed into a report, "Infinity" reads as a bug in the benchmark rather
    // than as the correct answer for zero elements.
    const stats = sceneStats([], { count: 0 });
    expect(stats.extent).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect(JSON.stringify(stats)).not.toContain("null");
  });

  test("the extent accounts for negative width and height", () => {
    // A line runs up and to the left, so x + width < x. An extent computed as
    // [x, x + width] would report min > max and a viewport cull would drop it.
    const elements = generateScene({ count: 300, profile: "realistic" });
    const stats = sceneStats(elements, { count: 300 });
    expect(stats.extent.minX).toBeLessThanOrEqual(stats.extent.maxX);
    expect(stats.extent.minY).toBeLessThanOrEqual(stats.extent.maxY);
  });
});
