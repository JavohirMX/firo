---
status: rejected
date: 2026-10-03
deciders: maintainer
---

# Keep `FiroDoc.read()` a full snapshot for now — REJECTED

> **Rejected by the maintainer, 2026-10-04.** The reasoning below stands and the measurement reproduces exactly (see _Re-measured_). What was rejected is the conclusion: "keep it as a full snapshot and re-measure before v1". The decision is to fix the hot path, which means changing the read interface, which this ADR declined to do on its own authority.
>
> The successor is [ADR-0020](0020-stop-walking-the-whole-document-to-read-it.md), which sets out the options and asks for a signature on one of them rather than choosing for the maintainer. It carries the re-measurement and one finding this ADR did not have: **`assets` is lazy and every other field is not**, so a caller that wants only the collections pays for every element on the board.

## Context and Problem Statement

`FiroDoc.read()` in [`packages/doc/src/doc.ts`](../../packages/doc/src/doc.ts) returns a `BoardSnapshot`: every element, every record, every collection, the z-order, the meta map. It builds it by walking the whole document, and `readAllElements` in [`structure.ts`](../../packages/doc/src/structure.ts) calls `fromYMap` **per element**, which allocates a fresh `Object.create(null)` per element _and_ per nested `Y.Map` inside it. Every read is O(total) in time and in allocation, and the result is a set of objects that are garbage the moment the reader drops them.

That is not a design flaw — it is the read half of the single write path. [ADR-0016](0016-enforce-the-write-path-with-a-proxy.md) made `commit()` the only thing that writes, and a snapshot of plain, detached objects is what lets a caller read the document without any possibility of reaching a live `Y.Map` and mutating it. `structure.ts` says so at the top of `fromYMap`. The cost is the price of that property.

The problem is where it is spent. Four callers, three of them on a keystroke or a drag:

| Caller | When it reads | Reads? |
| --- | --- | --- |
| `FiroDoc.notify()` — `doc.ts` | every durable transaction, _if_ `subscribe()` has a listener | yes, before iterating listeners |
| `BoardSync.push()` — [`sync.ts`](../../packages/board/src/sync.ts) | after a push that produced mutations, to re-read what the document actually committed | yes |
| `BoardSync.onDocumentChanged()` — `sync.ts` | every notification it does not suppress, for the echo guard | yes |
| `saveBoard()` — [`storage.ts`](../../apps/web/board/storage.ts) | each debounced autosave (400 ms) and each flush | yes |

`commitBoard()` is called unconditionally from Excalidraw's `onChange` in [`apps/web/App.tsx`](../../apps/web/App.tsx), whose own comment reads "since this is a hot path". During a drag that fires per frame.

**Two reads per editor change, and one of them is thrown away.** A drag frame changes `x`/`y`, so `push()` finds mutations, commits, and re-reads what the document actually committed. That commit fires the document's own `update` event, which calls `notify()`, which calls `this.read()` — and the one subscriber, `onDocumentChanged`, returns immediately on `this.committing`. **The snapshot is built and then discarded, every push.** A notification that is _not_ from `push()` — a remote apply, `doc.load()` at startup — costs two reads instead, because `onDocumentChanged` calls `this.doc.read()` for its echo guard rather than using the snapshot it was handed.

Sources are cited by file and function name rather than by line number, because `sync.ts` and `doc.ts` are being edited alongside this record and a decision log should not rot the week it is written.

### The measurement

Node, Apple Silicon, esbuild built against real Yjs, at three board sizes:

| elements | per `read()` | allocated per `read()` |
| -------- | ------------ | ---------------------- |
| 100      | 109 µs       | 168 KB                 |
| 1,000    | 1.14 ms      | 1.7 MB                 |
| 10,000   | 17.5 ms      | 17 MB                  |

End-to-end `BoardSync.push()` at 10,000 elements: **~41 ms** — roughly 2.5× a 60 fps frame budget, and that is before the renderer draws anything.

The absolutes are machine-specific and Node is not a browser. **The ratios are the finding**: linear in element count, allocation-dominated, and additive with every other cost on the path.

### Two things this must not be mistaken for

