# Phase 11 — Miro board-experience parity

**Status: In progress — evidence (11.0) and the parity matrix (11.1) delivered; decisions (11.2) next.** Opened 2026-10-18, with a live authenticated Miro **Business** account as the reference. The matrix ([`../research/miro-parity-matrix.md`](../research/miro-parity-matrix.md)) assigns every row to a candidate cluster (C1–C10); those clusters stay candidates until their ADRs land, and the phase's exit criterion cannot be met until every adopt/adapt row is implemented and verified.

**Goal:** close the remaining distance between a Miro board and Firo's. Every command, surface, object, format, panel and keyboard path a person meets on a Miro board and its home is observed from the live product, classified, and either implemented inside Firo's data model or recorded as a deliberate divergence with its reason.

## Why this phase exists

Phase 7.5 built the shell from the first evidence pass (task 7.5.0, 2026-10-15) and recorded its gaps rather than dropping them:

| Recorded gap | Where it is recorded |
| --- | --- |
| The rendered grammar of unopened surfaces — submenus, flyouts, panels. Contents were known from the bundles; roles, focus order and painted labels were not, because passive inspection could not open them | [`../research/miro-interactions.md`](../research/miro-interactions.md) §Gaps |
| Geometry and motion — rail width, icon size, hit targets, spacing, radii; durations and easings | [`../research/miro-ui.md`](../research/miro-ui.md) §Still unverified |
| The selection context menu's exact actions; zoom bounds; the zoom-percentage control | [`../research/miro-ui.md`](../research/miro-ui.md) §Still unverified |
| Shell composition and keyboard follow-ons — rail flyouts, the Templates/Stickers/Diagramming/`+` entries, the `⌘K` palette, toolbar keyboard navigation, the single-key toggle | 7.5.8 and 7.5.9; [`../research/miro-interactions.md`](../research/miro-interactions.md) §What Firo adopts |

This phase reopens them with better instruments and extends the same method to the whole board experience:

- `capture_browser_scenario` connects to the authenticated Chrome and clicks, presses and waits — so hover menus, flyouts and dialogs can be **opened and captured**, not only mined from bundles.
- `compare_web_screenshots` gives pixel metrics between two captures — so geometry can be **measured and held**, with Firo on localhost as the second target.
- `analyze_web_bundle` re-derives the command registry reproducibly (script sources, source maps) instead of a one-off manual download.

The status column of every matrix row is derived when the matrix is written, from the repository at that commit. The 2026-10-15 research documents are evidence about **Miro**; they are not a current statement about Firo.

## Scope

**In scope — everything a user meets on a Miro board and its home**, observed on a Business account:

| Family | What it covers (examples, not exhaustive) |
| --- | --- |
| Shell | creation rail and flyouts, board menu, zoom and navigation, top bar, command palette, context menus, frames panel |
| Objects | sticky notes, text, shapes, the pen family, connectors, cards, frames, mind maps, tables and charts, images, stickers, embeds |
| Formats | table, kanban, timeline, mind map and charts as projections over the record store |
| Facilitation | voting, timer, private mode, reactions, presentation mode, and the activity formats |
| Media | upload and library, stickers/emoji/GIFs, embeds, media playback |
| History | activity, version history, restore |
| Home | board list, search and filters, spaces, the template gallery, board card actions |
| Export and share | image, PDF, backup and embed exports; the share dialog and link states |

**Out of scope — recorded per command in the matrix, not left silent:** marketplace apps and the integration connector family (Jira, Asana, Slack and the rest), enterprise compliance (SSO, SCIM, audit, residency), real-time video and audio, and Miro AI as a metered product — the [`vision.md`](../vision.md) non-goals. Surfaces that cannot be observed on the available account are recorded as **unobserved or plan-gated rows**, never assumed. **Talktrack** gets an explicit adopt/defer/omit decision in the matrix: it sits between the media family and the vision's audio non-goal and was not settled before the evidence.

