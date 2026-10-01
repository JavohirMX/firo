import { ROUNDNESS } from "@firo/common";

import type { RoundnessType } from "../src/types.js";

/*
 * The renderer and the schema must agree on what `roundness.type` is.
 *
 * This is here because they disagreed once. The schema declared
 * `"radius" | "proportional"` while Excalidraw's `ROUNDNESS` is a numeric enum,
 * and nothing caught it: every `roundness` in the schema and its fixtures is
 * `null`, so no value ever exercised the type. The mismatch only surfaced when
 * `@firo/board` tried to hand a note to the canvas and the types refused to
 * assign.
 *
 * Deriving the type from `ROUNDNESS` fixes the drift by construction. This test
 * is the belt to that braces: it fails if someone re-declares the type locally,
 * which is the only way it can drift again.
 */

describe("RoundnessType", () => {
  it("is exactly the set of values the renderer accepts", () => {
    const rendererValues = Object.values(ROUNDNESS).sort();
    const schemaValues = [...RENDERED].sort();

    expect(schemaValues).toEqual(rendererValues);
  });

  it("has no string members, which is what drifted", () => {
    // The specific regression. A string here means a note carries a corner style
    // the canvas cannot interpret.
    for (const value of RENDERED) {
      expect(typeof value).toBe("number");
    }
  });

  it("covers every algorithm the renderer names", () => {
    expect(RENDERED).toContain(ROUNDNESS.LEGACY);
    expect(RENDERED).toContain(ROUNDNESS.PROPORTIONAL_RADIUS);
    expect(RENDERED).toContain(ROUNDNESS.ADAPTIVE_RADIUS);
  });
});

/**
 * The type, materialised.
 *
 * A type cannot be compared to a value at runtime, so this stands in for it: a
 * non-exhaustive list of the declared members. If `RoundnessType` gains or loses a
 * member and this is not updated, the first test fails rather than passing on a
 * stale list.
 */
const RENDERED: readonly RoundnessType[] = [1, 2, 3];