**1. It is not a regression from the recent work, and it is not the renderer gate failing.** The eager half of `read()` is byte-identical before and after the lazy `assets` getter was added: `git show 34f9d45:packages/doc/src/doc.ts` returns the same four walks and `fromYMap(meta)`, and `dd6182f` added the getter and nothing else to the body. A reader comparing profiles across those commits is comparing like with like.

And ADR-0017's 73 fps was measured **on the renderer alone**, with `BoardSync` out of the path entirely ([`scripts/bench/`](../../scripts/bench/read-snapshot.mjs), windowed Chromium). It was never a claim about this cost. The two costs are additive, so criterion 1 must be re-measured with the bridge attached before it is quoted again — and this ADR does not reopen ADR-0017, which stands.

**2. It is not merely an inefficiency. It misses a budget already written down.** AC-5's row "Move one element in a 10,000-element board — under 16 ms" ([`prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md)) is a v1 gate. Two `read()`s is ~35 ms before the renderer draws. On the numbers measured today, that criterion is not met. Stating that is the reason this ADR is `proposed` rather than settled.

The same shape already has a rule against it. `trd/06`'s second property for projections is "`applyChange` is O(changed records), not O(all records) — a projection that re-lays-out the whole collection on every keystroke will fail AC-5". **The bridge is currently the one part of the read path that does not obey the rule the records design obeys.** That is worth recording, because the fix is not a matter of finding where the rule went unfollowed — it is a matter of deciding which interface the rule is expressed in.

The [risk table](../roadmap.md) already carries this row and says the fix "is an interface decision and wants an ADR". This is that ADR.

## Decision Drivers

- **`read()` is the read half of the single write path**, and its contract — a consistent, read-only, plain-object snapshot as of one instant — is what `@firo/board`, the exporter, the autosave and a large body of tests are written against. Changing the shape of that snapshot changes all of them.
- **`AGENTS.md` requires escalating before changing the Yjs document structure.** An observer/delta API changes what callers are told about the document's contents. A revision-keyed cache changes _when_ they are told, and turns a snapshot from disposable into shared. Both are close enough to that line to be a maintainer decision, not a hot-path cleanup by whoever feels the lag first.
- **A cache trades transient garbage for resident memory.** The 17 MB per read is currently collectable immediately. AC-5 names "idle memory on a 10,000-element board — under 500 MB". Any option that makes reads cheaper by holding objects alive has to be argued against that budget, not just against time.
- **The cost is pre-existing and O(all), not O(changed)** — so the honest framing is the same one `trd/06` already uses, not "the new bridge is slow".
- **Effort spent on the bridge is effort not spent on Phases 3–7.** The same argument that closed the renderer rewrite.
- **v1 boards are workshop whiteboards, not 10,000 elements.** Nothing in the PRD names 10,000 elements as the size people actually use; it names it as the size the _budget_ is measured at.
- **A decision made now, with the numbers attached, is cheaper than one made from a profile during Phase 3.** But only if it is made with the right numbers — see the Confirmation list, where four of the load-bearing ones are still open.

## Considered Options

1. **Change nothing now.** Keep `read()` as it is, record the measurement, accept the cost for v1, and set the reversal triggers.
2. **Delta / observer API** — subscribers receive what changed rather than a full snapshot.
3. **A revision-keyed cache** inside `FiroDoc`, rebuilding only the elements a transaction touched.
4. **Make `push()` not need a full read** — project the document's two normalisations locally instead of re-reading.
5. **Fix only the two provable wastes** — the discarded snapshot in `notify()` and the re-read in `onDocumentChanged`.
6. **Coalesce `notify()`** — batch transactions into one read per frame.

## Decision Outcome

**Option 1**, subject to the maintainer's ratification below.

1. **`read()` is not changed.** Not in this phase, not on the hot path, and not by a wrapper that makes it lazy for some callers and eager for others — the `assets` getter already did that once, deliberately and for one field.

2. **The measurement is the artefact**, and it belongs in three places: this ADR, the roadmap risk row, and the Confirmation list below. Anyone who re-measures should report the browser number _and_ the Node number, because only the first settles it.

