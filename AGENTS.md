# AGENTS.md

Operating rules for AI coding agents working in this repository.

This file is **operational policy**, not a human-facing README. It exists to be executed, not read for inspiration. If an instruction here cannot be verified by running a command, it does not belong here.

## Repository status

**Version 1 complete; Phase 7.5 complete; Phase 8 in progress.** Phases 0 through 7.5 are complete, built, and tested. The repository is a fully operational Yarn v1 classic workspaces monorepo containing 13 packages and apps: a Miro-shaped shell in `@firo/ui`, a clean-default canvas, a board home, and local-first comments ([ADR-0021](docs/adr/0021-miro-style-shell-and-clean-aesthetic.md), [ADR-0022](docs/adr/0022-ui-package-owns-the-chrome.md), [ADR-0023](docs/adr/0023-open-icons-and-ui-typeface.md), [ADR-0027](docs/adr/0027-comments-are-their-own-lane.md)). Phase 8 (the project layer) has begun: the board index — folders, starring, duplication — and cross-board content search shipped ([ADR-0028](docs/adr/0028-project-layer-folders-and-content-search.md)); element tags, the activity feed and the timeline projection remain (§8.3–§8.5 of [`docs/plans/phase-8-pm-layer.md`](docs/plans/phase-8-pm-layer.md)).

All verification checks below are active and enforced.

```sh
# Typecheck
yarn test:typecheck

# Tests
yarn test

# Every internal doc link resolves
node -e '/* internal link check */'

# No placeholder markers left behind
grep -rniE '\b(TODO|FIXME|XXX|TBD)\b' docs/ README.md
```

## Commands

Authoritative once the fork exists. Upstream Excalidraw uses Yarn v1 classic workspaces and Vite 5; we keep both deliberately ([`ADR-0010`](docs/adr/0010-keep-upstream-tooling.md)).

| Task | Command |
| --- | --- |
| Install | `yarn install --frozen-lockfile` |
| Dev server | `yarn start` |
| Build packages | `yarn build:packages` |
| Build app | `yarn build:app` |
| Typecheck | `yarn test:typecheck` |
| Unit tests | `yarn test` |
| Update test snapshots | `yarn test:update` |
| Lint and fix | `yarn fix` |
| Full CI check | `yarn test:typecheck && yarn test && yarn fix --check` |

**Run `yarn test:update` before every commit.** Upstream snapshot tests fail intentionally when rendering changes. Never delete a failing snapshot without reading the diff.

## Architecture — the four rules that are easy to break

These are not style preferences. Violating them breaks correctness in ways that tests will not catch.

### 1. Ephemeral state never enters the Yjs document

Cursor position, in-progress drags, live selection, hover, and the laser pointer go to **Yjs awareness only**. They are never persisted, never in history, never synced as document updates.

Only committed operations (pointer-up, keypress commit, property change) touch `@firo/doc`. Getting this wrong floods the CRDT with update traffic and makes the document unusable.

Excalidraw already draws this line: its `onIncrement` hook distinguishes `DurableIncrement` from `EphemeralIncrement`. Preserve that distinction. See [`docs/trd/03-crdt-and-sync.md`](docs/trd/03-crdt-and-sync.md).

### 2. Every schema change ships with a migration

Elements and records are versioned. Adding, removing, or renaming a field requires a migration function in `@firo/schema` **and** a test that loads a fixture written by the previous version.

Port the pattern from `packages/editor/data/restore.ts` upstream: spread the original object first to preserve unknown keys, then overwrite with normalised values. Never write a migration that drops unrecognised fields — that is how forward-compatibility dies. See [`docs/trd/02-data-model.md`](docs/trd/02-data-model.md).

### 3. Text is ProseMirror, not a string

Any element with editable rich text stores a ProseMirror document, never a plain string. Rendering happens on canvas; editing mounts a ProseMirror instance positioned over the canvas-rendered text. Do not "simplify" a rich text field to a string. See [`docs/trd/05-rich-text.md`](docs/trd/05-rich-text.md).

### 4. Records are not elements

A **record** is a typed row in a collection. An **element** is a positioned object on a canvas. Projections (table, grid, kanban, timeline) are _views over records_, not element types. If you are about to add a `kanban` element type, stop and read [`docs/trd/06-records-and-projections.md`](docs/trd/06-records-and-projections.md).

## Boundaries — do not touch without an ADR

| Path | Rule |
| --- | --- |
| `packages/geometry/`, `packages/common/` | Near-verbatim from Excalidraw. Keep diffs to upstream small. No behavioural changes without an ADR. |
| `docs/adr/*.md` | Accepted ADRs are **immutable**. To change a decision, write a new ADR that supersedes it. |
| `LICENSE`, `NOTICE` | Never remove or alter the Excalidraw copyright notice. |
| Any font file | Virgil and Excalifont are removed for licensing reasons ([`ADR-0013`](docs/adr/0013-replace-the-virgil-font.md), [ADR-0014](docs/adr/0014-font-position-after-phase-0.md)). Do not reintroduce them, and do not add any font whose licence is not recorded in [`FONT-LICENSES.md`](FONT-LICENSES.md) with its licence text committed alongside the binary. `packages/common/tests/fonts.test.ts` enforces both halves of that rule — do not weaken it |
| `packages/*/package.json` workspace versions | Upstream pins them exactly (`"0.18.0"`, not `^`) for reproducible resolution. Do not switch to ranges. |

## Upstream policy

We forked Excalidraw and are **refactoring aggressively**. We do not track upstream releases and we do not merge them ([`ADR-0001`](docs/adr/0001-fork-excalidraw-and-refactor-aggressively.md)).

This means:

- Do not attempt to keep changes small or "mergeable with upstream".
- Do not add `git remote upstream` or cherry-pick upstream commits.
- Porting an upstream _idea_ is welcome. Copying upstream _structure_ is not a goal.
- When you copy code, cite the origin file path in the commit message and keep the MIT notice intact.

## Conventions

- **TypeScript strict mode.** No `any` in our own packages. Branded types for coordinates and angles, following `@firo/math`.
- **SCSS** for styles, co-located with components, themed via CSS custom properties. No CSS-in-JS, no Tailwind.
- **Browser globals:** use `app.ownerDocument` / `app.ownerWindow`, never bare `document` or `window`, in library code. This is an inherited upstream rule and it exists so the editor can be embedded in iframes and shadow roots.
- **Utility types:** use `Merge<Base, Overrides>` from `@firo/common/utility-types` rather than `Omit<Base, keyof Overrides> & Overrides`.
- Tests use **vitest** with jsdom and `vitest-canvas-mock`. Match the existing assertion style in the file you are editing.

## Definition of done

A change is complete when:

1. `yarn test:typecheck` passes.
2. `yarn test` passes, including new tests for the behaviour you added.
3. `yarn fix` has been run and reports no changes.
4. Any schema change has a migration and a fixture test.
5. Any architectural decision that a future contributor would find surprising is captured — as an ADR if it constrains the whole system, as a code comment if it is local.

**Do not report work as done without running the commands and showing the output.** If you could not run them, say so explicitly.

## When blocked

Stop and report rather than improvising. Specifically, escalate to the human before:

- Changing the Yjs document structure or the ephemeral/durable split.
- Adding a dependency that ships a non-permissive licence.
- Renaming anything in the public file format.
- Making a change that would make a future upstream merge _easier_ — we have explicitly decided that is not a goal.
