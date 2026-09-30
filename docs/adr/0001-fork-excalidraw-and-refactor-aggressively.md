---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# Fork Excalidraw and refactor aggressively; stop tracking upstream

## Context and Problem Statement

We need an infinite canvas with a hand-drawn aesthetic, correct hit testing, a proven
element model, and a permissive licence. Two obvious candidates exist and they are
mutually exclusive on licence grounds.

**tldraw** is the better-engineered SDK — 50,665 stars, 492,700 weekly npm
downloads, an excellent signals-based state layer, a clean schema/editor separation.
Its `LICENSE.md` states:

> "Not to use the Software in Production Environments."

> "A **Production Environment** means any production deployment of the Software that
> operates on servers, cloud platforms, web applications, or where the software is
> used to provide functionality to end users, customers, or the public."

tldraw's own FAQ is unambiguous: "it is not permissively licensed… any source code or
packages covered by the tldraw SDK license would not be Open Source by any
definition. If you wish to include tldraw in an open source project, you may do so but
the SDK itself must remain under its original license."

A free, self-hostable application distributed to users is a Production Environment.
Commercial use requires a paid licence key, reportedly around $6,000/year. The free
hobby licence **forces a "made with tldraw" watermark on the canvas**.

**Excalidraw** is MIT — 133,272 stars, actively developed. It has the aesthetic we
want, correct hit testing, a mature element model, and a `.excalidraw` format with
1,415 lines of migration logic. It also lacks everything Miro has: no backend worth
the name, no facilitation, no structure, no project layer, one canvas per file, and
elements stored in `localStorage` with a ~5–10 MB ceiling.

Once forked, we face a second question: do we track upstream releases?

## Decision Drivers

- **The licence must permit an MIT project that anyone can run in production.** This
  is non-negotiable. It eliminates tldraw.
- We need to add element types Excalidraw does not have (cards, sections, connectors,
  records) and change rendering. That is not possible through the npm package's
  public API.
- The hand-drawn aesthetic is a genuine differentiator
  ([`../competitive.md`](../competitive.md)).
- A fork nobody can maintain is worse than no fork. Sustainability matters.

## Considered Options

1. Depend on `@excalidraw/excalidraw` as an npm package
2. Fork and track upstream releases
3. Fork and refactor aggressively, stopping upstream tracking
4. Use tldraw under a commercial licence
5. Build a renderer from scratch

## Decision Outcome

Chosen option: **3 — fork Excalidraw, refactor aggressively, do not track upstream.**

Concretely:

- **Keep** `@excalidraw/math`, `@excalidraw/common`, `element/collision.ts`,
  `element/shape.ts`, `element/renderElement.ts`, `data/restore.ts`, fractional
  indexing, and the `version` / `versionNonce` / `index` triple.
- **Discard** `App.tsx` (12,942 lines), the two-canvas orchestration, the nonce-driven
  invalidation, the Firebase integration, and the Excalidraw+ product gating.
- **No `upstream` remote. No cherry-picks. No release syncs.**

The trade-off is explicit and accepted: **we lose upstream bug fixes and
improvements.** We gain the freedom to build the thing we actually need.

## Consequences

- (+) We own the architecture and can add element types freely.
- (+) MIT throughout. No licence key, no watermark, no revenue dependency.
- (+) A 133,000-star, 4,114-commit project has already solved the geometry,
  hit-testing and hand-drawn rendering problems, and most of that code is
  MIT-encumbered but ours to use.
- (-) **We permanently lose upstream improvements.** Excalidraw is actively
  developed; its renderer and text handling will get better and we will not see it.
- (-) We inherit 500,000 lines of TypeScript that we did not write, including
  `binding.ts` at 94 KB and `bucketFill.ts` at 69 KB that we may never use.
- (-) Security fixes in the inherited code must be backported by hand.
- (~) Contributors arriving from Excalidraw may initially expect upstream
  compatibility. [`CONTRIBUTING.md`](../../CONTRIBUTING.md) states the policy
  explicitly.

## Confirmation

- `NOTICE` retains the Excalidraw MIT copyright notice and enumerates what was
  derived. Enforced by review; `LICENSE` and `NOTICE` are on the do-not-touch list in
  [`../../AGENTS.md`](../../AGENTS.md).
- No `upstream` git remote is ever added. Verifiable with `git remote -v`.
- `dev-docs/` retains upstream's inherited content and is not modified except where
  factually wrong after refactoring.

## Pros and Cons of the Options

### 1. Depend on the npm package

- (+) Zero maintenance; upstream updates arrive automatically.
- (+) No fork to maintain at all.
- (-) **The public API cannot add element types.** No new shapes, no custom
  rendering, no custom sync. The ceiling is exactly Excalidraw's feature set, which
  is the gap we exist to fill.
- (-) `excalidraw-app` — collaboration, persistence, PWA, share links — is
  `private: true` and not published. Depending on the package gets us *less* than
  forking.

### 2. Fork and track upstream

- (+) Keeps upstream bug fixes and renderer improvements.
- (+) Minimises the long-term maintenance burden.
- (-) **To add Miro-scale features we must edit `App.tsx` in dozens of places.**
  A 12,942-line class component whose renderer invalidation rules are documented only
  in code comments produces an unmergeable diff within two releases.
- (-) Upstream has 4,114 commits and ships frequently. Tracking it while diverging is
  a permanent tax on every change.
- (-) Excalidraw's architectural direction is not ours. We want a records layer, a
  rewritten renderer, and a different state model. Merging fights all three.

### 4. tldraw under a commercial licence

- (+) The best SDK available. Excellent architecture, signals-based state, a clean
  schema layer, and a documented sync server design we can learn from.
- (-) **Incompatible with an MIT project that anyone can run in production.** The
  licence explicitly forbids it.
- (-) A ~$6,000/year dependency for a project that will never charge money.
- (-) A forced watermark on the free tier, which defeats the entire thesis.

### 5. Build from scratch

- (+) No licence entanglement, no inherited complexity.
- (+) Complete freedom over the architecture.
- (-) **Years of work to match a decade of polish** in hit testing, hand-drawn
  rendering, and text layout. The single most valuable thing Excalidraw gives us is
  the hard parts of a canvas application, already solved and already MIT.
- (-) We would re-implement `collision.ts`, `shape.ts` and `restore.ts` badly.

## More Information

- [tldraw licence](https://github.com/tldraw/tldraw/blob/main/LICENSE.md)
- [tldraw FAQ on open source](https://tldraw.dev/community/license)
- [Excalidraw licence](https://github.com/excalidraw/excalidraw/blob/master/LICENSE)
- [`../trd/01-stack-and-conventions.md`](../trd/01-stack-and-conventions.md) — the keep/replace table
- [`../competitive.md`](../competitive.md) §1 — the licensing reality check
