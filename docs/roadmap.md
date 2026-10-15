# Roadmap

## Phases

Each phase has an **exit criterion**. A phase is done when its criterion is met and demonstrated — not when its code is written.

| # | Phase | Exit criterion |
| --- | --- | --- |
| 0 | [Fork, rebrand, documentation](plans/phase-0-foundation.md) | The fork builds and tests; rebrand complete; Virgil gone; `docs/` navigable |
| 1 | [Document model](plans/phase-1-document-model.md) | `@firo/schema` and `@firo/doc` round-trip a board; migration harness passes against every fixture |
| 2 | [Renderer rewrite](plans/phase-2-renderer.md) | **The gate.** 10,000 elements at 60 fps; output visually equivalent to Excalidraw. Criterion 1 met by the inherited renderer; rewrite cancelled — [`ADR-0017`](adr/0017-do-not-rewrite-the-renderer.md) |
| 3 | [Interaction](plans/phase-3-interaction.md) | Full tool set, selection, transforms, arrow binding, undo/redo, full keyboard |
| 4 | [Miro objects and nesting](plans/phase-4-miro-objects.md) | Sticky notes, cards, frames, sections, connectors, arbitrary nesting |
| 5 | [Facilitation](plans/phase-5-facilitation.md) | Voting, timer, private mode, reactions, presentation mode |
| 6 | [Records and projections](plans/phase-6-records-and-projections.md) | One record store; table and board projections; **AC-3 passes in full.** Canvas projection renderer, switchable Board/Table/Grid views with zero reload, card drag-and-drop, inline cell editing, and document round-trip verified end-to-end |
| 7 | [Persistence and formats](plans/phase-7-persistence-and-formats.md) | **AC-6 and AC-7 pass.** `.firo` round-trips losslessly; offline works fully. The container is now a directory, per [`ADR-0018`](adr/0018-a-firo-is-a-directory.md), so the 50 images AC-6 names are carried — including a test for exactly that board |
| 7.5 | [Miro UI shell](plans/phase-7-5-miro-ui.md) | The board reads as Miro, not Excalidraw: Miro's shell (left creation rail, bottom-right navigation, board menu, right inspector, floating selection toolbar), a clean-default canvas, a board home with a template gallery, and object-anchored comments |
| 8 | [Project layer](plans/phase-8-pm-layer.md) | **Complete.** Board index, folders, tags, content search, activity feed, timeline projection ([`ADR-0028`](adr/0028-project-layer-folders-and-content-search.md)) |
| 9 | [Sync server](plans/phase-9-sync-server.md) | **Complete. AC-12 passes in full.** Single container on port 8080, SQLite persistence, snapshot compaction, WebSocket relay, comment lane enforcement ([`ADR-0027`](adr/0027-comments-are-their-own-lane.md)), presence, share capability links |
| 10 | [AI, MCP, accessibility, desktop](plans/phase-10-ai-mcp-a11y-desktop.md) | **In progress (Wave 1 complete).** Local AI engine (`@firo/ai`), MCP server (`@firo/mcp`), VPAT published, Tauri shell |

Phases 0–9 are complete (Version 1 and Version 2 shipped). **Phase 10 is in progress:**
Wave 1 shipped local-model AI (§10.1, `@firo/ai`) with zero cloud telemetry and
undoable mutations, and the Model Context Protocol stdio server (§10.2, `@firo/mcp`)
with declarative diffable board serialization; accessibility completion (§10.3),
the Tauri desktop shell (§10.4), and doc blocks (§10.5) follow in Wave 2.

## Version boundaries

**Version 1 = Phases 0–7.** A team can run a full workshop on one machine, offline, with no account, and walk away with a file they own.

**Phase 7.5 sits between them.** It is not a version; it is the shell work that makes v1 look like the product it already is, inserted before v2 rather than after because the first impression is not a v2 concern. It is labelled `7.5` rather than renumbering 8–10 so that every existing phase reference — including those inside immutable ADRs — stays valid.

**Version 2 = Phases 8–9.** Self-hosted collaboration, the project layer, the timeline projection, and import from Miro.

**Version 3 = Phase 10.** AI, agent tooling, a published VPAT, and desktop.

Multiplayer is deliberately absent from v1 ([`prd/02-scope.md`](prd/02-scope.md)). The data model is designed for it from day one ([`ADR-0002`](adr/0002-yjs-as-concurrency-engine.md)), so v2 is a deployment change rather than a rewrite.

## The critical path

```
0 ──▶ 1 ──▶ 2 ──▶ 3 ──▶ 4 ──▶ 5 ──▶ 6 ──▶ 7  = v1
                                          │
                                          ▼
                                        7.5     = shell
                                          │
                                          ▼
                                    8 ──▶ 9      = v2
                                          │
                                          ▼
                                        10      = v3
```

**Phase 2 is the project.** Everything before it is setup and everything after it depends on it. Two consequences:

1. **It gets the most scrutiny and the most time.** The gate ([`prd/04-acceptance-criteria.md`](prd/04-acceptance-criteria.md) AC-11) is numeric, not a judgement call.
2. **It has a scheduled fallback.** If the gate is not met at the end of the timebox, we revert to a thinner fork of Excalidraw's renderer and ship a smaller product. This is a planned decision point, stated now so nobody in Phase 3 discovers it was never considered. See [the Phase 2 plan](plans/phase-2-renderer.md#the-fallback).

