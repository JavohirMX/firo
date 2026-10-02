---
status: accepted
date: 2026-10-02
deciders: maintainer
---

# Keep the inherited renderer; the rewrite was justified by a measurement artefact

## Context and Problem Statement

Phase 2 exists to answer one question with numbers rather than judgement: does a
canvas that renders 10,000 elements at 60 fps require rewriting Excalidraw's, or
is a thinner fork enough? The gate is
[AC-11](../prd/04-acceptance-criteria.md#ac-11--the-renderer-rewrite-succeeded-phase-2-gate),
and a non-met gate has a scheduled outcome — revert to a thinner fork and ship a
smaller product ([the fallback](../plans/phase-2-renderer.md#the-fallback)).

The plan's justification for the rewrite was a cost model: a CPU profile and then a
positive control attributed **4.8 µs of drawing per element**, which implied a
10 ms draw budget holds about **2,100 elements** and that the target scale of
10,000 was two orders of magnitude out of reach without culling and level of
detail. Tasks 2.2 through 2.6 exist to close that gap.

That number was measured, and it was an artefact of the measuring environment.

**Headless Chromium on macOS rasterises in software.** `WEBGL_debug_renderer_info`
reports SwiftShader. Launching the same page windowed gets Metal on real
hardware. Same scene, same code, same machine, 9,766 elements visible, each
measured against a "draw nothing" control:

| | drawing costs | per element | 10 ms budget holds |
| --- | --- | --- | --- |
| software (SwiftShader) | 46.5 ms | 4.76 µs | ~2,100 elements |
| GPU (Apple M5, Metal) | 5.4 ms | 0.55 µs | ~18,000 elements |

**Software rasterisation makes a blit 8.6× more expensive.** Every conclusion
drawn from the software number was a conclusion about SwiftShader.

With the number corrected, the target this phase was written to hit — 60 fps at
10,000 elements — **is already met by the renderer we inherited, unmodified**: 73
fps at 9,766 visible elements on an M5. A GPU five times slower than an M5, which
is a rough stand-in for the "five-year-old laptop" in criterion 1, still holds
~3,600 elements in budget.

One criterion does fail. Zoom to 10% runs at **3.3 fps** against 101 fps at 50%
([§2.1e](../plans/phase-2-renderer.md#21e--an-open-problem-at-low-zoom-cause-unknown)).
It is real, reproducible, order-independent, and **not in the renderer's
JavaScript**: a CPU profile attributes 81–93% of the frame to `(idle)` and
`(program)`, and no individual JS function reaches 3%. Overdraw was tested as the
explanation and rejected — sweeping world size at fixed zoom gives no monotonic
relationship at all, and the fastest case is the most compressed. The mechanism is
unknown.

## Decision Drivers

- **The gate was designed to stop a rewrite justified by a guess. It has now done
  so.** AC-11's purpose was to make the biggest bet in the project falsifiable. The
  measurements came back saying the bet's premise was false. Acting on anything else
  would leave the gate decorative.
- **Effort spent here is effort not spent on Phases 3–7**, which is where the
  product is. A rewrite spends roughly a month on work whose measured benefit is
  zero and whose risk is regressing a renderer that works.
- **`@firo/board` already projects onto Excalidraw's element vocabulary.** The
  document↔canvas bridge added in October is written against that vocabulary, field
  by field. A new renderer would invalidate it, and it is the piece that makes the
  local-first thesis real.
- **A partly-failing gate must produce a decision, not a shrug.** Either the gate is
  met and Phase 2 closes, or the fallback fires. Leaving it open is how a project
  spends a quarter without shipping.
- **Criterion 5's failure is a bug, not an architectural verdict.** It is
  reproducible, localised to one zoom range, and outside the renderer's own code.
  Bugs get diagnosed; renderers get rewritten for frame budgets that are not being
  missed.

## Considered Options

1. **Rewrite as planned** — build the stage compositor, `rbush` culling, level of
   detail, the three cache layers and canvas text (tasks 2.2–2.6).
2. **Keep the inherited renderer.** Close Phase 2 against the inherited code,
   diagnose the low-zoom stall as a defect, and maintain the renderer's known
   inefficiencies opportunistically rather than as a phase.
3. **Trigger the fallback** — revert to a deliberately thinner fork and ship a
   smaller product.
4. **Measure more before deciding** — run the remaining spikes.

## Decision Outcome

**Option 2.**

1. **The renderer is not rewritten.** `packages/element/renderElement.ts`,
   `packages/editor/renderer/staticScene.ts`, `staticSvgScene.ts`,
   `element/shape.ts` and `element/collision.ts` are kept as inherited, and the
   stage compositor, spatial index and level-of-detail ladder in tasks 2.2 and 2.3
   are **cancelled**. `trd/04-rendering.md`'s design is superseded by this ADR for
   the orchestration and culling layers; its cache and device-pixel-snapping
   sections describe the inherited code and stand.

2. **Criterion 1 is met by the inherited renderer**, measured on a GPU rather than
   a software rasteriser. The fallback does not fire, because the gate the fallback
   guards is not missed.

3. **Criterion 5 is a defect to diagnose, not a reason to rewrite.** The next
   investigation is a Chrome trace that can account for `(program)`, because the JS
   CPU profiler has now said twice that the cost is not in this code. Guessing a
   third time from the same data would be the third wrong answer. It is bounded
   work with a known next step, and it does not block Phase 3.

4. **The renderer's real inefficiencies are maintenance, not a phase.** Two are
   genuine and neither is about frame rate:

   - **Culling is a linear scan** (`packages/editor/scene/Renderer.ts`), so cost is
     O(total elements) rather than O(visible). Invisible on a 10,000-element board
     at 100% zoom; not on a 100,000-element one, or at 10% zoom where everything is
     visible anyway.
   - **`elementWithCanvasCache` holds one bitmap per element with no zoom-level
     fan-out**, so a zoom invalidates every element at once — the 82–160 MB heap
     measured earlier. This is the most valuable of the abandoned optimisations and
     the one worth doing if and when memory is measured to matter.

   A third, the per-frame allocation in `isElementInViewport`, is already fixed
   (40,000 objects a frame, eliminated with 12 tests).

5. **Phases 3 through 7 proceed on the inherited renderer.** This is already the
   de facto position: the document↔canvas bridge, the autosave and the `.firo`
   format all assume it.

### Consequences

- (+) The largest single risk in the project is closed by measurement rather than by
  effort, and the month it would have cost goes to interaction, objects and
  persistence instead.
- (+) `@firo/board` is not invalidated, and the local-first path — document
  authoritative, editor a lossy projection — keeps its only implementation.
- (+) The hand-drawn font search deferred to Phase 2 by
  [ADR-0014](0014-font-position-after-phase-0.md) is now unblocked: there is
  rendered output to measure, which is what that ADR required and did not have.
- (-) `packages/editor/components/App.tsx` remains 12,946 lines. It is the reason a
  rewrite was ever proposed, and it stays. Interaction work in Phase 3 has to work
  around it rather than through it.
- (-) Memory at scale is unsolved and unquantified since the measurement
  environment was fixed. A board far larger than 10,000 elements may find the bitmap
  cache to be the wall, and the answer will be the zoom fan-out above.
- (-) **The gate as written is not fully demonstrable, and saying otherwise would be
  false.** Criterion 5 fails. Criteria 2, 3 and 4 — visual equivalence by reference
  image, the create/save/load budget, and hit-testing correctness at every zoom —
  are unverified, and nothing in this ADR verifies them. This ADR decides *whether
  to rewrite*, not that the renderer is finished.
- (-) The plan's own framing is now wrong in its opening paragraphs, which still
  describe a rewrite as the phase's purpose. It is corrected in place rather than
  rewritten, because the measurement record in §2.1a–2.1e is the most valuable
  thing in it.

### What would reverse this

Named in advance, because "we should revisit the renderer" is not a trigger:

- A measured regression against criterion 1 on GPU-backed hardware, at 10,000
  elements.
- Criterion 5's trace attributing the cost to a specific renderer structure —
  culling, the cache, or the two-canvas split — rather than to the browser.
- A measured memory ceiling that the zoom fan-out alone does not resolve.

Any of the three reopens tasks 2.2 and 2.3. None of them is "a contributor found
the renderer hard to read".

## Confirmation

- [x] Criterion 1 measured on a GPU: **73 fps at 9,766 visible elements**, inherited
      renderer unmodified, against a "draw nothing" control. `scripts/bench/`,
      windowed Chromium.
- [x] The software-rasterisation artefact identified and quantified: 4.76 µs/element
      against 0.55 µs/element, 8.6×.
- [x] Criterion 5 measured and failing: 3.3 fps at 10% zoom against 101 fps at 50%.
- [ ] Criterion 5's mechanism identified. **Open.** Needs a Chrome trace that can
      attribute `(program)`.
- [ ] Criterion 2, visual equivalence by reference-image comparison. **Open.**
- [ ] Criteria 3 and 4, create/save/load budget and hit-testing at every zoom.
      **Open.**
- [ ] Memory measured on GPU-backed hardware at 10,000 elements. **Open.** The
      82–160 MB figure predates the measurement-environment fix.

## More Information

- [`../plans/phase-2-renderer.md`](../plans/phase-2-renderer.md) — §2.1a–2.1e is
  the measurement record this decision rests on, including the four ways the
  environment invalidated earlier numbers
- [`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) — AC-11,
  the gate, and AC-5, the budget it references
- [`../trd/04-rendering.md`](../trd/04-rendering.md) — the design, superseded in
  part by this ADR
- [`../roadmap.md`](../roadmap.md) — Phase 2's exit criterion and the fallback
- [ADR-0016](0016-enforce-the-write-path-with-a-proxy.md) — the write path the
  renderer sits downstream of
