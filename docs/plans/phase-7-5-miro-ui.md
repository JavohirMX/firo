# Phase 7.5 — Miro UI shell

**Goal:** a person who opens a board reads it as **Miro**, not as Excalidraw.
Firo keeps its data model — Miro's object vocabulary, the facilitation loop, the
record store, local-first storage — and stops *looking* like a sketch pad.

**Status: complete, except one verification §7.5.9 flags rather than assumes.**
Documentation landed first (ADRs
[0021](../adr/0021-miro-style-shell-and-clean-aesthetic.md),
[0022](../adr/0022-ui-package-owns-the-chrome.md),
[0023](../adr/0023-open-icons-and-ui-typeface.md),
[0024](../adr/0024-the-chrome-font-lives-with-the-chrome.md),
[0025](../adr/0025-the-host-reuses-the-editors-property-controls.md),
[0026](../adr/0026-board-home-and-its-index.md),
[0027](../adr/0027-comments-are-their-own-lane.md)); `@firo/ui` carries the design
tokens, the theme and the chrome typeface; the canvas is clean by default; the
shell is built — the creation rail, navigation toolbar, board menu, collaboration
bar, right-side inspector and floating selection toolbar all render, with
Excalidraw's default chrome off (7.5.1–7.5.4); one-time tools and the minimap
followed in the phase's second pass (commit `76e5059`); the board home and
template gallery shipped (7.5.5), and local-first comments landed (7.5.6). Polish,
accessibility, and documentation are complete (7.5.7). The live Miro inspection
(7.5.0) is **done** — carried out on an authenticated board on 2026-10-15 and
written up in [`../research/miro-ui.md`](../research/miro-ui.md) and
[`../research/miro-interactions.md`](../research/miro-interactions.md). The two
tasks it unblocked have landed: the rail is customisable (7.5.8,
[ADR-0029](../adr/0029-the-rail-is-a-per-user-arrangement.md)) and the keyboard
map is aligned with Miro (7.5.9,
[ADR-0030](../adr/0030-keyboard-parity-with-miro.md)).

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
| Chrome typeface | Plus Jakarta Sans (OFL 1.1), bundled in `packages/ui/src/fonts/PlusJakartaSans/` and registered from `packages/ui/src/fonts.ts` | [ADR-0023](../adr/0023-open-icons-and-ui-typeface.md), [ADR-0024](../adr/0024-the-chrome-font-lives-with-the-chrome.md) |
| Canvas default face | **Unchanged** — Nunito stays until measured (ADR-0013 requirement 4) | [ADR-0023](../adr/0023-open-icons-and-ui-typeface.md) |
| Evidence | Reverse-engineered the live shell with REA + Chrome DevTools against an authenticated board (2026-10-15) | §7.5.0, [`../research/miro-ui.md`](../research/miro-ui.md) |

**Explicitly out of scope:** reactions and live cursors (v2 — single-player in
v1), the Frames-and-Layers panel (deferred), a marketplace, real-time video or
audio, presentation-deck authoring.

## Exit criterion

- [x] The board reads as Miro: left creation rail with undo/redo, bottom-right
      navigation toolbar, top-left board menu, top-right facilitation + share,
      adaptive right-side inspector, floating selection toolbar.
- [x] A board created after the phase opens with a **clean** canvas; a board
      created before it is unchanged. Both verified on rendered output.
- [x] `roughness` is still selectable per element.
- [x] The board home shows a board list, recents, trash and a curated template
      gallery.
- [x] Object-anchored comment threads create, reply and resolve, and survive a
      save/load round trip.
- [x] A full workshop runs on the keyboard alone (AC-8), including the new shell.
- [x] `yarn test:typecheck && yarn test && yarn fix --check` pass.
- [x] 10,000 elements still hold the AC-5 frame budget with the new chrome.
- [x] No `.firo` format change without a migration and a previous-version
      fixture test.
- [x] Tools can be unpinned and reordered by Miro's gestures, and the arrangement
      persists per user (7.5.8).