3. **Criterion 1 is re-opened for re-measurement, not re-decided.** ADR-0017 stands and the renderer is not in question. What needs a new number is criterion 1 **with `BoardSync` attached**, which is what the app runs. Until that number exists, "73 fps at 9,766 elements" should be quoted as "73 fps with the renderer alone".

4. **AC-5's "move one element under 16 ms" is recorded as a known gap**, not claimed as passing. It is a v1 gate, the Node numbers say it is missed, and the browser measurement that would settle it is open. Saying so is cheaper than having a tester discover it.

5. **`read()` stays the only full-snapshot reader.** A consumer that needs a delta has to ask for one explicitly. No second implicit full-read path accumulates beside it.

6. **Nothing is bundled into this ADR.** In particular option 5 — which touches no Yjs structure and could plausibly remove one of the two reads — is _not_ taken here, because it changes what `subscribe()` promises its listeners, and because no browser measurement of it exists. Taking an unmeasured optimisation inside a documentation-only record is the mistake [ADR-0017](0017-do-not-rewrite-the-renderer.md) was written about.

### What "accepting it" actually assumes

Option 1 is honest only if the assumption is written down, and it is an assumption about people rather than about code:

**That v1 boards stay well under 10,000 elements.** Nobody has measured the size of a real workshop board. AC-5 names 10,000 because a budget needs a number to be testable at, not because it is a claim about the product.

**And it is explicitly not a limit.** AC-2 is "No limits, anywhere in the code". Option 1 therefore adds no ceiling, no warning and no cap: a 10,000-element board in v1 is slow, and saying so is a fact rather than a restriction. If the maintainer would rather this decision _include_ a stated board-size ceiling, that is a product decision with an AC-2 consequence and belongs in its own words, not implied here.

### Consequences

- (+) Nothing on the write path moves, so nothing that depends on the single write path can regress. The four architectural rules in `AGENTS.md` are untouched.
- (+) The pre-existing cost is now a number with a method behind it rather than an impression, and it is clearly separated from the lazy-`assets` work that arrived in the same window.
- (+) `trd/06`'s O(changed)-not-O(all) rule is recorded as applying to the bridge too, which is the form any future fix will have to take.
- (+) Phase 3 starts with the interaction work it exists for, not with a performance refactor of the document's read API.
- (-) **AC-5's move-one-element row is knowingly unmet** if the Node ratios hold in a browser. That is the real cost of this decision and it is a v1 gate.
- (-) **"73 fps" needs a footnote everywhere it appears** — the roadmap, the Phase 2 plan's opening, ADR-0017's own Confirmation list — and the ADR log's immutability rule means ADR-0017 cannot be edited to carry it. The footnote lives here and in the roadmap row instead.
- (-) The cost is O(total) on a path the product's own design says should be O(changed), so **Phase 6 records will add a second O(all) walk on the same keystroke** unless this is fixed first. Deferring does not remove the work; it moves it to the phase where it is more expensive to fix, because by then the interface has two callers with different needs.
- (-) `read()`'s contract gets a second undocumented exception: the `assets` getter already gave up "read at the instant `read()` returned" for one field. A future change has to work around that rather than through it.
- (-) `notify()` keeps building a snapshot its only listener may discard. That is a visible waste on a hot path, and "we measured it and left it" is not the same as "we do not know".
- (~) Two of the six options need a browser measurement before they can be believed, and none of them has one. The decision to wait is only as good as that measurement discipline.

### What would reverse this

Named in advance, because "we should revisit `read()`" is not a trigger:

- **AC-5's "move one element in a 10,000-element board — under 16 ms" measured failing in a browser, with `BoardSync` attached.** This is the primary trigger, and it is a number already written into the PRD rather than invented here.
- **Criterion 1 re-measured below 60 fps on GPU-backed hardware at 10,000 elements with the bridge in the path.** This is ADR-0017's first trigger re-scoped: it fires for the renderer on its own terms, and for this decision once the bridge is in the measurement.
- **A measured allocation ceiling** — GC pauses or heap growth, in a browser, at a board size a real workshop reaches, attributable to `read()`'s fresh-object churn. The trigger is a felt board size, not the 17 MB figure, which is only a number on this machine.
- **Phase 6 records reaching the same keystroke.** `trd/06` requires projections to be O(changed); a collection large enough for a projection to re-lay-out per keystroke makes the fix one interface decision instead of two.
- **Phase 9 collaboration, where every remote apply is also a `notify()` and therefore also a full read.** This is the concrete form of the roadmap's open question "Is Yjs still the right engine at 10,000 elements with 20 concurrent editors?" — measured, that question answers this one.

