import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  COLOR,
  CSS_PREFIX,
  FONT_FAMILY_UI,
  SPACE,
  THEME_VARIABLES,
  THEME_VARIABLE_NAMES,
  toCssName,
} from "@firo/ui";

/**
 * Guards the token ↔ theme agreement.
 *
 * `tokens.ts` and `theme.scss` are two views of one thing, and there is nothing
 * in the type system that keeps them in step: SCSS cannot import a TypeScript
 * module, and a custom property that is never declared simply evaluates to
 * nothing at use time rather than failing loudly. The failure mode is a control
 * that silently loses its colour.
 *
 * So the agreement is asserted here, in both directions that matter:
 *
 *  1. Every token has a declared custom property.
 *  2. Every colour role has a value in the light block *and* in the dark block.
 *     A role that exists in one theme and not the other is the specific bug this
 *     file exists to catch, and it is invisible without a rendered check.
 */
const themeScss = fs.readFileSync(
  path.resolve(__dirname, "..", "src", "theme.scss"),
  "utf8",
);

// Slice on the block openers, not the bare selector text — `.theme--dark` also
// appears in the file's header comment, and slicing on that would silently
// produce an empty light block that every assertion then passes against.
const rootBlockStart = themeScss.indexOf(":root {");
const darkBlockStart = themeScss.indexOf(".theme--dark {");

const rootBlock = themeScss.slice(rootBlockStart, darkBlockStart);
const darkBlock = themeScss.slice(darkBlockStart);

describe("design tokens", () => {
  it("finds both theme blocks in theme.scss", () => {
    // If either marker moved, `slice` would produce a short or empty string and
    // every assertion below would pass vacuously. Make that failure loud.
    expect(rootBlockStart).toBeGreaterThanOrEqual(0);
    expect(darkBlockStart).toBeGreaterThan(rootBlockStart);
    expect(rootBlock.length).toBeGreaterThan(0);
    expect(darkBlock.length).toBeGreaterThan(0);
  });

  it("namespaces every property so it cannot collide with the editor", () => {
    for (const name of THEME_VARIABLE_NAMES) {
      expect(name.startsWith(CSS_PREFIX)).toBe(true);
    }
  });

  it("declares every token as a custom property", () => {
    const missing = THEME_VARIABLE_NAMES.filter(
      (name) => !themeScss.includes(`${name}:`),
    );
    expect(
      missing,
      "a token with no matching custom property is a value the chrome cannot read",
    ).toEqual([]);
  });

  it("declares a light and a dark value for every colour role", () => {
    const offenders: string[] = [];
    for (const [role, value] of Object.entries(COLOR)) {
      const name = `${CSS_PREFIX}color-${toCssName(role)}`;
      if (!themeScss.includes(`${name}:`)) {
        offenders.push(`${name} (missing entirely)`);
      } else if (!rootBlock.includes(value.light)) {
        offenders.push(`${name} (no light value)`);
      } else if (!darkBlock.includes(value.dark)) {
        offenders.push(`${name} (no dark value)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("exposes one typed token per declared variable", () => {
    // `THEME_VARIABLES` is the map the parity test iterates. If it were empty,
    // the assertions above would be vacuous.
    expect(Object.keys(THEME_VARIABLES).length).toBe(
      THEME_VARIABLE_NAMES.length,
    );
    expect(THEME_VARIABLE_NAMES.length).toBeGreaterThan(30);
  });

  it("uses a monotonic spacing scale", () => {
    const steps = Object.values(SPACE);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(new Set(steps).size).toBe(steps.length);
  });

  it("leads the chrome typeface stack with Plus Jakarta Sans", () => {
    // ADR-0023. The bundled face is not the first entry by accident: if the
    // stack is reordered, the decision has been silently reversed.
    expect(FONT_FAMILY_UI.startsWith('"Plus Jakarta Sans"')).toBe(true);
  });
});
