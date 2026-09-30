---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# IndexedDB via idb-keyval for local persistence

## Context and Problem Statement

Excalidraw persists locally by splitting data across two stores: **element and app
state JSON go to `localStorage`**, while file blobs go to IndexedDB via `idb-keyval`.

`localStorage` caps at roughly **5–10 MB** and is synchronous, so every write blocks
the main thread. Excalidraw catches `QuotaExceededError` and surfaces a warning —
correct behaviour, but it means the product does not work for our primary use case. A
two-hour workshop board with a few hundred images and 2,000 elements does not fit in
5 MB, and the person it fails for is exactly the person we are building for.

## Decision Drivers

- Must hold a realistic workshop board: 10,000 elements, 50 images, and their history.
- Must not block the main thread on write.
- Must not require a server, an account, or a permission prompt.
- Minimal new surface area — every additional dependency is a maintenance obligation
  in a fork we maintain alone.

## Considered Options

1. IndexedDB via `idb-keyval`
2. SQLite in the browser (WASM)
3. `localStorage`
4. Files on disk via the File System Access API
5. A third-party reactive IndexedDB wrapper (Dexie, localForage)

## Decision Outcome

Chosen option: **1 — IndexedDB via `idb-keyval`**, which is already a dependency in
the fork and already used for file storage upstream.

Everything goes in IndexedDB: Yjs document updates, assets, board metadata,
preferences. The Yjs document is persisted by `y-indexeddb`, which is a thin wrapper
over `idb-keyval`.

## Consequences

- (+) No size ceiling that matters. The NFR-7 budget is 50 MB for a 10,000-element
  board, which IndexedDB handles comfortably.
- (+) Asynchronous. Writes do not block the main thread.
- (+) **No new dependency.** `idb-keyval` is already in the fork.
- (-) **No query capability.** IndexedDB is a key-value store, not a database. Board
  search, tag filtering, and the activity feed must be built from indexes or from
  in-memory data over loaded boards. This is the main argument for option 2.
- (-) No transactions across multiple stores in the way a SQL database provides.
  Atomicity across the document and its assets must be handled by writing assets
  first, then the document reference.
- (-) Browser storage eviction is real. A user who never returns to a board can lose
  it under storage pressure. This is a browser platform behaviour, not a bug, and it
  is one of the reasons the `.firo` export exists
  ([`../trd/07-persistence-and-formats.md`](../trd/07-persistence-and-formats.md)).
- (-) We must request persistent storage where the browser offers it
  (`navigator.storage.persist()`), or a board is evictable.

## Confirmation

- The NFR-7 storage budget test measures IndexedDB usage after compaction and fails
  above 50 MB for a 10,000-element board.
- AC-7 in [`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md)
  requires that IndexedDB contents be legible, not opaque.
- A test asserts that `localStorage` contains no board data.

## Pros and Cons of the Options

### 2. SQLite in the browser (WASM)

- (+) Real SQL, real transactions, real indexes. Search, filtering, and the activity
  feed become straightforward.
- (+) A far more capable foundation if the project layer grows significantly.
- (-) A WASM payload, on top of an already-large bundle.
- (-) Async initialisation and its own failure modes.
- (-) The record store does not need SQL in v1 — projections are in-memory views over
  Yjs data, not queries.
- **Revisit trigger:** if the project layer in Phase 8 needs cross-board queries over
  more than a few hundred boards, this becomes the right answer.

### 3. `localStorage`

- (+) Simplest, synchronous, universally supported.
- (-) **The 5–10 MB ceiling is disqualifying.** It is the reason this ADR exists.
- (-) Synchronous writes block the main thread.

### 4. Files on disk via the File System Access API

- (+) Maximum local-first purity. Boards are real files in a folder the user picks;
  git-friendly from the start.
- (+) Images are files beside the document rather than blobs in a database.
- (-) **Browser support is uneven** — Safari does not implement the File System
  Access API at all.
- (-) The permission model is awkward: a directory handle must be persisted and
  re-granted, and a user who clears site data loses it.
- (-) A desktop concept on the web.

### 5. Dexie or localForage

- (+) Dexie has a genuinely better API and real query support.
- (-) A dependency we do not need yet, in a project we maintain alone.
- (-) We are inheriting a fork; fewer new abstractions is better.

## More Information

- [y-indexeddb](https://github.com/yjs/y-indexeddb)
- [idb-keyval](https://github.com/jaredwray/idb-keyval)
- [`../trd/07-persistence-and-formats.md`](../trd/07-persistence-and-formats.md)
