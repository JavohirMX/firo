---
status: accepted (options A and B)
date: 2026-10-04
deciders: maintainer
supersedes: [0019](0019-keep-read-a-full-snapshot.md)
---

# Stop walking the whole document to read it: choose one of three fixes

## Context

[ADR-0019](0019-keep-read-a-full-snapshot.md) measured `FiroDoc.read()` and recommended leaving it alone. **The maintainer rejected that recommendation.** The reasoning in 0019 stands — the cost is the price of a detached snapshot, and the snapshot is what makes "read the document without any possibility of reaching a live `Y.Map`" true. What was rejected is the conclusion that the cost is acceptable for v1.

This ADR does not choose. It sets out the options with their measurements and their risks, because each one changes what `read()` _means_ rather than how fast it is, and `AGENTS.md` says to escalate before touching the write path and its read half.

## Re-measured, 2026-10-04

10,000 elements, Node 26, the built packages (`yarn build:packages` then a plain ESM script importing `@firo/doc` — _not_ a source bundle, which resolves two copies of Yjs and fails every write with `Unexpected content type`; that is a harness trap, not a product bug, and it cost twenty minutes).

| Measurement | Result |
| --- | --- |
| `read()` full snapshot | **16.0 ms** |
| retained per snapshot | **17.2 MB** |
| `read().elements` | 15.0 ms |
| `read().collections` — wants _none_ | 19.7 ms |
| `read().meta` — a handful of keys | 15.3 ms |
| `read().elementOrder` | 16.3 ms |
| **`elementOrder()` — the same ids, the cheap path** | **0.097 ms** |
| transaction, **no** subscriber | **0.48 ms** |
| transaction, **one** subscriber | **16.1 ms** |
| two reads, as `notify()` + `push()` do | **32.0 ms** = **1.9 frame budgets** |

Reproduce with `yarn bench:read`.

Two rows carry the argument on their own.

**`elementOrder()` is 0.097 ms; `read().elementOrder` is 16.3 ms.** The same ten thousand strings, from the same document, through two methods that differ only in whether they also walk every element. That is a 165× difference for data both return, and it is the cleanest statement of the problem available.

**Adding one subscriber turns a 0.48 ms transaction into a 16.1 ms transaction.** Not an inference from a profile — the same transaction, measured twice, differing only in whether anything is subscribed. `notify()` returns before it reads when no listener is registered, so the whole 15.6 ms delta is the read. And the app _is_ subscribed, on purpose: the subscriber is the editor sync.

0019's figures were ~17.5 ms and ~17 MB. **The measurement reproduces.** Nothing has drifted, and nothing about the cost is an artefact of that earlier harness — the one difference is this script using `openBoardMemory()` rather than constructing a `Y.Doc` itself, because the built packages inline their own copy of Yjs and a foreign `Y.Doc` fails every write. That is a harness trap, noted at the top of the script so the next person does not lose twenty minutes to it.

### One finding 0019 did not have

`read()` returns an object literal in which **every field is evaluated eagerly except `assets`**, which is already a memoised getter. The consequence is not subtle and it is not confined to the renderer:

```ts
doc.read().collections; // 13.7 ms — walks all 10,000 elements to return [] or [one]
doc.read().meta; // 13.7 ms — same
doc.read().elementOrder; // 14.7 ms — same
```

Three of those four lines are in `BoardSync` and `apps/web`, and one of them (`this.publishRecords(this.doc.read().collections)`) exists solely to hand a collections array to a function that ignores everything else on the snapshot. Four measurements of "one field" came out between 15 and 20 ms, which is the tell: they are all paying for the same walk, and the spread is noise.

## The three options

### Option A — make every field lazy, as `assets` already is

`read()` returns memoised getters for `elements`, `elementOrder`, `collections`, `records` and `meta`. Cost per field becomes O(that field), so the four measurements above split apart: `meta` becomes free, `collections` becomes free, `elements` is unchanged.

**What it costs.** A snapshot stops being a point-in-time view. Today every field in one `read()` describes the same instant; lazily, `read().elements` can describe a _later_ instant than `read().meta` if a transaction lands in between. Whether that is acceptable is a real question — arguably a lazily-read snapshot is _more_ correct, since a caller asking a question gets the answer as of when they asked — and it is the kind of question this ADR exists to have answered rather than assumed.

**What it does not fix.** The dominant cost, `elements`, is unchanged, and `pull()` and `push()` both genuinely need it. Best case this is a constant-factor win on paths that were already cheap and no win at all on the path that matters.

**Risk.** Low. No call site changes. The behaviour change is confined to snapshot consistency and is testable.

### Option B — cache the snapshot against a revision counter

`FiroDoc` already has `localRevision`, incremented in `commit()`. Add a revision bumped on _every_ durable transaction, local or remote, and memoise `read()` against it. Four reads in one transaction become one walk. Nothing else changes at any call site.

**What it costs.** Callers now share element objects instead of receiving fresh ones. Any caller that mutates a snapshot poisons the cache for everybody, silently, and the poison persists until the next transaction. `fromYMap` already returns `Object.create(null)` objects, so nothing _prevents_ a write — `Object.freeze` on the snapshot would make it loud, but deep-freezing 10,000 elements costs more than the walk it would protect.

This is the whole risk of Option B, and it is not a small one: it converts a class of bug that is currently impossible ("I mutated a snapshot") into one that is invisible until it corrupts a board. It is greppable today — `read()` callers are few — but greppable is not enforced.

