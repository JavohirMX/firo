---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# Replace the Virgil font

## Context and Problem Statement

The Excalidraw repository ships **Virgil** as its signature hand-drawn typeface. It
is what gives the product its aesthetic, and it is referenced throughout
`packages/excalidraw/fonts/`, `font-metadata.ts`, and the font-subsetting machinery
(`fonteditor-core`, `harfbuzzjs`, `wawoff2`).

**Virgil is not MIT licensed, and no licence file for it exists anywhere in the
upstream repository.** The upstream `LICENSE` covers the code. The font is not code,
and its redistribution terms are unknown.

This is a distribution blocker for a project that ships a desktop and web application
to arbitrary users.

## Decision Drivers

- We cannot distribute a font whose licence we cannot state.
- NFR-6 sets a zero-runtime-font-payload budget, which also serves this requirement:
  no font CDN, no third-party origin.
- The hand-drawn aesthetic is a genuine differentiator
  ([`../competitive.md`](../competitive.md)) and cannot simply be dropped.
- Clean mode at roughness 0 already exists in Excalidraw's renderer, so a
  non-hand-drawn fallback is viable.

## Considered Options

1. Ship Virgil and accept the unknown terms
2. Replace with an explicitly licensed hand-drawn font
3. Use a clean geometric font and rely on roughness 0 for a "designed" look
4. System font stack only
5. Generate the hand-drawn look at runtime from a clean font

## Decision Outcome

Chosen option: **2 — replace with an explicitly licensed hand-drawn font.** The
specific font is an open question and must be resolved during Phase 0.

Candidates to evaluate, all with licences that permit redistribution:

- **Caveat** (Google Fonts, OFL) — handwriting, but more marker-like than sketch-like
- **Kalam**, **Patrick Hand**, **Shadows Into Light**, **Caveat** (all OFL)
- **Architects Daughter** (OFL)
- **Comic Neue**, **Comic Relief** (OFL) — too stylised for diagrams
- A specifically commissioned or dedicated open-licence sketch face, if one can be
  identified

**Requirements for the replacement:**

1. Licence explicitly permits redistribution and embedding in an application.
2. Latin coverage adequate for the default UI language, with a documented fallback
   chain.
3. Legible at small sizes. Diagram labels are 12–16 px and most handwriting faces
   fail there.
4. **Sufficient contrast at the default stroke width.** Roughjs jitter means an edge
   is never exactly where the colour says it is, so the accessibility contrast
   requirement ([`../trd/09-accessibility.md`](../trd/09-accessibility.md)) must be
   *measured* on rendered output, not assumed.
5. Reasonable file size. Weights are subset on demand rather than shipped whole.

**Until a replacement is chosen, Firo ships with the clean font stack and roughness 0
as the default.** A missing aesthetic is recoverable; a licence violation is not.

## Consequences

- (+) We can state the licence of every asset we ship.
- (+) No third-party font origin, satisfying NFR-3 and NFR-6.
- (+) Removes the single largest legal risk inherited from the fork.
- (-) **We lose a defining part of Excalidraw's identity.** Virgil is not just a font;
  it is the aesthetic. A substitute will not be identical and the product will look
  different from Excalidraw at first glance.
- (-) Finding a legible hand-drawn font that survives 12 px diagram labels is harder
  than it sounds. Most handwriting faces are designed for prose, not for labels, and
  fail at small sizes.
- (-) Font subsetting machinery is inherited and will need adapting for whatever
  replacement we choose.
- (-) Until resolved, the default rendering is not the intended aesthetic, which is a
  visible incompleteness in early builds.

## Confirmation

- The Virgil font files are **absent** from the repository and from any build
  artifact. Verifiable by inspecting `packages/` and the built output.
- `NOTICE` records the removal and the reason
  ([`../../NOTICE`](../../NOTICE)).
- Every font file in the repository has a recorded licence in `NOTICE`.
- A test asserts that no bundled font file originates from the Excalidraw repository.
- Rendered contrast is measured on the default font at the default stroke width, in
  both themes, against the NFR-4 threshold.

## Pros and Cons of the Options

### 1. Ship Virgil and accept the unknown terms

- (+) Perfect aesthetic fidelity to Excalidraw.
- (+) Zero work.
- (-) **Redistributing a font whose licence we cannot state is a distribution
  blocker.** The upstream project is MIT-licensed; we cannot assume the font is.
- (-) The risk falls on users, not on us, which is the worst place for it to fall.

### 3. A clean geometric font with roughness 0

- (+) Excellent legibility at every size, which is what diagram labels need.
- (+) Zero licensing risk, trivially available.
- (-) **Loses the hand-drawn identity entirely.** The product becomes "a whiteboard
  with straight lines", which is the generic look Firo is trying to differentiate
  from.
- (-) Roughness 0 still leaves a white canvas with crisp vectors, which reads as
  unfinished rather than deliberate.

### 4. System font stack

- (+) No payload at all, satisfies NFR-6 perfectly.
- (+) Maximum legibility.
- (-) Different on every platform. A whiteboard that looks different on macOS and
  Windows is not a product with an identity.
- (-) Reinforces option 3's aesthetic problem.

### 5. Generate the hand-drawn look at runtime

- (+) One font file, unlimited stylistic variation.
- (-) **This is a research project.** Reliable hand-drawn text rendering from a clean
  outline is genuinely hard, and it is not a task to take on before the renderer
  rewrite.
- (~) Interesting to revisit in v3 if the font search fails.

## More Information

- [Excalidraw `packages/excalidraw/fonts/`](https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw/fonts)
- [`../../NOTICE`](../../NOTICE) — the Virgil removal record
- [`../trd/09-accessibility.md`](../trd/09-accessibility.md) — contrast requirements
- [`../prd/05-non-functional-requirements.md`](../prd/05-non-functional-requirements.md) NFR-6
