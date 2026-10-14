---
status: accepted
date: 2026-10-14
deciders: maintainer
---

# The board home reads its index from the autosave store, beside the boards it names

## Context and Problem Statement

Task 7.5.5 adds the first screen: a board home listing a person's boards, with a
curated template gallery, and a way to open one. Until now the product held
**one** board — a single JSON snapshot under one IndexedDB key, `autosave`
([ADR-0005](0005-indexeddb-via-idb-keyval.md);
[ADR-0018](0018-a-firo-is-a-directory.md) clause 9 keeps that snapshot the
canonical local form of the document).

A board home needs three things the app did not have:

1. **A list** — which boards exist, with a name, tags and a last-opened time.
2. **Isolation** — each board's bytes under its own key, so opening one cannot
   overwrite another.
3. **A route** — "which board is this tab showing" as a value the URL carries,
   so a link is shareable and a reload is honest.

`@firo/doc` already ships a board index and persistence — `library.ts`
(`listBoards`, `getBoard`, `putBoard`, `touchBoard`) and `persistence.ts`
(`boardKey`, `openBoard`, `openBoardMemory`) — built on `y-indexeddb` update
logs. The app has never used either: it stores JSON snapshots, not update logs.
So there are already two board systems in the tree, one of them unwired, and the
question this ADR answers is which one the home is drawn from, and what the
other one becomes.

## Decision Drivers

- **A board saved before the home exists must still open.** Every current user
  has their work under `autosave`. If that key moves, their board disappears.
- **One index that names the boards that are actually there.** A list built from
  a different store than the documents would offer boards with no bytes behind
  them.
- **The list must not read every board to draw names.** Payloads are whole
  documents — hundreds of kilobytes — sharing the same store; listing must not
  deserialize them.
- **Board switching must not fight the document's lifetime.** `apps/web/board/board.ts`
  builds its `FiroDoc` and subscribes its autosave at **module scope**
  ([ADR-0018](0018-a-firo-is-a-directory.md)). A tab's document is one board.
- **Do not reconcile the doc library in this phase.** It is Phase 8 work
  (folders, multi-board, the two systems merging). The home must ship now.

## Considered Options

1. **Build the home on the app's autosave store.** Extend
   `apps/web/board/storage.ts` with a per-board key scheme and a single small
   `board-index` record; a new `apps/web/board/library.ts` owns the index and the
   domain operations; navigation is `?board=<id>` with a full reload.
2. **Draw the home from `@firo/doc`'s `library.ts` / `persistence.ts`.**
3. **List boards by scanning the store with `entries`**, no index at all.
4. **Reconcile the two board systems now**, before building the home.

## Decision Outcome

**Option 1.**

### The key scheme

| Board | Payload key |
| --- | --- |
| the default board | `autosave` (unchanged) |
| every other board | `autosave:<id>` |

The default board keeps the original key **byte-for-byte**, which is what makes
an existing board survive. `payloadKey(id)` in `storage.ts` is the one place that
string is built, so the reader and the writer cannot disagree about which board a
key names. A single small record under the key `board-index` holds one entry per
board:

```
BoardMeta = { id, name, tags, created, lastOpened, color?, thumbnail?, trashedAt? }
```

The index is a record rather than one key per board deliberately. One key per
board would let listing scan with `entries`, but `entries` returns the *values* —
which in this store are whole documents. Listing would deserialize every board to
draw a list of names. One small record costs a read-modify-write per change; for a
single-person, local-first v1 that is the right trade, and the concurrent-write
race it accepts is the same one `@firo/doc`'s `touchBoard` accepts.

### The route

- `?board=<id>` — open that board.
- `?home=1` — show the home even when a last board exists. This is what makes the
  home reachable; without it a returning user is always resumed into their last
  board and can never get back to the list.
- neither — **resume the most recently opened live board**, or show the home when
  there is none. A board saved before the index existed is adopted on first sight
  (one `autosave` record with no index entry), so it appears on the home rather
  than being invisible.

Opening a board is a **full reload**, not an in-place swap. A tab's document is
built at module scope and the editor subscribes to it, so swapping boards in
place would mean tearing a document out of a subscribed editor; a reload gets a
fresh module, document and restore for free. The cost is a page load.

