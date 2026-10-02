# Roadmap

## Phases

Each phase has an **exit criterion**. A phase is done when its criterion is met and
demonstrated — not when its code is written.

| # | Phase | Exit criterion |
| --- | --- | --- |
| 0 | [Fork, rebrand, documentation](plans/phase-0-foundation.md) | The fork builds and tests; rebrand complete; Virgil gone; `docs/` navigable |
| 1 | [Document model](plans/phase-1-document-model.md) | `@firo/schema` and `@firo/doc` round-trip a board; migration harness passes against every fixture |
| 2 | [Renderer rewrite](plans/phase-2-renderer.md) | **The gate.** 10,000 elements at 60 fps; output visually equivalent to Excalidraw. Criterion 1 met by the inherited renderer; rewrite cancelled — [`ADR-0017`](adr/0017-do-not-rewrite-the-renderer.md) |
| 3 | [Interaction](plans/phase-3-interaction.md) | Full tool set, selection, transforms, arrow binding, undo/redo, full keyboard |
| 4 | [Miro objects and nesting](plans/phase-4-miro-objects.md) | Sticky notes, cards, frames, sections, connectors, arbitrary nesting |
| 5 | [Facilitation](plans/phase-5-facilitation.md) | Voting, timer, private mode, reactions, presentation mode |
| 6 | [Records and projections](plans/phase-6-records-and-projections.md) | One record store; table and board projections; **AC-3 passes** |
| 7 | [Persistence and formats](plans/phase-7-persistence-and-formats.md) | **AC-6 and AC-7 pass.** `.firo` round-trips losslessly; offline works fully |
| 8 | [Project layer](plans/phase-8-pm-layer.md) | Board index, folders, tags, search, activity |
| 9 | [Sync server](plans/phase-9-sync-server.md) | **AC-12 passes.** One container, local accounts, roles, presence |
| 10 | [AI, MCP, accessibility, desktop](plans/phase-10-ai-mcp-a11y-desktop.md) | Local-model AI, MCP server, VPAT published, Tauri shell |

## Version boundaries

**Version 1 = Phases 0–7.** A team can run a full workshop on one machine, offline,
with no account, and walk away with a file they own.

**Version 2 = Phases 8–9.** Self-hosted collaboration, the project layer, the timeline
projection, and import from Miro.

**Version 3 = Phase 10.** AI, agent tooling, a published VPAT, and desktop.

Multiplayer is deliberately absent from v1
([`prd/02-scope.md`](prd/02-scope.md)). The data model is designed for it from day one
([`ADR-0002`](adr/0002-yjs-as-concurrency-engine.md)), so v2 is a deployment change
rather than a rewrite.

## The critical path

```
0 ──▶ 1 ──▶ 2 ──▶ 3 ──▶ 4 ──▶ 5 ──▶ 6 ──▶ 7  = v1
                                          │
                                          ▼
                                    8 ──▶ 9      = v2
                                          │
                                          ▼
                                        10      = v3
```

**Phase 2 is the project.** Everything before it is setup and everything after it
depends on it. Two consequences:

1. **It gets the most scrutiny and the most time.** The gate
   ([`prd/04-acceptance-criteria.md`](prd/04-acceptance-criteria.md) AC-11) is
   numeric, not a judgement call.
2. **It has a scheduled fallback.** If the gate is not met at the end of the timebox,
   we revert to a thinner fork of Excalidraw's renderer and ship a smaller product.
   This is a planned decision point, stated now so nobody in Phase 3 discovers it was
   never considered. See
   [the Phase 2 plan](plans/phase-2-renderer.md#the-fallback).

**The gate did its job, and it said no.** The cost model the rewrite was justified by
turned out to be measured on a software rasteriser; on a GPU the inherited renderer
already holds 10,000 elements at 60 fps. The fallback did not fire, the rewrite is
cancelled, and criterion 5's low-zoom failure is now a bounded investigation rather
than an architectural question. See [`ADR-0017`](adr/0017-do-not-rewrite-the-renderer.md).

Phases 4 and 6 are the two largest by feature volume. Phase 6 is the larger
architectural risk; Phase 4 is the larger amount of work.

## What is deliberately unsequenced

- **Timeline projection** waits for v2. Four projections before two are proven is how
  projects ship four half-built widgets.
- **Doc blocks** wait for v3. A structured document editor is a whole product.
- **Tablet optimisation** waits for v3. Tablets are supported from v1; optimised in
  v3.
- **Templates** are a handful shipped in-app, not a gallery. A marketplace is a
  community problem we do not have yet.

## Risks, in order of severity

| Risk | Phase | Mitigation |
| --- | --- | --- |
| The renderer rewrite does not achieve the budget | 2 | **Closed.** The gate measured it and the inherited renderer passes; no rewrite. [`ADR-0017`](adr/0017-do-not-rewrite-the-renderer.md) |
| Yjs is the bottleneck at scale | 9 | Measure in Phase 6; Loro's API is compatible for a bounded swap ([`ADR-0002`](adr/0002-yjs-as-concurrency-engine.md)) |
| Records and projections ship half-built | 6 | Two proven projections beat four broken ones. Scope is set in [`prd/02-scope.md`](prd/02-scope.md) |
| ProseMirror overlay alignment is subtly wrong at some zooms | 3, 4 | Explicit multi-zoom test matrix ([`trd/05-rich-text.md`](trd/05-rich-text.md)) |
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
