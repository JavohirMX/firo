---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# One board with unlimited frames

## Context and Problem Statement

The unit of work in our product is contested by three reasonable models.

**Miro** has boards containing frames. Frames are named, nestable rectangles that
group content, define PDF page order, and become slides in presentation mode.

**tldraw** has a board containing multiple **pages**, each its own canvas, switched
by tabs. This is one of tldraw's most requested and most used features.

**Excalidraw** has one canvas per file. Its users have asked for multi-page support
for years, and it is a recurring complaint
([r/Excalidraw](https://www.reddit.com/r/Excalidraw/comments/1ten8kv/does_excalidraw_support_multiple_pages/)).

Our primary persona runs workshops
([`../prd/01-personas.md`](../prd/01-personas.md)) and the second is an engineer with
notes organised into files. They need different things, and choosing wrong is
expensive because it determines the file format and the navigation model.

## Decision Drivers

- A workshop is one continuous surface, not a set of tabs. Splitting a retrospective
  across pages would be actively wrong for Priya.
- A long-lived engineering document with sections should not require one file per
  section.
- PDF export must be one page per frame, in user-controlled order. That is Miro's
  model and it is correct for our primary use case.
- The file format must support the chosen model without a rewrite later.

## Considered Options

1. One board, unlimited frames
2. Multi-page boards
3. Both: pages, and frames within pages
4. One canvas per file, as Excalidraw

## Decision Outcome

Chosen option: **1 — one board, unlimited frames.**

A **frame** is a named, nestable rectangle that groups content, defines PDF page
order, and becomes a slide in presentation mode. A lighter grouping, the **section**,
provides visual grouping without page or slide semantics.

The distinction is deliberate: **frames structure output, sections structure the
board.** Weje makes the same split and it is the right one — a board needs grouping
that does not become a page.

## Consequences

- (+) Matches the workshop use case exactly. One continuous surface.
- (+) PDF export and presentation mode fall out of the model rather than being
  bolted on.
- (+) Frame order is a user-facing list, which is how Miro does it and how people
  expect it to work.
- (-) **Long documents with clear section boundaries are awkward.** An engineer's
  architecture notes want pages. They will use frames, which is workable but not
  ideal.
- (-) A board with 200 frames is a board with 200 things on it, and the zoomed-out
  view is a wall. Frames need a navigation panel, which is extra UI.
- (-) A very large board (100,000 elements) is a performance question that pages
  would have made smaller. The renderer budget in
  [`../prd/05-non-functional-requirements.md`](../prd/05-non-functional-requirements.md)
  is set at 10,000 elements; beyond that, exports and search matter more.
- (-) **The trade-off favours our primary persona over our secondary one.** This is
  a deliberate choice, and it is the one most likely to be questioned by a
  contributor who resonates with Mira rather than Priya.

## Confirmation

- The board document has no page collection. A test asserts that a board document
  contains frames and sections and no page array.
- PDF export produces one page per frame, in frame order, and frame order is
  user-reorderable.
- Presentation mode enumerates frames in that order.

## Pros and Cons of the Options

### 2. Multi-page boards

- (+) Better for long-lived structured documents; tldraw users clearly want it.
- (+) A natural unit for separate files if we ever add file-per-page export.
- (-) **Bad for workshops.** Splitting a retrospective across tabs is friction on
  the primary use case.
- (-) Loses the continuous-canvas feel that makes a workshop board good.
- (-) PDF export and presentation mode need a separate concept, since a page is not
  automatically a slide or a page of output.

### 3. Both pages and frames

- (+) Maximum flexibility; serves both personas natively.
- (-) **Two containment systems that must stay consistent.** What happens when a
  frame spans two pages? What is the export order? This is a large amount of
  ambiguity for a problem that the section/frame split already largely solves.
- (-) The most complex option to build, test, and explain.
- (-) Two navigation models in one product.

### 4. One canvas per file

- (+) Simplest. What Excalidraw does today.
- (-) Its users already complain about it. Adopting a known complaint as our model
  is a choice we would have to justify.
- (-) A workshop becomes several files, which is the wrong shape for the use case.

## More Information

- [tldraw pages](https://tldraw.dev/sdk-features/pages)
- [Miro frames](https://help.miro.com/hc/en-us/articles/360017343514)
- [`../prd/03-feature-specifications.md`](../prd/03-feature-specifications.md) — FR-13, FR-14
