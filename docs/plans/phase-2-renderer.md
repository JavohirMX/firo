# Phase 2 — Renderer rewrite

**Goal:** a canvas that renders 10,000 elements at 60 fps and is visually equivalent
to Excalidraw for the element types we inherited.

**This is the phase the project succeeds or quietly fails on.** Everything before it
is setup and everything after it depends on it.

**Status: the rewrite is cancelled. The renderer is kept.**
[`ADR-0017`](../adr/0017-do-not-rewrite-the-renderer.md) records the decision and the
measurements behind it. In short: the cost model this plan was written around was
measured on a software rasteriser, and on a GPU the **inherited renderer already meets
criterion 1** at 73 fps with 9,766 visible elements. Tasks 2.2 and 2.3 are cancelled;
2.4 to 2.6 describe code that was kept.

**Read that status before the rest of this document.** The phase's premise is
withdrawn, and sections 2.1a to 2.1e are the record of how: four measurements that had
to be thrown away, and a positive control that is what makes the surviving numbers
mean anything. What remains open is criterion 5, one problem, cause unknown.

## Exit criterion — the gate

All five must hold. These are numbers, not judgements
([AC-11](../prd/04-acceptance-criteria.md#ac-11--the-renderer-rewrite-succeeded-phase-2-gate)):

1. 10,000 elements, 60 fps sustained pan, under 500 MB idle — on a five-year-old
   laptop, not a developer machine
2. Rendered output is **visually equivalent** to Excalidraw for inherited element
   types, verified by reference-image comparison
3. A 10,000-element scene creates, saves and loads within budget
4. Rotation, resize, arrow binding and hit testing are correct at every zoom level,
   including rotated-outside-bounds elements
5. Zoom from 10% to 400% with no frame over 100 ms

**The gate is a scheduled decision point, not a hopeful target.** See
[the fallback](#the-fallback).

## What we keep and what we build

**Decided in [`ADR-0017`](../adr/0017-do-not-rewrite-the-renderer.md): the left
column is the whole list.** Nothing in the right column is being built as a phase.
The table is kept because the reasoning is worth reading, and because the abandoned
optimisations are the ones to reach for if a measurement ever says they are needed.

| Keep (MIT, port directly) | Build (new) — all cancelled |
| --- | --- |
| `element/shape.ts` — roughjs mapping, `ShapeCache` | The stage compositor |
| `element/renderElement.ts` — bitmap cache, device-pixel snapping | Viewport culling with a spatial index |
| `renderer/staticScene.ts` — the element draw pass | Level of detail |
| `renderer/staticSvgScene.ts` — the SVG export path | The render loop and scheduling |
| `element/collision.ts` — hit testing | Layout passes and resize |
| Browser limits: `AREA_LIMIT`, `WIDTH_HEIGHT_LIMIT` | |

Two items survive as maintenance rather than as a phase: culling is still a linear
scan, and the bitmap cache still has no zoom fan-out. Both are real, and neither is
about frame rate — see ADR-0017's consequences.

| Discard | Why |
| --- | --- |
| `App.tsx` (12,942 lines) | The central architectural problem |
| `scene/Renderer.ts` nonce invalidation | Random-nonce cache invalidation is undocumented and undebuggable |
| The two-canvas static/interactive split | One canvas plus an overlay pass, if the benchmark holds |
| `AppState` as a single god object | Split by concern |

Full design: [`../trd/04-rendering.md`](../trd/04-rendering.md).

## Tasks

### 2.1 — Spikes before implementation

Three isolated spikes, each producing a measurement. Do not start the renderer
before these are done.

| Spike | Question | Timebox |
| --- | --- | --- |
| **Culling** | Does `rbush` + viewport query hold 60 fps at 10,000 elements? | 2 days |
| **Single canvas** | Does one canvas with a drawn-last overlay match the two-canvas approach, or is Excalidraw's split load-bearing? | 2 days |
| **Text** | Can ProseMirror layout be drawn to canvas at 60 fps with 500 text elements? | 3 days |

**The single-canvas spike is the most important.** If one canvas does not hold the
budget, Excalidraw's two-canvas split is load-bearing and we keep it. Finding that out
in a spike costs two days; finding it out in the renderer costs a month.

#### 2.1a — The measurement environment, which invalidates everything above

Recorded before the spikes, because two spikes were run and both produced numbers
that had to be thrown away.

**0. This machine is shared and frequently oversubscribed, and it breaks the test
suite before it breaks a benchmark.** `uptime` reached a load average of 46 on 10
cores during ordinary work here, with `llama-server`, `WindowServer` and `cloudd`
among the consumers. A full `yarn test:app --watch=false` run under that load
reported **211 failures** — every one of them a timeout in a test that passes on
an idle machine, including 10 that are the known pre-existing sidebar ones. None
were assertion failures.

The lesson is not "wait for an idle machine", which is not always available. It is
that **a failure count from this machine means nothing on its own**: check
`AssertionError` separately from timeouts, and record the load alongside the
number. A timeout is a statement about contention; an assertion failure is a
statement about the code, and only the second one is worth investigating.

The same applies to the interactive browser checks used for Phase 3. Several hours
were spent reading a "the document is one point behind" result that turned out to
be a correct measurement on a correct build — but only after two runs were thrown
away because a stale `dist/dev` bundle was being served, which is its own trap,
recorded at the end of this section.

**1. Headless Chromium here rasterises in software.** `WEBGL_debug_renderer_info`
reports `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …), SwiftShader driver)`.
There is no GPU. Rasterisation cost measured here is software-raster cost and is
*not* representative of a user's machine, which has a GPU. Ratios between
configurations may survive; absolute milliseconds will not. Criterion 1's
"five-year-old laptop" cannot be satisfied in this environment at all, so it needs
either a GPU-backed browser or a real machine.

**1b. The app consumes `@firo/*` as build output, not source.** `packages/board`'s
`exports` resolve to `dist/dev/index.js`, so a change to a package's `src` is
**not** visible to the running app until `yarn build:packages` has been run. Two
browser measurements were thrown away because the app was serving a stale bundle and
the change under test appeared to have no effect at all — a convincing, entirely
false negative. When a source change "does nothing" in the browser, rebuild the
packages before concluding anything.

**2. The frame-time metric was vsync-quantised.** `measure` collects rAF timestamp
deltas, and those land on the 16.7 ms grid. Under one budget that is invisible; far
above it, it dominates: at a true 70 ms frame cost the reported interval is 83.3 ms.
Three runs of one build at one zoom reported p50 values of 16.7, 133.3 and 200.0 ms,
and one reported 0.0. That spread describes the grid, not the renderer.

The fix is to quote the **mean**, which is not quantised because the grid phase does
not repeat, and to collect enough samples for it to mean something — a 3 s window at
80 ms per frame is about 37 samples. `FrameReport.meanMs` now carries it and the
report leads with it. `p50`/`p95` are demoted to secondary and are only meaningful
below one frame budget.

**3. The machine has to be quiet or nothing is measurable.** A CPU-bound render
benchmark is the one measurement that cannot survive contention. With a raytracer
from another project saturating all cores, the A/B on the `setTransform` change
(7 runs per side) gave medians of 66.2 ms without and 67.6 ms with — a difference
smaller than the run-to-run spread of 63.6–84.3 ms. The same contention made four
unrelated tests fail under a parallel `vitest run` and pass when re-run alone. Load
average reached 157 on 10 cores.

So the rule for the spikes: **check `uptime` before and during, and re-run any A/B
whose two sides overlap in range.** A benchmark that cannot tell two builds apart is
not evidence that they are equal — it is evidence that it cannot measure.

#### 2.1b — What the CPU profile did and did not show

A CPU profile of a dense board (10,000 elements, ~9,766 visible, 1024 px world,
100% zoom, ~66–72 ms per frame, ~7 µs per element) attributed **80% of per-element
self time to `setTransform`** — a native canvas call — with the `drawImage` blit
itself under 6%. That pointed at a redundant native call in the hot loop, and
`renderElement.ts` did have one: `getTransform()` and `setTransform()` ran once per
element unconditionally, to undo a transform that the snapping branch only sets when
`canSnapElement` is true, which is rare. Both are now conditional.

**The fix is correct and strictly removes work, but no win was measured.** The A/B
above is the reason, and it is not evidence that the fix does not help — it is
evidence that the measurement could not detect anything.

More important is what the profile *cannot* see. Roughly 80% of the frame is
unattributed to any JS frame, which is what software rasterisation looks like from
inside a JS CPU profiler. So the profile is not a reliable guide to the dominant
cost in this environment, and acting on its top line as though it were is the exact
error this phase exists to avoid.

**Therefore: the lever is still unidentified.** The plan's three spikes stand.

#### 2.1c — The correction: it *is* a per-element drawing cost

The paragraph above reaches the wrong conclusion, and a positive control is what
shows it. Its reasoning was: "`setTransform` is 80% of self time, but removing it
changed nothing, so the profile is not a reliable guide." Both halves are true. The
error was assuming the cost had moved somewhere unmeasured, rather than testing
that.

**The control.** Inject `return;` as the first statement of `drawElementFromCanvas`,
so the element loop still runs and draws nothing:

| | mean frame |
| --- | --- |
| all 9,766 elements drawn | 63.2 ms |
| nothing drawn | 16.7 ms — the vsync floor, not work |

So **46.5 ms of a 63 ms frame is the per-element draw: 4.8 µs per element.** A
control like this is what makes a null result mean something. Without one, "the fix
did not help" is equally consistent with "the fix never ran" and "the fix was
irrelevant". With one, the null result is real — the `setTransform` call is close to
free, and Chrome charges the sample to it rather than charging it for the work.

Worth noting how nearly this went the other way. A file-swap A/B could easily have
been silently inert — a stale dev-server module serves the same bytes for both sides
and reports a tidy, meaningless zero. The control is what distinguishes that from a
genuine null, and it cost three runs.

**What this corrects.** 2.1b concluded this was "not a Level of Detail problem, not a
culling problem, and not a rasterisation problem... a small local fix rather than a
rewrite." That is wrong. The cost is per-element drawing, so *drawing fewer elements
is the lever* — which is exactly what 2.2 (culling) and 2.3 (level of detail) are
for. The plan's priorities were right and the profile was misleading. A ranked
profile is not a substitute for a control.

**The budget this implies.** At 4.8 µs per element, a 10 ms draw budget — leaving
headroom inside a 16.7 ms frame — holds about **2,100 elements**. Past that, no
micro-optimisation inside the draw path rescues it, because the work is one blit per
element and there is no cheaper blit. So the spikes must answer two concrete
questions:

1. How many elements are on screen in practice? If a real board rarely exceeds
   2,000 visible, 2.3 is unnecessary and the renderer is nearly done.
2. What does it cost to decide *not* to draw? If the visibility test costs more than
   the 4.8 µs it saves, culling has to be spatial (an R-tree, 2.2) rather than
   per-element.

Two caveats on the 4.8 µs. It is a software-rasterised number and a real GPU will be
cheaper, so 2,100 is a floor on the useful element count rather than a ceiling. And
it averages over a scene whose elements overlap heavily at 100% zoom in a 1024 px
world; 2.4 (caching) may move it substantially, so the figure should be re-measured
after the cache work rather than treated as final.

#### 2.1d — The measurement environment was the bottleneck, not the renderer

2.1c sized everything from 4.8 µs per element and concluded a 10 ms draw budget
holds ~2,100 elements. That number was produced by a software rasteriser, and it is
wrong for the machine any user will run this on.

`chromium.launch()` with no options runs headless, and headless Chromium on macOS
rasterises through SwiftShader — a CPU rasteriser. Launching the same page windowed
gets Metal on real hardware. Same scene, same code, same machine, 9,766 elements
visible, each measured against the "draw nothing" control:

| | drawing costs | per element | 10 ms budget holds |
| --- | --- | --- | --- |
| software (SwiftShader) | 46.5 ms | 4.76 µs | ~2,100 elements |
| GPU (Apple M5, Metal) | 5.4 ms | 0.55 µs | ~18,000 elements |

**Software rasterisation makes a blit 8.6× more expensive.** The whole premise of
this phase was built on the inflated number.

The inherited renderer, unchanged, draws all 9,766 visible elements at **73 fps** on
an M5. A GPU five times slower than an M5 — a rough stand-in for the "five-year-old
laptop" in criterion 1 — still holds ~3,600 elements in budget. So the target this
phase was written to hit, "60 fps at 10,000 elements", **is already met by the code
we inherited.**

Two things follow, and they point in opposite directions:

1. **Do not rewrite the renderer for speed.** There is no measured performance
   problem at the target scale. Tasks 2.2 through 2.5 were justified by a cost model
   that does not hold on real hardware, and 2.3 (level of detail) in particular was
   about to absorb effort on the strength of a software-rasterisation artefact.
2. **The rewrite may still be worth doing — for other reasons.** Culling is a linear
   scan (`Renderer.ts:200`) and stays O(n) in *total* elements, not visible ones;
   `elementWithCanvasCache` is a `WeakMap` with one bitmap per element and no
   zoom-level fan-out, so a zoom invalidates every element at once and costs the
   82–160 MB heap measured earlier; and `isElementInViewport` recomputes the
   viewport rect twice per element, allocating 20,000 objects a frame. Those are real
   and none of them are about frame rate. But they are ordinary engineering, not a
   phase.

**What is needed is a decision, not more measurement**: whether a renderer rewrite is
justified by maintainability and memory, given that it is not justified by speed. That
is a judgement call about the project, not something a benchmark can settle.

### A note on measuring below 16.7 ms

Windowed mode also removes the vsync floor: the empty-canvas control measured 8.3 ms
at 120 fps, where the headless control was pinned at 16.7 ms. Any future work that
needs to resolve frame costs *under* one refresh must measure windowed, or it is
measuring the clock instead of the renderer. This is the same trap as 2.1a, in a
different disguise.


#### 2.1e — An open problem at low zoom, cause unknown

Criterion 5 asks for 10% to 400% with no frame over 100 ms. **10% does not come
close**, and it is the one exit criterion this phase cannot demonstrate.

| zoom | mean frame | frames in 3 s |
| --- | --- | --- |
| 10% | 29.5 ms | 11 |
| 25% | 11.0 ms | 84 |
| 50% and above | 8.3 ms | 124 |

Roughly half a second a frame at 10%, against 8.3 ms everywhere from 50% up. It is
not a warm-up cost: 10% is slow whether it comes first, in the middle, or last, and a
15 s window yields two frames rather than none, so it is slow rather than hung. The
inherited renderer fails this criterion on hardware, and the plan should say so
rather than quietly measuring 25% to 400%.

**Where the time goes: not in JavaScript.** A CPU profile at 10% zoom, on a scene and
a build identical to one that does 8.3 ms, attributes 81-93% of the time to `(idle)`
and `(program)` -- the main thread waiting, and browser-internal work. Two runs split
those two differently (52/41 and 73/7) so the ratio is not trustworthy, but their sum
is. Every individual JS function is under 3%, and `drawElementFromCanvas` does not
reach the top fifteen. So this is not culling, not level of detail, not the bitmap
cache, and not anything else reachable from the renderer's own code.

**One explanation was tested and is wrong.** Overdraw looked right -- at 10% zoom all
10,000 elements land inside 506x506 px -- but sweeping world size at fixed zoom gives
no monotonic relationship at all: a 2,441-element scene is *slower* than a
9,766-element one, and the fastest case is the most compressed. So it is not fill rate
from overlapping geometry.

**The harness had to be fixed before any of this could be measured.** The report led
with the mean gap between rAF callbacks, and that metric cannot see a stall: when the
main thread blocks, the pending rAF callback and the pending timeout both become
runnable and run back to back, so the recorded gap is the milliseconds between them
while the seconds that caused it appear nowhere. A scene managing five frames in six
seconds reported a mean of 29.8 ms — implying 33 fps at a real 0.8. Optimistic, in
exactly the case where being optimistic is most costly.

`fps` is now frames over measured wall clock, which cannot be fooled that way, and
the report leads with it. The same sweep then reads **3.3 fps at 10% against 101 fps
at 50%** — the size of the problem rather than a guess. At the extreme the frame
count in a 6 s window is sometimes 4 and sometimes 0, and the run reports NO DATA
rather than a number when it is 0, so the honest reading at 10% is "somewhere under
1 fps, varying wildly, and not yet characterised."

So: the low-zoom cost is real, reproducible, outside the renderer's JavaScript, and
**its mechanism is unknown.** Anyone picking this up should start with a trace that
can account for `(program)` -- a Chrome tracing run rather than a JS CPU profile,
because the JS profiler has now said twice that the answer is not in this code.
Guessing a third time from the same data would be the third wrong answer.


### 2.2 — Culling — **cancelled**

`rbush` R-tree of element bounds, queried against the viewport plus a margin.

**Not built.** The linear scan it replaces is invisible at the target scale: at
100% zoom on a 10,000-element board, 9,766 elements are visible and a spatial index
saves 2% of the work. At 10% zoom — where the frame is 300 ms — every element is
visible and a spatial index saves nothing. It is a real inefficiency for a board much
larger than the one this product targets.

The index design below is kept because it is the right answer *if* a measurement
ever says a scan is too slow.

`rbush` R-tree of element bounds, queried against the viewport plus a margin.

| Concern | Handling |
| --- | --- |
| Index coherence | Updated **in the same frame** as the invalidating mutation. A stale index shows as elements vanishing during fast drags — the most visible bug class in a canvas app |
| Rotated bounds | Store rotated absolute bounds, not the axis-aligned box |
| Containers | A collapsed container culls its children; expand lazily |
| Empty result | Must not throw or render a frame late |

### 2.3 — Level of detail — **cancelled**

**Not built.** LoD exists to cut the cost of drawing elements you cannot resolve
anyway, and the measurement says that cost is 0.55 µs per element on a GPU. There is
nothing to save.

**This is the item the software-rasterisation number was about to spend the most on**,
and it is worth being explicit about why: at 4.8 µs per element a board of 10,000
holds 2,100 elements in a 10 ms budget, so a level-of-detail ladder looked like the
difference between shipping and not shipping. The ladder is designed for 25% zoom,
which is precisely the range where the real cost is 11 ms and needs nothing.

Note for whoever picks up criterion 5: **a LoD ladder is not the fix for the 10% zoom
stall.** That stall is not in the renderer's JavaScript at all, so it is not a
function of how many elements are drawn. Do not build this and expect the sweep to
change.

The design below is kept for the same reason as 2.2's.

Hysteresis-damped thresholds, or the canvas flickers as the user oscillates around
one.

| Zoom | Rendering |
| --- | --- |
| > 100% | Full: roughjs jitter, hatching, all stroke detail |
| 25–100% | Full geometry, simplified fills, fine strokes dropped |
| 10–25% | Flat fills, no jitter, freedraw reduced to convex hull |
| < 10% | Flat rectangles at element bounds, identity colour, count badge |

**Vector LoD, not raster LoD.** Miro published the result: swapping cached rasters
for re-connected Bézier control points at low zoom saved ~20% memory on 4,000 curves.

### 2.4 — Caching — **kept as inherited; one item still open**

Three layers, ported from Excalidraw's design:

1. **Shape cache** — `WeakMap<Element, RoughShape>`, keyed on object identity. This
   is why copy-on-write mutation matters: replacing the object invalidates for free.
2. **Bitmap cache** — `WeakMap<Element, HTMLCanvasElement>`, invalidated on zoom,
   theme, crop and container opacity. Respect `AREA_LIMIT = 16777216` and
   `WIDTH_HEIGHT_LIMIT = 32767`.
3. **Stage** — blit cached bitmaps at a transform; draw the overlay last.

**Device-pixel snapping** for unrotated, right-angled elements, never during a zoom
gesture. A 150% zoom label offset lands on a half-pixel often enough that float noise
makes it flicker without this.

**The one item here still open** is the bitmap cache's zoom fan-out. One bitmap per
element, keyed on the element, means a zoom invalidates every element at once — the
82–160 MB heap measured before the measurement environment was fixed. That figure has
not been re-measured on a GPU, so it is a hypothesis rather than a number. It is the
optimisation to reach for first if memory ever turns out to matter, and it is
maintenance rather than a phase.

### 2.5 — Excalidraw's published optimisations — **deferred, not cancelled**

All four are memory optimisations rather than frame-rate ones, so the measurement in
2.1d does not argue against them; it argues that they are not urgent. Two of the four
are also entangled with 2.3, which is cancelled: vector LoD *is* a level-of-detail
ladder, and building it without the rest would be building 2.3 by the back door.
The reported effects are Miro's, from
[their write-up](https://medium.com/miro-engineering/fighting-for-bytes-in-the-frontend-419c48103ef8).

| Optimisation | Reported effect | Position |
| --- | --- | --- |
| Vector LoD instead of raster LoD | 4,000 curves: 256 MB vs 316 MB | Deferred — depends on 2.3 |
| Merge adjacent freedraw strokes of constant style | 1,000 squares: 160 MB → 105 MB | **Best candidate.** Independent of 2.3, and a board of hand-drawn diagrams is exactly where it pays |
| Typed arrays instead of point objects | 3× reduction; 165 MB → 130 MB | Deferred — `points` is in the document model now, so this is a schema question, not a renderer one |
| **Combined** | **~40–50% total** | |

### 2.6 — Text on canvas — **kept as inherited; Phase 3 owns the overlay**

The first two are how the inherited renderer already works. The third is the reason
rich text is a Phase 3 and 4 problem rather than a renderer one.

- **Layout from ProseMirror.** Do not write a text layout engine.
- **Cache `measureText`** per `(font, size, weight, text)`. Naive per-node measurement
  is the most common source of canvas text jank.
- **Fonts must be loaded before the first layout.** A fallback font has different
  metrics, produces wrong wrapping, and misaligns the editor overlay the moment the
  real font arrives.

## Verification

Performance tests, not benchmarks — a regression should be a red test:

```ts
it("pans 10,000 elements at 60fps", () => { /* frame timing assertions */ })
it("idle memory stays under 500MB", () => { /* heap assertion */ })
it("moves one element in under 16ms", () => { /* performance.now() */ })
```

Reference images: render each inherited element type through both Excalidraw's
renderer and ours, and compare. This requires a real canvas in a headless browser,
not `vitest-canvas-mock`.

Correctness: hit testing at 0.1×, 0.5×, 1×, 1.5×, 3.7×, with rotation, with
bounds-exceeding elements, and inside nested containers.

## The fallback

**Not triggered.** Criterion 1 is met by the inherited renderer, measured on a GPU, so
the condition this section guards against — a renderer that cannot hold the target
scale — did not occur. [`ADR-0017`](../adr/0017-do-not-rewrite-the-renderer.md)
records the decision and the measurements.

The section is kept because the reasoning still applies to the gate's *remaining*
criteria, and because a reader who finds a superseded fallback has to be able to tell
it from a live one. It stood as follows:

**If the gate is not met at the end of the timebox:**

1. Stop. Do not continue into Phase 3 on an unproven renderer.
2. Revert to a thinner fork of Excalidraw's two-canvas renderer, keeping our data
   model, our element types, and our records layer.
3. Ship a smaller product: fewer element types, no records on canvas, no timeline,
   no mind map. Everything in [`../vision.md`](../vision.md) still holds; some of
   [`../prd/02-scope.md`](../prd/02-scope.md) moves to v2.
4. Record the outcome as a superseding ADR with the measurements, so the next person
   can see what was tried and what the numbers were.

**This is a planned outcome, not a failure.** The measurements are worth more than
the aesthetic.

### What is still open, and is not a fallback trigger

Criterion 5 fails, criteria 2 to 4 are unverified, and none of that is the condition
above. Phase 3 proceeds; the open items are named in ADR-0017's confirmation list and
in the ADR index's open questions.

## Why not React Flow

Hyper8 — a funded team rebuilding a whiteboard from scratch — chose React Flow for
its board canvas. That is real evidence that a node-graph library gets most of a
*structured* board cheaply.

We are not doing that because the hand-drawn aesthetic is a genuine differentiator
and React Flow has no freehand, no roughjs, and imposes a node-shaped mental model
that Excalidraw's users reject. But the evidence is real, and Phase 2 should be
attempted knowing that a competent, funded team looked at the same problem and chose
differently.
