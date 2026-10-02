# Phase 1 — Document model

**Goal:** a Yjs-backed document that a board is stored in, with versioning and
migrations, and no UI at all.

Building this before the renderer is deliberate. The data model is the most
expensive thing to change later
([`ADR-0002`](../adr/0002-yjs-as-concurrency-engine.md)), and it is pure logic
that can be tested exhaustively without a canvas.

**Status: implemented.** Two new packages, 140 new tests, no UI, no changes to
any existing package's behaviour. One ADR added.

## Exit criteria

- [x] A board round-trips through `@firo/doc` → Yjs → IndexedDB → `@firo/doc`
      with no data loss — `packages/doc/tests/persistence.test.ts`, against a
      real IndexedDB (`fake-indexeddb`; the code under test is the real
      `y-indexeddb` and `idb-keyval`, unmodified)
- [x] Every element type serialises and deserialises losslessly —
      `packages/doc/tests/roundtrip.test.ts`, plus a 500-element board
- [x] The migration harness loads every committed fixture, from version 1 to
      current — `packages/schema/tests/migrations.test.ts`
- [x] A synthetic 5-second drag produces **zero** document updates — 300 frames
      at 60 Hz, `packages/doc/tests/ephemeral.test.ts`
- [x] Undo is local: a simulated remote update does not appear in the local undo
      stack, and undoing does not revert it — `roundtrip.test.ts`
- [x] `doc.commit()` is the only write path, enforced by a test — and by a guard
      that throws, not a lint rule. See [`ADR-0016`](../adr/0016-enforce-the-write-path-with-a-proxy.md)

## What was built

### `@firo/schema` — types, validation, migrations

`packages/schema/`, 11 source files. No UI, no Yjs. Pure data, which is what
makes it testable without a browser.

| File | Responsibility |
| --- | --- |
| `version.ts` | `CURRENT_ELEMENT_VERSION`, `CURRENT_RECORD_VERSION`, `ForwardVersionError` |
| `types.ts` | `ElementBase`, `StickyNoteElement`, `Collection`/`Column`/`FiroRecord`, `asFractionalIndex` |
| `prosemirror.ts` | the Firo rich-text schema (ADR-0004) |
| `validate.ts` | repairing primitives + `RepairLog` + `preserveUnknownFields` |
| `registry.ts` | per-type props, migrations, validation; the chain runner |
| `migrate.ts` | `migrateElement`, `migrateRecord`, `loadBoard`, `serializeBoard` |
| `fixtures.ts` | the committed fixture harness, **in `src/` on purpose** |
| `types/stickynote.ts` | the one concrete element type |

Two version chains, not one. Elements and records migrate independently and fail
independently, and a board whose records are v2 and whose elements are v1 is a
normal, loadable board.

### `@firo/doc` — the write path, the CRDT, the local store

`packages/doc/`, 9 source files.

| File | Responsibility |
| --- | --- |
| `guard.ts` | the write guard (ADR-0016) |
| `doc.ts` | `FiroDoc`: `commit()`, `read()`, `setEphemeral()`, `createUndoManager()` |
| `origin.ts` | `LOCAL_ORIGIN` / `REMOTE_ORIGIN` / `LOAD_ORIGIN`, as `unique symbol` |
| `structure.ts` | the seven Yjs roots; nested `Y.Map` per element; order as `Y.Array` |
| `mutations.ts` | the `Mutation` union, exhaustively checked against the implementation |
| `ephemeral.ts` | the ephemeral state shape and its pure merge |
| `persistence.ts` | `y-indexeddb`, plus the trust boundary around the raw doc |
| `library.ts` | board index and asset store, both `idb-keyval`, both outside the document |

## Decisions worth surfacing

### The write guard is a Proxy, and that is not a stylistic choice

The obvious implementation — throw from `beforeTransaction` — **fails open**.
Yjs emits that event *outside* the `try` in `transact()`, so a throw skips the
`finally` that clears `doc._transaction`, and every subsequent `transact` takes
the nested path and never emits the event again. Measured:

```
_transaction still set?             true
write after violation went through?  true
```

One violation, permanent blindness. [`ADR-0016`](../adr/0016-enforce-the-write-path-with-a-proxy.md)
has the full reasoning; the short version is that a Proxy refuses *before* the
write, so a violation leaves the document both untouched and still armed.

