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
| [0018](0018-a-firo-is-a-directory.md) | A `.firo` is a directory: `board.json`, a manifest, and content-addressed assets beside it | Accepted — implemented | 2026-10-02 |
| [0019](0019-keep-read-a-full-snapshot.md) | Keep `FiroDoc.read()` a full snapshot for now; the fix is an interface decision, not an optimisation | Rejected — superseded by [0020](0020-stop-walking-the-whole-document-to-read-it.md) | 2026-10-03 |
| [0020](0020-stop-walking-the-whole-document-to-read-it.md) | Adopt options A and B: memoise `read()` and make its fields lazy getters | Accepted (options A and B; supersedes 0019) | 2026-10-04 |
| [0021](0021-miro-style-shell-and-clean-aesthetic.md) | Adopt a Miro-style UI shell and a clean-by-default canvas aesthetic | Accepted (supersedes the roughness clause of 0014) | 2026-10-13 |
| [0022](0022-ui-package-owns-the-chrome.md) | `@firo/ui` owns the app chrome; `@firo/editor` exposes layout tunnels | Accepted | 2026-10-13 |
| [0023](0023-open-icons-and-ui-typeface.md) | Author our own icon set; adopt Plus Jakarta Sans for the chrome | Accepted (font location superseded by [0024](0024-the-chrome-font-lives-with-the-chrome.md)) | 2026-10-13 |
| [0024](0024-the-chrome-font-lives-with-the-chrome.md) | The chrome's font ships with the chrome, not in the editor's font pipeline | Accepted (supersedes clause 2 of 0023) | 2026-10-14 |
| [0025](0025-the-host-reuses-the-editors-property-controls.md) | Reuse the editor's property controls for the inspector, and expose them as named seams | Accepted (extends the edit list of [0022](0022-ui-package-owns-the-chrome.md) by two exports) | 2026-10-14 |
| [0026](0026-board-home-and-its-index.md) | The board home reads its index from the autosave store, beside the boards it names | Accepted | 2026-10-14 |
| [0027](0027-comments-are-their-own-lane.md) | Comments are their own durable lane, not elements or records | Accepted | 2026-10-14 |
| [0028](0028-project-layer-folders-and-content-search.md) | Folders, starring, and content search in the project layer | Accepted | 2026-10-14 |
| [0029](0029-the-rail-is-a-per-user-arrangement.md) | The creation rail is a per-user arrangement, and Select/Hand is one control | Accepted (restore clause superseded by [0031](0031-rail-slot-kinds-and-the-phase-11-composition.md)) | 2026-10-15 |
| [0030](0030-keyboard-parity-with-miro.md) | Bind `G` and `M`, keep the numeric tool keys, and let the host own its own chrome keys | Accepted (`B` extra moved by [0032](0032-shell-keyboard-model.md)) | 2026-10-15 |
| [0031](0031-rail-slot-kinds-and-the-phase-11-composition.md) | A rail slot carries a tool, a family, an option set or a surface, and Phase 11 completes the composition | Accepted (supersedes the restore clause of [0029](0029-the-rail-is-a-per-user-arrangement.md)) | 2026-10-18 |
| [0032](0032-shell-keyboard-model.md) | Bind `⌘K`, make the shell keyboard-navigable, generate the shortcut reference from the registries, and put single-key shortcuts behind one preference | Accepted (moves the `B` extra of [0030](0030-keyboard-parity-with-miro.md)) | 2026-10-19 |

## Open questions

Deliberately deferred. Each is answered before the phase that depends on it.

| Question | Must be answered by |
| --- | --- |
| Does a projected element (table, mind map) have its own element type, or is it render-only? | **Answered: render-only.** `ProjectionElement` is a description, never persisted and never an element type (`packages/records/src/types.ts`). It carries the `recordId` it came from, so a gesture on it becomes a change to that record rather than to the picture of the record |
| Do projections need multi-level sort and filter composition? | Phase 6 — single-level only so far, and no projection advertises either yet |
| Can a record live in more than one collection, and what merges? | Phase 6. **One, today:** `FiroRecord.collectionId` is a single id. A record in two collections has no merge rule written down, and the honest answer is that nobody has asked yet |
| Is Yjs still the right engine at 10,000 elements with 20 concurrent editors? | **Answered: Yes.** Verified in Phase 9 (`apps/server/tests/ac12.test.ts` and `apps/server/tests/relay.test.ts`). SQLite persistence, compaction, and WebSocket relay handle concurrent editors with low latency and clean merge semantics |
| **Verified licence for every bundled font** — the audit found _no_ licence file for any of them, including the new default. See [`../../FONT-LICENSES.md`](../../FONT-LICENSES.md) and ADR-0014. | **Before any public release** |
| Which OFL hand-drawn face can survive 12 px diagram labels, measured on rendered output rather than assumed? | Phase 2 — **now unblocked.** ADR-0017 keeps the inherited renderer, so there is rendered output to measure, which is what ADR-0014 required and did not have |
| Why is 10% zoom ~30× slower than 50%, with the cost outside the renderer's JavaScript? | Before criterion 5 can be demonstrated. The Chrome trace exists and rules GPU rasterisation out; it has not reproduced a mechanism. See [ADR-0017](0017-do-not-rewrite-the-renderer.md) and [§2.1f](../plans/phase-2-renderer.md#21f--the-trace-exists-now-and-it-did-not-settle-it) |
| Is losing the one-file download worth the readable diff, and is AC-6's `cat` amended or the deviation accepted? **Raised by [ADR-0018](0018-a-firo-is-a-directory.md), which chose the directory and left both to the maintainer.** | Closed — the criterion was amended to say `cat board.json`; Safari folder import is the remaining cost |
| Product name and trademark clearance | Before any public release |
| Should the **canvas** default face move off Nunito to Plus Jakarta Sans now that the chrome uses it? Chrome text is UI labels at UI sizes; canvas text is diagram labels at 12 px and is measured on rendered output. [ADR-0023](0023-open-icons-and-ui-typeface.md) deliberately leaves `DEFAULT_FONT_FAMILY` unchanged. | Phase 7.5 — **answered: no.** The canvas default is measured, not chosen by the chrome's taste. Revisit only against ADR-0013 requirement 4 |
| Plus Jakarta Sans is decided for the chrome but **not yet bundled**, so its licence is not yet stated. A decision without an artefact is not compliance; the font gate (`packages/common/tests/fonts.test.ts`) blocks a shipped binary without OFL text and a `FONT-LICENSES.md` row. | Closed in Phase 7.5 task 7.5.2 — bundled with `OFL.txt` beside it, a `FONT-LICENSES.md` row and hashes, and the gate widened to cover `packages/ui/src/fonts` ([ADR-0024](0024-the-chrome-font-lives-with-the-chrome.md)) |
