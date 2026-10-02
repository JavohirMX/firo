# Rendering

**This document describes new code. It is the riskiest part of the project and the
Phase 2 gate exists precisely because of it.**

> **Partly superseded by
> [`ADR-0017`](../adr/0017-do-not-rewrite-the-renderer.md), which cancelled the
> rewrite.** The "Replace" column below did not happen and will not: the inherited
> renderer already holds 10,000 elements at 60 fps on a GPU, so the culling index, the
> level-of-detail ladder and the compositor were cancelled as work whose justification
> was a software-rasterisation artefact.
>
> **What still stands** is everything describing the inherited code — the bitmap cache,
> the shape cache, device-pixel snapping, the two-canvas split, and the requirements in
> the later sections. **What does not** is the architecture diagram, the culler and the
> `AppState` split.
>
> Read it as a record of a design that was measured and declined, not as a
> specification to build.

## What we keep and what we replace

Excalidraw's renderer is two stacked canvases with a per-element `WeakMap` bitmap
cache, invalidated by a random `canvasNonce` bumped on every structural change. The
caching is genuinely good and worth keeping. The orchestration is not: it lives
inside a 12,946-line class component whose invalidation rules are documented only
in code comments, and adding element types with new visual states fights it
constantly.

**This table is the decision ADR-0017 was asked to make.** The right column is what a
rewrite would have replaced, and it is kept here so the reasoning stays attached to
the measurements rather than to a commit message.

| Keep | Replace — not done |
| --- | --- |
| `element/shape.ts` — roughjs option mapping, `ShapeCache` | `components/App.tsx` — 12,946 lines of orchestration |
| `element/renderElement.ts` — bitmap cache, device-pixel snapping | `scene/Renderer.ts` — the nonce-driven invalidation |
| `renderer/staticScene.ts` — element drawing pass | The interactive-canvas layering strategy |
| `renderer/staticSvgScene.ts` — the SVG export path | The React component boundary around the canvas |
| `element/collision.ts` — hit testing | The `AppState` object as a single god-state |

## Architecture

**Cancelled.** Kept because the shape of it is the right answer to a question nobody
has needed answered yet, and because a reader comparing it against the inherited
`scene/Renderer.ts` will get further than by reading prose.

```
                 ┌──────────────────────────────────────────┐
  viewport ──────▶  Culler          rbush R-tree, cached  │
  (pan/zoom)      └────────────────┬─────────────────────┘
                                   │ visible ids
                                   ▼
                 ┌──────────────────────────────────────────┐
                 │  ShapeResolver   WeakMap<element, path> │
                 └────────────────┬─────────────────────┘
                                   │
                 ┌────────────────┴─────────────────────┐
                 ▼                                      ▼
        ┌──────────────────┐                 ┌────────────────────┐
        │  BitmapCache     │                 │  Overlay           │
        │  offscreen canvas│                 │  selection, handles│
        │  per element     │                 │  cursors, grid     │
        └────────┬─────────┘                 └────────────────────┘
                 ▼
        ┌──────────────────────────────────────────────────────┐
        │  Stage (single visible canvas)                       │
        └──────────────────────────────────────────────────────┘
```

**One visible canvas, not two.** Excalidraw splits static and interactive across two
elements to avoid repainting the world on every selection change. With a viewport
culler and per-element bitmaps, blitting cached bitmaps is cheap enough that a
single canvas with a drawn-last overlay pass is simpler and avoids a class of
canvas-compositing bugs. **This is a deliberate deviation and the Phase 2 benchmark
is where we find out whether it holds.**

## Viewport culling

The single most important performance decision. Excalidraw's `getVisibleElements`
is a flat `filter` over every element on every frame — O(n) per frame, forever.

```ts
const tree = new RBush<ElementBounds>()
// insert on create; update on move; delete on remove
const visible = tree.search(viewportRect.expanded(CULL_MARGIN))
```

| Concern | Handling |
| --- | --- |
| Index coherence | Updated in the **same frame** as the mutation. A stale index shows as elements vanishing during fast drags. |
| Rotated bounds | The index stores *rotated* absolute bounds, not the axis-aligned box, or a rotated element can be culled while visible. |
| Empty boards | A 10,000-element board fully zoomed out still indexes 10,000 entries, but the search returns 10,000 and we rely on LOD and batching. |
| Groups and containers | A collapsed container culls its children. One entry per container, expanded lazily. |
| Margin | CULL_MARGIN of roughly one viewport width, so panning does not pop. |

## Level of detail

Below a zoom threshold, simplify. Thresholds must be **hysteresis-damped** or the
canvas flickers as the user oscillates around a threshold.

| Zoom | Rendering |
| --- | --- |
| > 100% | Full. roughjs jitter, hatching, all stroke detail. |
| 25–100% | Full geometry, simplified fills, dropped fine strokes. |
| 10–25% | Flat fills, no jitter, freedraw reduced to its convex hull. |
| < 10% | Flat rectangles at element bounds with identity colour, plus a count badge. |

