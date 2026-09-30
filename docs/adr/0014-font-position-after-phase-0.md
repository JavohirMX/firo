---
status: accepted
date: 2026-09-30
deciders: maintainer
supersedes: ADR-0013 (partially — the fallback clauses only)
---

# Ship Nunito as the default face, keep roughness, and treat the font audit as a release blocker

## Context and Problem Statement

[ADR-0013](0013-replace-the-virgil-font.md) decided to remove Virgil and replace
it with an explicitly licensed hand-drawn face, with two interim clauses:

> Until a replacement is chosen, Firo ships with the clean font stack and
> roughness 0 as the default.

Phase 0 executed the removal. What it found differs from what ADR-0013
anticipated in four ways, and the divergence has to be recorded rather than left
as an undocumented gap between an ADR and the code.

### 1. There were two Virgil derivatives, not one

ADR-0013 analysed `packages/excalidraw/fonts/Virgil/`. It did not notice
**Excalifont**, which upstream's own attribution describes as
"Your Own Font Foundry (Virgil); Ján Filípek / DizajnDesign (Excalifont,
modifications)" — a modified Virgil.

Excalifont, not Virgil, was the *default* font: `DEFAULT_FONT_FAMILY` was
`FONT_FAMILY.Excalifont`. Removing Virgil alone would have left the default
pointing at a font derived from it. Both were removed.

### 2. No hand-drawn face was found, so the default is a clean sans

The candidate list in ADR-0013 (Caveat, Kalam, Patrick Hand, Shadows Into
Light, Architects Daughter, Comic Neue) was not evaluated against real
renderings. Choosing one on paper would have meant asserting a legibility and
contrast claim that nobody had measured — which ADR-0013's own requirement 4
explicitly forbids ("must be *measured* on rendered output, not assumed").

Measuring requires the Phase 2 renderer's output, so the default is
**Nunito** (SIL OFL 1.1, already bundled, legible at label sizes) and the
hand-drawn search continues into Phase 2.

### 3. Nunito's licence is unverified, so ADR-0013's goal is not yet met

The audit behind `FONT-LICENSES.md` found that **the repository contains no
licence file for any font**. Not Virgil's, not Nunito's, nothing. The upstream
project did not ship them either.

So "we can state the licence of every asset we ship" — ADR-0013's first stated
consequence — is **not true yet**. Nunito is believed to be OFL, but believed is
not stated. Worse, even if the grant is valid, shipping an OFL binary without
its licence text is non-compliant with OFL §3.

Four further fonts are unverified outright: **Assistant**, **Comic Shanns**,
**Xiaolai**, and (unverified) Liberation Sans.

### 4. Roughness stays at 1, contradicting the ADR

ADR-0013 said the fallback would be "clean font stack **and roughness 0**".
Roughness was not changed.

## Decision Drivers

- A licence we cannot state is a distribution blocker. Unverifiable is not a
  weaker form of unstatable; it is the same problem.
- The hand-drawn aesthetic is a load-bearing differentiator
  ([`../competitive.md`](../competitive.md)). ADR-0013 already recorded, as its
  main negative consequence, that losing it makes the product indistinguishable
  from a generic whiteboard.
- An ADR whose Confirmation section is unmeetable is worse than no ADR, because
  it teaches the next reader that the process is decorative.
- The audit must not rot. A written table nobody maintains is worse than nothing.

## Considered Options

1. Keep the clean stack at roughness 0, exactly as ADR-0013 said
2. Keep the clean stack at roughness 1, superseding that clause
3. Block Phase 0 until every font licence is fetched and verified
4. Delete every font whose licence is unverified, leaving only confirmed OFL faces

## Decision Outcome

**Option 2, plus option 3 applied narrowly.**

1. **Virgil and Excalifont are removed.** Confirmed by
   `packages/editor/fonts/`, by a test, and by the build output. This part of
   ADR-0013 stands and is not superseded.

2. **Nunito is the default face.** The font picker's top picks became Nunito
   (Normal), Lilita One (Heading) and Cascadia (Code), replacing the
   Hand-drawn / Normal / Code strip that pointed at Excalifont.

