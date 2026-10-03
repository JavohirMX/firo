# Data model

## The two kinds of thing

This distinction is the most important idea in the data model and the easiest to
blur. Blurring it is rule 4 in [`../../AGENTS.md`](../../AGENTS.md).

| | **Element** | **Record** |
| --- | --- | --- |
| What it is | A positioned, transformed object on a canvas | A typed row in a collection |
| Has geometry | Yes — x, y, width, height, angle | No |
| Has style | Yes — stroke, fill, roughness | No |
| Lives in | A board's scene | A collection |
| Is rendered by | The canvas renderer | A projection |
| Is edited by | Direct manipulation | A cell, or a card that projects it |
| Identity | `id` | `id` |

A **card on the canvas** is a *projection* of a record. It is not a record, and it
is not an element either — it is the rendering of one. This is why editing a card
on a kanban board changes the record, and why the same task appears in the table.

## Elements

### The base

Inherited from Excalidraw's `_ExcalidrawElementBase` and kept because it is correct.
The three fields at the bottom are the ones that matter:

```ts
type ElementBase = Readonly<{
  id: string
  version: number          // monotonic per element; drives merge
  versionNonce: number     // random per change; deterministic tie-break
  index: FractionalIndex | null   // z-order; a real CRDT for ordering
  // ... geometry, style, timestamps
}>
```

**Keep the triple.** `version` and `versionNonce` give last-writer-wins a
deterministic answer; `index` gives ordering that converges without conflict. We
are replacing Excalidraw's reconciliation wholesale, but these three fields cost
nothing and are used by the CRDT layer, the undo stack, and the renderer cache
alike.

**What we add:**

```ts
type FiroElement = Readonly<{
  // ... ElementBase
  frameId: string | null          // inherited
  containerId: string | null      // NEW: the parent container (FR-16)
  bindings: readonly Binding[]    // NEW: connectors bind to elements, not just arrows
  text?: ProseMirrorDoc           // NEW: rich text, not a string (FR-9)
  recordId?: string               // NEW: this element projects a record (FR-30)
}>
```

**What we remove:** `boundElements` is replaced by a two-way `bindings` relation,
because a Miro-style board has connectors that are not arrows, and because a
one-sided `boundElements` array is the source of most of the complexity in
Excalidraw's 94 KB `binding.ts`.

### Element types

| Type | Phase | Notes |
| --- | --- | --- |
| `shape` | 3 | rectangle, ellipse, diamond, triangle + library |
| `linear` | 3 | line and arrow, with bindings and elbow routing |
| `freedraw` | 3 | inherited renderer |
| `text` | 3 | plain text, no container |
| `image` | 3 | blob reference, not inlined |
| `stickynote` | 4 | Excalidraw already has this type; extend it |
| `card` | 4 | a container, usually projecting a record |
| `frame` | 4 | named, nestable, defines PDF pages and slides |
| `section` | 4 | lighter grouping, no page semantics |
| `connector` | 4 | any-to-any relation with a label |
| `table` | 6 | **a projection instance**, not a data store |
| `mindmap` | 6 | **a projection instance** |
| `doc` | v3 | |

### `table` and `mindmap` are not data

This is worth stating bluntly because it is the mistake most likely to be made:
**a table element on the canvas holds no rows.** It holds a collection id and a
projection configuration. The rows live in `@firo/doc` as records. If a table
element ever stores data, the single-source-of-truth property in AC-3 is gone.

## Containers

Arbitrary nesting ([`ADR-0007`](../adr/0007-arbitrary-container-nesting.md)) is a
property of the tree, not a distinct type.

```
containerId: string | null      // null = top level
```

Any element with `containerId` pointing at a `card`, `frame`, or `section` is a
child of it. Children move and resize with their parent. Collapse is a render-time
flag on the container, not a data change.

**Ordering within a container** uses `index` — the same fractional indexing as
z-order. Weje arrived at the same primitive independently
([`../competitive.md`](../competitive.md) §4), which is reassuring.

