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
