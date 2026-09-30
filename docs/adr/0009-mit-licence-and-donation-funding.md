---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# MIT licence, free forever, donations only

## Context and Problem Statement

Firo's pitch is that it is free and that its data stays on your machine. Both claims
require a licence that cannot be revoked and a funding model that does not depend on
charging for the software.

The market context is unusually favourable and unusually honest. **Weje** went
completely free in August 2023 and survives on donations ($19 one-time, $9 monthly)
— and as of 2026 the company is winding it down in favour of a new product.
**Excalidraw** is MIT, funds itself through Open Collective and Excalidraw+, and
sells a paid tier without gating the core. **AFFiNE** is partially open source with
proprietary components. **AppFlowy** and **Docmost** are AGPL-3.0. **tldraw** is
source-available with a paid production licence.

There is no evidence that a whiteboard can be sustained by seat pricing in the
open-source world, and strong evidence that donation funding works — for as long as
the maintainer wants it to.

## Decision Drivers

- Anyone must be able to run Firo in production, modify it, and redistribute it.
- No dependency may impose a licence incompatible with that.
- The project must never need to hold user data to be useful.
- No feature may be held back for a paid tier, ever.

## Considered Options

1. MIT, free forever, donations
2. AGPL-3.0, free, cloud use must share
3. Apache-2.0
4. Open core — AGPL core with paid enterprise features
5. Source-available, like tldraw

## Decision Outcome

Chosen option: **1 — MIT licence, free forever, donations only.**

- **Every dependency must be permissively licensed**: MIT, Apache-2.0, BSD, ISC, CC0.
  No copyleft. No source-available.
- **No paid tier, ever.** No seat limits, no watermarks, no usage meters, no feature
  gates. This is stated in [`../vision.md`](../vision.md) as a non-goal.
- Funding through GitHub Sponsors and Open Collective.
- Firo will never operate a service that requires user accounts to be useful.

**This decision is what excludes tldraw.** Its licence forbids production use without
a paid key and forces a "made with tldraw" watermark on the free tier. A
dependency we cannot ship to our users is not a dependency
([ADR-0001](0001-fork-excalidraw-and-refactor-aggressively.md)).

## Consequences

- (+) Maximum adoption and maximum contributors. A team can adopt Firo without a
  legal review.
- (+) Self-hosting needs no licence conversation at all.
- (-) **No obligation on anyone to fund this.** Weje's shutdown is the concrete
  example of how that ends. A solo-maintained donation-funded project has a real and
  finite lifespan, and pretending otherwise would be dishonest.
- (-) AGPL would have prevented a cloud competitor from shipping a hosted clone. MIT
  does not, and that is an accepted trade — the alternative is fewer users.
- (-) No enterprise revenue means no sustainable funding for the accessibility work,
  the security work, or the support burden.
- (-) Every dependency check is manual. There is no licence-checking tool in CI
  because adding one is a dependency of its own.

## Confirmation

- `LICENSE` is MIT. `NOTICE` enumerates every derived work and its licence,
  including the CC0-1.0 fractional-indexing package.
- Every new dependency is checked before merge. This is on the do-not-touch list in
  [`../../AGENTS.md`](../../AGENTS.md).
- A test or grep confirms no seat-count, board-count, or watermark code path exists
  (AC-2).
- The non-goals list in [`../vision.md`](../vision.md) names the paid tier explicitly,
  so a future maintainer considering one finds a decision already made rather than
  making it fresh.

## Pros and Cons of the Options

### 2. AGPL-3.0

- (+) Prevents a hosted clone from undercutting a hosted official version.
- (+) Used successfully by AppFlowy and Docmost.
- (-) Discourages corporate adoption, including the self-hosting teams who are our
  primary persona. Some companies cannot adopt AGPL without a legal review, which
  directly contradicts the Dan persona.
- (-) We are not running a hosted service to undercut, so it protects against
  something that does not exist.

### 3. Apache-2.0

- (+) MIT plus an explicit patent grant, which is a real additional protection.
- (+) Equally permissive in practice for adoption.
- (-) We have no patent portfolio to defend and no corporate contributor, so the
  patent clause protects nothing in practice.
- (-) The only reason to prefer it over MIT is defensiveness, which is not a
  motivation for an MIT-derived project.

### 4. Open core

- (+) A free self-hosted core plus paid enterprise features — SSO, audit logs, a
  hosted AI service — could fund the project.
- (-) It is a business model, and adopting it means becoming the kind of company we
  are building against.
- (-) It makes every feature decision a question about which side of the line it
  falls on, which would slow the roadmap considerably.
- (-) Firo's pitch is "free forever". Open core makes that a marketing claim rather
  than a fact.

### 5. Source-available

- (+) Revenue certainty.
- (-) **This is tldraw's model and it is incompatible with our purpose.** It makes
  every user's adoption contingent on a commercial relationship with us.

## More Information

- [tldraw licence](https://github.com/tldraw/tldraw/blob/main/LICENSE.md) and [FAQ](https://tldraw.dev/community/license)
- [Weje pricing](https://weje.io/pricing) — the donation-funded model, and its limits
- [Excalidraw sponsors](https://opencollective.com/excalidraw)
- [`../competitive.md`](../competitive.md) §1 — the licensing landscape