3. **Roughness stays at `ROUGHNESS.artist` (1).** This supersedes ADR-0013's
   "roughness 0" clause. Reasoning: roughness is a *stroke* property applied by
   roughjs to shape outlines, independent of the typeface. It is the stroke
   jitter that carries the sketch quality for every rectangle, arrow and
   freehand path. Setting it to 0 would make Firo a crisp-vector tool
   indistinguishable from any other diagram editor — a worse outcome than the
   one the clause was written to avoid. ADR-0013 proposed roughness 0 on the
   assumption a hand-drawn face would arrive shortly; it has not, and the shapes
   now have to carry the aesthetic on their own.

4. **The font audit is a release blocker, tracked in `FONT-LICENSES.md`, and
   enforced by a test** (`packages/common/tests/fonts.test.ts`) that fails if an
   unlicensed or unrecorded font is added. This satisfies the *intent* of
   ADR-0013's Confirmation section even though its letter cannot yet be met.

5. **Fetch and verify before release.** Every distributed face needs its actual
   licence text and its OFL notice added in the same commit. This is release
   work, not Phase 0 work, and it is listed as a blocker in
   [`../roadmap.md`](../roadmap.md).

### The `FONT_FAMILY` enum ids for Virgil and Excalifont are retained

`FONT_FAMILY.Virgil === 1` and `FONT_FAMILY.Excalifont === 5` stay in the enum,
marked `@deprecated`, along with their `FONT_METADATA` entries. Scenes written by
either font must keep loading; their text falls back to the default family. The
ids must not be reused.

This is why the string "Virgil" still appears in the build output. It appears
only as an enum key and a metrics record — never as a font file or a
`@font-face`. The test asserts on font *files*, not on the word.

## Consequences

- (+) The largest inherited legal risk is gone, and the remaining one is now
  visible, written down, and enforced rather than latent.
- (+) A test now prevents the regression that would otherwise wait for the next
  audit.
- (-) The product's default text is a clean humanist sans, not handwriting. It
  reads as deliberate rather than unfinished, but it is not the intended
  aesthetic. Recorded as visible incompleteness, exactly as ADR-0013 predicted.
- (-) Nunito may itself turn out to be unusable if the audit finds a problem.
  That risk is concentrated in one constant, so it is cheap to change later.
- (-) The font picker's "Hand-drawn" slot is gone and `labels.heading` was added
  to `en.json` to replace it. Translations come from Crowdin, as upstream.
- (-) Roughness 1 on a clean sans is a compromise. It will look wrong to a
  designer's eye until a hand-drawn face lands.

## Confirmation

Verified at the end of Phase 0:

- [x] No Virgil or Excalifont **font file** exists under `packages/`, `apps/` or
      `public/`, or in `apps/web/build/`. Enforced by
      `packages/common/tests/fonts.test.ts`.
- [x] `DEFAULT_FONT_FAMILY` is `FONT_FAMILY.Nunito`, not either removed family.
- [x] `NOTICE` records the upstream commit, the removal, and the reason.
- [x] `FONT-LICENSES.md` records every bundled font and its verification state.
- [x] The build emits no third-party font origin; fonts are same-origin unless
      `FIRO_ASSET_CDN` is set.
- [ ] Every bundled font has a *verified* licence and a licence text in its
      directory. **Open — this is the release blocker.** See
      [`../../FONT-LICENSES.md`](../../FONT-LICENSES.md).
- [ ] Rendered contrast is measured on the default font at the default stroke
      width in both themes. **Open — requires the Phase 2 renderer.**

## More Information

- [ADR-0013](0013-replace-the-virgil-font.md) — the original decision, whose
  removal and candidate requirements stand
- [`../../FONT-LICENSES.md`](../../FONT-LICENSES.md) — the per-font audit
- [`../trd/09-accessibility.md`](../trd/09-accessibility.md) — contrast
  requirements, including the measured-contrast clause
- [`../prd/05-non-functional-requirements.md`](../prd/05-non-functional-requirements.md)
  NFR-3 and NFR-6