### The serialised format carries z-order explicitly

Found by the round-trip test, and it would have shipped as "works fine": elements
live in a `Y.Map` keyed by id, so their position in the serialised `elements`
array carries no meaning. A reader that used it as z-order would be guessing, and
a board whose notes had been moved would reopen stacked in creation order with
nothing looking wrong. `elementOrder` is now a required field.

### `created` / `updated` / `version` are stamped only when the caller omits them

A caller that omits them is drawing a note *now*. A caller that supplies them is
loading a board, and unconditional stamping meant every import reset the whole
board's history to the moment it was imported — data loss wearing the costume of
a default.

### A detached `Y.Map` answers `get` with `undefined`

`toYMap` builds a map that is only integrated when its parent is `set` into a
document. Reading defaults from it before that point looks like "the caller
supplied nothing" for *every* field. The bug was live for several iterations and
was caught by the round-trip test; the fix is to read defaults from the input
object, and the comment says so.

### Mutation validation is a sequential pass, before the transaction

Yjs does not roll back: a throw inside `transact`'s callback leaves every write
that already ran in the document. So a commit is fully checked first, and the
check walks mutations **in order** carrying the ids earlier ones will create —
because a paste that creates and then styles a note in one commit is a normal
call shape, and a validator that only asked "is this in the document?" would
refuse it.

### `instanceof` is not used for `ArrayBuffer` / `Uint8Array` / `Blob`

Realm-local. An `ArrayBuffer` from an iframe or a worker is a perfectly good
`ArrayBuffer` and fails the check out here — and Firo is explicitly meant to be
embeddable in an iframe.

## Corrections to the plan

The plan's task 1.1 said "port the element base from Excalidraw". Two things
changed on contact with the code:

1. **`boundElements` → `bindings`.** The plan did not anticipate this, but
   Excalidraw's one-sided array is the source of most of the complexity in its
   94 KB `binding.ts`, and a Miro-style board has connectors that are not arrows.
   A two-way relation is the honest shape.
2. **Sticky notes keep `text` as a plain string.** This is a documented,
   deliberate exception of the same kind as ADR-0004's list. A sticky note's
   content is a short label, not a document. `ElementBase.text` (the ProseMirror
   field) is left unused for this type, and making notes multi-line-editable in
   Phase 4 is a migration rather than a breaking change.

The plan also did not anticipate that the write path needed *enforcement*
mechanisms at all, only that it needed to be a convention. It does.

## Two things the tests caught that a review would not

- **The `elementOrder` omission above.** The round trip was "complete" and wrong.
- **A vacuous test.** The first "aborts before reading any element" probe wrapped
  the elements array in a `Proxy` trapping `Symbol.iterator` — and `forEach`
  reads the array's internal slots, so the trap never fired. The test passed
  because the probe was wrong, not because the ordering held. It is now a
  `defineProperty` getter, with a control test so a loader that simply never
  reads the data cannot pass both.

## Verification

Every command below was run, and this is its output.

| Check | Result |
| --- | --- |
| `yarn test:typecheck` | `Done in 15.04s.` — no errors |
| `yarn fix` (prettier + eslint `--max-warnings=0`) | `Done in 34.05s.` — 0 warnings, no files changed |
| `yarn prettier --check` | `All matched files use Prettier code style!` |
| `yarn build:packages` | `Done in 39.81s.` — all 8 packages |
| `yarn build:app` | `✓ built in 9.04s` / `Done in 18.79s`, PWA service worker generated |
| `yarn vitest run` (full) | `Tests 10 failed \| 2526 passed \| 47 skipped \| 1 todo (2584)` |

### The 10 failures are pre-existing and not mine

They are the sidebar-docking tests documented in the Phase 0 report. Proven
rather than assumed, by stashing all of Phase 1 and running the full suite
again:

| | Test files | Tests |
| --- | --- | --- |
| Baseline, all Phase 1 code removed | 2 failed / 139 passed (141) | **10 failed** / 2384 passed / 47 skipped / 1 todo (2442) |
| With Phase 1 | 2 failed / 146 passed (148) | **10 failed** / 2526 passed / 47 skipped / 1 todo (2584) |

