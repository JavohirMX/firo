# CRDT and sync

## Why Yjs

Three options were evaluated ([`ADR-0002`](../adr/0002-yjs-as-concurrency-engine.md)):

| Option | Verdict |
| --- | --- |
| **Yjs** | The production default. ~920k weekly downloads, 17k stars, MIT, pure JavaScript, smallest bundle (18 kB gzipped), mature bindings, `y-indexeddb` for offline in three lines. |
| Automerge | The research-backed alternative. Slower on large documents, larger encoded size, but stores full history natively. |
| Loro | Fastest in benchmarks, smallest encoded documents (68 kB vs Yjs's 160 kB on the B4 trace). Rust/WASM: 2.9 MB bundle, ~50 ms init. Youngest ecosystem. |

Yjs wins on ecosystem and bundle size. Loro wins on raw performance and on a real concern: for a canvas with many concurrent editors and long divergent offline histories, Yjs's update size and apply time are worse.

**We are choosing Yjs, and accepting the trade.** The deciding factors are ecosystem maturity, `y-indexeddb`, and bundle size — this is a browser app that must load fast and work offline, and a 2.9 MB WASM payload for a whiteboard is a real cost for a user on a hotel wifi. If profiling shows Yjs is the bottleneck at 10,000 elements with 20 concurrent editors, Loro's `y-websocket`-compatible API means the swap is bounded.

## What we rejected, and why it matters

**Excalidraw's own collaboration model is not what it appears to be.** It does not use Yjs. `excalidraw-app/package.json` contains `socket.io-client`, `firebase`, and `idb-keyval` — no `yjs`, no `y-websocket`. The entire merge algorithm is **118 lines** in `data/reconcile.ts`: per-element last-writer-wins on `(version, versionNonce)`, fractional-index ordering, and a 20-second full-scene resync as a divergence backstop.

It converges. It is also lossy — two users editing different properties of the same element lose one edit. Acceptable for a sketch, unacceptable for a shared task table.

Its E2EE is AES-GCM with a **128-bit symmetric key** carried in the URL fragment, with no asymmetric handshake, no forward secrecy, and no revocation. We will not inherit that. [`08-server-and-auth.md`](08-server-and-auth.md).

**A server-authoritative room** (tldraw's `TLSocketRoom`) is simpler to reason about and much easier to authorise. It was rejected because it makes true offline use a special case rather than the default, and offline-first is the thesis.

## Document structure

One `Y.Doc` per board.

```ts
const doc = new Y.Doc();

doc.getMap<Y.Map<unknown>>("elements"); // id -> element
doc.getMap<Y.Array<Y.Map<unknown>>>("elementOrder"); // z-order
doc.getMap<Y.Map<unknown>>("collections");
doc.getMap<Y.Map<unknown>>("records");
doc.getMap<Y.Array<Y.Map<unknown>>>("recordOrder");
doc.getMap<unknown>("meta"); // name, created, schema version
doc.getMap<Y.Map<unknown>>("assets"); // id -> blob reference
```

**Nested `Y.Map` per element, not a flat key-value map.** Nested maps give per-field merge semantics. A flat `Y.Map` keyed by field name would merge at field granularity only if each field were its own key; nesting gets us that for free and keeps the element self-contained.

**Ordering is a `Y.Array`, not a map.** This is the one place we deliberately do _not_ use a `Y.Map`. A `Y.Array` of ids gives us concurrent-insert merge semantics that a sorted map does not, and it keeps z-order as a single mergeable structure. `FractionalIndex` values are stored on each element as a secondary, and the reconciler uses them to re-sort when the array diverges.

## The ephemeral/durable split

**This is the single most important rule in the system** (rule 1 in [`../../AGENTS.md`](../../AGENTS.md)), and the most common way a CRDT-backed canvas becomes unusable.

| Ephemeral → Yjs **awareness** | Durable → Yjs **document** |
| --- | --- |
| Cursor position | Pointer-up, committing a move |
| In-progress drag preview | A completed resize |
| Live selection | A property change |
| Hover state | Creating or deleting an element |
| Laser pointer | A committed text edit |
| Scroll position per collaborator | A vote placement |
| Idle state | A record field change |
| Open dialog, tool selection | A container collapse |
| Workshop timer (an anchor, never a countdown) |  |
| Private / revealed toggle (session state) | Marking an element `hiddenUntilRevealed` |

The last two rows are the facilitation split, and they are the clearest statement of why the split is drawn by _lifetime_ rather than by size. The timer is session state — a `.firo` file must not reopen with a clock frozen at 3:41 — and so is the reveal toggle. Which elements are hidden, though, is board state: a note marked "hide until reveal" must still be hidden when the board is reopened tomorrow and must survive the export that carries the board to the next facilitator. The timer's durable column is empty, and that is the correct answer rather than an omission.

Storing the timer as a per-second countdown rather than an anchor is the loudest possible violation of the rule on this page: a five-minute timer would produce 300 updates, 300 undo steps, and 300 broadcasts per participant. See [`../plans/phase-5-facilitation.md`](../plans/phase-5-facilitation.md).

Awareness state is **never persisted, never in history, and never in a `.firo` file.** It is designed exactly for this: it is relayed between peers, it is discarded when a peer disconnects, and it does not enter the document's history.

**The failure mode this prevents.** If a pointer-move handler writes to the document, a two-second drag produces hundreds of Yjs updates. Every one is broadcast, every one is persisted, every one enters the undo history, and the document becomes several orders of magnitude larger than its content. This is not a performance problem that degrades gracefully; it destroys the document.

**Enforcement.** `@firo/doc` exposes two functions and nothing else mutates the Yjs document:

```ts
doc.commit(mutations)   // durable — tagged with local origin, undoable, synced
doc.observe(...)        // read-only
```

A test asserts that a synthetic 5-second drag produces **zero** document updates and only awareness traffic.

Excalidraw already draws this line with its `onIncrement` hook, which distinguishes `DurableIncrement` from `EphemeralIncrement`. We preserve that distinction because it is right, and it is under-documented externally.

## Undo

`Y.UndoManager`, scoped to the local client ID, with `trackedOrigins` set to our local origin tag.

**Undo is local and per-user.** A collaborator's change never appears in your undo stack. This is not a nicety — it is the reason the origin tag is mandatory, and the reason `doc.commit` is the only write path.

`captureTimeout` is tuned to the tool, not globally: a drag commits on pointer-up and must be one undo step, not one per frame.

## Persistence

### v1: local only

```ts
const doc = new Y.Doc();
const persistence = new IndexeddbPersistence(`firo:board:${boardId}`, doc);
```

`y-indexeddb` is the whole integration. Every change is persisted locally, the document is available offline, and reopening the board is instant. This satisfies the local-first requirement completely with no server.

**Binary assets do not go in the Yjs document.** Images are content-addressed blobs in IndexedDB; the document holds a reference. A 2 MB base64 image inside a CRDT update would be broadcast on every sync and duplicated in every peer.

### v2: adding a provider

```ts
// v2 — the only change
new WebsocketProvider(wsUrl, `board:${boardId}`, doc, { params: { token } });
```

Adding multiplayer is this one call plus a server. That is the entire argument for choosing Yjs in v1, and the reason [`../prd/02-scope.md`](../prd/02-scope.md) defers it rather than omitting it.

**Provider choice for v2:** `y-websocket` is the reference implementation and works, but its bundled server is minimal. We write our own server against `y-protocols` so we control authentication, room authorisation, and SQLite persistence ([`08-server-and-auth.md`](08-server-and-auth.md)).

## Sync protocol

Two channels, following Excalidraw's correct split:

| Channel | Carries | Guarantee |
| --- | --- | --- |
| **Reliable** | Document updates, awareness snapshots | Ordered, at-least-once, deduplicated by Yjs |
| **Volatile** | Cursor movement, idle state, live scroll | Droppable. **A dropped cursor update is always preferable to a queued one.** |

Yjs already distinguishes these at the protocol level — updates are idempotent and merged, awareness is state that is replaced rather than accumulated. We do not need to invent anything.

## Reconnect and divergence

Yjs guarantees convergence by construction. Two additional measures:

**Periodic compaction.** Yjs keeps tombstones for deleted content. Left alone, a long-lived board grows without bound. We compact on a schedule and on explicit request, writing a fresh snapshot and replacing the update log.

**A read-only fallback.** If the sync server is unreachable, the board opens read-only with a clear message and full local editing available after the user chooses to fork to a local copy. Silent divergence is worse than an honest read-only mode.

## Performance

| Concern | Approach |
| --- | --- |
| Update size | Element-level granularity. An element is the unit of sync, not the board. |
| Apply cost | Only changed elements re-render; the renderer is keyed on element identity. |
| Hot paths | Cursor updates are awareness, throttled to 30 fps, and never touch the document. |
| Large boards | The render loop is bounded by the viewport, not the document ([`04-rendering.md`](04-rendering.md)). Sync cost is independent of board size. |
| Awareness size | Awareness payloads are tiny. A user is a cursor, a colour, a name, and a selection id list. |

**The one thing to watch.** Yjs document size is proportional to _operations_, not to current content. A board where every drag committed 60 updates would be a problem. It does not, because drags are ephemeral — which is rule 1 again.
