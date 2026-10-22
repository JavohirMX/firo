# The Miro–Firo parity matrix

Every family of the Miro board experience, classified: what Miro does, what Firo
has, and what Firo will do about it.

This is the working contract for Phase 11. Its rows are the worklist for 11.3
and later; its omissions are the locked record of what parity does **not** mean.
The evidence behind the Miro column is the 2026-10-15 shell pass and the
2026-10-18 deep pass, summarised in [`miro-ui.md`](miro-ui.md),
[`miro-interactions.md`](miro-interactions.md) and [`miro-geometry.md`](miro-geometry.md).

**Reference:** live Miro **Business** account; build `1.104717.0`; Chrome
155.0.8059.80; viewport 1200 × 818 CSS at dpr 2; scratch board. Raw captures stay
outside the repository.

**Firo side:** the repository at commit `a425018`, read on 18 October 2026. The
status column is derived from **code** — the files are named per section — not
from the 2026-10-15 research documents. Where code could not settle a status, the
row says so.

**Decision vocabulary:** **adopt** (build the reference behaviour), **adapt**
(build it in Firo's model — construction may differ, function may not),
**diverge** (deliberately different; reason recorded), **omit** (not building it;
reason recorded). **Defer** appears once — Talktracks — where the phase plan
calls for an explicit adopt/defer/omit call.

## How to read a row

- **Status:** `implemented` (needs no work, marked *(met)*), `partial` (the gap
  is stated), `absent`, or `unobserved` (no decision until evidence exists).
- **Cluster:** the candidate 11.3 cluster the row targets; the map with ADR gates
  is at the end. Rows that need no work carry no cluster.
- **Evidence tags:** `[live]` observed on the board, `[live, deep pass]` opened
  and read on 18 October, `[bundle]` structure-mined, `[docs]` published.

**Coverage.** Rows are at the level of the control or family a decision is made
at. The exhaustive descriptor catalogue — with bundle ids, categories and
descriptor shapes — is [`miro-interactions.md`](miro-interactions.md) §The
command catalogue; every descriptor category maps into exactly one section below,
and the out-of-scope categories map into §Omissions. Where descriptors inside one
category take different decisions, they are separate rows. Geometry is measured
in the companion document and enters the matrix as one row (tokens).

---

## Shell

Code checked: `packages/ui/src/components/` (`BoardMenu`, `CollabBar`,
`CreationRail`, `NavToolbar`, `SelectionToolbar`), `apps/web/components/AppMainMenu.tsx`,
`apps/web/board/railLayout.ts`, `packages/editor/components/CommandPalette/`,
`packages/editor/actions/shortcuts.ts`, `apps/web/components/AccessibilityLayer.tsx`.

| # | Surface | Miro (observed) | Firo at `a425018` | Decision | Cluster |
| --- | --- | --- | --- | --- | --- |
| 1 | Board bar — sidebar toggle, Home, thumbnail, title, main menu | 311 × 48; the title is click-to-rename [live, deep pass] | partial — title is click-to-rename inline, home moved to a boards button; no thumbnail | adapt | C10 |
| 2 | People bar | facilitation · activity · talktracks · avatar · present · share [live, deep pass] | partial — connection pill, static avatars, Share; presentation lives in the FacilitatorBar; no facilitation menu | adapt | C10 |
| 3 | Creation rail — entries, groups, separators | per-user arrangement; 13–15 slots across two reads; separators between groups [live, deep pass] | partial — ten tool entries (select/hand merged) plus undo/redo; no stickers, diagramming or catalog entry; `+` opens a popover with no target | adapt | C1 |
| 4 | Rail flyouts — one slot, a family of tools | shapes and lines (`O R L S`), pen family (`P E` and three more), sticky colours, frames presets, media [live, deep pass; bundle] | partial — shapes, connectors and pen only | adapt | C1 |
| 5 | Rail customisation — reorder, unpin, restore, persist | per-user and local; the arrangement changed between two reads on the same account [live] + [docs] | implemented — drag reorder, right-click unpin, hidden-tools restore; per browser ([`ADR-0029`](../adr/0029-the-rail-is-a-per-user-arrangement.md)) | adopt *(met)* | — |
| 6 | Tools catalog (`+`) and the sidebar create menu | catalog 450 × 746; create menu 264 × 688 at 48 px pitch [live, deep pass] | partial — an unpinned-tools popover without a catalog target; the create menu exists | adapt | C1 |
| 7 | Main menu tree | Board · Edit · View · Preferences · Accessibility [live] | partial — tree shape adopted: Board - Edit - View - Preferences - Help; no Accessibility group (its options stay in Preferences, row 15) | adapt | C10 |
| 8 | Command palette | `⌘K`; one list of apps and actions with key chips [live, deep pass] | partial — opens with Ctrl/Cmd+`/` and Ctrl/Cmd+Shift+`P`, not `⌘K`; registry-driven; text-to-diagram items ride the local AI flag (default on); `⌘K` belongs to the link action and moves to `⌥⌘K`, Miro's own link key, for the palette to take it | adapt | C2 |
| 9 | Keyboard cheat-sheet (Help) | read-only modal, 78 rows captured [live, deep pass] | partial — the modal exists and its registered rows now print from the shortcut registry (the grid row was advertising the retired Ctrl+' while the binding was plain G); the remaining hardcoded rows are the unregistered contextual chords (picker keys, align, text editing) | adopt | C2 |
| 10 | Zoom cluster — out, percentage, in | control strip bottom-right [live] | implemented — zoom out/percentage/in and fit | adopt *(met)* | — |
| 11 | Zoom and navigation menu | full screen, minimap, grid, object dimensions, fit `⌥1`, stops 50/70/100/400 `⌘0` [live, deep pass] | partial — zoom, fit, grid and minimap toggles exist; the nav readout menu adds preset stops (50/70/100/400), full screen, grid variants and in-menu selection dimensions; no canvas object-dimensions overlay | adapt | C10 |
| 12 | Context menu — empty canvas | item list with a checkable group (grid, comments, snapping, size hints); flips above the cursor near the bottom edge [live, deep pass] | partial — inherited menus | adapt | C3 |
| 13 | Context menu — object | 16 items with separators; Arrange and Info submenus [live, deep pass; bundle] | partial — inherited menus | adapt | C3 |
| 14 | Selection toolbar | 16 controls, centred above the object [live, deep pass] | partial — six controls (comment, tags, duplicate, lock, front, delete) | adapt | C5 |
| 15 | Accessibility layer | skip links; board overview; single-key toggle [live] (the overview key is unresolved — see the research doc) | partial — accessibility tree/overview and reduce-motion exist; no skip link; single-key shortcuts are host options only | adapt | C2 |
| 16 | Side-panel shell | right dock, 340 / 380 wide, pushes the bottom-right strip, own close control (Escape does not close) [live, deep pass] | absent — no panel shell; comments are canvas pins, activity is a dialog | adopt | C8 |
| 17 | Measured geometry → tokens | the metrics in [`miro-geometry.md`](miro-geometry.md) [measured] | partial — tokens cover surfaces, radii and elevation; rail width, control sizes, the three menu pitches, panel widths and the active/secondary colour roles have none | adapt | C4 |
| 18 | Comment tool mode | the rail tool arms; the next canvas click opens a pinned composer [live, deep pass] | implemented — comment mode with the `C` key and canvas placement | adopt *(met)* | — |

## Objects, styling and creation flows

Code checked: `packages/element/src/` (`types`, `embeddable`),
`apps/web/components/ProjectionView.tsx`, `packages/records/src/`,
`packages/editor/charts/`, `packages/ui/src/components/Inspector.tsx`,
`packages/common/src/colors.ts`, `apps/web/board/railLayout.ts`.

| # | Surface | Miro (observed) | Firo at `a425018` | Decision | Cluster |
| --- | --- | --- | --- | --- | --- |
| 19 | Sticky colour palette (tool flyout) | 16 swatches, 50 px cells [live, deep pass] | partial — sticky colours exist in the colour UI, not on the tool | adapt | C1 |
| 20 | Sticky size presets and bulk mode | S / M / L; Stack; Templates; Bulk mode [live, deep pass] | partial — one 250 px default, resizable; no presets, no bulk create | adapt | C5 |
| 21 | Text tool | canvas text with an in-place editor [live] | implemented | adopt *(met)* | — |
| 22 | Shapes and connectors — basics | shape strip; lines and arrows with binding [live] | implemented — rectangle, diamond, ellipse; arrow and line with binding and snapping | adopt *(met)* | — |
| 23 | Shape libraries (diagramming sets) | diagramming panel; flow/UML sets [live; contents per bundle] | absent | adapt — our own drawings; no Miro assets | C1 |
| 24 | Pen family depth | pen, highlighter, smart pen, eraser, precision eraser, presets [live, deep pass] | partial — freedraw, eraser, laser | adapt | C1 |
| 25 | Frames as objects | create, name, resize; frames drive presentation [live] | implemented — creatable; they drive the deck | adopt *(met)* | — |
| 26 | Frames panel | frame list, order, per-frame actions [live, deep pass of the entry point] | absent | adopt | C8 |
| 27 | Cards | card element with fields; drag into a kanban [live; object depth unobserved] | adapted by model — records and their projections are Firo's card vocabulary ([`ADR-0003`](../adr/0003-records-with-switchable-projections.md); [TRD-06](../trd/06-records-and-projections.md)); no card element, by design | adapt | C5 |
| 28 | Mind maps | auto-layout map format [palette entry observed; object body unobserved] | absent | adopt — as a projection over records, not a new element type | C5 |
| 29 | Tables and charts | table format; charts [palette] | partial — table and grid projections implemented; charts are paste-driven (bar, line, radar) | adapt | C5 |
| 30 | Kanban and timeline | formats [palette] | implemented — projections over the record store | adopt *(met)* | — |
| 31 | Grid and snapping | show grid; snap to grid; snap objects; size hints; alignment guides [live, deep pass] | partial — grid toggle, object and midpoint snapping, snap lines; size-hint toggles to confirm at build | adapt | C5 |
| 32 | Inspector / styling surface | styling lives on the toolbar's popovers; no persistent inspector | implemented — persistent Inspector, host-owned property controls ([`ADR-0025`](../adr/0025-the-host-reuses-the-editors-property-controls.md)) | diverge — keep the Inspector; the toolbar still adapts (row 14) | C5 |

## Facilitation and presentation

Code checked: `packages/facilitation/src/` (`timer`, `voting`, `reveal`,
`presentation`), `apps/web/board/facilitatorActions.ts`,
`apps/web/components/FacilitatorBar.tsx`.

| # | Surface | Miro (observed) | Firo at `a425018` | Decision | Cluster |
| --- | --- | --- | --- | --- | --- |
| 33 | Reactions | six quick reactions above the facilitation menu [live, deep pass] | absent | adopt — ephemeral, so the awareness lane (rule 1), never the document | C7 |
| 34 | Timer | setup popover: minute stepper, music, Start [live, deep pass] | partial — command and readout in the FacilitatorBar; no setup dialog | adapt — the music tracks are omitted (licensed audio) | C7 |
| 35 | Voting | 380 px panel: votes per person, minutes, toggles, type filter, transient voting area [live, deep pass] | partial — dot voting via Alt-chord commands with records storage; no settings or results panel | adapt | C7 |
| 36 | Private mode and reveal | private-mode item; per-object flow [live, listed only] | partial — a reveal command; no per-object toggle UI | adapt | C7 |
| 37 | Presentation mode | overlay; navigation; laser; hidden objects [live; start and exit verified] | partial — frames-as-slides, slide readout, start/next/end; no deck reorder, no hidden-object authoring | adapt | C7 |
| 38 | Facilitation "Notes" | listed, not activated [unobserved] | absent | unobserved — no decision until the flow is seen | — |

## Media

Code checked: `packages/editor/data/` (`image`, `blob`), `packages/element/src/embeddable.ts`,
`packages/editor/components/App.clipboard.ts`, `packages/editor/components/DefaultSidebar.tsx`.

| # | Surface | Miro (observed) | Firo at `a425018` | Decision | Cluster |
| --- | --- | --- | --- | --- | --- |
| 39 | Images — upload, URL, library | image placing and replacement [live] | implemented | adopt *(met)* | — |
| 40 | Media library panel | full-height 368 × 746 library [live, deep pass] | absent | adopt — the panel; content classes decided in rows 41–43 | C6 |
| 41 | Emoji | picker with search and categories [live] | partial — a font fallback only; no picker | adopt — picking is unicode; nothing is licensed | C6 |
| 42 | Stickers | art sets [live] | absent | omit — Miro's art is licensed and the clean-room guardrail forbids it; shipping our own set is a content decision, not parity work | — |
| 43 | GIFs | picker [live] | absent | omit — needs an external search service and its content licence; not the local-first shape | — |
| 44 | Embeds | embed panel; inline playback of supported links [live; bundle] | partial — the embeddable element type and the paste/URL path exist; no panel, no in-app affordance | adapt | C6 |
| 45 | Calls and screen sharing | Talk and huddles [out of scope] | absent | omit — vision non-goal (real-time video, audio and screen sharing) | — |
| 46 | Talktracks | record and watch a walkthrough; the people-bar entry [live, listed; recording out of bounds] | absent | **defer** — explicit call: needs a recording and durable playback lane the document model does not have; revisit after the media lane (C6), only if demand appears | — |

## History and activity

Code checked: `packages/ui/src/components/ActivityFeed.tsx`,
`apps/web/components/VersionHistoryModal.tsx`, `apps/web/board/storage.ts`,
`apps/web/board/comments.ts`, `apps/web/components/CommentLayer.tsx`.

| # | Surface | Miro (observed) | Firo at `a425018` | Decision | Cluster |
| --- | --- | --- | --- | --- | --- |
| 47 | Activity feed | the comments panel's Board / Team tabs; added / deleted / edited per item [live, partial] | partial — an activity dialog; no panel, no tabs | adapt | C8 |
| 48 | Version history | timeline, preview, restore-into-a-new-board [bundle; panel not opened live] | partial — revision list, restore, download, manual snapshot; no visual preview or diff | adapt | C8 |
| 49 | Comments itself | composer, thread menu, resolve; mentions [live; bundle] | implemented — pins, replies and resolve ([`ADR-0027`](../adr/0027-comments-are-their-own-lane.md)); mentions and read/unread deliberately deferred in code | adopt *(met)* — mentions: adapt later | C8 |

## Home

Code checked: `packages/ui/src/components/BoardHome.tsx`,
`apps/web/BoardHomeScreen.tsx`, `apps/web/board/library.ts`,
`apps/web/components/TemplateModal.tsx`, `apps/web/board/templates.ts`,
`apps/web/board/search.ts`.

| # | Surface | Miro (observed) | Firo at `a425018` | Decision | Cluster |
| --- | --- | --- | --- | --- | --- |
| 50 | Dashboard — recents, starred, folders | recents, starred, spaces [sidebar capture; the dashboard page itself was not visited] | implemented — sections, folders, search, sort | adopt *(met)* | — |
| 51 | Spaces | the spaces model [live, sidebar] | partial — folders carry the need; no spaces | adapt — folders are the Firo shape; the naming diverges | C9 |
| 52 | Search and filters | search; owner filter [live, sidebar] | implemented | adopt *(met)* | — |
| 53 | Board card actions | rename, duplicate, move, star, trash, export [live, sidebar row menu] | implemented | adopt *(met)* | — |
| 54 | Shared-with-me and team surfaces | not observed on this account | absent | adapt — arrives when share links are wired (row 59) | C9 |
| 55 | Template gallery | full-screen modal; categories, search, preview [live, deep pass] | partial — built-ins plus a My-templates tab with search, tag filters and rendered preview art; no category sidebar | adapt — our own templates only | C9 |
| 56 | Save as template | object context menu [live, deep pass] | implemented *(met)* — object context-menu entry | adopt | — |

## Export and share

Code checked: `packages/ui/src/components/ExportModal.tsx`,
`packages/ui/src/components/ImportModal.tsx`, `apps/web/board/batchExport.ts`,
`apps/web/components/ShareModal.tsx`, `apps/web/App.tsx` (ShareModal wiring).

| # | Surface | Miro (observed) | Firo at `a425018` | Decision | Cluster |
| --- | --- | --- | --- | --- | --- |
| 57 | Export | image and PDF from menus and the palette [observed as entries only — dialogs not opened] | implemented — image (PNG/SVG), PDF, archive, CSV, interop; a JPG option is a small follow-up | adopt *(met)* | — |
| 58 | Import | import surfaces [not observed] | implemented — `firo`, Miro backup (`rtb`), Excalidraw, CSV, JSON, with insert / replace / open-new | adopt *(met)* | — |
| 59 | Share dialog — link and roles | Invite tab; owner/team/link access rows [live, deep pass] | partial — the dialog exists but is unwired: no link generation or revocation reaches the server | adapt — wire to real server link state | C9 |
| 60 | Embed and publish tabs | public embed and publish flows [live, tabs only] | absent | omit — needs public content hosting, a new product decision; not the self-hosted shape | — |
| 61 | Share → AI tab | sharing and AI consent surfaces [live, tab only] | absent | omit — credit-metered cloud AI contradicts the no-paid-tier non-goal | — |

## Omissions — out of scope, with reasons

These are locked: widening the list is a new decision, not a wave (the phase's
risk table). Each follows [`../vision.md`](../vision.md) §Non-goals.

| Family | Recorded per command | Reason |
| --- | --- | --- |
| Marketplace apps | every third-party member of the `+` catalog and the tools panel | vision: no marketplace; the catalog ships Firo-native tools only |
| Integration connectors | the `convert to` targets that are integrations (Jira, Azure and the rest) and connector-class catalog members | vision: the integration story is a file format and an API, not a monetised ecosystem |
| Enterprise compliance | SSO, SCIM, audit, residency surfaces | vision; the self-hosted model ("buy Miro if you need them") |
| Real-time video, audio, screen share | huddles, Talk, broadcasting | vision non-goal |
| Metered cloud AI | Miro AI, the Assist group inside context menus, the share dialog's AI tab | vision: no credit meters; Firo ships a local model instead (Phase 10). The Assist actions that have a local equivalent — cluster, summarise — map onto the AI modal, not onto a cloud call |
| Template content | Miro's template catalogue and its art | clean-room: content is not copied; the gallery ships our own templates |
| Talktracks | recording and watching | deferred, not omitted — row 46 |

## Unobserved or unresolved

Recorded rather than assumed; none of these block the clusters above.

- Facilitation **"Notes"** — listed in the menu, not activated (row 38).
- **Board details** panel — a deferred surface, not visited.
- **Arrange and Info submenus** — contents are known from the bundle; the
  rendered menus were not opened (decisions stay in C3, tagged `[bundle]`).
- **Version history panel** — bundle only; the panel was not opened live (row 48).
- **Export dialog options** — not opened; the sweep avoids downloads (row 57).
- **Talktrack recording flow** — out of bounds by the safety rules (row 46).
- **Zoom stops 1200 / 2000** — recorded on 15 October, absent on 18 October; the
  discrepancy is unresolved in the research doc and no decision depends on it.
- The rail's **default** composition — the observed rail is a user's
  arrangement; the arrangement model is settled ([`ADR-0029`](../adr/0029-the-rail-is-a-per-user-arrangement.md)),
  the factory default is documented, not observed.

## Cluster map — 11.3 candidates

The plan's draft list stands except where noted. "ADR gate" says whether 11.2
must accept an ADR before the cluster opens.

| # | Cluster | Rows that target it | ADR gate |
| --- | --- | --- | --- |
| C1 | Rail composition and flyouts | 3, 4, 6, 19, 23, 24 | yes — extends [`ADR-0029`](../adr/0029-the-rail-is-a-per-user-arrangement.md) |
| C2 | Shell keyboard and palette | 8, 9, 15 | yes — extends [`ADR-0030`](../adr/0030-keyboard-parity-with-miro.md) |
| C3 | Context menus — the two lanes | 12, 13 | yes — the lane model |
| C4 | Geometry tokens | 17 | yes — the measured spec as a contract |
| C5 | Objects and formats depth | 14, 20, 27, 28, 29, 31, 32 | yes — format depth is a model change |
| C6 | Media and stickers | 40, 41, 44 | yes — media scope; embeds carry a security question (foreign frames) |
| C7 | Facilitation formats | 33–37 | likely — voting session state must be settled (durable votes vs ephemeral) |
| C8 | Panels, history and activity | 16, 26, 47, 48, 49 | yes — the history lane and the panel shell |
| C9 | Home, templates and share depth | 51, 54, 55, 56, 59 | likely — share links gain server state |
| C10 | Board chrome, menus and navigation | 1, 2, 7, 11 | no |

**Dissolved from the draft list:** the *Tools* cluster ("Card and Comment as
modes; `D`, `C`"). Card-as-a-mode resolves to the records model (row 27);
the comment mode already exists (row 18); the `D` and `C` keys are
[`ADR-0030`](../adr/0030-keyboard-parity-with-miro.md) territory. No separate
cluster.

**What this changes in 11.2.** The ADR list grows beyond the draft: the
side-panel shell (C8) and share-link server state (C9) are contracts the draft
did not name; media (C6) and history (C8) were flagged there already; voting
session state (C7) is new. The matrix's own rows are the evidence for each.

**What 11.3 starts from.** Every adopt and adapt row above, with rows 14 and 17
(C5, C4) as the cross-cutting first moves: the toolbar and the tokens touch every
surface the other clusters build.
