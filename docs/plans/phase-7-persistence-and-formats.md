# Phase 7 — Persistence and formats

**Goal:** the file survives. AC-6 and AC-7 pass.

This is where the product stops being a demo and becomes something a team will
actually keep using. Dan
([`../prd/01-personas.md`](../prd/01-personas.md)) keeps a whiteboard if his boards
are files he can read, diff, and put in git.

## Exit criterion

- **AC-7 passes**: block all network at the OS level and every feature still works;
  DevTools shows zero requests; a 10,000-element board uses under 50 MB after
  compaction
- **AC-6 passes**: export a `.firo` archive, read it as text, `git diff` it, delete
  the app's storage, re-import, and every element, record, tag, and vote is present
- A `.firo` export round-trips **byte-identically**
- Every released format version loads in every later version, verified by fixture
- Loading a file from a newer version fails loudly and writes nothing

## Tasks

### 7.1 — Persistence wiring

[`idb-keyval`](https://github.com/jakearchibald/idb-keyval) for board metadata and
assets; `y-indexeddb` for the Yjs document
([ADR-0005](../adr/0005-indexeddb-via-idb-keyval.md)).

Everything in IndexedDB. **Nothing in `localStorage`** — a test asserts this.

**Do not pause saving when the tab is hidden.** Excalidraw does, to avoid background
writes to `localStorage`. That is defensible there and wrong here: a user switching
tabs during a workshop must not be able to lose work.

**Request persistent storage** (`navigator.storage.persist()`), or a board is
evictable under storage pressure.

**The save state is visible.** Saving, saved, error. Never silent (AC-10).

#### Started early, and it nearly repeated the mistake this section warns about

The autosave landed before the rest of Phase 7, because until something is written
out nothing else can be shown to survive. The first version used `localStorage`.

That is the option this section rules out and
[ADR-0005](../adr/0005-indexeddb-via-idb-keyval.md) rejected on measurement — roughly
5–10 MB, and synchronous, so every write blocks the main thread — and it was still
what got written first, because a *synchronous* restore is easier: the board can be
in the document before the canvas asks it for anything.

It is now IndexedDB, and the restore is awaited in `initializeScene` rather than
fired. That turned out to be the better shape independently of the storage choice —
the editor already waits on a promise for its initial scene, so awaiting the restore
there means the canvas is never created empty and then filled in. The
synchronous-storage version had been quietly accepting a flash of blank canvas as the
price of its convenience, and had the ADR not been checked the flash would have
shipped.

`storage.test.ts` asserts `localStorage.setItem` is never called, which is the test
this section asked for.

#### What is done

- Autosave on every document change, debounced 400ms with a trailing call, so the last
  change in a burst is never the one dropped.
- A flush on `pagehide` and on `visibilitychange`, where a pending debounce would
  never fire. Saving is not paused while hidden.
- Restore awaited before the canvas is created.
- **A failed restore disarms the autosave.** The document in memory is then an empty
  board that replaced one we could not read, and saving it would destroy the only copy.
  Refusing is the difference between a recoverable situation — empty canvas, a console
  warning, the bytes still in storage — and an unrecoverable one.
- Autosave and files share one path (`serializeBoard`/`loadBoard`), so the autosave
  continuously exercises the file format.

#### What is not done

- **No `navigator.storage.persist()`**, so a board is still evictable under pressure.
- **No visible save state** (AC-10). A failed save warns in the console, which is not
  the same as showing it.
- **Excalidraw's `LocalData` element copy is still there** and is now redundant. It
  should be removed, in its own commit where the reload behaviour can be verified on
  its own. Its `appState` half — zoom, theme, scroll — stays; the document model has
  no opinion about it and never will.
- Import refuses a board that already has content. See below.
- §7.2 compaction is answered for the *file* (see above) but not for the document
  itself. The autosave grows with tombstones indefinitely, which is correct for a CRDT
  and wrong for a long-lived board: a year of edits accumulates dead elements that are
  rewritten on every save. That is a document-level compaction — rewriting the Yjs
  history — and it is a different piece of work from dropping tombstones on export.

#### The export refuses a board with an image, on purpose

`image` reached the document model after the rest of this section was written, and it
is the first element type whose *content* is not in the document.

An image element holds a content-addressed reference into the asset store
(`@firo/doc`'s `library.ts`), and the store is a separate IndexedDB database — the
right call, since bytes inside a CRDT update are broadcast on every sync. But a
`.firo` file is a single JSON document, so it can carry the reference and not the
picture.

So the export **refuses** rather than writing a file that imports cleanly and draws a
broken image, with nothing in either file saying so. That is the silent-loss failure
this section exists to prevent, arriving from a direction it did not anticipate: the
element survives, its content does not. A tombstoned image does not count — it is not
in the file either, and counting it would make a board unexportable for ever after
somebody deleted a picture from it.

**This is a position, not the fix.** §7.3 specifies the fix — a manifest, a
`board.json`, and a content-addressed `assets/` directory — and that is a *different
file layout* from the single canonical JSON that round-trips byte-identically and
diffs legibly. Both properties are wanted and they are in tension: a `.firo` that is
one file cannot carry its assets, and a `.firo` that is a directory is no longer one
download. Choosing between them is real design and belongs in an ADR, so the refusal
stands in the meantime and makes the gap visible rather than silent.

Covered by `apps/web/board/tests/files.test.ts`, including the tombstone case and a
board of frames, which carries no assets and must keep exporting normally.

### 7.1a — `.firo` export and import

Done, and AC-6 passes. Both live in the app's own menu
(`apps/web/components/AppMainMenu.tsx`), beside "Export image...", because that is the
same intent and someone looking for one will look near the other.

#### The file format round-trips byte-identically

Every fixture, and every board: export, import, export again, same bytes. This is not
free, and the reason is worth recording.

`JSON.stringify` emits keys in **insertion order**, and insertion order is a property
of the *loader's object literals* rather than of the data — a validator that spreads
`{ ...base }` and overlays normalised fields emits keys in whatever order that
produces. So `JSON.stringify` cannot support byte-identity: two boards with identical
content serialise to different bytes, and `git diff` on a board nobody touched shows a
whole-file rewrite.

`canonicalJson` in `packages/schema/src/fixtures.ts` sorts keys, and is now exported
as the format's writer rather than kept as a test helper. **One implementation, used
by the export and by the round-trip tests** — if the file writer and the comparison
disagreed, "the export round-trips" would mean nothing. The same reasoning retired a
`JSON.stringify` comparison that was passing on boards which had lost fields, as long
as both sides happened to order the rest the same way.

Pretty-printing is a recursive walk, not a regular expression over the compact form.
The regex version was tried first and is shorter; it indents inside strings, so a note
containing `", {"` comes back with a newline and two spaces in the middle of its text
and the file stops being what it was exported from. A board is mostly strings someone
typed, so that is the ordinary case.

#### Tombstones: kept in the autosave, dropped from the file

The question the format could not answer by default, now settled. `doc.read()` returns
deleted elements, so `serializeBoard` writes them — and for the autosave it must.

The two paths want opposite things, and getting either wrong is silent:

| | tombstones | why |
| --- | --- | --- |
| **autosave** | **kept** | the document is a CRDT. A tombstone stops a stale write resurrecting a deleted element, and it is what lets an undone deletion be restored after a reload. |
| **`.firo` file** | **dropped** | a file is a snapshot, not a replica. It carries no undo history for a tombstone to restore, and has no concurrent writer for one to protect against. |

What a tombstone costs in a file is unbounded growth. Measured before this: five notes
with two deleted exported all five. Every edit-and-undo added another and nothing ever
removed them — so a board someone worked on for a week was mostly dead elements, and
`git diff` on a board nobody touched still churned.

`compactBoard` in `@firo/schema` does it, and it is a **named function rather than a flag
on the serialiser** so the autosave cannot pick it up by accident. The autosave calls
`serializeBoard` and does not know compaction exists; the file calls `compactBoard` and
has to ask for it.

What it does *not* compact, which is the mistake available in the other direction:
**archived records.** `archiveRecords` exists *because* deleting is wrong for a record —
archiving takes it out of a projection's view and lets it come back. Compacting it would
lose a card someone deliberately removed from a board *view* but not from the board, and
unlike an element tombstone there is no flag saying "this was temporary".

It also filters `elementOrder`, not just `elements`. `loadBoard` copes with a dangling id
by dropping it *and reporting it*, so a file with one would warn on every load. A file
this function writes should be one `loadBoard` has nothing to complain about.

Verified in the app — six shapes, three undone, so three live and three tombstoned:

```
document / autosave:  6 elements, 3 tombstones   (kept)
.firo file:           3 elements, 0 tombstones   (dropped), elementOrder 3
```

Both directions are tested through the app's own paths rather than by inspecting a
serialised string, because the two paths differ by one call and a test that only checked
one would pass with the other broken.

#### Import refuses a non-empty board, on purpose

The document is a CRDT: a delete writes a tombstone, and an id cannot be reused
afterwards. Importing a file into a browser that already has an autosaved board — which
is every browser, since the autosave exists — means resolving a tombstoned node against
a new element with the same id, and there is no "replace this element" mutation to
reach for.

Rewriting the incoming ids works, and was written, and is not what shipped. It renames
elements, so a note's label and its connector bindings have to be rewritten in the same
pass or the board draws with detached arrows, and it produces ids the document did not
mint. That is the kind of damage which is invisible now and obvious later.

So the flow is: export what you have, start a new board, import. Both halves already
exist and neither can lose anything. The alternative is a merge strategy, which is real
design and belongs in an ADR rather than in a Friday.

#### The menu the app does not use

Worth knowing before adding a menu item: `LayerUI` has a `DefaultMainMenu`, and it is
**never rendered**. The app supplies its own menu through `MainMenuTunnel`, which is
what `__fallback` means.

Two items were added to the fallback list first. They did not appear, produced no
error, and the action they referred to was registered and present in the action manager
the whole time — every check said it should be there. The tell was logging the
children `MainMenu` actually receives: fourteen entries, none of them mine, and
including `CommandPalette` and `Preferences`, which the fallback list has never had.
The app's menu has its own composition and it is the one on screen.

So: **`apps/web/components/AppMainMenu.tsx` is the menu.**

### 7.2 — Compaction

Yjs keeps tombstones for deleted content. A long-lived board grows without bound.

Compact on a schedule and on demand: write a fresh snapshot, replace the update log.
**The NFR-7 disk budget is measured after compaction, not before.**

Orphaned assets are collected at the same time — content-addressed, so an asset
referenced by no element is provably unused.

### 7.3 — The `.firo` format

```
board.firo
├── manifest.json        version, id, created, generator, checksums
├── board.json           elements, containers, collections, columns, records
└── assets/
    └── <sha256>.<ext>   content-addressed, deduplicated
```

**Assets are files beside the document, never base64 inlined.** A 2 MB base64 string
inside the JSON makes it unreadable and undiffable, and content addressing
deduplicates the same image used on 50 cards.

**The diff is the point.** A committed `.firo` must produce a readable diff. That is
what makes it a durable artefact rather than an opaque blob, and it is a large part
of why Dan will still be here in three years.

### 7.4 — Export

PNG, SVG, PDF (one page per frame, in user-controlled frame order), CSV, Mermaid.

**Never watermarked** (AC-2). This is one of the cheapest and most effective wedges
against Miro.

Keep Excalidraw's `png-chunk-text` technique for "copy as PNG" that retains scene
data, so an image pasted into a chat can be re-opened in Firo.

### 7.5 — Import

`.firo` (lossless), `.excalidraw`, Mermaid, CSV, PNG and PDF as background images.

**AC-9 is the bar for `.excalidraw`:** every element arrives editable and correctly
positioned, not flattened. Achievable because we forked the source and the element
model is compatible.

**Import is atomic.** Validate the whole file, build in memory, commit only on
success. A failure leaves the existing board untouched (AC-10).

### 7.6 — Board list and trash

All local boards, sortable, filterable, with folders and tags. Delete moves to trash
with restore.

Excalidraw's local model is a single board in `localStorage`. Ours is a list.

### 7.7 — Round-trip testing

**The test that turns the file format from a feature into a promise:**

```
export → import → export  ===  byte-identical
```

With every element type, every column type, tags, votes, containers at multiple
depths, and a 10,000-element board. Any difference must be explainable and separately
tested.

## Verification

- **AC-6** and **AC-7** in full
- `localStorage` contains no board data
- Network tab is empty, with the app fully functional
- Every committed format fixture loads without loss
- A forward-version fixture throws a clear error and writes nothing
- A deliberately corrupt import leaves the existing board byte-identical
- An import interrupted mid-write leaves the previous good state
- Export → import → export is byte-identical
- Round trip survives: nested containers, all column types, votes, tags, a detached
  card whose record still exists
- `.firo` in git produces a readable diff

## Risks

| Risk | Mitigation |
| --- | --- |
| CRDT document size from ProseMirror in records | Measured in Phase 6. Compaction here |
| Browser storage eviction loses a board | `navigator.storage.persist()`; the `.firo` export is the user's backup |
| Round-trip has "harmless" differences that accumulate | The byte-identical test, with every difference explicitly justified |
| Save is silently dropped under storage pressure | Visible save state; explicit errors; never silent |
| Base64 creeps back in for convenience | A test asserting no base64 data URLs in `board.json` |
