---
status: accepted
date: 2026-10-13
deciders: maintainer
supersedes: ADR-0014 (the roughness clause only)
---

# Adopt a Miro-style UI shell and a clean-by-default canvas aesthetic

## Context and Problem Statement

Firo's *data model* is Miro's: sticky notes, cards, frames, sections,
connectors, records with switchable projections, and a facilitation loop
(voting, timer, private mode, presentation). The *shell and stroke style* are
still Excalidraw's: a top-centre horizontal toolbar, a top-left shape-actions
island, a bottom-left zoom footer, a right library sidebar, and roughjs
hand-drawn outlines at `roughness: 1`.

The consequence shows in the first thirty seconds of use. A person who opens a
board does not see "a Miro replacement". They see Excalidraw with extra
objects. The object vocabulary is the product; the chrome argues with it.

Two different changes are tangled together here, and they are not equally
reversible.

1. **The shell.** Toolbar placement, panels, menus, where zoom lives, and where
   an object's properties are edited. Miro's shell is a *layout*. Layouts are
   functional, and emulating one is a different act from copying an asset.
2. **The canvas aesthetic.** Miro is clean and flat. Firo is hand-drawn. The
   hand-drawn look is written into [`vision.md`](../vision.md) as deliberate,
   and [ADR-0014](0014-font-position-after-phase-0.md) kept `roughness` at 1 on
   the reasoning that the stroke jitter — not the typeface — is what carries the
   sketch quality now that no hand-drawn *face* ships.

The shell is a UI refactor that contradicts nothing. The aesthetic flip
supersedes a stated non-goal, which makes it a positioning decision rather than
a styling pass. Both were requested; this ADR records both and records which
one is reversible.

## Decision Drivers

- **The object vocabulary is unseen if the chrome hides it.** Frames, sections,
  cards and records are indistinguishable from Excalidraw shapes when they are
  drawn in Excalidraw's chrome.
- **Placement is functional.** Miro's left creation rail, bottom-right
  navigation toolbar and floating selection toolbar are interaction patterns.
  They are not protected expression, and emulating them is what interoperability
  and competitive alternatives have always done. Miro's code, assets, icons,
  typefaces and marks are a different matter and are not used.
- **A hand-drawn default and a Miro-shaped shell are incoherent.** A clean
  shell around sketchy strokes reads as a bug, not a brand.
- **The aesthetic is cheap to reverse; a shell is not.** `roughness` is one
  constant and a per-element field. The shell is a package, a set of tunnels and
  a layout that other work will build on.
- **ADR-0014's own reasoning has an expiry.** It kept roughness at 1 *because*
  no hand-drawn face shipped and the shapes had to carry the aesthetic alone.
  Choosing a clean default is not a refutation of that reasoning; it is the
  same reasoning reaching the other conclusion once the goal changes from
  "preserve the sketch" to "read as Miro".

## Considered Options

1. **Shell only.** Move the tools, panels and menus to Miro's layout; leave the
   hand-drawn strokes untouched.
2. **Shell and clean default, hand-drawn kept as an option.** Miro's layout and
   a clean default stroke, with `roughness` still selectable per element.
3. **Shell, clean default, and no roughjs path at all.** Delete the sketch
   renderer.
4. **Do nothing.** Keep Excalidraw's shell; rely on the object vocabulary to
   carry the comparison.

## Decision Outcome

**Option 2.**

1. **The shell is Miro's layout**, implemented in a new `@firo/ui` package
   ([ADR-0022](0022-ui-package-owns-the-chrome.md)):
   - a **left vertical creation rail** (Select/Hand, sticky note, shapes, text,
     connector, frame, more) with **Undo/Redo** below it;
   - a **bottom-right navigation toolbar** (zoom in/out, zoom percentage,
     fit-to-screen, minimap, grid);
   - a **top-left board menu** (hamburger, board name, main menu);
   - a **top-right** facilitation and share region, which absorbs today's
     `FacilitatorBar`;
   - an **adaptive right-side inspector** for the selected object's properties,
     replacing the top-left shape-actions island;
   - a **floating selection toolbar** anchored to the selection, not to the
     window.

   Miro's tool model is adopted with it: tools are **one-time** (they revert to
   Select after use) and can be **dragged onto the board**.

2. **The canvas default becomes clean.** `DEFAULT_ELEMENT_PROPS.roughness`
   moves from `ROUGHNESS.artist` (1) to `ROUGHNESS.architect` (0). This
   supersedes clause 3 of [ADR-0014](0014-font-position-after-phase-0.md).

   This is **not** a schema change and **no migration is required**. `roughness`
   is a stored per-element field; existing boards keep the value they were
   written with, so a board sketched before this decision still looks sketched.
   Only newly created elements are clean.

3. **Hand-drawn is kept, as an option.** `roughness` stays in the element
   schema, stays in the shape-properties UI, and stays in the renderer. Option 3
   was rejected because deleting the sketch path is irreversible and buys
   nothing: a clean default already produces the Miro read, and the sketch mode
   remains useful for the brainstorm half of a session.

