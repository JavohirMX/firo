import { describe, expect, it } from "vitest";

/*
 * Import through the package name, not `../src/constants`. There is a real
 * import cycle -- `constants` -> `./colors` -> `@firo/math` -> `math/range.ts`
 * -> the `@firo/common` barrel -> `index.ts` -> `font-metadata`, which reads
 * `FONT_FAMILY` from `constants` before it has finished initialising. Entering
 * the graph at the barrel is safe (the cycle resolves before it is read);
 * entering it at `constants` throws `Cannot read properties of undefined
 * (reading 'Excalifont')`. The barrel is the supported entry point, and the
 * only one this repository uses.
 */
import { DEFAULT_ELEMENT_PROPS, ROUGHNESS } from "@firo/common";

/*
 * ADR-0021 moved the default roughness from `artist` (1) to `architect` (0), so
 * that a board drawn on a fresh install reads as the tool teams already know
 * rather than as a sketch pad. The sketch stroke is still an option; it is no
 * longer the frame every new element is drawn inside.
 *
 * The numeric value is asserted and not only the constant, because "clean" is
 * specifically roughjs `roughness: 0` -- the setting that produces true
 * geometry. `ROUGHNESS.architect` quietly becoming 0.5 would keep a
 * constant-only assertion passing while the aesthetic it exists to guarantee
 * drifted away.
 */

describe("the default element roughness", () => {
  it("is clean (roughness 0)", () => {
    expect(DEFAULT_ELEMENT_PROPS.roughness).toBe(ROUGHNESS.architect);
    expect(ROUGHNESS.architect).toBe(0);
  });

  it("is not the hand-drawn default it replaced", () => {
    /*
     * A control, so the test above cannot pass by forgetting to change
     * anything. ADR-0014 clause 3 set this default to `artist`; undoing
     * ADR-0021 means superseding it, not editing this line.
     */
    expect(DEFAULT_ELEMENT_PROPS.roughness).not.toBe(ROUGHNESS.artist);
    expect(ROUGHNESS.artist).toBe(1);
  });

  it("keeps every roughness available, including the hand-drawn ones", () => {
    // The default changed; the vocabulary did not. Dropping `artist` from
    // `ROUGHNESS` would take the sketch stroke away from users entirely, which
    // is not what ADR-0021 decided -- it made clean the default, not the law.
    expect(Object.keys(ROUGHNESS)).toEqual([
      "architect",
      "artist",
      "cartoonist",
    ]);
    expect(Object.values(ROUGHNESS)).toEqual([0, 1, 2]);
  });

  it("leaves the neighbouring defaults alone", () => {
    // The flip is one field. This pins the others so that it stays one field.
    expect(DEFAULT_ELEMENT_PROPS.strokeStyle).toBe("solid");
    expect(DEFAULT_ELEMENT_PROPS.fillStyle).toBe("solid");
    expect(DEFAULT_ELEMENT_PROPS.strokeWidth).toBe(2);
    expect(DEFAULT_ELEMENT_PROPS.opacity).toBe(100);
    expect(DEFAULT_ELEMENT_PROPS.locked).toBe(false);
  });
});