## Clean-room guardrail

Restated from [`../research/miro-ui.md`](../research/miro-ui.md) and binding on every task here:

- **Emulated:** layout, geometry, behaviour, interaction order and keyboard paths — re-expressed in our components, tokens, icons and copy.
- **Never used:** Miro source (minified or otherwise), icon files, typefaces (Roobert PRO is commercial), brand marks, colour tokens copied verbatim, marketing copy, template content.
- **Bundle mining records structure only:** command ids, categories, descriptor shapes, shortcut tables. An internal identifier is quoted to name a control; it is not copied into the codebase.
- **Colour values are measured to understand function, then re-expressed** in `@firo/ui` tokens. The palette stays ours ([`ADR-0023`](../adr/0023-open-icons-and-ui-typeface.md)).
- Raw evidence (captures, bundles, screenshots) is held outside the repository and is not committed. Summaries and the matrix are.

## Decisions locked

| Area | Decision | Recorded in |
| --- | --- | --- |
| Scope | Board experience: the board, its home, templates, facilitation, export and share | this plan |
| Reference | A live Miro **Business** account | this plan |
| Feature families | Object depth, shape libraries, facilitation formats, media, history | this plan |
| Method | REA + Chrome DevTools, scenario-driven, against an authenticated Chrome on a dedicated debugging profile (a non-default `--user-data-dir` is required); screenshots measured and compared | this plan |
| Guardrail | Clean-room: behaviour and geometry emulated; no assets, code, typefaces or verbatim colour tokens | [`../research/miro-ui.md`](../research/miro-ui.md) |
| Aesthetic | Unchanged: clean by default, sketch as an option | [`ADR-0021`](../adr/0021-miro-style-shell-and-clean-aesthetic.md) |

**Relationship to Phase 10.** Phase 10 continues independently (Wave 2: the desktop shell and doc blocks). Phase 11 does not reprioritise it and does not change its roadmap position.

## Exit criterion

- The parity matrix (`docs/research/miro-parity-matrix.md`) covers every command descriptor and every surface observed, each row carrying an evidence tag, a current Firo status, and a decision: **adopt**, **adapt**, **diverge** or **omit**.
- Every adopt and adapt row is implemented, tested, and verified side-by-side against Miro at the same viewport.
- Every diverge and omit row records its reason; the architectural ones carry an ADR.
- The measured geometry is applied to `@firo/ui` tokens, with the tolerances the measurements actually support.
- Document changes ship migrations and previous-version fixture tests (`AGENTS.md` rule 2); ephemeral interactions never enter the Yjs document (rule 1); record-shaped features are projections, never element types (rule 4).
- `yarn test:typecheck`, `yarn test`, `yarn test:code` and `yarn test:other` pass, with every snapshot re-baseline read.
- The "Still unverified" list in [`../research/miro-ui.md`](../research/miro-ui.md) and the Gaps list in [`../research/miro-interactions.md`](../research/miro-interactions.md) are each closed or restated with a reason.

## Tasks

### 11.0 — Evidence: the deep pass

The scenario-driven sweep. Every surface below is opened with `capture_browser_scenario` (connect mode, the authenticated Chrome), then captured with `inspect_web_page` (DOM, accessibility tree, listeners as needed) and `capture_web_screenshot`; the registry is re-derived with `analyze_web_bundle`.

Rules for the run, to keep it honest and safe:

- Work happens on a **scratch board** the owner provides, never on their real boards. Scenarios may create and delete objects there.
- No invites are sent, no AI credits are spent, no emails are triggered; share surfaces are observed, not exercised.
- Every capture is dated; the Chrome version and the observed account tier are recorded beside the evidence.
- Raw captures stay outside the repository (the evidence store), as the 2026-10-15 pass did.

**Shell**

