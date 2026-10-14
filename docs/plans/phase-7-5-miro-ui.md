# Phase 7.5 — Miro UI shell

**Goal:** a person who opens a board reads it as **Miro**, not as Excalidraw.
Firo keeps its data model — Miro's object vocabulary, the facilitation loop, the
record store, local-first storage — and stops *looking* like a sketch pad.

**Status: in progress.** Documentation landed first (ADRs
[0021](../adr/0021-miro-style-shell-and-clean-aesthetic.md),
[0022](../adr/0022-ui-package-owns-the-chrome.md),
[0023](../adr/0023-open-icons-and-ui-typeface.md)); `@firo/ui` and the tokens
are the first code. The shell itself is not built yet.

This phase sits between v1 (Phases 0–7) and v2 (Phases 8–9). It is numbered
`7.5` rather than renumbering 8–10 so that every existing phase reference,
including those inside immutable ADRs, stays valid.

## Decisions locked

| Area | Decision | Recorded in |
| --- | --- | --- |
| Scope | Shell + aesthetic + feature gaps | [ADR-0021](../adr/0021-miro-style-shell-and-clean-aesthetic.md) |
| Canvas default | Clean (`roughness 0`); hand-drawn kept as a per-element option | [ADR-0021](../adr/0021-miro-style-shell-and-clean-aesthetic.md) |
| Shell location | New `@firo/ui` package; bounded tunnels in `@firo/editor` | [ADR-0022](../adr/0022-ui-package-owns-the-chrome.md) |
| Icons | Authored in-repo; no third-party icon dependency | [ADR-0023](../adr/0023-open-icons-and-ui-typeface.md) |
| Chrome typeface | Plus Jakarta Sans (OFL 1.1) | [ADR-0023](../adr/0023-open-icons-and-ui-typeface.md) |
| Canvas default face | **Unchanged** — Nunito stays until measured (ADR-0013 requirement 4) | [ADR-0023](../adr/0023-open-icons-and-ui-typeface.md) |
| Evidence | Reverse-engineer the live shell with REA + Chrome DevTools, or fall back to documented behaviour | §7.5.0 |

**Explicitly out of scope:** reactions and live cursors (v2 — single-player in
v1), the Frames-and-Layers panel (deferred), a marketplace, real-time video or
audio, presentation-deck authoring.

## Exit criterion

- [ ] The board reads as Miro: left creation rail with undo/redo, bottom-right
      navigation toolbar, top-left board menu, top-right facilitation + share,
      adaptive right-side inspector, floating selection toolbar.
- [ ] A board created after the phase opens with a **clean** canvas; a board
      created before it is unchanged. Both verified on rendered output.
- [ ] `roughness` is still selectable per element.
- [ ] The board home shows a board list, recents, trash and a curated template
      gallery.
- [ ] Object-anchored comment threads create, reply and resolve, and survive a
      save/load round trip.
- [ ] A full workshop runs on the keyboard alone (AC-8), including the new shell.
- [ ] `yarn test:typecheck && yarn test && yarn fix --check` pass.
- [ ] 10,000 elements still hold the AC-5 frame budget with the new chrome.
- [ ] No `.firo` format change without a migration and a previous-version
      fixture test.

## Tasks

### 7.5.0 — Evidence

Establish what Miro's shell actually does, from primary sources, before
building it.