Same 10 tests, same 2 files, same error — `TypeError: Cannot destructure
property 'tunnelsJotai' of useTunnels(...) as it is null` at
`withInternalFallback.tsx:18:21`, byte-identical to the signature recorded in
Phase 0. They also fail in isolation at baseline (10 failed / 9 passed). The
baseline's 2384 matches the count recorded at the end of Phase 0, so the two
measurements are the same yardstick. The delta is **+7 test files and +142
passing tests**.

Not patched. It is upstream's bug, the attribution is already documented, and
patching it would change a file unrelated to the data layer.

### Rebrand grep, against build output

Run against `apps/web/build/` (not source) — the Phase 0 lesson being that the
CDN leak, the Sentry import, the Plus menu links and the FUNDING handle were all
invisible to a source-level grep.

Executable JS / HTML / CSS: **clean** for `excalidraw.com`, `plus.excalidraw`,
`oss-ai`, `sentry.io`, `fonts.googleapis`, `fonts.gstatic`.

Five textual hits appear in `.js.map` files only, and all five are inside this
repo's own Phase 0 comments explaining what was *removed* — e.g. `// Upstream
linked to libraries.excalidraw.com here`. Not leaks.

### Negative tests: each invariant was broken on purpose, and caught

The repo rule is that each architectural invariant is enforced by a *test*. A
test that cannot fail is a comment, so each was mutated:

| Mutation | Caught by |
| --- | --- |
| `preserveUnknownFields` stops preserving | 7 tests fail |
| Prune values whose column is gone | 7 tests fail |
| Remove the board-level forward-version guard | 1 test fails |
| Remove the per-element forward-version guard | 1 test fails |
| `setEphemeral` writes to the document | 4 tests fail |
| The write guard accepts any method | 5 tests fail |
| Undo tracks `REMOTE_ORIGIN` too | 2 tests fail |
| A `Mutation` kind missing from `MUTATION_KINDS` | `tsc` fails |
| The prototype-walk exhaustiveness check | `tsc` fails |

Two negative tests were **mis-aimed on the first attempt** and had to be redone:
one mutated the wrong file (`setEphemeral` lives in `doc.ts`, not `ephemeral.ts`),
and one added origins that do not admit remote changes. Both passed while
proving nothing. A negative test that passes is not evidence.

## Things a future contributor should know

- **`packages/*/global.d.ts` is load-bearing, not boilerplate.** `rootDir: "../"`
  means tsc follows imports out of `include`, so compiling `@firo/schema` reaches
  `@firo/common` and then `@firo/editor`, whose ambient declarations
  (`import.meta.env`, `window.FIRO_*`, `*.woff2`) are not otherwise in scope.
  Without it, `build:packages` reports 264 errors in files this package has
  nothing to do with. The two packages that genuinely need nothing ambient have
  an **empty** `global.d.ts`, which is the same statement.
- **`@firo/doc` is not wired into `apps/web` yet, by design.** Phase 1 is a data
  layer. The app build is unchanged.
- **`ADDED: yjs 13.6.33, y-indexeddb 9.0.12, y-protocols 1.0.7,
  prosemirror-model 1.25.12, fake-indexeddb 3.1.7 (dev).** All MIT except
  `fake-indexeddb`, which is Apache-2.0 — permissive, test-only, never shipped,
  and pinned to the version `packages/editor` already used so there is one copy
  in the tree. Versions pinned exactly, per the upstream convention.
- **Element types other than `stickynote` do not exist yet.** The registry is the
  mechanism; the other types land with their phases. `ELEMENT_TYPES` and the
  registry are checked against each other at registration, so they cannot drift.
  **Superseded:** true when written. The document now holds ten types —
  `stickynote`, the three shapes, the two connectors, `freedraw`, `text`, `frame` and
  `image` — each added with a validator, a conformance assertion and both halves of
  the fold. The mechanism held; the types arrived one at a time, and each one closed a
  case where the editor could draw something the document could not hold.

## Still open

Unchanged from the Phase 0 list, and not addressed here:

- **Font licences unverified.** No licence file ships for any font. Release
  blocker per ADR-0014, still true.
- **Product name not trademark-cleared.** Blocks public release, not development.
- **The TTD/AI subtree (44 files) is dead code**, left in place. Deletion belongs
  with the v3 AI work.
- **Sidebar-docking tests** — pre-existing, attributed, unpatched.

## Next

Phase 2: the renderer. ADR-0014 defers measuring OFL hand-drawn font candidates
until there is rendered output to measure, so that happens there.