- [x] Miro key bindings are adopted where they do not break AC-8 (7.5.9).

## Tasks

### 7.5.0 — Evidence

Establish what Miro's shell actually does, from primary sources, before
building it.

- [x] Public documentation read and cited:
      [Toolbars](https://help.miro.com/hc/en-us/articles/360017730553-Toolbars)
      — the left **creation toolbar** with undo/redo beneath it, the bottom-right
      **navigation toolbar** (zoom, frames, layers, minimap, grid, fit), the
      top-left board menu, and the top-right collaboration tools.
- [x] Live inspection with **REA (`morluto/rea`)** and its **Chrome DevTools**
      provider against a Miro board, recorded in
      [`../research/miro-ui.md`](../research/miro-ui.md). Done **2026-10-15**
      against an authenticated board (Chrome 155): `list_browser_targets`,
      `inspect_web_page` (DOM, accessibility tree, storage keys) and
      `inspect_web_event_listeners` settled the region contents, the vertical
      Creation rail and its members, undo/redo placement, the accessibility layer,
      the rail's customisation rules and the keyboard model.
      **Limits, recorded honestly:** REA's passive inspection returns no computed
      styles and no attribute *values*, and source maps are not fetched; the
      screenshot is of the visible viewport only and was not measured by hand.
      Geometry and motion tokens therefore remain open — see the research
      document's "Still unverified". Raw evidence was kept in a temporary
      directory and is deliberately **not committed**.
- [x] A **clean-room guardrail** stated in that document: layout and interaction
      patterns are emulated; no Miro code, asset, icon file, typeface or mark is
      used.
- [x] The **interaction inventory** — every surface, what it does, and the
      mechanism behind it — recorded in
      [`../research/miro-interactions.md`](../research/miro-interactions.md).
      Beyond the live enumeration, the *how* came from Miro's own JS bundles
      (420 files, ~54 MB, **structure only**, never copied): a shared command
      registry with one descriptor per control (`main`/`active`/`inactive`
      states, `actionType`, `aliases`, keyboard bindings, icon slots), the
      categories the rail groups by, the two context-menu lanes, and the
      shortcut machinery. This is what 7.5.8 (rail customisation) and 7.5.9
      (keyboard) act on.

REA **is installed** as of 2026-10-15, and an authenticated Miro board is
available. For a web app only the Chrome DevTools provider is relevant — no
binary engine is needed.

**Exit:** `docs/research/miro-ui.md` exists with citations, unverified claims
flagged, and the guardrail recorded; `docs/research/miro-interactions.md`
catalogues the interactions and the mechanism behind them.

### 7.5.1 — Design tokens and theme

The foundation everything else is drawn from.

- [x] `packages/ui` scaffolded: `@firo/ui` in the workspace, resolvable from
      `tsconfig.json` and `vitest.config.mts` **without** going through `dist/`.
- [x] `packages/ui/src/tokens.ts` — the TS source of truth: colour (light and
      dark), spacing, radii, elevation, typography, motion, z-index.
- [x] `packages/ui/src/theme.scss` — the same tokens as CSS custom properties,
      with a parity test asserting every property in the map is declared.
- [x] The app loads the theme (`apps/web/index.scss` `@use`s it) and loads the
      chrome typeface (`apps/web/index.tsx` calls `loadChromeFonts`). Old and new
      chrome coexist: the theme declares custom properties and nothing else, so
      nothing is restyled until a shell component reads them.

**Exit:** tokens drive the app, and a theme-parity test fails if a token and its
custom property drift. Both hold; the custom properties are in the production CSS
(`yarn build:app`), which is also how the font was verified to load.

### 7.5.2 — Clean aesthetic and chrome typeface

- [x] `DEFAULT_ELEMENT_PROPS.roughness → ROUGHNESS.architect` (0) in
      `packages/common/src/constants.ts`
      (`packages/common/tests/element-defaults.test.ts`), plus the two other
      places a *new* element gets its roughness: `newElement`
      (`packages/element/tests/newElement.test.ts`) and `@firo/board`'s
      `STICKY_NOTE_DEFAULTS` (`packages/board/tests/elements.test.ts`). A note
      created by the document layer staying hand-drawn would have made a clean
      board with sketchy notes on it.
- [x] Confirm existing boards are unaffected (stored per-element values) and new
      elements are clean. Restore is the path that matters, and it is pinned by
      `restore keeps the roughness a board was saved with` in
      `packages/editor/tests/data/restore.test.ts`: `0`, `1` and `2` all survive a
      restore unchanged.
- [x] Re-baseline the snapshot tests with `yarn test:update`; **every changed
      line read**. 624 lines across 11 `.snap` files, and every one of them is
      `roughness: 1 → 0` or `currentItemRoughness: 1 → 0`, plus one embedded-SVG
      payload that encodes the same field. No render count, no element count and
      no geometry changed.
- [x] Bundle Plus Jakarta Sans for the chrome: binaries, `OFL.txt` beside them, a
      `FONT-LICENSES.md` row with the source URL, size and SHA-256 of each binary,
      and `packages/common/tests/fonts.test.ts` passing. The gate now walks
      `packages/editor/fonts` **and** `packages/ui/src/fonts`.
- [x] `roughness` remains selectable in the shape-properties UI — nothing in
      `actionChangeSloppiness` reads the default, so all three values stay
      offered; `ROUGHNESS` keeps `architect`, `artist` and `cartoonist`.
- [x] `DEFAULT_FONT_FAMILY` is **unchanged** (still Nunito), asserted by
      `packages/common/tests/fonts.test.ts`.

**Exit:** a new board looks clean; the licence gate passes with the new font.
Both hold. Two things were needed that this task did not anticipate, and both are
recorded in [ADR-0024](../adr/0024-the-chrome-font-lives-with-the-chrome.md): the
font cannot be declared in a stylesheet (Vite emits a font only when it is
imported as a module), and `@firo/ui` had to be loaded by the app for the face to
load at all.

### 7.5.3 — Shell layout

- [x] The five tunnels in `@firo/editor` ([ADR-0022](../adr/0022-ui-package-owns-the-chrome.md)):
      `renderCreationRailUI`, `renderNavigationUI`, `renderBoardMenuUI`,
      `renderInspectorUI`, `renderSelectionUI`.
- [x] `defaultChromeEnabled` flag; absent means today's behaviour, so `examples/`
      keeps working.
- [x] `CreationRail` reads the tool registry from `@firo/editor` — no second tool
      list, labels or shortcuts.
- [x] `BoardMenu`, `CollabBar` (wraps today's `FacilitatorBar`), `NavToolbar`
      (zoom, zoom %, fit, grid).
- [x] **Minimap** — built after the phase's first pass (commit `76e5059`).
      `apps/web/components/Minimap.tsx` computes the scene's bounding box, draws
      it on a `<canvas>`, and translates the viewport on drag without touching the
      Yjs CRDT; `WebNavToolbar` in `apps/web/App.tsx` owns `minimapVisible` and
      passes `isMinimapOpen`/`onToggleMinimap` through `NavToolbar`. Covered by
      `apps/web/tests/minimap.test.tsx`. It is a host feature rather than a shell
      placement, which is why it landed here and not in the tunnel work above.
- [x] Drag-from-rail onto the board: the rail is a drag source, not only a mode
      switch (`onPointerDownTool` → `app.toolDrag.handleButtonPointerDown`).
- [x] **One-time tools** — a creation tool reverts to Select after it is used
      ([ADR-0021](../adr/0021-miro-style-shell-and-clean-aesthetic.md) clause 1;
      [`../research/miro-ui.md`](../research/miro-ui.md), item 1). Built after the
      phase's first pass (commit `76e5059`): `WebCreationRail` in
      `apps/web/App.tsx` selects every tool in `CREATION_TOOLS` (sticky note,
      rectangle, diamond, ellipse, arrow, line, text, frame) with `locked: false`,
      so a single click stamps once and reverts; a double-click or shift-click
      passes `locked: true` for continuous placement. `CreationRail` forwards the
      mouse event so the host can read `shiftKey`. Covered by
      `apps/web/tests/creationRail.test.tsx`.
- [x] `components/App.tsx` untouched.

**Exit:** the Miro layout renders, Excalidraw's default chrome is off, and a
host with no custom chrome still gets the old editor.

### 7.5.4 — Inspector, selection toolbar and context menus

- [x] `Inspector` — the right panel that replaces the top-left shape-actions
      island (`defaultChromeEnabled` hides the island). It hosts the editor's own
      `SelectedShapeActions`, reused rather than re-implemented — the decision and
      the two extra editor exports are
      [ADR-0025](../adr/0025-the-host-reuses-the-editors-property-controls.md).
- [x] `SelectionToolbar` — floating, anchored to the selection's top edge in
      container coordinates (`(scene + scroll) * zoom`), following pan and zoom.
      Actions: duplicate, lock/unlock, bring to front, delete.
- [x] Right-click context menus for canvas and for a selection. The editor's
      built-in menu already covers both (`components/App.tsx`, `getContextMenuItems`
      for the `"canvas"` and `"element"` types), and `defaultChromeEnabled` does
      **not** gate it — `isDefaultUIEnabled()` does, and that is a different flag —
      so it keeps working unchanged. It is Excalidraw-styled, not chrome-styled;
      restyling it is deferred to 7.5.7.
- [x] **Keyboard map** aligned to Miro's, with AC-8 preserved. The rail and its
      tooltips read the editor's single keyboard registry (`TOOLS` +
      `getToolShortcut`), so the shortcut shown and the shortcut handled cannot
      drift, and no AC-8 path regressed (the rails add no shortcut of their own).
      The full remap to Miro's letter map landed in
      [7.5.9](#759--keyboard-map-remap), where it was a reconciliation against
      Firo's existing bindings rather than a rename:
      [ADR-0030](../adr/0030-keyboard-parity-with-miro.md).

**Exit:** properties are edited on the right; the selection toolbar tracks the
selection at every zoom. Both hold.

### 7.5.5 — Board home and template gallery

The first screen, which is where most of the "this is Miro" impression is
formed.

- [x] A board home: board list, recents, trash, minimal tags. `@firo/ui`'s
      `BoardHome` (with `BoardCard` and `TemplateGallery`) is presentational and
      takes boards, templates and callbacks from the host;
      `apps/web/BoardHomeScreen.tsx` wires it to storage.
- [x] A curated, in-app template gallery — four authored boards (Retrospective,
      Brainstorm, User story map, Meeting notes) built from `@firo/board`'s
      factory in `apps/web/board/templates.ts`, not a marketplace.
- [x] Board metadata (name, tags, thumbnail, last-opened) extends
      `apps/web/board/storage.ts`. Each board's document moves to
      `autosave:<id>` while the default board keeps the original `autosave` key,
      so a pre-existing board is untouched; a `board-index` record holds one
      `BoardMeta` per board, and `apps/web/board/library.ts` owns the index, the
      domain operations and the active-board cache.
- [x] **Coordinate with Phase 8.** Folders, full search and activity are Phase 8
      depth; this phase ships the minimum that makes the home feel real.

**Navigation.** Opening a board is `?board=<id>` and a full reload — a tab's
document is built at module scope, so the switch is a reload rather than a swap
([ADR-0026](../adr/0026-board-home-and-its-index.md)). `?home=1` is the explicit
way back to the home (the board menu's title), and a URL naming neither resumes
the most recently opened board. The editor is loaded lazily so the home path
never imports the editor's module-scope document and `pagehide` flush.

**Recorded divergence.** `@firo/doc` already ships a board index and persistence
(`packages/doc/src/library.ts`, `persistence.ts`) that `apps/web` does not use:
the app persists each board as a JSON snapshot in `./storage.ts`
(ADR-0018 clause 9), not as a `y-indexeddb` update log. The home's index is
therefore the index of the store the documents are actually in, kept in
`apps/web`; the two board indexes are recorded rather than reconciled, and
reconciling them is Phase 8 work ([ADR-0026](../adr/0026-board-home-and-its-index.md)).

**Exit:** a new user lands on a board home and can start from a template. Met.

### 7.5.6 — Comments (local-first)

Object-anchored threads, persisted in the document.

- [x] **Design decision, recorded:** a comment thread is a **record**, not a
      canvas element — a durable row keyed to an `elementId`, with anchor
      geometry, rendered as an overlay the way `ProjectionView` is. This honours
      `AGENTS.md` rule 4 (records are not elements) and keeps comments off the
      canvas element path ([ADR-0027](../adr/0027-comments-are-their-own-lane.md)).
- [x] Because this is a **schema change**, it ships with a migration
      (`AGENTS.md` rule 2) and a fixture test that loads a document written by
      the previous version (`CURRENT_RECORD_VERSION = 2`, fixture v2 updated).
- [x] Create, reply, resolve, and re-anchor on element move; round-trip through
      `.firo`.
- [x] The **permissions lane is deferred to v2.** In v1 comments are
      local-first; there is no commenter role yet, and the UI does not imply one.

**Exit:** comments create, reply and resolve, and a pre-change document still
loads through the migration. Met.

### 7.5.7 — Polish, accessibility, docs

- [x] VoiceOver/NVDA smoke pass over the new chrome; keyboard path through every
      new surface (Escape closes composer/thread, Cmd+Enter submits/replies, ARIA dialog and labels).
- [x] Theme parity between `@firo/ui/theme.scss` and the editor's
      `css/theme.scss`; a plan to consolidate.
- [x] Inherited Excalidraw icons removed from every surface the shell owns
      (`@firo/ui/src/icons.tsx`).
- [x] Docs updated: `vision.md`, `README.md`, `docs/index.md`, `AGENTS.md`
      status, and the ADR index.

**Exit:** the shell is usable without a pointer. Met.

### 7.5.8 — Customisable creation rail

Miro's rail is customisable, and §7.5.0's live inspection plus
[Miro's *Toolbars* article](https://help.miro.com/hc/en-us/articles/360017730553-Toolbars)
settle the mechanics: **drag a tool to reorder it, right-click to Unpin it**, the
arrangement is saved to **your profile only** (per user, not per board), and it is
**not supported on touch devices**. **Select/Hand cannot be removed** — and in
Miro it is *one* toggling control (`V`/`H`), not two entries. Firo's rail is fixed
today (`RAIL_TOOL_ORDER` in `apps/web/App.tsx`) and renders `selection` and `hand`
separately.

- [x] Select/Hand is a single non-removable entry that toggles between Select and
      Hand; every other tool can be hidden (unpinned) and reordered.
- [x] Reorder by drag and remove by context menu, matching Miro's two gestures.
- [x] The arrangement persists locally, per user — a local preference, not a
      document field and not a board property. v1 is single-player, so "per user"
      means "this installation".
- [x] The ordering UI stays in `@firo/ui`; the storage seam stays in `apps/web`
      ([ADR-0022](../adr/0022-ui-package-owns-the-chrome.md),
      [ADR-0026](../adr/0026-board-home-and-its-index.md)).
- [x] Because it changes the rail's contract, it carries its own ADR
      ([ADR-0029](../adr/0029-the-rail-is-a-per-user-arrangement.md)).

**Exit:** a user can unpin and reorder tools by the same gestures Miro uses, the
arrangement survives a reload, and Select/Hand cannot be removed.

**Not in this task (recorded, not silently dropped):** collapsing the five flat
shape entries into one "Shapes and lines" entry with a flyout, and adding Miro's
`Templates`, `Stickers / Emoji / GIFs`, `Diagramming shapes` and `+` entries.
Those change the rail's *composition*, not its customisability, and are separate
decisions — see the differences table in
[`../research/miro-ui.md`](../research/miro-ui.md).

### 7.5.9 — Keyboard map remap

Align Firo's keyboard map with Miro's where the two differ, without losing AC-8.
Miro-first on collisions; the standard editing keys are the exception.

Compare the two maps in `TOOLS` (`packages/editor/components/Tools.tsx`) with
[Miro's *Shortcuts and hotkeys*](https://help.miro.com/hc/en-us/articles/360017731033).
Checked tool by tool, they agree on almost everything. The genuine work is small,
and most of the apparent "conflicts" are Miro features Firo does not have — which
should be documented, not forced.

| Key | Miro | Firo today | Action |
| --- | --- | --- | --- |
| `V` / `H` | select / hand, one toggling control | `selection` / `hand`, two tools | keys already right; rail shape is 7.5.8 |
| `T`, `P`, `E`, `F`, `R`, `O`, `L`, `N` | text, pen, eraser, frame, rectangle, oval, line, sticky note | same | **already agree** |
| `M` | minimap | a minimap exists but has no key | **bind `M` to the minimap toggle** |
| `G` | grid | a grid toggle exists but has no key | **bind `G` to the grid toggle** |
| `S` | the shapes group | no group tool — shapes are separate entries | no target today; document |
| `C` | the comment tool | comments exist as threads, not a tool mode | no target today; document |
| `D` | card | diamond | not a conflict — Firo has no card tool; document |
| `A` | unbound | arrow | harmless extra; keep |
| `X` / `Shift+X`, `B`, `K` | unbound | autoshape, bucket fill, laser | Firo-only extras; record |

- [x] `M` (minimap) and `G` (grid) are bound — the only two Miro keys whose Firo
      features already exist but have no shortcut — and neither collides with an
      existing binding or a browser/OS-reserved key.
- [x] The divergences with no Firo counterpart are recorded, not forced: `S`
      (shapes group) and `C` (comment tool) have no matching tool here, and `D` is
      diamond where Miro has card.
- [x] Firo's own extras (`X`/`Shift+X`, `B`, `K`) are listed as deliberate.
- [x] The `1`–`9` collision is decided and documented. Miro's numbers are
      positional and unremappable (`2` is always Templates), which our inherited
      Excalidraw numbering cannot satisfy while also meaning "tool type"; if we
      keep numeric tool keys, that divergence is stated in the ADR as deliberate.
      **Kept type-based, and stated as deliberate.**
- [x] The standard editing keys (copy, cut, paste, select-all, undo, redo) and
      browser/OS-reserved keys (`⌘K`, `⌘0`, `⌘+`/`⌘-` and friends) stay as the
      platform expects, and are listed in the ADR as the exception.
- [x] The remap lives in the editor's single registry (`TOOLS` +
      `getToolShortcut`); no second shortcut table is introduced. The two new keys
      add no parallel *tool* table: `G` is an action in the registry, and `M` is
      the host's own chrome shortcut, owned beside the chrome it drives.
- [ ] AC-8 is re-proven end to end: a full workshop runs on the keyboard alone,
      including the remapped tools. **Not re-run for this change.** The new keys
      are covered by tests — `shortcuts.test.tsx` proves plain `G` cycles the
      grid and that `Ctrl`/`⌘`+`G` still groups, and
      `apps/web/board/tests/chromeShortcuts.test.ts` pins the `M` predicate — but
      the end-to-end keyboard-only pass is a manual step, and it has not been
      performed since the remap. It is the one open item in this phase.
- [x] Shortcut tests and snapshots (`packages/editor/tests/shortcuts.test.tsx`
      and any `.snap`) are re-baselined with every diff read.
- [x] An ADR records the remap, the positional-vs-type decision, and the keys
      deliberately left alone:
      [ADR-0030](../adr/0030-keyboard-parity-with-miro.md).

**Exit:** someone who knows Miro's shortcuts can use Firo without relearning, and
AC-8 still holds.

**Follow-on (recorded, not silently dropped):** Miro's shell is itself
keyboard-navigable — `Tab`/`Shift-Tab` between toolbars, arrows within one, `B` to
the board, `⌘K` command palette, `Escape` back, and a preference that turns
single-character shortcuts off for screen-reader users (see
[Keyboard navigation](https://help.miro.com/hc/en-us/articles/11997028019858)).
Firo does not have the roving-focus toolbar behaviour or a command palette yet.
That is a larger piece than a remap and is tracked separately rather than folded
into this task.

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
- **Read a re-baseline as a cascade, not as a list.** A failing `afterEach` hook
  stops the remaining hooks in a file, and one of them is `Testing Library`'s
  `cleanup`. The next test then renders a second app into a `document` that still
  has the first one, so `getByToolName` reports *"Found multiple elements"*, and
  the snapshot recorded in that test is a mid-test state: the 7.5.2 re-baseline
  first showed `number of renders 5 → 3` in `contextmenu.test.tsx`, which was
  never a rendering change but a test body that had aborted before its last
  render. `--update` makes the assertion pass, so no cascade happens and the
  values written are clean — and the proof that they are is a **plain run
  afterwards being green**, since a cascaded value would not reproduce. Verified
  here with a throwaway probe test, which is how the mechanism was established
  rather than inferred.
- A rendered-output check that a new board is clean and an old board is not.
- A 10,000-element run against the AC-5 frame budget with the new chrome mounted.
- A keyboard-only pass through a full workshop.

## Risks

| Risk | Mitigation |
| --- | --- |
| REA cannot be installed, or its Chrome DevTools provider cannot reach an authenticated board | Fall back to documented behaviour and screenshots; flag every unverified item in `miro-ui.md` rather than asserting it. **Superseded (2026-10-15):** REA is installed and a board is available, so the fallback is no longer needed (7.5.0, 7.5.8, 7.5.9) |
| A tunnel cannot express a left rail | **Closed.** The five tunnels plus bounded `@firo/editor` edits render the rail ([ADR-0022](../adr/0022-ui-package-owns-the-chrome.md)) |
| The clean default changes snapshot output | **Closed.** Only new elements moved; `yarn test:update` re-baselined and every diff was read |
| The dashboard balloons into Phase 8 | **Closed.** 7.5.5 shipped the minimum; depth went to Phase 8 ([ADR-0028](../adr/0028-project-layer-folders-and-content-search.md)) |
| The Miro keyboard remap breaks AC-8 | **Partially closed.** The standard editing keys were kept and the map stayed centralised in `TOOLS`/`getToolShortcut` (with `M` owned by the host beside the chrome it drives); no snapshot moved. The end-to-end keyboard-only re-run is still owed — §7.5.9 records it as the phase's one open item rather than ticking it |
| Scope creep generally | Each task has its own exit criterion; 7.5.8 and 7.5.9 each carry an ADR because they change editor behaviour rather than chrome |
| Font licence bookkeeping | Binary, OFL text, `FONT-LICENSES.md` row and the test all land in one commit |

## More Information

- [ADR-0021](../adr/0021-miro-style-shell-and-clean-aesthetic.md) — shell and
  clean default
- [ADR-0022](../adr/0022-ui-package-owns-the-chrome.md) — `@firo/ui` and the
  tunnels
- [ADR-0023](../adr/0023-open-icons-and-ui-typeface.md) — icons and chrome
  typeface
- [ADR-0025](../adr/0025-the-host-reuses-the-editors-property-controls.md) —
  the inspector reuses the editor's property controls, and the two exports that
  required
- [`../research/miro-ui.md`](../research/miro-ui.md) — the observed shell
- [`../research/miro-interactions.md`](../research/miro-interactions.md) — the
  interaction inventory and the mechanism behind it
- [`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) —
  AC-5, AC-8
- [`../../AGENTS.md`](../../AGENTS.md) — rules 2 and 4, which §7.5.6 follows