None of these is "a contributor noticed the allocation", and none is "the Node numbers looked bad".

### What this does not decide

So that the next person does not reopen it by accident:

- **Whether `assets` stays a lazy getter.** Untouched. [ADR-0018](0018-a-firo-is-a-directory.md) outcome 2 depends on `serializeBoard` building a fresh five-field object and never walking `assets`, and `assets.test.ts` asserts it. Any change to `read()`'s shape must preserve that, which is one more constraint on options 2 and 3.
- **Whether 400 ms is the right autosave debounce.** Untouched, and it is the cheapest knob if the third read ever matters more than the first two.
- **Whether culling is still a linear scan**, or whether the bitmap cache still has no zoom fan-out. Both are ADR-0017's maintenance list, both are additive with this cost in the same frame, and neither is decided here.
- **Whether the low-zoom stall is related.** It is not. That one is browser-internal, measured outside this path, and unexplained.
- **Whether `read()` becomes lazy per collection rather than per field.** That is an implementation of options 2 or 3, not a decision this ADR makes.
- **How much of `push()`'s 41 ms is `read()`.** The arithmetic says ~35 of 41, leaving ~6 ms for `editor.read()`, `fromEditorElements`, the baseline map and `diff`. Nobody has measured it, and the whole ranking of the options above depends on it.

## Confirmation

Measured or verified today:

- [x] `read()` is a full O(total) walk allocating a fresh plain object per element and per nested map: `read()` → `readAllElements` → `fromYMap`, with `Object.create(null)` at every level. [`structure.ts`](../../packages/doc/src/structure.ts).
- [x] `notify()` reads on every durable transaction and skips the read only when nothing is subscribed. `BoardSync.start()` subscribes, so in the app it always reads.
- [x] **Two `read()` calls per editor change that produces mutations**, and the second is built and discarded: `push()` re-reads after committing, the commit's own `update` event drives `notify()`'s read, and `onDocumentChanged` returns on `this.committing` before looking at it.
- [x] A notification not originating in `push()` costs two reads, because `onDocumentChanged` calls `this.doc.read()` for its echo guard rather than using the snapshot `notify()` handed it.
- [x] A third read per debounced autosave and per flush: `serializeBoard(doc.read())` in `saveBoard`, behind the 400 ms `AUTOSAVE_DELAY_MS` in `board.ts`.
- [x] `commitBoard()` is called unconditionally from Excalidraw's `onChange`, in a function whose own comment calls itself a hot path. `apps/web/App.tsx`.
- [x] The measured figures and method: 109 µs / 168 KB at 100 elements, 1.14 ms / 1.7 MB at 1,000, 17.5 ms / 17 MB at 10,000, ~41 ms end-to-end `push()` at 10,000. Node, Apple Silicon, esbuild against real Yjs.
- [x] **The eager half of `read()` is unchanged by the lazy `assets` getter.** `git show 34f9d45:packages/doc/src/doc.ts` and `dd6182f`, which added it. This is a pre-existing cost, not a fresh regression.
- [x] ADR-0017's 73 fps was measured on the renderer alone, with `BoardSync` out of the path. The costs are additive and criterion 1 has not been measured end-to-end.
- [x] `trd/06` already requires projections to be O(changed) rather than O(all) for exactly this reason, so the rule the bridge breaks is not a new one.
- [x] The cost predates the bridge's _wiring_ problem in the sense that matters: the eager walk is the original `read()`, and the second call site is a consequence of subscribing, which is what made the document authoritative over the editor.

Open, and load-bearing:

