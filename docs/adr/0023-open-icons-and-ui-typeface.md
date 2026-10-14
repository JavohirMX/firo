---
status: accepted
date: 2026-10-13
deciders: maintainer
---

# Author our own icon set; adopt Plus Jakarta Sans for the chrome

## Context and Problem Statement

A Miro-shaped shell ([ADR-0021](0021-miro-style-shell-and-clean-aesthetic.md))
needs two assets that a hand-drawn Excalidraw shell did not: a **UI icon set**
sized for a tool rail and toolbar, and a **UI typeface** for chrome that is not
the canvas face.

Miro uses its own icon family and the proprietary **Roobert PRO** typeface. We
use neither. That is not a preference — Roobert PRO is a licensed commercial
face with no redistribution grant, which is the same class of problem that
removed Virgil and Excalifont in Phase 0
([ADR-0013](0013-replace-the-virgil-font.md),
[ADR-0014](0014-font-position-after-phase-0.md)). Copying Miro's icon files
raises the same question, and the shell (§2 of ADR-0021) is deliberately
clean-room.

The inherited icon set is Excalidraw's
(`packages/editor/components/icons.tsx`, a double-icon library drawn for a
hand-drawn product). It is not licensed for the Miro read, and its forms —
chunky, marker-drawn — fight the clean aesthetic.

## Decision Drivers

- **Licence first.** No icon or font may ship whose terms we cannot state, with
  the licence text beside the binary. `FONT-LICENSES.md` and
  `packages/common/tests/fonts.test.ts` already enforce this for fonts, and the
  last audit found a GPL face hiding in an MIT project. Adding assets is the
  riskiest place to be casual.
- **The icon set is small and stable.** The rail and toolbar need on the order
  of two dozen glyphs. That is authorable in-house, which removes a dependency
  and all of its licence bookkeeping in one move.
- **Icons drawn for us cannot resemble Miro's files**, because they are not
  derived from them. Clean-room is easier to demonstrate when the artefact is
  original rather than a near-copy of a permissive set that itself resembles the
  original.
- **Chrome text needs a face that is not the canvas face.** The canvas face must
  survive 12 px diagram labels and is under a separate, measured decision
  (ADR-0013 requirement 4). Coupling the two would block the shell on the font
  search.
- **Open-licensed geometry sans is abundant.** Plus Jakarta Sans is OFL 1.1 and
  has the friendly-geometric character the shell needs without Roobert PRO's
  terms.

## Considered Options

1. **Bundle an existing open icon library** (for example Lucide, ISC).
2. **Author our own icon set in-repo**, as SVG React components.
3. **Keep Excalidraw's icons** and restyle only the chrome around them.
4. **UI typeface: keep Nunito** (already bundled) for the chrome too.
5. **UI typeface: adopt Plus Jakarta Sans** (OFL 1.1), bundled with its licence.

## Decision Outcome

**Option 2 for icons, option 5 for the typeface.**

1. **The icon set is authored in `@firo/ui`**, as SVG React components under
   `packages/ui/src/icons.tsx`. No third-party icon dependency is added, so no
   icon licence has to be audited, and no set that itself derives from a
   commercial family is pulled in.

   The set is drawn to a single grid and stroke weight so the rail reads as one
   family. It contains only glyphs the shell uses; it is not a general-purpose
   library.

2. **Plus Jakarta Sans (SIL OFL 1.1) is the chrome typeface.** It is bundled
   into the same font pipeline as the canvas faces
   (`packages/editor/fonts/…`, `fonts.css`, `FONT_METADATA`) and referenced by a
   `@firo/ui` token.

3. **Its licence obligations are satisfied in the same commit that adds it**:
   `OFL.txt` beside the binary, a row in [`FONT-LICENSES.md`](../../FONT-LICENSES.md),
   and `packages/common/tests/fonts.test.ts` passing. This is a hard gate, not a
   follow-up — the audit that produced `FONT-LICENSES.md` exists precisely
   because this step was skipped once.

4. **The canvas default face is *not* changed here.** `DEFAULT_FONT_FAMILY`
   stays Nunito. Whether the *canvas* default should move is the measured
   question ADR-0013 requirement 4 leaves open, and it must not be decided by
   the chrome's taste. The two are separate: chrome text is UI labels at UI
   sizes; canvas text is diagram labels at 12 px and is measured on rendered
   output.

## Consequences

- (+) No new dependency, and no new icon licence to audit. The only new asset
  obligation is one OFL font, which the existing font gate already checks.
- (+) The icons cannot be confused with Miro's, because they are original.
- (+) Chrome typography is unblocked from the canvas font search.
- (-) **Authoring icons is work the project did not otherwise have.** The set is
  small, but it is real design effort and it will grow with each shell piece.
- (-) **A font binary and its licence text enter the repository.** The bin is
  small; the obligation is not. Until the commit lands, Plus Jakarta Sans is a
  decision without an artefact, and the confirmation list records that.
- (-) If Excalidraw's inherited icons are used anywhere in the chrome that this
  ADR does not replace, two icon families coexist. The plan tracks removing the
  inheritance from every surface the shell owns.
- (~) Nunito and Plus Jakarta Sans are both OFL geometric-ish sans faces, so a
  board with a chrome is not visually jarring. Consolidating the canvas face
  onto Plus Jakarta Sans later is possible and is not decided here.

## Confirmation

- [x] Decision recorded, with the licence reasoning for both assets.
- [ ] `packages/ui/src/icons.tsx` exists and every glyph the shell uses is
      authored there.
- [ ] No third-party icon dependency appears in `packages/ui/package.json`.
- [ ] Plus Jakarta Sans is bundled, with `OFL.txt` beside the binary.
- [ ] `FONT-LICENSES.md` carries a row for it, with the URL read from a primary
      source.
- [ ] `packages/common/tests/fonts.test.ts` passes with the new font present.
- [ ] `DEFAULT_FONT_FAMILY` is **unchanged** (still Nunito) at the end of this
      phase.

## Pros and Cons of the Options

### 1. An existing open icon library

- (+) Zero drawing effort; consistent family out of the box.
- (-) A new dependency and a new licence row on every addition.
- (-) Its forms were drawn for someone else's product, which is exactly the
  criticism that applies to the inherited set.

### 3. Keep Excalidraw's icons

- (+) No work, no new assets.
- (-) Marker-drawn glyphs in a clean toolbar read as unfinished, and it leaves
  the chrome half-converted.

### 4. Keep Nunito for chrome

- (+) No new font, no new licence row.
- (-) Couples chrome typography to the canvas font decision, blocking the shell
  on an unrelated measurement.

## More Information

- [ADR-0013](0013-replace-the-virgil-font.md) — the font/licence rules this
  follows, and requirement 4 on measuring before choosing
- [ADR-0014](0014-font-position-after-phase-0.md) — why Nunito is the canvas
  default today
- [`../../FONT-LICENSES.md`](../../FONT-LICENSES.md) — the per-font audit
- [`../research/font-licence-verification.md`](../research/font-licence-verification.md)
  — the working behind the audit