**What it fixes.** The largest amount, by a wide margin. 29.2 ms per keystroke of read cost becomes ~14.6 ms, and the four call sites collapse to one walk each.

**Risk.** Medium, and the risk is a data-integrity class rather than a performance one.

### Option C — deltas

`notify()` hands each listener a delta instead of a snapshot, derived from the Yjs update that caused it. This is the design 0019 gestures at and declines to commit to.

**What it costs.** It is a real interface change: every subscriber becomes a state machine. `BoardSync`'s diff, the echo guard, the autosave and the records channel all have to be rewritten against it, and each rewrite is a chance to introduce the silent divergence that `withheldIds` documents at such length. This is days of work and it lands before Phase 6 rather than after.

**What it fixes.** Everything, permanently. A keystroke costs O(changes) rather than O(board).

**Risk.** High, and it is the risk of doing a large rewrite of the sync path while Phase 6 is still ahead of it.

## Recommendation

**Option B, with Option A taken first.**

A on its own is a small, safe, one-file change that removes three of the four measured wastes and gives a measurable before/after — so it is worth doing whether or not B is approved, and it makes B's improvement legible rather than speculative.

B is then the change that matters, and its one real hazard — shared mutable element objects — can be closed rather than merely documented:

- `Object.freeze` the snapshot's **containers and top-level element objects** only, not deeply. Freezing 10,000 shallow objects is O(n) with no allocation and no deep walk, and it turns "a caller mutated a snapshot" from silent corruption into a `TypeError` in strict mode. Nested plain objects stay mutable, which is a smaller hole than the whole object and is where the existing callers already do not go.
- Add a test that commits a transaction and asserts every consumer-visible field identity is _stable_ across two `read()` calls, so the caching is a stated property rather than an accident.

C should not be attempted before Phase 6 lands. It is the right destination, and arriving there after the projections exist means the projection sync is written against deltas from the start rather than migrated onto them.

## Outcome: A and B, implemented

Signed and built. `read()` is now memoised against a document revision, every field is a memoised getter, and snapshots are shallow-frozen. `yarn bench:read`, 10,000 elements, before → after:

|  | before | after |
| --- | --- | --- |
| `read().collections` — wants _none_ | 19.7 ms | **0.44 ms** |
| `read().meta` — a handful of keys | 15.3 ms | **0.35 ms** |
| `read().elementOrder` | 16.3 ms | **0.48 ms** |
| `read().elements` | 15.0 ms | 17.9 ms |
| retained per snapshot | 17.2 MB | 18.4 MB |
| **per keystroke, one subscriber reading `elements`** | **16.1 ms** | **17.4 ms** |
| two reads per keystroke | 32.0 ms | **17.4 ms** |

Three rows are the waste A was aimed at, and they are gone: 51.3 ms of "read one small field" across three calls is now 1.3 ms.

**Two rows got slightly worse, and both are honest costs.**

`read().elements` went 15.0 → 17.9 ms and the snapshot 17.2 → 18.4 MB. That is the freeze: measured at **1.6 ms** on 10,000 elements by disabling it and re-running, over three runs each, because the first attempt at that measurement produced a 26 ms reading for identical code and could not be trusted. 1.6 ms to turn "a caller mutated a snapshot" from silent cache poisoning into a `TypeError` is a trade worth making, and the number is recorded so it can be re-litigated.

### What this does _not_ achieve, stated plainly

**AC-5's "move one element in a 10,000-element board, under 16 ms" is still not met.** A keystroke now costs 17.4 ms of read against a 16.7 ms budget, having cost 32 ms.

The reason is Option C's whole argument, and it is worth being precise about why A and B cannot substitute for it. A and B make _repeated_ reads free. They do not make the _first_ read cheaper, and the first read after a transaction must walk every element, because every element is a `Y.Map` and turning 10,000 of them into plain objects is the cost. So one walk per keystroke survives, and 17.9 ms is what one walk costs.

Options A and B bought back the _second_ read and the three small-field reads. Only C removes the remaining walk, by not needing the elements at all.

That is not an argument for rushing C. It is an argument for recording the number honestly instead of letting "read() is now cached" stand in for "the keystroke fits in a frame", which it does not.

### One semantic change, now a tested property

A snapshot is no longer a point-in-time view: fields fill on first access, so one `read()` can straddle a transaction. Each field is internally consistent and memoised, so no caller sees a torn value _within_ a field — and a caller asking later arguably wants the later answer. `assets` had behaved this way since it was added.

This was Option A's cost as written above, and it is now the subject of a test named `a field asked for after a transaction reflects the new state`, so that changing the trade means deleting a test rather than surprising somebody.

## What is being asked

A signature on **B** (with A first), or on **C**, or on **A alone** with B deferred and the cost recorded as knowingly unmet — in which case AC-5's "move one element in a 10,000-element board, under 16 ms" is missed, and the roadmap should say so rather than leave it to be discovered.

## Consequences

- (++) Whichever is chosen, the measurement above is now reproducible rather than remembered, and `docs/roadmap.md`'s risk row can point at a command instead of a paragraph.
- (−) Option B trades a class of impossible bug for a class of subtle one. That is a real cost and it is why the freeze is part of the recommendation rather than a follow-up.
- (~) AC-5 criterion 1 (10,000 elements at 60 fps) was measured by [ADR-0017](0017-do-not-rewrite-the-renderer.md) with the renderer alone and `BoardSync` out of the path. That measurement is not invalidated by this ADR, and it is also not sufficient: the two costs are additive. Until this is fixed, the fps claim rests on evidence taken with the bridge removed.