- [x] Board editor default state — no selection: rail, undo/redo, controls, overlays
- [x] Board menu and its submenus: Board, Edit, View, Preferences, Accessibility
- [x] Creation rail — entries and labels captured in two per-user compositions; drag-to-board and the rail context menu (Pin/Unpin) not re-run (documented behaviour stands)
- [x] Rail flyouts: Shapes and lines; the Pen family
- [x] Templates modal; stickers/emoji/GIFs panel; diagramming panel; the tools/media panel (Miro-native members only)
- [x] The `+` formats-and-flows menu — the rail's catalog captured; the sidebar create menu captured (48 px pitch)
- [x] Zoom and navigation menu — stops (50/70/100/400 live; 1200/2000 recorded 15 Oct, absent 18 Oct), object dimensions and fit captured; the Grid submenu's variants not opened
- [x] Facilitation and reactions menu; the top bar (title, star, share, present, avatar, Talktracks entry) — star not toggled
- [x] Command palette — opened, listed and closed; search-typing, aliases and multi-step variants not exercised
- [x] Accessibility layer — skip links and the Accessibility submenu observed; the board overview did not reproduce under synthetic `⌥O` (restated in the research doc); the single-key toggle not reached
- [x] Preferences: dark mode, reduce motion, language, other view preferences — submenu captured; toggling not exercised

**Selection and menus**

- [x] Selection toolbar — captured in full for a sticky note (16 controls); other object kinds and multi-select states not captured
- [x] Right-click context menu — both lanes captured item-by-item; the Arrange and Info submenus not opened
- [ ] The format/inspector panel per object type; multi-select behaviours (align, distribute, group)

**Objects and creation flows**

- [x] Sticky note — palette (16-swatch flyout), text editing (rich-text editor), create/delete captured; presets, bulk create and the text tool not exercised
- [ ] Shapes (rectangle, oval, shape drawer contents); lines and connectors (types, elbows, line jumps, labels, endpoints) — the shapes strip was captured; connector behaviours were not tested
- [x] The pen family: pen, highlighter, eraser, precision eraser, lasso — flyout captured (five modes, presets); drawing not exercised
- [ ] Frames (create, name, order, the frames panel); cards (fields and flows) — the frames panel and its empty state were captured; frame creation and cards were not tested
- [ ] Mind maps; tables and charts; kanban and timeline — appear in the palette; object behaviours not captured
- [ ] Images (upload, URL, library); embeds; media; stickers/emoji/GIFs — the media library panel was captured; placing media not tested
- [ ] Comments: create, reply, mentions, reactions, resolve; the thread menu — the composer and panel were captured; posting and resolving not exercised (the board was left clean)
- [ ] Grid and snapping: snap-to-grid, dot and line grids, alignment guides — checkbox states seen in the context menu; behaviours not tested

**Facilitation and presentation**

- [x] Voting — settings captured (panel, defaults, filters, transient area preview); starting a session, placing and reveal not run
- [x] Timer; private mode and reveal; reactions — timer setup captured (not started); private mode and reactions not activated
- [x] The activity formats, as observed — the facilitation menu's formats plus the comments/activity panel tabs
- [x] Presentation mode — started and exited; navigation, laser and hidden objects not exercised. Side effect recorded: entering present changed the zoom (69 → 34 %) and exiting did not restore it

**Home**

- [ ] Dashboard: recents, starred, the board list, search, filters, spaces — the in-editor Spaces sidebar was captured in depth (search, filters, create menu, row menu); the standalone dashboard page was not visited
- [x] Board card actions — captured through the sidebar's row menu; exports not run
- [ ] Template gallery: categories, search, preview, use; new-board flow — the templates modal was captured; preview and use-a-template were not exercised, and the new-board flow was not visited

**Export and share**

- [ ] Image export: dialog and options; PDF export: dialog and options — not opened (the sweep avoids downloads); observed as menu and palette entries only
- [ ] Backup; embed and link formats — not observed (no downloads); the Embed tab itself was captured
- [x] The share dialog: link states and roles — opened and captured; nothing exercised (no invites, no link changes, no copying)

