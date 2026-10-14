---
status: accepted
date: 2026-10-14
deciders: maintainer
---

# The chrome's font ships with the chrome, not in the editor's font pipeline

## Context and Problem Statement

[ADR-0023](0023-open-icons-and-ui-typeface.md) chose Plus Jakarta Sans for the
chrome, and its clause 2 placed the files in "the same font pipeline as the
canvas faces (`packages/editor/fonts/…`, `fonts.css`, `FONT_METADATA`)".
Carrying that out produced three findings that the ADR was written without:

1. **`packages/editor/fonts/fonts.css` does not survive a production build.**
   `scripts/woff2/woff2-vite-plugins.js` replaces the whole file in an
   `apps/web` build, generating its `@font-face` rules from a hard-coded list
   that contains only Assistant. A face added to the stylesheet and not to that
   plugin is correct under `yarn start`, absent from `yarn build`, and green in
   CI — a production-only failure with no test standing in front of it.
2. **`FONT_METADATA` is not a font pipeline; it is the canvas font registry.**
   Each entry supplies per-face vertical metrics for text laid out *on the
   canvas* (`getVerticalOffset`) and carries a `FONT_FAMILY` id that makes the
   face selectable in the picker. Chrome text is none of those things. Adding
   the chrome face there would be a canvas-font change, which ADR-0023 clause 4
   explicitly declines to make: it keeps the canvas default on Nunito and defers
   "consolidating the canvas face onto Plus Jakarta Sans" as undecided.
3. **`packages/editor/fonts/` is discovered by the font licence gate.**
   `packages/common/tests/fonts.test.ts` walks one hard-coded root and asserts
   two things about every directory it finds: that `FONT-LICENSES.md` names it,
   and that a binary has its licence text beside it. A font placed in a second
   package is not checked at all.

So the clause cannot be followed literally without either editing a build plugin
to emit a chrome face, or putting a chrome face in the canvas picker.

## Decision Drivers

- **A font is an asset with a licence obligation, and the obligation follows the
  binary.** Where the file lives decides which gate covers it, so the choice is
  a compliance decision rather than a tidy-up.
- **The chrome owns its chrome.** [ADR-0022](0022-ui-package-owns-the-chrome.md)
  gave the shell to `@firo/ui`, with a closed list of edits into `@firo/editor`.
  A chrome asset reached across that boundary would be the first exception, and
  exceptions to a closed list are how closed lists stop being closed.
- **A face no build ships is worse than a face nobody bundled**, because it
  looks finished.
- **The existing gate should be widened, not routed around.** The invariant that
  matters — no font binary without a recorded licence and its text beside it —
  is about the repository, not about one directory.

## Considered Options

1. **`@firo/ui` ships the fonts and its own `@font-face` stylesheet**, and the
   licence gate is extended to scan a second root.
2. **Follow ADR-0023 literally**: binaries in `packages/editor/fonts/`, and add
   the chrome face to `woff2-vite-plugins.js` so the production build emits it.
3. **Land the binary and the licence row now, register no face**, and wire the
   face up when the shell's stylesheet is mounted in task 7.5.3.

## Decision Outcome

**Option 1.**

1. **The binaries live in `packages/ui/src/fonts/PlusJakartaSans/`**, with the four
   Google Fonts subsets and `OFL.txt` beside them. `packages/ui/src/fonts.ts`
   imports them and registers one `FontFace` per subset through the `FontFace`
   API, and `loadChromeFonts(ownerDocument)` is what a host calls before the
   chrome renders. That is what makes `--firo-font-ui` resolve to Plus Jakarta
   Sans rather than falling through to Nunito.

   **Registration is from TypeScript, not from a stylesheet, and that is not a
   preference.** An `@font-face` block in SCSS with `url("../fonts/…")` was
   written first and a production build disproved it: Vite emits a font only when
   it is imported as a module, which is why every canvas face is imported by
   `packages/editor/fonts/<Family>/index.ts`. A `url()` reached through `@use` is
   left as a literal relative path, no file is copied into the build, and the CSS
   points at nothing — correct in dev, broken in production, green in CI.
   Registering against the URL the bundler emitted makes the two agree by
   construction.

   The same trap applies to `packages/editor/fonts/fonts.css`, which is replaced
   wholesale at build time: a face added there and not to
   `scripts/woff2/woff2-vite-plugins.js` is silently absent from a production
   build.

2. **No `FONT_FAMILY` id, no `FONT_METADATA` entry, no font-picker entry.**
   ADR-0023 clause 4 stands unchanged: the canvas default is Nunito, and whether
   it moves is a measured question.

