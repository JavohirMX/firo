# Architecture decision records

An ADR captures a single architectural decision, the context behind it, the options considered, and the consequences. The collection of ADRs is the project's decision log.

**Accepted ADRs are immutable.** When a decision changes, write a new ADR that supersedes the old one. The old file stays, because the chain is the value: six months later, reading ADR-0002 tells you what was true when it was written, and that is the point.

## Format

We use [MADR](https://adr.github.io/madr/) 4.0 — Markdown Any Decision Records.

```markdown
---
status: proposed | accepted | superseded by ADR-XXXX
date: YYYY-MM-DD
deciders: <names or roles>
---

# <Title in the form "Use X for Y">

## Context and Problem Statement

## Decision Drivers

## Considered Options

## Decision Outcome

## Consequences

## Confirmation

## Pros and Cons of the Options

## More Information
```

## Index

| # | Decision | Status | Date |
| --- | --- | --- | --- |
| [0000](0000-record-architecture-decisions.md) | Record architecture decisions | Accepted | 2026-09-30 |
| [0001](0001-fork-excalidraw-and-refactor-aggressively.md) | Fork Excalidraw and refactor aggressively; stop tracking upstream | Accepted | 2026-09-30 |
| [0002](0002-yjs-as-concurrency-engine.md) | Use Yjs as the concurrency engine from day one | Accepted | 2026-09-30 |
| [0003](0003-records-with-switchable-projections.md) | One record store with switchable projections | Accepted | 2026-09-30 |
| [0004](0004-prosemirror-for-rich-text.md) | Use ProseMirror for all rich text | Accepted | 2026-09-30 |
| [0005](0005-indexeddb-via-idb-keyval.md) | IndexedDB via idb-keyval for local persistence | Accepted | 2026-09-30 |
| [0006](0006-one-board-unlimited-frames.md) | One board, unlimited frames | Accepted | 2026-09-30 |
| [0007](0007-arbitrary-container-nesting.md) | Arbitrary container nesting | Accepted | 2026-09-30 |
| [0008](0008-local-accounts-on-self-hosted-server.md) | Local accounts on the self-hosted server | Accepted | 2026-09-30 |
| [0009](0009-mit-licence-and-donation-funding.md) | MIT licence, free forever, donations only | Accepted | 2026-09-30 |
| [0010](0010-keep-upstream-tooling.md) | Keep Yarn v1 workspaces and Vite 5 | Accepted | 2026-09-30 |
| [0011](0011-plain-markdown-docs.md) | Plain Markdown docs, separate from inherited `dev-docs/` | Accepted | 2026-09-30 |
| [0012](0012-no-ai-in-v1.md) | No AI in version 1 | Accepted | 2026-09-30 |
| [0013](0013-replace-the-virgil-font.md) | Replace the Virgil font | Accepted | 2026-09-30 |
| [0014](0014-font-position-after-phase-0.md) | Ship Nunito as the default face, keep roughness, and treat the font audit as a release blocker | Accepted (supersedes parts of 0013) | 2026-09-30 |
| [0015](0015-delete-inherited-dev-docs.md) | Delete inherited `dev-docs/` | Accepted (supersedes part of 0011) | 2026-09-30 |
| [0016](0016-enforce-the-write-path-with-a-proxy.md) | Enforce the write path with a Proxy, not a `beforeTransaction` listener | Accepted | 2026-09-30 |
| [0017](0017-do-not-rewrite-the-renderer.md) | Keep the inherited renderer; the rewrite was justified by a measurement artefact | Accepted | 2026-10-02 |
| [0018](0018-a-firo-is-a-directory.md) | A `.firo` is a directory: `board.json`, a manifest, and content-addressed assets beside it | Proposed — two clauses awaiting sign-off | 2026-10-02 |
| [0019](0019-keep-read-a-full-snapshot.md) | Keep `FiroDoc.read()` a full snapshot for now; the fix is an interface decision, not an optimisation | Proposed — needs the maintainer to choose between six options | 2026-10-03 |

## Open questions

Deliberately deferred. Each is answered before the phase that depends on it.

| Question | Must be answered by |
| --- | --- |
| Does a projected element (table, mind map) have its own element type, or is it render-only? | Phase 6 start |
| Do projections need multi-level sort and filter composition? | Phase 6 |
| Can a record live in more than one collection, and what merges? | Phase 6 |
| Is Yjs still the right engine at 10,000 elements with 20 concurrent editors? | Phase 9 |
| **Verified licence for every bundled font** — the audit found _no_ licence file for any of them, including the new default. See [`../../FONT-LICENSES.md`](../../FONT-LICENSES.md) and ADR-0014. | **Before any public release** |
| Which OFL hand-drawn face can survive 12 px diagram labels, measured on rendered output rather than assumed? | Phase 2 — **now unblocked.** ADR-0017 keeps the inherited renderer, so there is rendered output to measure, which is what ADR-0014 required and did not have |
| Why is 10% zoom ~30× slower than 50%, with the cost outside the renderer's JavaScript? | Before criterion 5 can be demonstrated. The Chrome trace exists and rules GPU rasterisation out; it has not reproduced a mechanism. See [ADR-0017](0017-do-not-rewrite-the-renderer.md) and [§2.1f](plans/phase-2-renderer.md#21f--the-trace-exists-now-and-it-did-not-settle-it) |
| Is losing the one-file download worth the readable diff, and is AC-6's `cat` amended or the deviation accepted? **Raised by [ADR-0018](0018-a-firo-is-a-directory.md), which chose the directory and left both to the maintainer.** | Before the Phase 7 exit criterion |
| Product name and trademark clearance | Before any public release |