**What is a container:** `card`, `frame`, `section`, and any shape promoted to one.
**What is not:** `stickynote`. A sticky note that holds other sticky notes is a
`sect` (section) with a note's styling. Promoting a shape is a type change, and
therefore a schema migration.

**The field is not yet written by the editor.** `containerId` is in the schema,
both directions of the fold carry it (`0c85ad3`), and it survives a reload and
an export round trip — verified in the app by `scripts/verify/framesImages.mjs`.
But nothing a person can do in the app produces it: `addElementsToFrame`
(`packages/element/src/frame.ts`) sets `frameId` and nothing else, so dropping a
shape into a frame yields `frameId`, never `containerId`. Today the field is
reachable only by import or by sync. The interaction that writes it — the drop
that means *nesting*, not *grouping* — is interaction work and belongs to
Phase 3, not to the data model.

## Records

```ts
type Collection = Readonly<{
  id: string
  boardId: string
  name: string
  columns: readonly Column[]
  order: FractionalIndex
  version: number
}>

type Column = Readonly<{
  id: string
  key: string            // stable; renaming the display name is not a rename
  name: string
  type: ColumnType
  options?: readonly SelectOption[]   // for single/multi select
  color?: string
}>

type Record = Readonly<{
  id: string
  collectionId: string
  values: Readonly<Record<string, FieldValue>>   // keyed by Column.key
  created: number
  updated: number
  order: FractionalIndex      // order within a projection
  archived: boolean
}>
```

**Values are keyed by `Column.key`, not `Column.id`.** Keys are stable across column
deletion and re-creation; ids are not. A value whose column has been deleted is
retained, not discarded — deleting a column hides it, and restoring the column
restores the data.

**`order` is per-projection, not per-record.** A record ordered second in a table
and second in a kanban is a coincidence. A projection owns the ordering it uses;
the record store owns identity and field values. This is what makes AC-3 work.

## Versioning and migrations

Every element and record type carries a `version`. Loading a document runs a
migration chain from the stored version to the current one.

**The pattern is inherited from Excalidraw's `restore.ts`, and it is the single
most valuable thing we inherited:**

```ts
const ret = {
  ...original,               // forward-compat: keep unknown keys
  ...normalisedDefaults,     // then apply known defaults
  ...extra,                  // then the migration's specific changes
}
delete ret.legacyField       // remove fields only after migrating them
```

**Rules:**

1. **Never write a migration that drops unrecognised fields.** A file written by a
   newer Firo must open in an older Firo without data loss, as far as possible.
2. **Never mutate in place.** Migrations return new objects; Yjs requires it.
3. **Never use `created` as a clock.** It is client wall-clock, deliberately not a
   Lamport clock. Excalidraw's own source says so.
4. **A forward-version file fails loudly.** Loading a file from a newer version
   must produce a clear error, not a partially-loaded board.
   [`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) AC-10.

**Fixture test per released version.** A file written by version N-1 must load in
version N with no data loss. These fixtures are committed and run in CI. This is
the mechanism that makes the format a promise rather than a hope.

## Undo and history

**Undo is local and per-user.** It is not a document operation and is never synced.
In Yjs terms, undo is tracked with `Y.UndoManager` scoped to the local origin, so
a collaborator's change is never in your undo stack.

**This is a real design constraint on the document structure.** It means every
mutation must be tagged with its origin, which means `@firo/doc` wraps every
write. Direct writes to a `Y.Map` bypass the origin tag and produce undo that
silently does not work. Enforce it with a test — this is one of the four
architectural rules.

## What is deliberately not modelled

| Not modelled | Why |
| --- | --- |
| Comments as elements | They need a separate permission lane and survive their anchor. v2. |
| Votes as elements | Ephemeral-ish session state with a persisted tally. Part of the record store from v1, as a special column. |
| Timer state | A single board-level ephemeral value; never persisted beyond the session. |
| Text as a string, anywhere | [`05-rich-text.md`](05-rich-text.md) |
| A separate "kanban" type | It is a projection. [`06-records-and-projections.md`](06-records-and-projections.md) |