**History**

- [ ] Activity panel; version history: timeline, preview, restore — the activity/comments panel was captured (empty states); the versions tab was not opened

**Geometry**

- [x] Measure the shell's geometry — rects, pitches, radii, shadows and colour roles read from the DOM, with tolerances stated in [`../research/miro-geometry.md`](../research/miro-geometry.md)
- [x] Map each measured value to a `@firo/ui` token where one exists; list every value with no token

**Deliverables**

- [x] [`../research/miro-ui.md`](../research/miro-ui.md) — updated: geometry section filled; "Still unverified" shrunk to what genuinely remains
- [x] [`../research/miro-interactions.md`](../research/miro-interactions.md) — updated: the unopened surfaces now observed; the `⌥O`/`⌥S` discrepancy resolved or restated
- [x] `docs/research/miro-geometry.md` — new: the measured spec
- [x] `docs/research/miro-parity-matrix.md` — new (11.1)

**Exit:** every checkbox above has an evidence record in the store; the three documents are committed; geometry is measured and dated.

**Wave 0 close-out (18 October 2026).** The sweep ran on the scratch board with
a scenario runner over the Chrome DevTools Protocol (synthetic input plus DOM
reads), alongside REA `inspect_web_page` dumps and screenshots; every surface the
phase names was opened at least once, and the qualifiers are inline above. Not
captured, with reasons: the standalone dashboard page (the in-editor sidebar was
captured instead), export **dialogs** (the sweep avoids downloads; exports appear
as menu and palette entries only), Talktrack **recording** (out of bounds by the
safety rules), the AI panels (metered), and the Arrange/Info submenus (cosmetic;
deferred). The rail's *default* composition remains the one surface that cannot
be closed from this account: the rail observed is a user's arrangement. The
un-ticked lines above are the follow-up list — most are object-level behaviours
the implementation clusters will cover as they build against the same reference.

### 11.1 — The parity matrix

One document, every command.

- [x] One row per command family or observed surface — the descriptor-level catalogue stays in the research doc and the matrix's §Coverage maps it — with: surface, Miro behaviour (evidence tag and date), Firo status **derived at matrix time from the repository**, decision (adopt/adapt/diverge/omit), and target cluster.
- [x] Spot-check the status column against the code, not against the 2026-10-15 research documents — 36 feature probes at `a425018`, the files named per section.
- [x] Classify every omit and diverge with its reason, linking the ADR or the vision non-goal it follows from.
- [x] Assign every adopt and adapt row to a candidate cluster in 11.3 and later — C1–C10, each with its ADR gate.

**Exit:** the matrix is committed and complete enough that 11.3 can open with a worklist instead of a re-investigation.

**11.1 close-out (18 October 2026).** The matrix
([`../research/miro-parity-matrix.md`](../research/miro-parity-matrix.md)) holds
61 rows, the omissions table, the unobserved list and the cluster map. The draft
*Tools* cluster dissolved: Card-as-a-mode resolves to the records model, and the
comment mode already exists.

### 11.2 — Decisions

The clusters below need ADRs before their implementation starts, because each changes a system-wide contract rather than one widget. The list is expected to grow as the matrix lands; it does not shrink silently.

- [ ] Rail composition and flyouts — one slot, a family of tools, sub-actions with their own keys (extends [`ADR-0029`](../adr/0029-the-rail-is-a-per-user-arrangement.md))
- [ ] The shell keyboard model — the `⌘K` command palette over the single command registry, toolbar roving focus, `B` and `Escape`, and the single-key toggle (extends [`ADR-0030`](../adr/0030-keyboard-parity-with-miro.md))
- [ ] The two context-menu lanes — content, structure, and styling
- [ ] Geometry tokens — the measured spec as a `@firo/ui` contract, including tolerances
- [ ] Whatever the matrix forces — one ADR per contract change, none per widget. The matrix names three more than this draft did: **side-panel shell** (C8), **share-link server state** (C9), **voting session state** (C7); media scope and history lane were already listed, and format depth (C5) is confirmed.

