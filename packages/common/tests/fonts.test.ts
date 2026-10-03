import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_FONT_FAMILY, FONT_FAMILY } from "@firo/common";

/**
 * Guards the font licensing invariant.
 *
 * `AGENTS.md` forbids shipping a font file whose licence we cannot state, and
 * ADR-0014 makes that a release blocker rather than a convention. A convention
 * is not enough here: adding a face is a two-minute change and the failure mode
 * is a legal problem discovered by someone else, months later.
 *
 * So this asserts two things a test can actually prove:
 *
 *  1. No font file from a Virgil-derived family exists in the tree. Virgil has
 *     no redistribution grant anywhere upstream, and Excalifont is a modified
 *     Virgil, so neither may ship — see ADR-0013 and ADR-0014.
 *  2. Every font directory that *is* in the tree is named in
 *     `FONT-LICENSES.md`, so a new face cannot be added without a licence
 *     decision being written down.
 *
 * What this deliberately does **not** do is claim the licences are correct. It
 * cannot. `FONT-LICENSES.md` records several faces as "unverified", and that
 * state is the finding, not a gap in the test. Resolving those entries is
 * tracked in `FONT-LICENSES.md` and gated in `docs/roadmap.md`.
 */

/** Families whose redistribution terms we cannot state. */
const FORBIDDEN_FAMILIES = ["virgil", "excalifont"] as const;

const repoRoot = path.resolve(__dirname, "..", "..", "..");

/** Directory names that differ from the display name in FONT-LICENSES.md. */
const DISPLAY_NAME: Record<string, string> = {
  Lilita: "Lilita One",
  Liberation: "Liberation Sans",
  ComicShanns: "Comic Shanns",
};

const collectFontFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFontFiles(full, acc);
    } else if (/\.(woff2?|ttf|otf|eot)$/i.test(entry.name)) {
      acc.push(path.relative(repoRoot, full));
    }
  }
  return acc;
};

const listFontDirs = (): string[] => {
  const fontDir = path.join(repoRoot, "packages", "editor", "fonts");
  return fs
    .readdirSync(fontDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
};

/**
 * Directories that ship font binaries to a browser.
 *
 * A font binary without a licence text beside it is non-compliant even when the
 * grant is valid — OFL §3 requires the licence to accompany the font, and MIT
 * requires the notice to be included in all copies. So the check is per
 * directory, and it only applies where binaries actually ship: the font lab
 * under `scripts/` holds measurement inputs, and `Helvetica` and `Emoji` hold
 * none.
 */
const SHIPPING_FONT_DIRS = path.join(repoRoot, "packages", "editor", "fonts");

/** Filenames that count as a licence text, in any of the spellings in the wild. */
const LICENCE_FILES = /^(OFL|LICENSE|LICENCE|COPYING)(\.[A-Za-z0-9]+)?$/i;

describe("font licensing", () => {
  const fontFiles = collectFontFiles(repoRoot);

  it("walks the repository and finds the bundled fonts", () => {
    // If the walk ever silently returned nothing, every assertion below would
    // pass vacuously. This makes that failure loud.
    expect(fontFiles.length).toBeGreaterThan(0);
    expect(fontFiles.some((f) => f.startsWith("packages/editor/fonts/"))).toBe(
      true,
    );
  });

  it.each(FORBIDDEN_FAMILIES)("ships no %s font file", (family) => {
    // Match on the path, not the file contents: a woff2 is binary, and a
    // renamed Virgil is still Virgil.
    const offenders = fontFiles.filter((file) =>
      file.toLowerCase().includes(family),
    );
    expect(offenders).toEqual([]);
  });

  it("does not default new text to a removed family", () => {
    // ADR-0014: Nunito is the default until an OFL hand-drawn face is measured.
    expect(DEFAULT_FONT_FAMILY).toBe(FONT_FAMILY.Nunito);
    expect(DEFAULT_FONT_FAMILY).not.toBe(FONT_FAMILY.Virgil);
    expect(DEFAULT_FONT_FAMILY).not.toBe(FONT_FAMILY.Excalifont);
  });

  it("keeps the removed family ids reserved for file compatibility", () => {
    // These ids are written into existing scene files. Reusing one would
    // silently re-map old boards onto whatever new face claimed it. See
    // ADR-0014.
    expect(FONT_FAMILY.Virgil).toBe(1);
    expect(FONT_FAMILY.Excalifont).toBe(5);
  });

  it("records every bundled font family in FONT-LICENSES.md", () => {
    const record = fs.readFileSync(
      path.join(repoRoot, "FONT-LICENSES.md"),
      "utf8",
    );

    const families = listFontDirs();
    expect(families.length).toBeGreaterThan(0);

    const undocumented = families.filter(
      (dir) => !record.includes(DISPLAY_NAME[dir] ?? dir),
    );

    expect(
      undocumented,
      "every font directory needs a FONT-LICENSES.md entry — see ADR-0014",
    ).toEqual([]);
  });

  it("ships a licence text beside every font binary", () => {
    /*
     * The second half of the AGENTS.md rule, and the half that was unenforced.
     *
     * A recorded licence in `FONT-LICENSES.md` says what the grant is. This says
     * the grant *travels with the font*, which is a separate obligation: OFL §3
     * requires the licence to be bundled with the font software, and MIT requires
     * the notice to appear in all copies. Both are satisfied by a text file in the
     * font's own directory, and neither is satisfied by a row in a table at the
     * repository root, which is where this was left for Phase 0.
     *
     * `Helvetica` and `Emoji` are excluded because neither has a binary: they
     * resolve through `local: true` and `LOCAL_FONT_PROTOCOL` to the operating
     * system's copy. Asserting on them would be asserting about directories that
     * ship nothing.
     */
    const offenders = fs
      .readdirSync(SHIPPING_FONT_DIRS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        const dir = path.join(SHIPPING_FONT_DIRS, entry.name);
        const files = fs.readdirSync(dir);
        const shipsBinary = files.some((file) =>
          /\.(woff2?|ttf|otf|eot)$/i.test(file),
        );
        if (!shipsBinary) {
          return false;
        }
        return !files.some((file) => LICENCE_FILES.test(file));
      })
      .map((entry) => entry.name);

    expect(
      offenders,
      "every shipped font directory needs its licence text beside the binary — " +
        "OFL §3 and MIT both require it. See ADR-0014 and FONT-LICENSES.md",
    ).toEqual([]);
  });

  it("does not point the font picker at a removed family", () => {
    // The picker's top picks are the first thing a user sees in the font UI.
    // Reading the file keeps this test from having to import the React
    // component (and therefore from needing a DOM).
    const picker = fs.readFileSync(
      path.join(
        repoRoot,
        "packages/editor/components/FontPicker/FontPicker.tsx",
      ),
      "utf8",
    );
    const defaults = picker.slice(
      picker.indexOf("export const DEFAULT_FONTS"),
      picker.indexOf("const DEFAULT_FONT_TOP_PICKS"),
    );
    for (const family of FORBIDDEN_FAMILIES) {
      expect(defaults.toLowerCase()).not.toContain(family);
    }
  });
});
