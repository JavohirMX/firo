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
- **AC-6 passes**: export a `.firo`, read it as text, `git diff` it, delete the app's
  storage, re-import, and every element, record, tag, and vote is present — on a board
  with 50 images in it, which is the board AC-6 actually names
- A `.firo` export round-trips **byte-identically**
- Every released format version loads in every later version, verified by fixture
- Loading a file from a newer version fails loudly and writes nothing

**AC-6 does not pass yet.** A `.firo` is currently a single JSON file and the export
refuses a board with an image in it, so the criterion fails on the 50 images it
specifies. [ADR-0018](../adr/0018-a-firo-is-a-directory.md) decides the container
that fixes this — a directory — and §7.3 describes it. Two clauses in that ADR are
with the maintainer, and one of them is whether AC-6's own wording is amended.

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
- **The `.firo` container is still a single JSON file**, because
  [ADR-0018](../adr/0018-a-firo-is-a-directory.md) has been written but not
  implemented. The format it specifies is a directory; the export here still writes
  one file and still refuses a board with an image. AC-6 names 50 images, so this
  is the gap between the criterion and the code.
- **`FiroDoc.read()` does not expose the document's `assets` map.** `setAsset`
  writes one and `BoardSnapshot` has no field for it, so nothing can currently ask a
  board which bytes it needs. ADR-0018 needs this closed before the export can
  assemble a manifest.
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

**This is a position, not the fix, and the fix has now been chosen.**
[ADR-0018](../adr/0018-a-firo-is-a-directory.md) decides the question this section
deferred: **a `.firo` is a directory** — `manifest.json`, `board.json`, and a
content-addressed `assets/` — which is §7.3's layout, adopted.

Two things about that decision are worth stating here rather than leaving in the ADR:

- **`board.json` does not change.** It is the same `serializeBoardFile` output, byte
  for byte, in a different container. The document format, the migration chain and
  every committed fixture are untouched, which is what makes the cost small.
- **The refusal is narrowed, not deleted.** The directory can carry assets, so
  "this board has an image" stops being a reason to refuse. What remains a reason is
  a hash the asset store does not hold, and an image with no `fileId` at all. Both
  still fail loudly. Deleting `uncarriedAssetTypes` wholesale when the container
  lands would restore exactly the silent loss it was written to prevent.

The ADR also names two things that must happen before any of it works and that this
plan does not yet show: `FiroDoc.read()` returns a `BoardSnapshot` with no `assets`,
so an exporter cannot enumerate what a board needs, and `SerializedBoard` has no
assets key, so the per-`fileId` metadata has to travel through `manifest.json`
instead. Both are in packages outside this section.

Covered by `apps/web/board/tests/files.test.ts`, including the tombstone case and a
board of frames, which carries no assets and must keep exporting normally. That test
block is the single-file format's and will be rewritten when the container lands.

### 7.1a — `.firo` export and import

Done, and AC-6 passes **for a board with no images**. It does not pass for the board
AC-6 actually names — one with 50 images in it — because the container is still a
single file and the export still refuses. [ADR-0018](../adr/0018-a-firo-is-a-directory.md)
chooses the container that closes that; see the refusal subsection above and §7.3.

Both live in the app's own menu (`apps/web/components/AppMainMenu.tsx`), beside
"Export image...", because that is the same intent and someone looking for one will
look near the other.

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

**Decided by [ADR-0018](../adr/0018-a-firo-is-a-directory.md), which picked this
layout over a single file.** A `.firo` is a directory:

```
board.firo/
├── manifest.json        format version, board id, created, generator, checksums
├── board.json           elements, containers, collections, columns, records
└── assets/
    └── <sha256>.<ext>   content-addressed, deduplicated
```

**Assets are files beside the document, never base64 inlined.** A 2 MB base64 string
inside the JSON makes it unreadable and undiffable — one 2.7-million-character line
per image, which `git diff` prints in full for a one-byte change — and content
addressing deduplicates the same image used on 50 cards.

**The diff is the point.** A committed `.firo` must produce a readable diff. That is
what makes it a durable artefact rather than an opaque blob, and it is a large part
of why Dan will still be here in three years. It is also why the container is not a
zip: an archive's diff does not show what changed, and `deflate` output is not
specified by the format, so byte-identity across builds is not free either. The ADR
has the full argument, including the honest version of what the directory *costs*:
it is no longer one file to download, and folder import is not available in Safari.

**`board.json` is byte-for-byte the file §7.1a writes today**, from the same
`serializeBoardFile`. Only the container around it changes. That is what keeps the
document format, the migration chain and every committed fixture out of this change.

**Format version 2.** Format version 1 is the single JSON file and loads for ever;
the loader dispatches on shape, not extension. `CURRENT_ELEMENT_VERSION` and
`CURRENT_RECORD_VERSION` do not move — this is a container change, not a schema
change.

**A zip may be offered beside the directory** as a transport, for browsers with no
directory writer and for email. It is never the thing under test and never the thing
committed to git.

Two clauses are with the maintainer, and the ADR says so in its own body rather than
here: whether losing the one-file download is worth the readable diff, and whether
AC-6's `cat` and FR-33's "a single file" are amended or the deviation recorded.

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

**This is stated over `board.json`, not over the directory**
([ADR-0018](../adr/0018-a-firo-is-a-directory.md)): the byte-identity claim is about
the document, and the container is asserted separately — the directory contains
exactly what `board.json` and `manifest.json` say it does, and a zip is never the
thing round-tripped.

## Verification

- **AC-6** and **AC-7** in full
- `localStorage` contains no board data
- Network tab is empty, with the app fully functional
- Every committed format fixture loads without loss, at both the format and the
  schema version
- A forward-version fixture throws a clear error and writes nothing
- A deliberately corrupt import leaves the existing board byte-identical
- An import interrupted mid-write leaves the previous good state
- Export → import → export is byte-identical, with 50 images on the board and the
  identical image deduplicated to one file under `assets/`
- An asset whose hash the store does not hold fails the export with a reason, rather
  than producing an archive that references bytes it does not contain
- Import writes asset bytes before the document references them, and a failure
  writes nothing
- Round trip survives: nested containers, all column types, votes, tags, a detached
  card whose record still exists
- `.firo` in git produces a readable diff — `git diff` on `board.json` shows the two
  changed lines, and an unchanged asset does not appear in `git status` at all

## Risks

| Risk | Mitigation |
| --- | --- |
| CRDT document size from ProseMirror in records | Measured in Phase 6. Compaction here |
| Browser storage eviction loses a board | `navigator.storage.persist()`; the `.firo` export is the user's backup |
| Round-trip has "harmless" differences that accumulate | The byte-identical test, with every difference explicitly justified |
| Save is silently dropped under storage pressure | Visible save state; explicit errors; never silent |
| Base64 creeps back in for convenience | A test asserting no base64 data URLs in `board.json` |
| The directory is quietly reverted to a single file "for convenience" | [ADR-0018](../adr/0018-a-firo-is-a-directory.md) is the record; the base64 test and the AC-6 image case both fail first |
| A `.firo` directory is half-copied, or copied without its `assets/` | The manifest's checksums, and a refusal rather than an import that resolves some assets and not others |
| Folder import is unavailable in Safari | The zip transport, offered beside the directory. Named in the ADR as a cost of the decision rather than discovered later |