- [x] Public documentation read and cited:
      [Toolbars](https://help.miro.com/hc/en-us/articles/360017730553-Toolbars)
      — the left **creation toolbar** with undo/redo beneath it, the bottom-right
      **navigation toolbar** (zoom, frames, layers, minimap, grid, fit), the
      top-left board menu, and the top-right collaboration tools.
- [ ] Live inspection with **REA (`morluto/rea`)** and its **Chrome DevTools**
      provider against a scratch board: DOM structure, computed styles and CSS
      custom properties, icon *sizing rhythm* (not the assets), interaction
      timings, tool-revert behaviour, and the keyboard map. Recorded in
      [`../research/miro-ui.md`](../research/miro-ui.md).
- [ ] A **clean-room guardrail** stated in that document: layout and interaction
      patterns are emulated; no Miro code, asset, icon file, typeface or mark is
      used.

REA is **not installed** in the environment this plan was written in, and
neither is Ghidra/Hopper/IDA. For a web app only the Chrome DevTools provider is
relevant — no binary engine is needed — but its setup is a prerequisite, not a
step that can be assumed.

**Exit:** `docs/research/miro-ui.md` exists with citations, unverified claims
flagged, and the guardrail recorded.

### 7.5.1 — Design tokens and theme

The foundation everything else is drawn from.

- [x] `packages/ui` scaffolded: `@firo/ui` in the workspace, resolvable from
      `tsconfig.json` and `vitest.config.mts` **without** going through `dist/`.
- [x] `packages/ui/src/tokens.ts` — the TS source of truth: colour (light and
      dark), spacing, radii, elevation, typography, motion, z-index.
- [x] `packages/ui/src/theme.scss` — the same tokens as CSS custom properties,
      with a parity test asserting every property in the map is declared.
- [ ] The app loads the theme; old and new chrome coexist during the transition.

**Exit:** tokens drive the app, and a theme-parity test fails if a token and its
custom property drift.

### 7.5.2 — Clean aesthetic and chrome typeface

- [ ] `DEFAULT_ELEMENT_PROPS.roughness → ROUGHNESS.architect` (0) in
      `packages/common/src/constants.ts`, with a test asserting the default.
- [ ] Confirm existing boards are unaffected (stored per-element values) and new
      elements are clean, on rendered output.
- [ ] Re-baseline reference-image and snapshot tests with `yarn test:update`;
      **read every diff**.
- [ ] Bundle Plus Jakarta Sans for the chrome: binary, `OFL.txt` beside it, a
      `FONT-LICENSES.md` row read from a primary source, and
      `packages/common/tests/fonts.test.ts` passing — all in one commit.
- [ ] `roughness` remains selectable in the shape-properties UI.
- [ ] `DEFAULT_FONT_FAMILY` is **unchanged**.

**Exit:** a new board looks clean; the licence gate passes with the new font.

### 7.5.3 — Shell layout

- [ ] The five tunnels in `@firo/editor` ([ADR-0022](../adr/0022-ui-package-owns-the-chrome.md)):
      `renderCreationRailUI`, `renderNavigationUI`, `renderBoardMenuUI`,
      `renderInspectorUI`, `renderSelectionUI`.
- [ ] `defaultChromeEnabled` flag; absent means today's behaviour, so `examples/`
      keeps working.
- [ ] `CreationRail` reads the tool registry from `@firo/editor` — no second tool
      list, labels or shortcuts.
- [ ] `BoardMenu`, `CollabBar` (absorbs today's `FacilitatorBar`), `NavToolbar`
      (zoom, zoom %, fit, minimap, grid).
- [ ] One-time tool behaviour and drag-from-rail onto the board.
- [ ] `components/App.tsx` untouched.

**Exit:** the Miro layout renders, Excalidraw's default chrome is off, and a
host with no custom chrome still gets the old editor.

### 7.5.4 — Inspector, selection toolbar and context menus

- [ ] `Inspector` — the adaptive right panel, replacing the top-left
      shape-actions island.
- [ ] `SelectionToolbar` — floating, anchored to the selection's bounding box in
      canvas coordinates, following pan and zoom.
- [ ] Right-click context menus for canvas and for a selection.
- [ ] Keyboard map aligned to Miro's, with AC-8 preserved.

**Exit:** properties are edited on the right; the selection toolbar tracks the
selection at every zoom.

### 7.5.5 — Board home and template gallery

The first screen, which is where most of the "this is Miro" impression is
formed.

- [ ] A board home: board list, recents, trash, minimal tags.
- [ ] A curated, in-app template gallery — a handful of boards, not a
      marketplace.
- [ ] Board metadata (name, tags, thumbnail, last-opened) extends
      `apps/web/board/storage.ts`.
- [ ] **Coordinate with Phase 8.** Folders, full search and activity are Phase 8
      depth; this phase ships the minimum that makes the home feel real.

**Exit:** a new user lands on a board home and can start from a template.

### 7.5.6 — Comments (local-first)

Object-anchored threads, persisted in the document.

- [ ] **Design decision, recorded:** a comment thread is a **record**, not a
      canvas element — a durable row keyed to an `elementId`, with anchor
      geometry, rendered as an overlay the way `ProjectionView` is. This honours
      `AGENTS.md` rule 4 (records are not elements) and keeps comments off the
      canvas element path.
- [ ] Because this is a **schema change**, it ships with a migration
      (`AGENTS.md` rule 2) and a fixture test that loads a document written by
      the previous version.
- [ ] Create, reply, resolve, and re-anchor on element move; round-trip through
      `.firo`.
- [ ] The **permissions lane is deferred to v2.** In v1 comments are
      local-first; there is no commenter role yet, and the UI does not imply one.

**Exit:** comments create, reply and resolve, and a pre-change document still
loads through the migration.

### 7.5.7 — Polish, accessibility, docs

- [ ] VoiceOver/NVDA smoke pass over the new chrome; keyboard path through every
      new surface.
- [ ] Theme parity between `@firo/ui/theme.scss` and the editor's
      `css/theme.scss`; a plan to consolidate.
- [ ] Inherited Excalidraw icons removed from every surface the shell owns.
- [ ] Docs updated: `vision.md`, `README.md`, `docs/index.md`, `AGENTS.md`
      status, and the ADR index.

**Exit:** the shell is usable without a pointer.

## The comments schema change, in detail

Comments are the one part of this phase that touches the document, so they get
the full treatment.

- **Shape.** A comment thread is `{ id, elementId, anchor, comments[], resolved,
  createdAt, author }`. `anchor` is stored in element-relative coordinates so
  the thread follows the element without a per-frame recompute.
- **Why not an element.** A comment has no position of its own, no z-order in
  the scene, and no reason to be exported as a shape. Making it an element would
  put it in culling, hit-testing and the renderer
  ([ADR-0017](../adr/0017-do-not-rewrite-the-renderer.md)) for no benefit, and
  would violate `AGENTS.md` rule 4.
- **Migration.** Adding the collection is additive, so the migration is the
  forward-compatible normalisation the repo already uses: spread the original
  object first (preserving unknown keys), then fill in the new field. A previous
  version loading a new document keeps the unknown collection intact rather than
  dropping it.
- **Fixture.** A document written before the change, loaded and re-saved, must
  not gain or lose fields.

## Verification

- `yarn test:typecheck` — strict mode, no `any` in our packages.
- `yarn test` — including new tests for tokens, theme parity, the shell
  components, and the comment migration.
- `yarn fix --check` — formatting and lint clean.
- `yarn test:update` re-baselines affected reference images; every diff is read
  before it is accepted.
- A rendered-output check that a new board is clean and an old board is not.
- A 10,000-element run against the AC-5 frame budget with the new chrome mounted.
- A keyboard-only pass through a full workshop.

## Risks

| Risk | Mitigation |
| --- | --- |
| REA cannot be installed, or its Chrome DevTools provider cannot reach an authenticated board | Fall back to documented behaviour and screenshots; flag every unverified item in `miro-ui.md` rather than asserting it |
| A tunnel cannot express a left rail | Timebox the tunnel route; take the bounded `@firo/editor` edits named in ADR-0022; do not fork the overlay |
| The clean default changes snapshot output | Only new elements move; `yarn test:update` with reviewed diffs |
| The dashboard balloons into Phase 8 | Ship the minimum; hand depth to Phase 8 explicitly |
| Scope creep generally | Each task has its own exit criterion; a task that needs a sixth tunnel or a schema field outside comments stops and gets an ADR |
| Font licence bookkeeping | Binary, OFL text, `FONT-LICENSES.md` row and the test all land in one commit |

## More Information

- [ADR-0021](../adr/0021-miro-style-shell-and-clean-aesthetic.md) — shell and
  clean default
- [ADR-0022](../adr/0022-ui-package-owns-the-chrome.md) — `@firo/ui` and the
  tunnels
- [ADR-0023](../adr/0023-open-icons-and-ui-typeface.md) — icons and chrome
  typeface
- [`../research/miro-ui.md`](../research/miro-ui.md) — the observed shell
- [`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) —
  AC-5, AC-8
- [`../../AGENTS.md`](../../AGENTS.md) — rules 2 and 4, which §7.5.6 follows
