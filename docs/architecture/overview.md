# System architecture

Descriptive documentation of how the system fits together. For *why* each choice was
made, see [`../trd/`](../trd/). For *what* was decided, see
[`../adr/`](../adr/).

**This describes the system as it is, not as it is planned.** Where a package below is
marked *planned*, it does not exist yet and nothing imports it. The target layering is
in [`../trd/01-stack-and-conventions.md`](../trd/01-stack-and-conventions.md).

## Layers, as built

```
┌─────────────────────────────────────────────────────────┐
│  apps/web            the PWA, the menu, autosave,        │
│                      .firo export and import             │
├─────────────────────────────────────────────────────────┤
│  @firo/editor        the inherited Excalidraw editor:    │
│                      App, renderer, interaction, chrome  │
├─────────────────────────────────────────────────────────┤
│  @firo/board         the seam. Projects the document     │
│                      onto the editor's vocabulary, and   │
│                      the editor back onto the document   │
├───────────────┬─────────────────────────────────────────┤
│  @firo/doc    │  @firo/element   geometry, hit testing, │
│  the Yjs     │                  rendering, mutation     │
│  document,    ├─────────────────────────────────────────┤
│  write guard  │  @firo/common    constants, colours,     │
│               │                  utility types, fonts    │
├───────────────┴─────────────────────────────────────────┤
│  @firo/schema     elements, records, migrations, the    │
│                   shared vocabulary of the two halves    │
├─────────────────────────────────────────────────────────┤
│  @firo/math, @firo/fractional-indexing,                 │
│  @firo/laser-pointer, @firo/utils — kept from upstream  │
└─────────────────────────────────────────────────────────┘
```

Dependencies point **downward only**, and a circular import fails CI
([ADR-0010](../adr/0010-keep-upstream-tooling.md)). This matters more than usual
because the inherited Excalidraw packages are not cleanly layered and it would be easy
to reintroduce the coupling we removed.

## The seam, and why it is a package

`@firo/doc` knows about Yjs, transactions and undo, and nothing about drawing.
`@firo/element` knows about canvases, hit testing and rendering, and nothing about
CRDTs. **Neither is allowed to know about the other.** `@firo/schema` is the vocabulary
they share, and `@firo/board` is the only place the two meet.

The rule that governs the seam: **the document is authoritative, and the editor holds
a lossy projection of it.** The projection is lossy in documented per-field ways —
Firo's `Binding` carries `focus` and `gap` while Excalidraw's `boundElements` carries
neither — so nothing in `@firo/board` ever writes a whole editor element back. Sync is
field-by-field, for editor-owned fields only.

This is the same shape as the single write path
([ADR-0016](../adr/0016-enforce-the-write-path-with-a-proxy.md)): one place durable
state changes, and `@firo/board` is not it.

## The target layering, for reference

Drawn as intended, none of it built yet. Recorded here so the current shape is
readable as a stage rather than as the plan:

| Package | Purpose | State |
| --- | --- | --- |
| `@firo/ui` | panels, dialogs, chrome, palette | planned — chrome is still `@firo/editor`'s `LayerUI` |
| `@firo/interact` | input state machine, selection, transforms | planned — currently inside `components/App.tsx` |
| `@firo/render` | canvas, level of detail, culling | **cancelled** — [`ADR-0017`](../adr/0017-do-not-rewrite-the-renderer.md) |
| `@firo/records` | collections, columns, projections | planned — Phase 6 |
| `@firo/text` | ProseMirror on canvas | planned — Phases 3 and 4 |
| `@firo/storage` | IndexedDB, `.firo`, I/O | partly built — in `apps/web/board/` |
| `@firo/sync` | providers, and only providers | planned — Phase 9 |
| `apps/server` | the relay | planned — Phase 9 |


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

Deliberate exceptions, each with a stated reason in the test's allow-list: **sticky
notes** and **free-standing text**, both of which the editor's own element types hold
as plain strings. A frame name, a connector label and a file path are not
text-bearing *elements*, so they do not appear here.

### 4. Records are not elements

