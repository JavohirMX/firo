---
status: accepted
date: 2026-10-19
deciders: maintainer
---

# Make the measured shell geometry a token contract, with tolerances and the two missing colour roles

## Context and Problem Statement

Phase 11's deep pass measured the shell's rects, pitches, radii and colour
roles. The numbers are in
[`miro-geometry.md`](../research/miro-geometry.md) — §The anchor lines,
§Shell regions, §Board bar internals, §The creation rail, §Menus — three metric
systems, §Panels, dialogs and popovers, §Shadows and radii, §Colour roles
observed and §Token mapping. The delta is row 17 of
[`miro-parity-matrix.md`](../research/miro-parity-matrix.md): Firo's tokens
cover surfaces, radii and elevation, but the rail width, the control sizes,
the three menu pitches, the panel widths and the active/secondary colour roles
have none.

The token layer already exists and is deliberately minimal
([`tokens.ts`](../../packages/ui/src/tokens.ts)):

- scales only — `COLOR`, `SPACE`, `RADIUS`, `FONT_SIZE`, `FONT_WEIGHT`,
  `LINE_HEIGHT`, `ELEVATION`, `MOTION`, `Z_INDEX`;
- two views of one thing: the TS constants and the custom properties declared
  in [`theme.scss`](../../packages/ui/src/theme.scss), with
  `THEME_VARIABLES` as the bridge and
  [`tokens.test.ts`](../../packages/ui/tests/tokens.test.ts) asserting they
  agree in both directions;
- consumed from SCSS as `var(--firo-…)`; TypeScript imports the scales only
  where layout is computed in code, which today is nowhere.

Without the missing roles, the shell approximates: the rail draws 36 px items
with a 2 px margin ([`CreationRail.scss`](../../packages/ui/src/components/CreationRail.scss)),
the board menu is 40 px tall with 28 px buttons
([`BoardMenu.scss`](../../packages/ui/src/components/BoardMenu.scss)), the
selection bar uses 30 px cells
([`SelectionToolbar.scss`](../../packages/ui/src/components/SelectionToolbar.scss)),
and the 340 px dock width is a literal in
[`ActivityFeed.scss`](../../packages/ui/src/components/ActivityFeed.scss). Each
approximation is reasonable alone; together they are why the chrome reads as
several surfaces rather than one. The accepted records depend on the same
numbers even where they do not say so — ADR-0031's rail, ADR-0032's shell, and
ADR-0033's canvas menus, which states explicitly that ADR-0034 names the
tokens.

The clean-room guardrail fixes what may be carried: geometry and colour
**roles** are functional facts; the colour **values** are not
([`miro-geometry.md`](../research/miro-geometry.md) §Colour roles observed, and
[ADR-0023](0023-open-icons-and-ui-typeface.md)).

## Decision Drivers

- **One rhythm.** The measured shell insets to 4, 8 and 12 and repeats a small
  set of sizes; a token per role keeps the rhythm from drifting per component.
- **Measured, not remembered.** Every new token cites its measurement so a
  future change argues with the source, not with a preference.
- **A minimal set.** A token nobody shares is indirection. Only names that are
  systems or shell roles earn one; single-surface dimensions stay local.
- **The two-view contract stays testable.** New groups must keep the TS/SCSS
  parity test meaningful, including nested names.
- **Tolerances are part of the contract.** The measurements carry ±1 px and
  estimates carry `≈`; the acceptance check needs the same language.
- **Colours are ours.** The two missing roles are re-expressed in Firo's
  palette; no measured value crosses over.

## Considered Options

- **A. Tokenise the named systems and shell roles, and keep one-offs local.**
  Five new groups (`CONTROL`, `BAR`, `RAIL`, `PANEL`, `MENU`) and two colour
  roles; everything else stays in its component with a comment.
- **B. Tokenise every measured number.** One source for the whole geometry
  document, including each flyout and modal width. Every future tweak becomes
  a token edit, and single-use names accumulate.
- **C. Document the spec without tokens.** Leave the numbers in the research
  document and copy them per component. No coupling, but nothing stops drift
  and the parity test cannot see a regression.

## Decision Outcome

**The token set.** Five geometry groups and two colour roles join the existing
scales:

| Group | Token | Value | Role as measured |
| --- | --- | --- | --- |
| `CONTROL` | `size` | 40 | bar and rail buttons, strip buttons: 40 × 40 |
| | `sizeSm` | 32 | pills: avatar, present, share |
| `BAR` | `height` | 48 | both top bars and the floating selection bar |
| `RAIL` | `width` | 48 | the creation rail's container |
| `PANEL` | `width` | 340 | comments, frames, the shape-library dock |
| | `widthWide` | 380 | the voting dock |
| `MENU` | `app.itemHeight` · `app.pitch` · `app.separator` | 40 · 44 · 9 | app menus and their submenus |
| | `create.itemHeight` · `create.pitch` | 40 · 48 | the sidebar's create menu |
| | `canvas.itemHeight` · `canvas.pitch` · `canvas.separator` | 32 · 36 · 5 | right-click canvas menus |
| `COLOR` | `activeTool` | ours: `rgba(91, 75, 255, 0.10)` light, `rgba(143, 134, 255, 0.16)` dark | the active tool's wash |
| | `buttonSecondary` | ours: `rgba(17, 19, 24, 0.05)` light, `rgba(255, 255, 255, 0.06)` dark | quiet secondary buttons |

The separator values are the measured *cost* of a divider between item starts
(≈ 9 app, ≈ 5 canvas) — the 1 px line plus its margins, not a margin alone. The
rail's pitch (44) is not a token: it is `CONTROL.size + SPACE.xs`, the same
derivation the measured rail shows. The menu line (y = 64) is `SPACE.sm × 2 +
BAR.height`; the panel height (746 at 818) and the strip's baseline are derived
from the viewport and the insets. Derived values are written as derivations in
the components; they never become tokens, because a fixed height would lie on
the next viewport.

**What is not a token.** A value stays local when it belongs to one surface and
names no system: the flyout widths (≈ 136 sticky colours, 240 shapes, 256
frames, 368 media, 450 catalog — the pen strip reuses `RAIL.width` and the
shape library reuses `PANEL.width`), the modal widths (600 share, 1160
templates), the palette's 546, the selection bar's internal slots (30 × 24
split, 127 convert, 46 AI), the canvas menu's ≈ 11 px item inset that ADR-0033
names, and every content-driven width (bar segments, menu widths 293 / 295).
The selection bar's ≈ 105 px offset at 70 % zoom is one sample and not
modelled; the positioning rule stays ours. If a second surface needs one of
these values, it earns a token then — promotion is a decision, not an
accident.

**The shape of the groups.** `MENU` is the one nested group, because the three
systems are only legible together; every other group is flat. `pxGroup` learns
to walk one level of nesting and `THEME_VARIABLES` emits joined names, so
`MENU.app.itemHeight` becomes `--firo-menu-app-item-height`. Deeper nesting is
not allowed: a third level would be a sign the group is a component, not a
scale. TS stays `as const`; CSS keeps reading properties. The existing parity
test covers the new names unchanged, and the new values are pinned by a
literal-value test so a quiet edit cannot move the contract.

**Colour roles are ours.** `activeTool` and `buttonSecondary` are alpha tints
of Firo's own accent and ink, declared for both themes. Miro's observed values
are recorded in the research document to explain the function and are not
carried: the contrast, not the hex, is the parity target
([ADR-0023](0023-open-icons-and-ui-typeface.md)).

**Tolerances.** The acceptance language for every side-by-side check:

| Class | Tolerance |
| --- | --- |
| Measured rects and pitches (whole-pixel reads) | ± 1 px |
| Estimated (`≈`) values — separator costs, estimated flyout widths | ± 2 px |
| Derived layout — menu line, panel height, strip baseline | exactly the formula from tokens and viewport |
| Content-driven widths — bars, menu widths | none; the content decides |
| The environment | 1200 × 818 CSS px, the measurement's viewport |

**Adoption.** The tokens land in `tokens.ts` and `theme.scss` with their
comments citing the measurement. The surfaces adopt them cluster by cluster —
C1's rail (48 / 40 / 44), C10's bars (48), C3's menus (32 / 36 / 9 / 5), C8's
panels (340 / 380), C5's selection bar (48 / 40). This record fixes the
contract; no component changes here. The visible moves this implies are
recorded rather than hidden: the rail's 36 px items become 40, the board menu's
40 px bar becomes 48, the selection bar's 30 px cells become 40.

