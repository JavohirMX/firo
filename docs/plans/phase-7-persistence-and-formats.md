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

- **No `.firo` export or import yet.** The format is the same and round-trips, but
  there is no UI, and no byte-identical round-trip guarantee.
- **No `navigator.storage.persist()`**, so a board is still evictable under pressure.
- **No visible save state** (AC-10). A failed save warns in the console, which is not
  the same as showing it.
- **Excalidraw's `LocalData` element copy is still there** and is now redundant. It
  should be removed, in its own commit where the reload behaviour can be verified on
  its own. Its `appState` half — zoom, theme, scroll — stays; the document model has
  no opinion about it and never will.
- No compaction. The JSON grows with tombstones, and editing a note's text creates one
  per keystroke session (see §7.2).

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