A **record** is a typed row in a collection with no geometry and no style. An
**element** is a positioned object on a canvas. A card on the canvas is a *projection*
of a record.

*Test:* no `kanban` element type exists; a `table` element holds no row data.

## Data flow

**Writing.** A user gesture lands in the editor → `BoardSync` folds the editor's
elements into the document, field by field, for editor-owned fields only →
`@firo/doc.commit()` writes one transaction tagged with the local origin → Yjs
persists to IndexedDB → observers fire. Remote changes arrive over the same path but
are **not** undoable and **not** re-broadcast.

**Reading.** A document change → `@firo/doc` emits an observation → `@firo/board`
re-projects the affected elements into editor elements → `updateScene` with
`captureUpdate: NEVER`, so a document change never enters the editor's own undo stack
→ the next frame draws.

The loop this closes is the interesting part. Editor changes are pushed into the
document and document changes are pushed into the editor, so without an echo guard the
two would drive each other. `BoardSync` recognises its own writes coming back and
commits nothing for them.

**Rendering.** Input events set a dirty flag and schedule a frame. The frame culls
with a linear scan over the scene, resolves shapes from cache, blits cached bitmaps,
and draws the interactive overlay last. The spatial index and level-of-detail ladder
this document previously described were cancelled — see
[`ADR-0017`](../adr/0017-do-not-rewrite-the-renderer.md).

## Where the interesting problems are

| Concern | Where | Why it is hard |
| --- | --- | --- |
| Rendering at scale | [`../trd/04-rendering.md`](../trd/04-rendering.md) | Cache invalidation and the 10% zoom stall, which is still unexplained |
| Merge semantics | [`../trd/03-crdt-and-sync.md`](../trd/03-crdt-and-sync.md) | The ephemeral/durable split, and structural merge on rich text |
| Text positioning | [`../trd/05-rich-text.md`](../trd/05-rich-text.md) | Canvas and DOM must agree at every zoom |
| Record projections | [`../trd/06-records-and-projections.md`](../trd/06-records-and-projections.md) | O(changed) not O(all), and one identity across views |
| Format longevity | [`../trd/07-persistence-and-formats.md`](../trd/07-persistence-and-formats.md) | Every field is a merge case, forever |
| Canvas accessibility | [`../trd/09-accessibility.md`](../trd/09-accessibility.md) | A bitmap with a hit-test layer, made navigable |

## What we inherited and what we are replacing

| Inherited | Status |
| --- | --- |
| `@firo/math` | Kept verbatim |
| `@firo/common` | Kept, renamed |
| `element/collision.ts` | Kept |
| `element/shape.ts` | Kept |
| `element/renderElement.ts` | Kept — [`ADR-0017`](../adr/0017-do-not-rewrite-the-renderer.md) |
| `element/binding.ts` | Kept; being adapted to two-way bindings, which is Phase 3 work |
| `data/restore.ts` | Kept as the migration pattern |
| `fractional-indexing` (CC0) | Kept |
| `components/App.tsx` | **Kept, 12,946 lines, unmodified.** An earlier version of this table recorded it as discarded. It is not, and it is the largest piece of debt in the repository |
| `scene/Renderer.ts` | **Kept, unmodified.** Same correction: its nonce invalidation is undocumented, and it is still the render loop |
| Firebase | **Deleted** — NFR-3 |
| Socket.io collaboration | **Deleted** — replaced by Yjs |
| Excalidraw+ gating | **Deleted** — not ours to carry |
| Virgil and Excalifont | **Deleted** — [licensing](../adr/0013-replace-the-virgil-font.md) |

## Build and test

Yarn 1 workspaces, Vite 5 for the app, esbuild for packages, vitest with jsdom and
`vitest-canvas-mock` ([ADR-0010](../adr/0010-keep-upstream-tooling.md)).

Two categories of test that matter more than the rest:

- **Reference images.** Renderer output is compared against Excalidraw's for inherited
  element types, in a real headless browser. `vitest-canvas-mock` tests behaviour,
  not appearance.
- **Performance as a test.** The Phase 2 gate is numeric, so a regression is a red
  test rather than a benchmark someone remembers to run.
