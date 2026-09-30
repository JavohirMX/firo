# Architecture decision records

An ADR captures a single architectural decision, the context behind it, the options
considered, and the consequences. The collection of ADRs is the project's decision
log.

**Accepted ADRs are immutable.** When a decision changes, write a new ADR that
supersedes the old one. The old file stays, because the chain is the value: six
months later, reading ADR-0002 tells you what was true when it was written, and that
is the point.

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

## Open questions

Deliberately deferred. Each is answered before the phase that depends on it.

| Question | Must be answered by |
| --- | --- |
| Does a projected element (table, mind map) have its own element type, or is it render-only? | Phase 6 start |
| Do projections need multi-level sort and filter composition? | Phase 6 |
| Can a record live in more than one collection, and what merges? | Phase 6 |
| Is Yjs still the right engine at 10,000 elements with 20 concurrent editors? | Phase 9 |
| Font licence for the hand-drawn default | Phase 0 |
| Product name and trademark clearance | Before any public release |