4. **Clean-room.** No Miro source, asset, icon file, typeface or trademark is
   used. The shell is re-implemented from documented behaviour and observed
   layout. The typeface and icon decisions are
   [ADR-0023](0023-open-icons-and-ui-typeface.md).

### What this supersedes, precisely

- **ADR-0014 clause 3** ("Roughness stays at `ROUGHNESS.artist`"). Superseded.
  The rest of ADR-0014 — Virgil and Excalifont removed, Nunito the default
  *canvas* face, the font audit as a release blocker — stands.
- **[`vision.md`](../vision.md): "We will not chase vector-design fidelity. The
  hand-drawn aesthetic is deliberate."** Superseded **only as it applies to the
  default stroke style**. The non-goal against becoming a Figma-class vector
  tool stands in full: Firo is still not a production-asset design tool, and it
  still is not chasing pixel fidelity with any design application. What changes
  is that the default surface is clean rather than sketchy.
- The README tagline ("on Excalidraw's hand-drawn canvas") is replaced, because
  it is now false.

## Consequences

- (+) The first thirty seconds of use match the comparison a visitor is
  already making. The shell stops undercutting the vocabulary.
- (+) The shell is a foundation other work builds on. A right inspector, a
  frames-and-layers panel and a dashboard all need a place to live, and
  Excalidraw's top-centre toolbar is not one.
- (+) Roughness remains a per-element property, so the change is cosmetic and
  data-preserving rather than destructive.
- (-) **The stated differentiator in the docs changes.** "Hand-drawn canvas" was
  a one-line answer to "why not just use Excalidraw". The replacement answer —
  the workshop loop, the object vocabulary, local-first, and now a shell that
  reads like the tool people already know — is longer to state and has to be
  earned by the shell actually landing.
- (-) **A large amount of inherited UI code is re-hosted or bypassed.**
  `packages/editor/components/LayerUI.tsx` and `Toolbar.tsx` own the current
  layout, and Excalidraw's tunnel API cannot express a left rail. Bounded edits
  inside `@firo/editor` are required and are recorded in ADR-0022.
- (-) **`components/App.tsx` (12,946 lines) is untouched and remains the reason
  the shell work is awkward.** This ADR does not fix that; it routes around it.
- (-) Snapshot and reference-image tests that pin `roughness: 1` for *new*
  elements will change. Those diffs must be read, not batch-accepted.
- (-) Comment threads, the dashboard and the template gallery are implied by
  "feels like Miro" but are separable. They are scoped in
  [`../plans/phase-7-5-miro-ui.md`](../plans/phase-7-5-miro-ui.md), with
  comments carrying their own schema change and migration.

## Confirmation

- [x] Decision recorded and the two superseded clauses named.
- [ ] `DEFAULT_ELEMENT_PROPS.roughness === ROUGHNESS.architect` in
      `packages/common/src/constants.ts`, with a test asserting the default.
- [ ] A board created after the change renders clean; a board created before it
      renders as it did. Both verified on rendered output.
- [ ] `@firo/ui` owns the shell and Excalidraw's default chrome is disabled, per
      [ADR-0022](0022-ui-package-owns-the-chrome.md).
- [ ] `roughness` remains selectable in the shape-properties UI.
- [ ] `vision.md`, `README.md` and `docs/index.md` no longer claim a hand-drawn
      default canvas.

## Pros and Cons of the Options

### 1. Shell only

- (+) Smallest change; nothing in `vision.md` is contradicted.
- (-) Leaves a clean shell around sketchy strokes, which reads as an
  inconsistency rather than a style. The mismatch is more conspicuous than
  either extreme.
- (-) Fails the actual request.

### 3. Shell, clean default, no sketch path

- (+) One aesthetic, unambiguously.
- (-) Irreversible, and removes a mode that is still useful for the divergent
  half of a session.
- (-) Touches the renderer, which [ADR-0017](0017-do-not-rewrite-the-renderer.md)
  deliberately kept as inherited.

### 4. Do nothing

- (+) Zero cost.
- (-) Concedes the first impression, which is where the comparison is decided.

## More Information

- [ADR-0014](0014-font-position-after-phase-0.md) — the roughness clause this
  ADR supersedes, and the reasoning behind it
- [ADR-0017](0017-do-not-rewrite-the-renderer.md) — why the renderer is kept
- [ADR-0022](0022-ui-package-owns-the-chrome.md) — where the shell lives
- [ADR-0023](0023-open-icons-and-ui-typeface.md) — the typeface and icon choices
- [`../plans/phase-7-5-miro-ui.md`](../plans/phase-7-5-miro-ui.md) — the
  implementation plan
- [`../research/miro-ui.md`](../research/miro-ui.md) — the observed Miro shell
  this is modelled on