**What this record does not decide.** Motion — not measured, `MOTION` stays
ours ([`miro-geometry.md`](../research/miro-geometry.md) §Motion). Icon grid and
stroke weights, hover/pressed/disabled colour states, font sizes beyond the one
≈ 14 px menu observation (which `FONT_SIZE.md` already carries), the board home
surface, and every component's internal composition.

## Consequences

- `tokens.ts` gains five groups and two colour roles; `theme.scss` declares
  their properties; `THEME_VARIABLES` carries them through the existing
  flattening, extended by one level.
- `tokens.test.ts` grows by the parity assertions it already has, plus a
  pinned-value test for the new constants. The test count guard stays
  meaningful because the map grows with it.
- Every later cluster implements against the same numbers: the rail, the bars,
  the menus, the docks and the selection bar cannot each invent their own.
- The two colour roles replace the washes components would otherwise invent or
  hard-code.
- Research traceability: each token's comment names its measurement, so the
  research document is the argument and the token is the conclusion.
- A value without a token is not a defect by definition — the local list above
  is the deliberate allowance, and promotion has a rule.

## Confirmation

- `packages/ui` tests: every new token's property is declared; nested names
  flatten exactly (`--firo-menu-app-item-height`, `--firo-menu-canvas-pitch`);
  the constants equal the contract (`MENU.canvas.pitch === 36`,
  `PANEL.width === 340`); both colour roles carry a light and a dark value; the
  existing parity test still passes with no special cases.
- Side-by-side, per cluster, at 1200 × 818: rail 48 wide, buttons 40, pitch 44;
  bars 48 high; docks 340 / 380; app menus 40 rows at 44, the create menu at 48,
  canvas menus 32 at 36 with separators ≈ 9 and ≈ 5 — each within its
  tolerance class.
- Grep review after adoption: no literal `48px`, `340px`, `380px`, `40px` or
  `36px` standing for these roles inside `@firo/ui` components; derived values
  appear as `calc()` over tokens.
- The tokens test fails if the SCSS and TS views diverge — the property that
  made the existing layer trustworthy carries forward.

## Pros and Cons of the Options

- **Role tokens only.** Pro: a small vocabulary, every name earns its keep, and
  the parity test stays legible. Con: a one-off change can still be made
  locally, so review must hold the rule — the record gives it a sentence.
- **Tokenise everything.** Pro: one place for every measured number. Con:
  dozens of single-use names, and a flyout tweak becomes a global edit; the
  tokens stop describing rhythm and start describing screenshots.
- **Documentation without tokens.** Pro: no indirection at all. Con: no test,
  no shared rhythm, and the measured spec decays into copies.
- **Nested `MENU` only.** Pro: the three systems read as one table, and the
  flat-name cost is bounded. Con: `pxGroup` grows a recursive case that the
  test must cover.
- **Colour roles re-expressed.** Pro: components stop inventing washes, and the
  clean-room line stays bright. Con: the two roles need design judgement, not
  measurement — the values are ours and may be tuned.

## More Information

- Matrix row 17 and the cluster map's C4
  ([`miro-parity-matrix.md`](../research/miro-parity-matrix.md)).
- Research: [`miro-geometry.md`](../research/miro-geometry.md) — all sections
  from §The anchor lines to §Token mapping; §What remains unmeasured bounds
  this record.
- Plan: [`phase-11-miro-parity.md`](../plans/phase-11-miro-parity.md) §11.2
  ("the measured spec as a `@firo/ui` contract, including tolerances") and
  §11.3.
- The token layer:
  [`tokens.ts`](../../packages/ui/src/tokens.ts),
  [`theme.scss`](../../packages/ui/src/theme.scss) and
  [`tokens.test.ts`](../../packages/ui/tests/tokens.test.ts).
- Records that forward here: [ADR-0031](0031-rail-slot-kinds-and-the-phase-11-composition.md)
  (the rail), [ADR-0032](0032-shell-keyboard-model.md) (the shell),
  [ADR-0033](0033-the-two-context-menu-lanes.md) (the canvas menus).
- Clean-room: roles and geometry are functional facts; the palette stays ours
  ([ADR-0023](0023-open-icons-and-ui-typeface.md),
  [`miro-geometry.md`](../research/miro-geometry.md) §Colour roles observed).
