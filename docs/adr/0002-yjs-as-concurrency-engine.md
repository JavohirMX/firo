---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# Use Yjs as the concurrency engine from day one

## Context and Problem Statement

Version 1 is single-player. Multiplayer is deferred to version 2. The temptation is
therefore to build a simple local document model now and add concurrency later.

That temptation is wrong, because **the data model is far more expensive to change
after it has shipped than to design correctly the first time.** Every field we add is
a field we must merge. Every element type is a merge case. Retrofitting CRDT
semantics onto a flat element model means rewriting the persistence layer, the undo
system, and the renderer cache — which is most of the application.

The concrete question: what concurrency engine does the document model target?

## Decision Drivers

- **The data model must be designed for multiplayer from day one**, even though
  multiplayer ships in v2. Offline-first is the thesis
  ([`../vision.md`](../vision.md)); a model that only works online fails the thesis
  from the start.
- The engine must work fully offline with zero configuration.
- Bundle size matters: this is a browser app that must load fast on poor
  connections.
- The ecosystem must be mature enough that we are not writing our own sync protocol.
- Merge semantics must be **structural**, not last-writer-wins on a blob, because our
  richest objects (ProseMirror documents, record collections) are large and
  concurrently editable.

## Considered Options

1. Yjs
2. Automerge
3. Loro
4. Build on Excalidraw's existing reconciliation
5. A server-authoritative room (tldraw's model)
6. Plain JSON, add concurrency in v2

## Decision Outcome

Chosen option: **1 — Yjs**, with `y-indexeddb` for local persistence in v1 and a
WebSocket provider in v2.

The document is a `Y.Doc`. Every mutation goes through `doc.commit()`, which tags
the transaction with a local origin so `Y.UndoManager` can track it. No other code
path writes to the Yjs document.

**The ephemeral/durable split is a hard architectural rule.** Cursor position,
in-progress drags, live selection, hover and the laser pointer go to Yjs
**awareness** — never persisted, never in history, never in the document.
[`../trd/03-crdt-and-sync.md`](../trd/03-crdt-and-sync.md) defines the full table.

## Consequences

- (+) Adding multiplayer in v2 is `new WebsocketProvider(url, room, doc)` plus a
  server. It is a deployment change, not a rewrite.
- (+) Offline merge is free. A user who works for a week offline reconnects and
  everything merges.
- (+) `y-indexeddb` is three lines and gives local persistence with no custom code.
- (+) `y-prosemirror` gives structural merge on rich text, which is the reason rich
  text is affordable in a collaborative board.
- (+) Mature bindings and providers. Yjs is the production default — roughly 920,000
  weekly downloads, 17,000 stars, MIT, pure JavaScript, 18 kB gzipped.
- (-) **Yjs is slower and produces larger documents than Loro.** On the B4 benchmark
  (260,000-character real-world trace): Yjs applies in 2,616 ms versus Loro's 2,271 ms,
  and encodes to 226,981 bytes versus 230,556 — Loro is faster but not smaller on that
  trace. Loro's advantage is largest in concurrent-write benchmarks (B2.4: 145 ms vs
  165 ms, and dramatically smaller updates in some cases).
- (-) Yjs document size is proportional to *operations*, not current content. A
  performance bug in the ephemeral/durable split would silently bloat every board.
- (-) Awareness requires care. The awareness state must be replaced, not accumulated,
  or it grows without bound.
- (-) The smallest unit of sync is the element, not the field, so a large element
  syncs in full on any change.

## Confirmation

Two tests enforce this decision, both in
[`../prd/05-non-functional-requirements.md`](../prd/05-non-functional-requirements.md)
NFR-7:

1. **A synthetic 5-second drag produces zero Yjs document updates** and only
   awareness traffic. This is the test that catches the failure mode above.
2. **Undo is local.** A simulated remote update does not appear in the local
   `Y.UndoManager` stack. This catches any write path that bypasses the origin tag.

Rule 1 in [`../../AGENTS.md`](../../AGENTS.md) states the constraint for agents; these
two tests enforce it for the build.

## Pros and Cons of the Options

### 2. Automerge

- (+) Stores the full editing history natively, which is attractive for a version
  history feature.
- (+) Research-backed, MIT.
- (-) Slower on large documents: 7,109 ms on the B4 trace versus Yjs's 2,616 ms.
- (-) Larger encoded documents: 129,116 bytes versus Yjs's 226,981 on B3.4 —
  inconsistently better or worse depending on the trace.
- (-) No comparable maturity in canvas or rich-text bindings.

### 3. Loro

- (+) Fastest in benchmarks, with the strongest published benchmark transparency of
  the three. Fugue algorithm, provably maximal non-interleaving.
- (+) Smallest bundle on the B4 trace: 68 kB versus Yjs's 160 kB.
- (-) **2.9 MB WASM bundle** and ~50 ms initialisation. For a whiteboard that must
  load fast on hotel wifi, that is a real cost.
- (-) Youngest ecosystem — roughly 12,000 weekly downloads against Yjs's 920,000.
- (-) The Yjs author has publicly disputed Loro's benchmarks
  ([discussion](https://discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567)), which
  while now largely resolved is a signal about the maturity of the comparison.

**Revisit trigger:** if profiling at 10,000 elements with 20 concurrent editors shows
Yjs is the bottleneck, Loro's `y-websocket`-compatible API makes the swap bounded.

### 4. Excalidraw's existing reconciliation

- (+) Already written, 118 lines, already tested in production at scale.
- (+) Fractional-index z-order converges without conflict.
- (-) **It is lossy.** Per-element last-writer-wins on `(version, versionNonce)` means
  two users editing different properties of the same element lose one edit. For a
  sketch that is acceptable; for a shared task table it is not.
- (-) Not a CRDT. Convergence depends on the 20-second full-scene resync as a
  divergence backstop, which is a mitigation rather than a guarantee.
- (-) Its E2EE is AES-GCM with a 128-bit symmetric key in the URL fragment — no
  forward secrecy, no rotation, no revocation.
- (-) **The most seductive wrong answer**, because it is already there and it works
  today. It works today because Excalidraw is a sketching tool. We are not.

### 5. Server-authoritative room

- (+) Much easier to authorise, since the server holds canonical state.
- (+) Simpler mental model; tldraw's `TLSocketRoom` + `SQLiteSyncStorage` is a good
  design worth learning from.
- (-) **Makes true offline use a special case rather than the default.** Offline-first
  is the product thesis, not a feature.
- (-) A client that has been offline for a week needs explicit conflict resolution
  rather than a merge.

### 6. Plain JSON, add concurrency in v2

- (+) Simplest possible v1. No CRDT to understand, no origin tags, no awareness.
- (+) Smallest bundle.
- (-) **This is the option that looks cheapest and costs the most.** Retrofitting
  CRDT semantics to a flat element model means rewriting persistence, undo, and the
  renderer cache — most of the application — and doing it with real user data
  already on disk.
- (-) Every schema decision made before the rewrite will have been made without
  merge semantics in mind, and they will all need revisiting.

## More Information

- [Yjs](https://github.com/yjs/yjs) · [y-indexeddb](https://github.com/yjs/y-indexeddb)
- [CRDT benchmark suite](https://github.com/dmonad/crdt-benchmarks) and [Loro's published results](https://loro.dev/docs/performance)
- [`../trd/03-crdt-and-sync.md`](../trd/03-crdt-and-sync.md) — the full design
- [`../competitive.md`](../competitive.md) §3 — Excalidraw's actual collaboration model