**Vector LoD, not raster LoD.** Miro published this result: swapping cached rasters
for re-connected Bézier control points at low zoom saved ~20% memory on 4,000
curves, where the raster approach does not. We render vectors at every zoom and
vary their complexity, rather than caching bitmaps at a fixed scale.

## Caching

Three layers, adapted from Excalidraw's design:

**1. Shape cache — `WeakMap<Element, RoughShape>`.** Keyed on element object
identity, which is why copy-on-write mutation matters: replacing the object
invalidates the cache for free. `null` is a valid cached value, meaning "this type
has no rough shape".

**2. Bitmap cache — `WeakMap<Element, HTMLCanvasElement>`.** One offscreen canvas
per element, drawn once, blitted thereafter. Invalidate on zoom, theme, crop, or
containing-container opacity change. Respect browser limits:

```ts
const AREA_LIMIT = 16_777_216      // Safari mobile canvas area
const WIDTH_HEIGHT_LIMIT = 32_767  // Safari width/height
```

**3. Stage.** Scroll and zoom blit cached bitmaps at a transform. The overlay pass
draws selection, handles, cursors, and the grid.

**Device-pixel snapping.** Snap to whole device pixels for unrotated, right-angled
elements, and never during a zoom gesture. A 150% zoom label offset lands exactly
on a half-pixel often enough that float noise makes it flicker without this.

## Text on canvas

Text is the hardest thing to render on a canvas and it is where most canvas apps
fall down.

**Measurement** goes through a single cached `measureText` per
`(font, size, weight, text)` tuple. Naive per-glyph measurement is the most common
source of jank in canvas text.

**Layout** is computed by ProseMirror, not by us. We get a positioned document tree
and draw it ([`05-rich-text.md`](05-rich-text.md)). **Do not write a text layout
engine.** That decision is what makes rich text affordable.

**Miro's 6,000-character cap** on text widgets
([source](https://medium.com/miro-engineering/why-we-developed-a-code-block-widget-in-miro-f6c5ec23085c))
is a real, citable limit we simply do not have.

## Hit testing

Inherited from Excalidraw's `collision.ts`, which is good.

**Two tiers with an aggressive bail:** a cheap rotated-bounds test, then a precise
per-type test. The bounds test alone eliminates the overwhelming majority of
candidates, and with a spatial index the candidate set is already small.

**Monotonic threshold cache.** A cached hit is valid for any larger threshold; a
cached miss only for a threshold no larger than the cached one. This is a small
detail that makes hover feel instant on a dense board.

**Never test the inside of a connector.** `shouldTestInside` returns false for
arrows, so clicking an arrow's bounding box does not select it.

## Rendering in detail we borrow from Miro

Miro's four published optimisations are directly applicable
([source](https://medium.com/miro-engineering/fighting-for-bytes-in-the-frontend-419c48103ef8)):

| Optimisation | Reported effect |
| --- | --- |
| Vector LoD instead of raster LoD | 4000 curves: 256 MB vs 316 MB |
| Merge adjacent freedraw strokes of constant style | 1000 squares: 160 MB → 105 MB |
| Typed arrays instead of point objects | 3× reduction; 165 MB → 130 MB |
| **Combined** | **~40–50% memory reduction; iPad crashes fixed** |

We adopt all four. The freedraw merging one is the most visible — a board of
hand-drawn diagrams is exactly where it pays.

## The Phase 2 gate

Phase 2 is complete when all of these hold
([`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) AC-11):

1. 10,000 elements, 60 fps sustained pan, under 500 MB idle.
2. Rendered output is **visually equivalent** to Excalidraw for inherited element
   types, verified by reference-image comparison.
3. A 10,000-element scene creates, saves, and loads within budget.
4. Rotation, resize, arrow binding, and hit testing are correct at every zoom
   level, including rotated-outside-bounds elements.
5. A five-year-old laptop is the test machine. A developer machine is not evidence.

**If the gate fails at the end of the timebox**, the fallback triggers: revert to a
thinner fork of Excalidraw's renderer, ship a smaller product, record the outcome as
a superseding ADR. This is a scheduled decision, not a failure — and it is stated
now so that nobody in Phase 3 discovers it was never considered.

## Why not React Flow

Hyper8 — a funded team rebuilding a whiteboard from scratch — chose
**React Flow** for its board canvas. That is real evidence that a node-graph library
gets most of a *structured* board cheaply.

We are not doing that, and the reason is specific: React Flow is a node graph. It
has no freehand, no hand-drawn aesthetic, no rotated arbitrary geometry, and it
imposes a node-shaped mental model. Excalidraw's users reject exactly that. Since
the hand-drawn feel is a genuine differentiator in
[`../competitive.md`](../competitive.md), the harder path is the right one — but
the evidence is real and Phase 2 should be attempted with eyes open.