- [ ] End-to-end `push()` in a **browser**, at 1,000 / 5,000 / 10,000 elements, decomposed into `editor.read()`, `fromEditorElements`, `diff`, and the two `read()`s. Node figures do not settle this, and ADR-0017 is the precedent for why.
- [ ] **Criterion 1 re-measured with `BoardSync` attached.** Open. This is the reason the ADR is `proposed`.
- [ ] AC-5's "move one element under 16 ms" measured in a browser on the same conditions. The Node numbers say it fails; that is a prediction and must be measured.
- [ ] The share of `push()`'s 41 ms that is `read()` rather than folding or diffing. The arithmetic says ~35 of 41; nobody has measured it, and it is what orders options 2, 4 and 5 against each other.
- [ ] Whether the maintainer accepts option 1 or directs options 2–6. **This ADR decides nothing until that happens.**
- [ ] A board-size figure for what a real workshop actually reaches. Option 1 rests on it and nobody has one.

## Pros and Cons of the Options

### 1. Change nothing now — chosen

- (+) Touches nothing. The single write path, `read()`'s contract, the `subscribe()` contract and ADR-0018's dependency on `serializeBoard` all stay exactly as they are.
- (+) Records a measured cost with a method, which is the thing ADR-0017 showed this project is good at and bad at doing in equal measure.
- (+) Preserves the option to fix it later against a better measurement, and a better measurement is a browser one that does not exist yet.
- (-) **Knowingly leaves a v1 gate unmet.** AC-5's move-one-element row is expected to fail on the numbers measured today.
- (-) Leaves a documented waste in `notify()` that a reviewer will re-derive from scratch, because the code will still show a read whose result is discarded.
- (-) Defers an interface decision to the phase where two consumers need different things from it.

### 2. Delta / observer API

- (+) The only option that makes the cost O(changed), which is what the problem actually is and what `trd/06` already demands of projections.
- (+) Yjs supplies the raw material. `observeDeep` reports which `Y.Map`s/`Y.Array`s a transaction touched, so this is not speculative machinery.
- (+) **`BoardSync.diff` already computes it.** It builds `beforeById`, deletes as it matches, and what is left over is the removed set. The delta is computed today and thrown away.
- (-) **It inverts the contract.** `subscribe(listener(snapshot))` hands every subscriber the whole board, and consumers depend on that: `boardElements()` reads for the initial scene, the exporter reads a snapshot, `sameElements()` compares two full lists. A delta API makes each consumer a projection that can drift — which turns the read half of the single write path into a distributed-state problem, and that is squarely on the wrong side of `AGENTS.md`'s escalation rule.
- (-) **The hard case is z-order, not fields.** `elementOrder` is one `Y.Array` where a concurrent insert merges by position, so a delta mostly says "the order changed" and each subscriber re-reads the array. That is cheap in bytes and O(n) in ids, so the delta API still needs a full-order path — and it is not obvious that is where the complexity lands rather than the diffing.
- (-) The failure mode is silent. A consumer that misses one delta shows a stale board with no error, which is worse than a slow one.

### 3. A revision-keyed cache inside `FiroDoc`

- (+) The cheapest _correct_ version of the idea, and the only one that needs no consumer to change. `read()` still returns a `BoardSnapshot` of plain objects; it just stops rebuilding the ones nothing touched. Yjs already says which nodes changed.
- (+) It preserves read-only-by-construction almost for free: the cached object was plain when it was built.
- (-) **It breaks the property that makes `read()` safe.** Today the contract is "fresh objects, so a caller cannot reach through them and mutate the document". The cached objects are not frozen, and `fromYMap` deliberately returns plain null-prototype objects rather than frozen ones. A consumer that mutates a snapshot it was handed would corrupt the next reader, and nothing would throw. This is the sharpest cost on the list and it is easy to miss, because the failure is a mutation rather than a slowdown.
- (-) **It trades transient garbage for resident memory.** 17 MB per read is currently collectable at once; a cache holds it for the idle period, against AC-5's "idle memory under 500 MB". The option that fixes the time budget is the one that spends the memory budget.
- (-) Invalidation has to cover every nested map, including remote peers' writes, and `read()` is reachable from a getter that must not be stale. `observeDeep` covering `fromYMap`'s recursive descent is where the fiddliness lives.
- (-) It is a cache, so it needs invalidation tests for a class of bug that presents as _stale data_, which is the hardest kind to diagnose and the one this project's rules exist to prevent.

### 4. Make `push()` not need a full read