**Exit:** an accepted ADR per cluster above; no 11.3 cluster opens without one.

### 11.3 and later — implementation clusters (candidate)

Final composition is the matrix's §Cluster map — C1–C10, each with its ADR gate
and its rows. Against the earlier draft, one cluster dissolved: *Tools* (the
card vocabulary resolves to the records model, and the comment mode already
exists); the rest kept their shape. Each cluster opens with tasks carrying their
own exit criteria, written when its ADR lands.

## Verification

- **Side-by-side harness.** Firo's dev server and the Miro scratch board are open in the same Chrome at the same viewport; both are captured with `capture_web_screenshot`, and `compare_web_screenshots` reports pixel metrics for matching surfaces. Screenshots are read as well as measured — a metric cannot see that a menu is in the wrong place. Divergences we intend (icons, typeface, palette) are excluded from the metric and stated per capture.
- **Behaviour scripts.** The same interaction sequence is run against both products where surfaces correspond; the observed sequence is recorded beside the capture.
- **Repo gates.** `yarn test:typecheck`, `yarn test`, `yarn test:code`, `yarn test:other`; any snapshot re-baseline is read in full per the protocol in [`phase-7-5-miro-ui.md`](phase-7-5-miro-ui.md) §Verification.
- **Acceptance criteria.** AC-4, AC-5, AC-8 and AC-10 are re-run for affected areas — parity must not cost the existing guarantees ([`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md)).

## Risks

| Risk | Mitigation |
| --- | --- |
| Chrome's remote debugging cannot reach an authenticated board | **Closed 2026-10-18:** a dedicated `--user-data-dir` debugging profile launches and its endpoint answers on `127.0.0.1:9222`. If it regresses, fall back to documented behaviour and flag every unverified row |
| Miro changes under the phase; observations go stale | Every row is dated and tied to the observed build; the matrix states that parity targets the observed version; a surface is re-verified before its row closes |
| Account gating hides surfaces | Business account as reference; plan-gated rows flagged, never assumed |
| Geometry from screenshots is approximate | Tolerances stated per value; tokens carry the measurement's precision; comparisons are metric-assisted, and "exact" is not claimed where it is not measured |
| Scope creeps into marketplace, enterprise or video | The omissions list is locked; widening it is a new decision, not a wave |
| The matrix becomes the deliverable | 11.1 rows carry target waves; the exit criterion is implemented and verified rows |
| Bundle mining drifts into copying | Guardrail restated; structure only; no assets committed; internal identifiers never enter the codebase |
| A parity feature violates the ephemeral/durable split | Rule 1 is stated in the exit criterion and the existing enforcing tests stay green |

## More Information

- [`../research/miro-parity-matrix.md`](../research/miro-parity-matrix.md) — the parity matrix (11.1)
- [`../research/miro-ui.md`](../research/miro-ui.md) — the observed shell
- [`../research/miro-interactions.md`](../research/miro-interactions.md) — the interaction inventory
- [`../research/sources.md`](../research/sources.md) — Miro's own sources, licences and API surface
- [`phase-7-5-miro-ui.md`](phase-7-5-miro-ui.md) — the phase that built the shell
- [`../adr/0021-miro-style-shell-and-clean-aesthetic.md`](../adr/0021-miro-style-shell-and-clean-aesthetic.md) and [`../adr/0023-open-icons-and-ui-typeface.md`](../adr/0023-open-icons-and-ui-typeface.md) — aesthetic and assets
- [`../adr/0029-the-rail-is-a-per-user-arrangement.md`](../adr/0029-the-rail-is-a-per-user-arrangement.md) and [`../adr/0030-keyboard-parity-with-miro.md`](../adr/0030-keyboard-parity-with-miro.md) — the shell contracts this phase extends
- [`../vision.md`](../vision.md) — the non-goals the omissions follow
