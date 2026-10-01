# Phase 2 — Renderer rewrite

**Goal:** a canvas that renders 10,000 elements at 60 fps and is visually equivalent
to Excalidraw for the element types we inherited.

**This is the phase the project succeeds or quietly fails on.** Everything before it
is setup and everything after it depends on it.

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

| Keep (MIT, port directly) | Build (new) |
| --- | --- |
| `element/shape.ts` — roughjs mapping, `ShapeCache` | The stage compositor |
| `element/renderElement.ts` — bitmap cache, device-pixel snapping | Viewport culling with a spatial index |
| `renderer/staticScene.ts` — the element draw pass | Level of detail |
| `renderer/staticSvgScene.ts` — the SVG export path | The render loop and scheduling |
| `element/collision.ts` — hit testing | Layout passes and resize |
| Browser limits: `AREA_LIMIT`, `WIDTH_HEIGHT_LIMIT` | |

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

**1. Headless Chromium here rasterises in software.** `WEBGL_debug_renderer_info`
reports `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …), SwiftShader driver)`.
There is no GPU. Rasterisation cost measured here is software-raster cost and is
*not* representative of a user's machine, which has a GPU. Ratios between
configurations may survive; absolute milliseconds will not. Criterion 1's
"five-year-old laptop" cannot be satisfied in this environment at all, so it needs
either a GPU-backed browser or a real machine.

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

### 2.2 — Culling

`rbush` R-tree of element bounds, queried against the viewport plus a margin.

| Concern | Handling |
| --- | --- |
| Index coherence | Updated **in the same frame** as the invalidating mutation. A stale index shows as elements vanishing during fast drags — the most visible bug class in a canvas app |
| Rotated bounds | Store rotated absolute bounds, not the axis-aligned box |
| Containers | A collapsed container culls its children; expand lazily |
| Empty result | Must not throw or render a frame late |

### 2.3 — Level of detail

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

### 2.4 — Caching

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

### 2.5 — Excalidraw's published optimisations

All four are applicable and all four are cheap to implement
([source](https://medium.com/miro-engineering/fighting-for-bytes-in-the-frontend-419c48103ef8)):

| Optimisation | Reported effect |
| --- | --- |
| Vector LoD instead of raster LoD | 4,000 curves: 256 MB vs 316 MB |
| Merge adjacent freedraw strokes of constant style | 1,000 squares: 160 MB → 105 MB |
| Typed arrays instead of point objects | 3× reduction; 165 MB → 130 MB |
| **Combined** | **~40–50% total** |

The freedraw merging is the most visible: a board of hand-drawn diagrams is exactly
where it pays.

### 2.6 — Text on canvas

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

## Why not React Flow

Hyper8 — a funded team rebuilding a whiteboard from scratch — chose React Flow for
its board canvas. That is real evidence that a node-graph library gets most of a
*structured* board cheaply.

We are not doing that because the hand-drawn aesthetic is a genuine differentiator
and React Flow has no freehand, no roughjs, and imposes a node-shaped mental model
that Excalidraw's users reject. But the evidence is real, and Phase 2 should be
attempted knowing that a competent, funded team looked at the same problem and chose
differently.