**The gate did its job, and it said no.** The cost model the rewrite was justified by turned out to be measured on a software rasteriser; on a GPU the inherited renderer already holds 10,000 elements at 60 fps. The fallback did not fire, the rewrite is cancelled, and criterion 5's low-zoom failure is now a bounded investigation rather than an architectural question. See [`ADR-0017`](adr/0017-do-not-rewrite-the-renderer.md).

Phases 4 and 6 are the two largest by feature volume. Phase 6 is the larger architectural risk; Phase 4 is the larger amount of work.

## What is deliberately unsequenced

- **Timeline projection** waits for v2. Four projections before two are proven is how projects ship four half-built widgets.
- **Doc blocks** wait for v3. A structured document editor is a whole product.
- **Tablet optimisation** waits for v3. Tablets are supported from v1; optimised in v3.
- **Templates** are a handful shipped in-app, not a gallery. A marketplace is a community problem we do not have yet.

## Risks, in order of severity

| Risk | Phase | Mitigation |
| --- | --- | --- |
| The renderer rewrite does not achieve the budget | 2 | **Closed.** The gate measured it and the inherited renderer passes; no rewrite. [`ADR-0017`](adr/0017-do-not-rewrite-the-renderer.md) |
| **The accessibility foundation was recorded as complete but was never built** | 3, 10 | **Caught in Phase 10.** `role="application"`, the parallel accessibility tree and `aria-posinset` are absent from `packages/editor`; the Phase 3 status and [`trd/09`](trd/09-accessibility.md) now say so. Built in §10.3 before the VPAT, which must not be published over an untested tree |
| Yjs is the bottleneck at scale | 9 | **Closed.** Phase 9 sync server and AC-12 verified Yjs WebSocket relay, SQLite persistence, and snapshot compaction (`apps/server/tests/ac12.test.ts`) |
| Records and projections ship half-built | 6 | **Closed.** Three projections (Board, Table, Grid) built and tested in `@firo/records`; AC-3 verified end-to-end in `projectionView.test.tsx` |
| A `.firo` cannot carry its images, or cannot be read as text | 7 | **Closed.** Directory format with `board.json` and content-addressed `assets/` implemented ([`ADR-0018`](adr/0018-a-firo-is-a-directory.md)); tested with 50 images |
| **Excalidraw's tunnel API cannot express a left rail** | 7.5 | **Closed.** The five tunnels plus bounded `@firo/editor` edits render the rail, nav toolbar, board menu, inspector and selection toolbar ([`ADR-0022`](adr/0022-ui-package-owns-the-chrome.md)) |
| **The clean default changes reference-image snapshots** | 7.5 | **Closed.** `roughness` is stored per element, so existing boards were unchanged and only *new* elements moved; re-baselined with `yarn test:update` and every diff read |
| ProseMirror overlay alignment is subtly wrong at some zooms | 3, 4 | Explicit multi-zoom test matrix ([`trd/05-rich-text.md`](trd/05-rich-text.md)) |
| **`FiroDoc.read()` is a full O(elements) walk on the keystroke path** | 3, 6 | **Fixed for the repeats; the remaining walk is Option C's job.** `read()` is now memoised against a document revision, every field is a memoised getter, and snapshots are shallow-frozen. `yarn bench:read` at 10,000 elements: `read().collections` 19.7 → **0.44 ms**, `read().meta` 15.3 → **0.35 ms**, `read().elementOrder` 16.3 → **0.48 ms**; per keystroke **32.0 → 17.4 ms**. The freeze costs 1.6 ms, measured over three runs each. Only deltas ([ADR-0020](adr/0020-stop-walking-the-whole-document-to-read-it.md) option C) remove it |
| **A value imported from a package barrel costs minutes of `tsc`** | any | Measured: subpaths used instead of package barrels (`@firo/element/bounds`, etc.) to keep typecheck fast |
| The ephemeral/durable split is violated by a well-meaning feature | any | Two enforcing tests ([`trd/03-crdt-and-sync.md`](trd/03-crdt-and-sync.md)) |
| No legible licensed hand-drawn font exists at 12 px | 0 | Fall back to the clean stack; the aesthetic is recoverable, a licence violation is not |
| Solo maintenance does not sustain the project | all | Accepted knowingly. See [`ADR-0009`](adr/0009-mit-licence-and-donation-funding.md) |

## How we will know it is working

From [`prd/04-acceptance-criteria.md`](prd/04-acceptance-criteria.md):

- **AC-1** — a workshop runs offline with no account
- **AC-2** — no limits, anywhere in the code
- **AC-3** — one record, every view, no reload
- **AC-5** — 10,000 elements at 60 fps on a five-year-old laptop
- **AC-6** — the file survives: readable, diffable, round-trippable
- **AC-7** — local-first is real: zero network requests
- **AC-8** — a full workshop on the keyboard alone
- **AC-11** — the Phase 2 gate
- **AC-12** — `docker compose up` and two browsers collaborating

These are the project's definition of done. Not "shipped" — these.