Because a reload is the switch, the home must **not** load the editor module: its
module-scope autosave and `pagehide` flush would write an *empty* document over a
real board. `Root.tsx` loads the editor with `React.lazy`, so the home path never
imports it. This is also why the home does not pay for the canvas bundle.

### The divergence, recorded

`@firo/doc`'s board index and persistence are untouched by this and remain
unwired. There are now two board indexes in the repository and **only the app's
is wired**; the doc package's names boards whose documents live in a different
store under a different key scheme. Reconciling them — deciding whether the app
moves onto the doc library, or the doc library is removed — is Phase 8 work and
is deliberately not attempted here. This ADR is the record that the duplication
is known and chosen, not missed.

## Consequences

- (+) Every board that existed before the home still opens, because the default
  board's key did not change.
- (+) The index is one small record; drawing the home does not read a single
  board's bytes.
- (+) Boards are isolated by construction — different keys — so no operation on
  one board can touch another's document.
- (+) The home is cheap: it renders without the editor bundle.
- (-) **Two board systems exist.** `packages/doc/src/library.ts` is dead weight
  until Phase 8 reconciles it, and a reader who finds it may wire the wrong one.
  Mitigated only by this ADR and the comment at the head of `library.ts`.
- (-) **The index is read-modify-written.** Two tabs creating a board at the same
  instant can lose one update. Accepted for single-user local-first v1, and the
  same trade `touchBoard` documents.
- (-) **Opening a board is a full page load**, so it is not instant and it
  re-parses the bundle. Accepted for the document-lifetime reason above.
- (-) **`lastOpened` is formatted by hand**, not `Intl.RelativeTimeFormat`, so the
  home's wording does not track the machine's locale. Deliberate: a shared surface
  that is consistently plain beats one that says "vor 2 Tagen" beside "Boards".

## Confirmation

- [x] The default board is stored under `autosave` and no other board is
      (`apps/web/board/tests/library.test.ts`, "the key scheme").
- [x] Creating, renaming, trashing and deleting one board does not touch another's
      metadata or bytes (same file).
- [x] A single `autosave` record with no index entry is adopted on first resolve
      (same file).
- [x] `apps/web/Root.tsx` imports the editor with `React.lazy`; the home path does
      not import `./App` (its chunk is separate in the app build).
- [x] `?home=1` is reachable from a board through the board menu's title.
- [x] `yarn test:typecheck`, `yarn test`, `yarn test:code`, `yarn build:packages`
      and `yarn build:app` pass.

## Pros and Cons of the Options

### 2. Draw the home from `@firo/doc`'s board library

- (+) No new index: the doc package already has one.
- (-) It lists a different store. The app's documents are JSON snapshots under
  `autosave`; the doc library names `y-indexeddb` logs. The home would offer boards
  with no bytes, or miss the boards that have them.
- (-) It requires adopting the doc package's persistence, which is the same
  "move the app onto update logs" decision ADR-0018 clause 9 already declined.

### 3. List boards by scanning with `entries`

- (+) No index to keep in step; no read-modify-write.
- (-) `entries` returns values, so listing would deserialize every board document
  to read a name. On a store built for a two-hour workshop this is the difference
  between a list and a stall.

### 4. Reconcile the two systems now

- (+) One board system at the end, with no recorded divergence.
- (-) It is a larger decision than the home needs — whether multi-board is a set
  of snapshots or a set of update logs — and folding it into 7.5.5 would block the
  home on Phase 8. The divergence is recorded instead.

## More Information

- [ADR-0005](0005-indexeddb-via-idb-keyval.md) — IndexedDB via `idb-keyval`
- [ADR-0018](0018-a-firo-is-a-directory.md) — the JSON snapshot is the canonical
  local form (clause 9); the module-scope document
- [ADR-0021](0021-miro-style-shell-and-clean-aesthetic.md) — the shell this home
  belongs to
- [ADR-0022](0022-ui-package-owns-the-chrome.md) — why `BoardHome` is in
  `@firo/ui` and the storage is in the app
- [`../plans/phase-7-5-miro-ui.md`](../plans/phase-7-5-miro-ui.md) — task 7.5.5,
  where this was carried out
