# Technical requirements

| Document | Contents |
| --- | --- |
| [`01-stack-and-conventions.md`](01-stack-and-conventions.md) | Languages, build, packages, code conventions |
| [`02-data-model.md`](02-data-model.md) | Elements, records, containers, versioning, migrations |
| [`03-crdt-and-sync.md`](03-crdt-and-sync.md) | Yjs document structure, the ephemeral/durable split, providers |
| [`04-rendering.md`](04-rendering.md) | Canvas architecture, culling, level of detail, caching, hit testing |
| [`05-rich-text.md`](05-rich-text.md) | ProseMirror on canvas, editing overlays, embedding |
| [`06-records-and-projections.md`](06-records-and-projections.md) | Collections, typed columns, the projection interface |
| [`07-persistence-and-formats.md`](07-persistence-and-formats.md) | IndexedDB, the `.firo` format, import and export |
| [`08-server-and-auth.md`](08-server-and-auth.md) | The sync server, accounts, roles, share links |
| [`09-accessibility.md`](09-accessibility.md) | Canvas accessibility tree, keyboard model, ProseMirror and AT |

## The three constraints that shape everything

**1. The document model is a CRDT, and that decision is irreversible.**
Every field we add is a field we must merge. Choosing Yjs
([`ADR-0002`](../adr/0002-yjs-as-concurrency-engine.md)) because it is cheap now
and expensive later is the correct trade only if we are honest about "later"
arriving.

**2. Element data and ephemeral interaction data are different systems.**
A cursor at `(x, y)` and the colour of a rectangle both live in the browser at the
same time. Only one of them is a document. Mixing them is the most common way a
CRDT-backed canvas becomes unusable
([`03-crdt-and-sync.md`](03-crdt-and-sync.md)).

**3. The renderer is a rewrite, and it is the project's risk.**
Everything in [`04-rendering.md`](04-rendering.md) is new code. It is also the only
thing standing between us and a working product. See the Phase 2 gate in
[`../plans/phase-2-renderer.md`](../plans/phase-2-renderer.md).

## What we keep from Excalidraw, and what we throw away

| Keep | Why | Rewrite | Why |
| --- | --- | --- | --- |
| `@excalidraw/math` | Pure geometry, well-typed, hard-won | `App.tsx` (12,942 lines) | The central architectural problem |
| `@excalidraw/common` | Constants, colours, utility types | The two-canvas orchestration | Cache invalidation documented only in comments |
| `element/collision.ts` | Hit testing with a two-tier bail | Element *payload* design | No records, no rich text, no comments |
| `element/shape.ts` | roughjs integration, shape cache | Persistence layer | Elements in `localStorage`; 5–10 MB ceiling |
| `element/renderElement.ts` | Per-element bitmap caching | Collaboration model | Lossy LWW, 128-bit key in the URL |
| `data/restore.ts` | 1,415 lines of migration logic | Firebase integration | The piece we delete outright |
| Fractional indexing | A real CRDT for ordering | Excalidraw+ gating | Not MIT-adjacent code we should carry |
| The `version` / `versionNonce` / `index` triple | Correct copy-on-write discipline | | |