- (+) Removes exactly one of the two reads, and it removes the read that exists for a **known and narrow** reason — the document stamps `updated` and assigns the fractional index — rather than for general correctness.
- (+) Local to `@firo/board`. No Yjs structure, no change to `read()`'s contract, no effect on any other consumer. Of everything on this list it is the best-shaped change.
- (-) **It duplicates knowledge, in the one class that must not.** The re-read is a declaration that we do not know what the document did. Replacing it with a local projection means `@firo/board` has to know how `updated`, `version`, `versionNonce` and the fractional index are assigned, and keep knowing forever or the echo baseline drifts and the loop guard stops recognising its own writes.
- (-) The file's own comments say what that failure looks like: not a crash, but a note's text silently blanking, and the sync loop running. Both have already happened once, and both were introduced by the fix for an earlier one. This is the worst available trade — a _known_ cost exchanged for an _invisible_ correctness risk in the code with the worst history in the repository.
- (-) It buys ~17 ms of ~41. The other read stays.
- (-) It needs a browser measurement to be believed, and 41 ms is a Node number.

### 5. Fix only the two provable wastes

- (+) Two reads per change become zero on the push path, with no change to `read()`, no change to Yjs structure, and no change to the CRDT.
- (-) Both halves are interface changes, which is the recurring theme and the reason none of this is a cleanup. `onDocumentChanged` re-reading the snapshot it was handed is a change to what `subscribe()` promises; and `notify()` _cannot know_ in advance whether a listener will want the snapshot, so "don't build it" means either a two-tier subscription API or listeners declaring what they need. Both are contracts.
- (-) Even at zero it does not touch the autosave's read, the initial scene's read, or `read()`'s cost for the exporter — so it lowers the constant on the hot path without changing the asymptotics.
- (-) It is the option most likely to be done on the strength of the Node numbers, and it is the option where "the snapshot was nearly the whole cost" most needs proving first.

### 6. Coalesce `notify()` into one read per frame

- (-) Ineffective against the measured path. `push()` is per editor change, not per frame-batchable group, so the dominant cost is untouched.
- (-) Changes the observable timing of every subscriber, and `subscribe()`'s own comment leans on "fires on transactions, not on elements" — a commit touching four elements fires once, which is what makes the loop guard's reasoning work.
- (-) Risks coalescing transactions the undo manager treats as separate steps, which would move cost from the frame budget into a bug that is very hard to see.

## More Information

- [`../roadmap.md`](../roadmap.md) — the risk-table row this ADR answers, and the open question about Yjs at 10,000 elements with 20 editors
- [`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) — AC-2 (no limits), AC-5 (the budgets this threatens), AC-11 (the Phase 2 gate)
- [`../plans/phase-2-renderer.md`](../plans/phase-2-renderer.md) — criterion 1 and the measurement environment that invalidated four earlier numbers
- [`../trd/06-records-and-projections.md`](../trd/06-records-and-projections.md) — property 2, "O(changed records), not O(all records)", the rule the bridge currently breaks
- [`../architecture/overview.md`](../architecture/overview.md) — the seam, the authoritative-document rule, and the write/read data flow this cost sits in
- [`../../packages/doc/src/doc.ts`](../../packages/doc/src/doc.ts) — `read()`, `notify()`, and the lazy `assets` getter's own accounting of what it gives up
- [`../../packages/doc/src/structure.ts`](../../packages/doc/src/structure.ts) — `readAllElements` and `fromYMap`, where the allocation actually happens
- [`../../packages/board/src/sync.ts`](../../packages/board/src/sync.ts) — `push()`, `onDocumentChanged()`, and the loop guard whose correctness makes option 4 expensive
- [`../../apps/web/board/storage.ts`](../../apps/web/board/storage.ts) — the autosave's third read
- [ADR-0016](0016-enforce-the-write-path-with-a-proxy.md) — the single write path whose read half this is
- [ADR-0017](0017-do-not-rewrite-the-renderer.md) — the measurement discipline and the reversal-trigger convention this ADR follows, and the criterion-1 claim that needs a footnote
- [ADR-0018](0018-a-firo-is-a-directory.md) — depends on `read()`'s shape, and on `serializeBoard` not walking `assets`
