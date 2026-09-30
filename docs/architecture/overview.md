# System architecture

Descriptive documentation of how the system fits together. For *why* each choice was
made, see [`../trd/`](../trd/). For *what* was decided, see
[`../adr/`](../adr/).

## Layers

```
┌─────────────────────────────────────────────────────────┐
│  apps/web            the PWA                             │
├─────────────────────────────────────────────────────────┤
│  @firo/ui            panels, dialogs, chrome, palette    │
├─────────────────────────────────────────────────────────┤
│  @firo/interact      input state machine, selection,     │
│                      tools, transforms, hit testing      │
├───────────────┬─────────────────────────┬───────────────┤
│  @firo/render │  @firo/records          │  @firo/text   │
│  canvas, LOD,│  collections, columns,  │  ProseMirror  │
│  culling     │  projections            │  on canvas    │
├───────────────┴───────────┬─────────────┴───────────────┤
│  @firo/doc               │  @firo/storage              │
│  the Yjs document        │  IndexedDB, .firo, I/O      │
├──────────────────────────┴──────────────────────────────┤
│  @firo/schema        elements, records, migrations       │
├─────────────────────────────────────────────────────────┤
│  @firo/common      constants, colours, utility types    │
├─────────────────────────────────────────────────────────┤
│  @firo/geometry    points, vectors, curves, polygons     │
└─────────────────────────────────────────────────────────┘
```

`@firo/sync` sits beside `@firo/storage` and is the only package that knows about
providers. `apps/server` depends on `@firo/schema` and `y-protocols` and nothing in
the UI layer.

Dependencies point **downward only**, and a circular import fails CI
([ADR-0010](../adr/0010-keep-upstream-tooling.md)). This matters more than usual
because the inherited Excalidraw packages are not cleanly layered and it would be easy
to reintroduce the coupling we removed.

## The four invariants

These are the rules a future contributor is most likely to break by accident, and
each has a test that fails when it is broken.

### 1. Ephemeral state never enters the document

Cursor position, in-progress drags, live selection, hover and the laser pointer go to
Yjs **awareness**. They are never persisted, never in history, never in a file.

*Test:* a synthetic five-second drag produces zero document updates.

Full table: [`../trd/03-crdt-and-sync.md`](../trd/03-crdt-and-sync.md).

### 2. Every schema change ships with a migration

Adding, removing or renaming a field requires a migration function and a fixture
test loading a file written by the previous version.

*Test:* every committed format fixture loads without loss; a forward-version file
fails loudly.

The pattern — spread the original first to preserve unknown keys, then normalise — is
inherited from Excalidraw's `data/restore.ts` and is the most valuable thing we
inherited.

### 3. Text is ProseMirror, never a string

Any text-bearing field stores a ProseMirror document. Rendering is on canvas;
editing mounts a DOM editor positioned from the same layout.

*Test:* a schema walk that fails if any text field is typed `string`.

Deliberate exceptions: frame names, connector labels, file paths.

### 4. Records are not elements

A **record** is a typed row in a collection with no geometry and no style. An
**element** is a positioned object on a canvas. A card on the canvas is a *projection*
of a record.

*Test:* no `kanban` element type exists; a `table` element holds no row data.

## Data flow

**Reading.** A change arrives in the Yjs document → `@firo/doc` emits an observation
→ `@firo/records` recomputes affected projections (O(changed), not O(all)) →
`@firo/interact` updates its state machine → `@firo/render` invalidates the cache for
changed elements only → the next frame draws.

**Writing.** A user gesture → the input state machine interprets it →
`@firo/doc.commit()` writes one transaction tagged with the local origin → Yjs
persists to IndexedDB → observers fire. Remote changes arrive over the same path but
are **not** undoable and **not** re-broadcast.

**Rendering.** Input events set a dirty flag and schedule a frame. The frame queries
the spatial index for visible elements, resolves shapes from cache, blits cached
bitmaps, and draws the overlay last.

## Where the interesting problems are

| Concern | Where | Why it is hard |
| --- | --- | --- |
| Rendering at scale | [`../trd/04-rendering.md`](../trd/04-rendering.md) | Culling, LOD, cache invalidation, and the rewritten orchestration |
| Merge semantics | [`../trd/03-crdt-and-sync.md`](../trd/03-crdt-and-sync.md) | The ephemeral/durable split, and structural merge on rich text |
| Text positioning | [`../trd/05-rich-text.md`](../trd/05-rich-text.md) | Canvas and DOM must agree at every zoom |
| Record projections | [`../trd/06-records-and-projections.md`](../trd/06-records-and-projections.md) | O(changed) not O(all), and one identity across views |
| Format longevity | [`../trd/07-persistence-and-formats.md`](../trd/07-persistence-and-formats.md) | Every field is a merge case, forever |
| Canvas accessibility | [`../trd/09-accessibility.md`](../trd/09-accessibility.md) | A bitmap with a hit-test layer, made navigable |

## What we inherited and what we are replacing

| Inherited | Status |
| --- | --- |
| `@excalidraw/math` | Kept verbatim |
| `@excalidraw/common` | Kept, renamed |
| `element/collision.ts` | Kept |
| `element/shape.ts` | Kept |
| `element/renderElement.ts` | Kept |
| `element/binding.ts` | Kept, adapted to two-way bindings |
| `data/restore.ts` | Kept as the migration pattern |
| `fractional-indexing` (CC0) | Kept |
| `App.tsx` | **Discarded** — 12,942 lines |
| `scene/Renderer.ts` | **Discarded** — nonce invalidation |
| Firebase | **Deleted** — NFR-3 |
| Socket.io collaboration | **Deleted** — replaced by Yjs |
| Excalidraw+ gating | **Deleted** — not ours to carry |
| Virgil font | **Deleted** — [licensing](../adr/0013-replace-the-virgil-font.md) |

## Build and test

Yarn 1 workspaces, Vite 5 for the app, esbuild for packages, vitest with jsdom and
`vitest-canvas-mock` ([ADR-0010](../adr/0010-keep-upstream-tooling.md)).

Two categories of test that matter more than the rest:

- **Reference images.** Renderer output is compared against Excalidraw's for inherited
  element types, in a real headless browser. `vitest-canvas-mock` tests behaviour,
  not appearance.
- **Performance as a test.** The Phase 2 gate is numeric, so a regression is a red
  test rather than a benchmark someone remembers to run.
