# Phase 1 — Document model

**Goal:** a Yjs-backed document that a board is stored in, with versioning and
migrations, and no UI at all.

Building this before the renderer is deliberate. The data model is the most expensive
thing to change later
([ADR-0002](../adr/0002-yjs-as-concurrency-engine.md)), and it is pure logic that can
be tested exhaustively without a canvas.

## Exit criterion

- A board round-trips through `@firo/doc` → Yjs → IndexedDB → `@firo/doc` with no
  data loss
- Every element type serialises and deserialises losslessly
- The migration harness loads every committed fixture, from version 1 to current
- A synthetic 5-second drag produces **zero** document updates
- Undo is local: a simulated remote update does not appear in the local undo stack
- `doc.commit()` is the only write path, enforced by a test

## Tasks

### 1.1 — `@firo/schema`

Port the element base from Excalidraw, keeping `version`, `versionNonce` and `index`:

```ts
type ElementBase = Readonly<{
  id: string
  version: number
  versionNonce: number
  index: FractionalIndex | null
  // ... geometry, style, timestamps
}>
```

Add the Firo fields: `containerId`, `bindings`, `text` (ProseMirror), `recordId`.

**Extend, do not reinvent,** the existing `stickynote` type — Excalidraw already has
one and it is MIT.

Build the type registry: each element type declares its props schema, its migrations,
and its validation.

### 1.2 — Migrations

Port the pattern from `data/restore.ts` (1,415 lines of upstream precedent):

```ts
const migrated = { ...original, ...normalisedDefaults, ...specificChanges }
delete migrated.legacyField
```

Rules, in order of how often they are violated:

1. **Never drop an unrecognised field.** Forward compatibility dies here.
2. **Never mutate in place.** Yjs requires new objects.
3. **Never use `created` as a clock.** It is wall-clock, deliberately not a Lamport
   clock.
4. **A forward-version file fails loudly**, never partially.

**Build the fixture harness early.** Commit a fixture per released version from the
first commit of this phase, so the harness is never retrofitted. Retrofitting a
migration harness is how formats become unreadable.

### 1.3 — `@firo/doc`

One `Y.Doc` per board. Structure per
[`../trd/03-crdt-and-sync.md`](../trd/03-crdt-and-sync.md):

```ts
elements, elementOrder, collections, records, recordOrder, meta, assets
```

Nested `Y.Map` per element — **not** a flat key-value map, so that field-level merge
semantics come for free.

**One write path:**

```ts
doc.commit(mutations)   // tagged with local origin, undoable, durable
doc.observe(...)        // read-only
```

Nothing else mutates the Yjs document. This is what makes undo work and what makes
the ephemeral/durable split enforceable.

### 1.4 — The ephemeral/durable split

Implement and test the full table from
[`../trd/03-crdt-and-sync.md`](../trd/03-crdt-and-sync.md).

**The test that matters:** simulate a five-second drag and assert the document update
count is zero and only awareness traffic was emitted. This is the test that catches
the failure mode that would otherwise silently bloat every board.

### 1.5 — Undo

`Y.UndoManager` scoped to the local client ID, with `trackedOrigins` set to our local
origin tag.

**Test:** a simulated remote update does not appear in the local undo stack, and
undoing does not revert the remote change.

### 1.6 — Persistence

`y-indexeddb` wired up, plus `idb-keyval` for board metadata, the board list, and
assets ([ADR-0005](../adr/0005-indexeddb-via-idb-keyval.md)).

**Binary assets never enter the Yjs document.** A 2 MB image inside a CRDT update is
broadcast on every sync and duplicated in every peer. The document holds a
content-addressed reference.

### 1.7 — Collections and records

`Collection`, `Column`, `Record` per
[`../trd/02-data-model.md`](../trd/02-data-model.md).

The two decisions that matter and that later look like over-engineering:

- **Values are keyed by `Column.key`, not `Column.id`.** Keys are stable across
  column deletion and re-creation. This prevents the most common data-loss bug in a
  record store.
- **Values for deleted columns are retained.** Deleting a column hides it; restoring
  it restores the data.

**No canvas. No projections. No UI.** This is a data layer and it should be complete
and boring.

## Verification

```sh
yarn test:typecheck && yarn test
```

- Round-trip: construct a board with every element type, serialise, deserialise, and
  assert deep equality.
- Migration: every committed fixture loads without loss.
- Forward version: a fixture at version N+1 throws a clear error and writes nothing.
- Ephemeral: a five-second drag produces zero document updates.
- Undo: remote changes are not in the local undo stack.
- Write path: an attempt to mutate a `Y.Map` outside `doc.commit` fails in a test.
- Assets: a document containing an asset reference serialises without the blob.

## Risks

| Risk | Mitigation |
| --- | --- |
| The migration harness is retrofitted late | Commit the first fixture now |
| The write-path rule is bypassed by a well-meaning change | The enforcing test, and rule 2 in [`../../AGENTS.md`](../../AGENTS.md) |
| Nested `Y.Map` is the wrong granularity for a large element | Measure in Phase 6 with 10,000 records before changing it |
| ProseMirror document size in records is larger than expected | Measure here, not in production. See [ADR-0004](../adr/0004-prosemirror-for-rich-text.md) |