3. **`packages/common/tests/fonts.test.ts` scans two roots**, `packages/editor/fonts`
   and `packages/ui/src/fonts`, for both halves of the rule. The roots are listed
   explicitly rather than globbed, so a third is a deliberate edit.

4. **`FONT-LICENSES.md` records the licence, the size and the SHA-256 of each
   binary**, so a later fetch can be compared against what was reviewed rather
   than trusted.

This supersedes **ADR-0023 clause 2's location**, and the assumption inside it
that `fonts.css` and `FONT_METADATA` are the pipeline a UI face belongs in.
ADR-0023's decision — Plus Jakarta Sans is the chrome typeface, authored icons,
canvas default unchanged — is unaffected.

## Consequences

- (+) The chrome's typeface is one package's business: the binary, the licence
  and the registration are all in `@firo/ui`, and a host that calls
  `loadChromeFonts` gets the face.
- (+) The production-build trap is avoided by construction rather than by
  remembering to update a plugin.
- (+) The licence gate is wider than it was. It now fails for a font binary
  anywhere in a shipping root, not only in the editor's.
- (-) **Two font roots exist**, and the licence audit has two places to look.
  This is the cost of the boundary; `FONT-LICENSES.md` names both in its header.
- (-) `@firo/ui` gains asset files, so it is no longer a package of pure
  TypeScript and SCSS. Consumers bundle it with `fonts/` resolvable — which is
  automatic for a bundler, and is why the faces are registered from the imported
  URLs rather than from a hard-coded path.
- (~) The editor's own `fonts.css` still has the trap that motivated this ADR:
  a face added there and not to `woff2-vite-plugins.js` is silently absent from
  production. Recorded in
  [`../research/font-licence-verification.md`](../research/font-licence-verification.md);
  untouched here, because it is the editor's pipeline and no face needs adding.

## Confirmation

- [x] `packages/ui/src/fonts/PlusJakartaSans/` holds the binaries and `OFL.txt`.
- [x] `packages/ui/src/fonts.ts` imports the four subsets and registers them, and
      `apps/web` calls `loadChromeFonts(document)` before its first render.
- [x] `packages/common/tests/fonts.test.ts` walks both roots, and fails by
      directory name when the licence text is removed (verified by removing it).
- [x] `FONT-LICENSES.md` carries a row with the source URL read from a primary
      source, and the binary hashes.
- [x] A production build emits the four subsets to `fonts/PlusJakartaSans/`,
      byte-identical to the sources, and the bundle references them by absolute
      path (verified with `yarn build:app`).
- [x] The package's own build carries them too: `yarn build:packages` puts them
      in `packages/ui/dist/{dev,prod}/fonts/PlusJakartaSans/`, which is what put
      the binaries inside `src/` — outside it, esbuild names the directory after
      the `..` that got there. `scripts/buildBase.js` therefore declares the
      `.woff2` loader that `scripts/buildPackage.js` already had.
- [x] In that build they load in a browser: four faces registered,
      `document.fonts.check()` true, all four subsets fetched with 200 before
      anything else touched `document.fonts` (verified with Playwright against a
      served build).
- [x] `DEFAULT_FONT_FAMILY` is unchanged.

## Pros and Cons of the Options

### 2. Follow ADR-0023 literally, and patch the build plugin

- (+) One font root, one gate, one audit — the arrangement the ADR set out to get.
- (+) One font root, and the plugin's `PRELOAD_FONTS` list stays about the
  editor's first paint.
- (-) `scripts/woff2/woff2-vite-plugins.js` ends up generating a chrome face,
  which means the editor's build tooling owns an asset of `@firo/ui`'s.
- (-) It also invites the `FONT_METADATA` step to be taken "for consistency",
  which would put a chrome face in the canvas picker.
- (-) `fonts.css` is served to the app as CSS, so the chrome face would arrive
  through a stylesheet the app loads for the editor's reasons.

### 3. Bundle now, declare nothing

- (+) Smallest change; the compliance obligation is met immediately.
- (-) "Bundled" would mean "present", not "loadable". The plan's own risk table
  calls a decision without an artefact non-compliance; a binary without a rule
  that loads it is the same shape of gap one step further along.

## More Information

- [ADR-0023](0023-open-icons-and-ui-typeface.md) — the chrome typeface decision
  this only relocates
- [ADR-0022](0022-ui-package-owns-the-chrome.md) — why the chrome is `@firo/ui`'s
- [`../../FONT-LICENSES.md`](../../FONT-LICENSES.md) — the licence record
- [`../research/font-licence-verification.md`](../research/font-licence-verification.md)
  — the working, including the build-plugin finding
- [`../plans/phase-7-5-miro-ui.md`](../plans/phase-7-5-miro-ui.md) — task 7.5.2,
  where this was carried out
