# Competitive analysis

Researched 30 September 2026. Every factual claim links to a primary source.
Claims we could not verify from a primary source are marked **unverified**.

---

## 1. The licensing reality check

Two of the four obvious foundations are unusable. This should be read before
anything else, because it eliminates options that comparison articles still
recommend.

### tldraw is not open source

`tldraw/tldraw` has 50,665 stars and 492,700 weekly npm downloads, and it is the
best-engineered canvas SDK available. It is also **not open source**, and its
licence forbids exactly what we would be doing.

From [`tldraw/LICENSE.md`](https://github.com/tldraw/tldraw/blob/main/LICENSE.md):

> - "Not to use the Software in Production Environments."
> - "Not to distribute the Software or modifications of the Software as a standalone
>   product, but only as part of another application."
> - "The Software may collect and transmit usage data to tldraw for license
>   compliance purposes."

> "A **Production Environment** means any production deployment of the Software
> that operates on servers, cloud platforms, web applications, or where the software
> is used to provide functionality to end users, customers, or the public."

A free, self-hostable application distributed to users is unambiguously a
Production Environment. tldraw's own
[FAQ](https://tldraw.dev/community/license) is explicit:

> "While the tldraw SDK is source available, it is not permissively licensed… any
> source code or packages covered by the tldraw SDK license would not be Open Source
> by any definition. If you wish to include tldraw in an open source project, you may
> do so but the SDK itself must remain under its original license."

Commercial production use requires a paid licence key, reportedly around $6,000/year
at launch. A free **hobby** licence exists for non-commercial use but **forces a
"made with tldraw" watermark** on the canvas. There is a 100-day trial.

**This licence changed in September 2025.** Much of the comparison content still
online predates it and is now wrong.

**Conclusion: tldraw cannot be a dependency of an MIT project.** It remains an
excellent *architectural reference* — see §6.

### Excalidraw is MIT

Verified [`LICENSE`](https://github.com/excalidraw/excalidraw/blob/master/LICENSE):
MIT, `Copyright (c) 2020 Excalidraw`. 133,000 stars, actively developed, 4,114
commits. Every workspace package declares MIT except
`@excalidraw/fractional-indexing`, which is **CC0-1.0** (public domain dedication) —
compatible, but noted in our [`NOTICE`](../NOTICE).

**Conclusion: Excalidraw is our foundation.**

---

## 2. Miro — the product we are replacing

### Pricing

Source: [miro.com/pricing](https://miro.com/pricing/)

| | **Free** | **Starter** | **Business** | **Enterprise** |
| --- | --- | --- | --- | --- |
| Price | $0 | $8/member/mo annual | $20/member/mo | Custom, **min. 30 seats** |
| **Editable boards** | **3** | Unlimited | Unlimited | Unlimited |
| Members | Unlimited | Paid | Paid | Paid |
| Private boards | ❌ | ✅ | ✅ | ✅ |
| Guests | ❌ | ❌ | ✅ | ✅ |
| Board history | ❌ | ✅ | ✅ | ✅ |
| **Voting, timer, private mode** | **❌** | ✅ | ✅ | ✅ |
| **Facilitation controls** | **❌** | ✅ | ✅ | ✅ |
| Presentation mode | ✅ | ✅ | ✅ | ✅ |
| High-res export, no watermark | ❌ | ✅ | ✅ | ✅ |
| Data tables, Planner, Dependencies | ❌ | ❌ | ✅ | ✅ |
| SSO (SAML) | ❌ | ❌ | ✅ | ✅ |
| SCIM, audit logs, SIEM | ❌ | ❌ | ❌ | ✅ |
| Data residency | EU | EU | EU | EU, US, AU, JP |

**The free-tier wall is three boards, total, per workspace** — and creating a fourth
silently downgrades the oldest. That is the cleanest, most citable wedge against
Miro, and it costs us nothing to attack.

Note the naming: the mid tier is **Starter**, not "Pro". Third-party comparison
articles are frequently out of date.

### Self-hosting: never, at any tier

Miro offers no self-hosted, on-premises, or air-gapped edition. "Data residency" in
Miro's language means choosing a *region* within their cloud, not choosing a
deployment. **Unverified as an explicit denial** — this is inferred from the
complete absence of any such offering across the pricing page, all help-centre plan
tables, the developer platform, and the trust centre. In practice it is unambiguous.

### AI is metered and structurally weak

Miro's AI credit costs
([source](https://help.miro.com/hc/en-us/articles/19756209116178-Miro-AI-credits)):
sticky note 1 credit, image 3, **board layout 5, diagrams 5, tables 5**, prototype
5 per screen, slide 5 per slide. Credits are pooled org-wide, reset monthly, **do
not roll over**, and are not refunded on undo. Guests and Visitors cannot run AI at
all.

More interesting is *how* Miro's AI reads a board
([source](https://help.miro.com/hc/en-us/articles/28765406244498-Miro-AI-overview)):

> "Miro AI works only with content that is actually visible on the Miro canvas… uses
> **visual context processing, for example optical character recognition (OCR)-style
> processing**, to analyze content rendered on the canvas."

Miro's AI is largely canvas-blind. A local-first product with a real document graph
and a search index can beat it on every synthesis task, structurally rather than by
out-executing a model.

### The MCP server is the most copyable idea in the product

[Miro's MCP server](https://developers.miro.com/docs/miro-mcp-tools) describes a
board as an **SVG document**. The agent reads the board as SVG, edits the SVG, and
writes it back as a diff.

> "The canvas tools describe a Miro board as an SVG document. Your agent reads the
> board as SVG, edits that SVG, and writes it back."

Every item carries a stable `data-miro-id`. `canvas_update_from_svg` applies a
declarative diff — create, update, delete. A `canvas_get_canvas_composer_skill` call
returns the authoritative format spec.

This is a validated design for making a board addressable by an AI agent, and it is
a design we should match. See
[`trd/07-persistence-and-formats.md`](trd/07-persistence-and-formats.md).

Their free tier is capped at **100 MCP calls per day**.

### Rendering and engineering

From Miro's own engineering blog and job postings:

- **Canvas 2D for text**, **PixiJS (WebGL) for shapes**, with WebGPU under
  evaluation ([`miroapp/render-playground`](https://github.com/miroapp/render-playground)).
- Frontend TypeScript, Webpack, WebSocket. Backend **Java 11 / Spring Boot**,
  Hazelcast, Redis, PostgreSQL, on AWS.
- Their sync protocol is **unpublished**. No CRDT or OT paper, no public spec.

Four published rendering optimisations are directly applicable to our Phase 2
([source](https://medium.com/miro-engineering/fighting-for-bytes-in-the-frontend-419c48103ef8)):

| Optimisation | Effect |
| --- | --- |
| Vector level-of-detail instead of raster | ~20% memory on 4000 curves |
| Merge adjacent pen strokes with constant style | 160 MB → 105 MB on 1000 squares |
| Typed arrays instead of `PIXI.Point` objects | 3× reduction; 165 MB → 130 MB |
| **Combined** | **~40–50% total reduction; iPad crashes fixed** |

One hard, citable limit worth beating: **Miro caps text widgets at 6,000
characters.**

---

## 3. Excalidraw — our foundation, and its limits

MIT, 133,000 stars, `@excalidraw/excalidraw@0.18.0`. React 19, TypeScript 5.9.3,
jotai, roughjs, perfect-freehand, radix-ui, esbuild + Vite 5, vitest.

### What it does well

- The hand-drawn aesthetic, done properly, with `roughjs` and a per-element shape
  cache.
- A correct, well-tested element model with copy-on-write mutation and fractional
  z-order indexing.
- Excellent hit testing, with a two-tier bail and a monotonic-threshold result cache.
- A mature `.excalidraw` JSON format with **1,415 lines** of forward and backward
  migration code in `data/restore.ts`.
- Genuinely free, self-hostable, offline-capable, PWA.

### Where it falls short for a Miro replacement

| Gap | Evidence |
| --- | --- |
| **No persistence beyond the browser** | Elements go to `localStorage` (~5–10 MB ceiling). Files go to IndexedDB. |
| **Collaboration is lossy** | See below. |
| **No multi-page** | One canvas per file. Long-requested by users. |
| **No facilitation** | No voting, timer, private mode, or presentation mode. |
| **No project layer** | No spaces, dashboards, tags, or search. |
| **No structure** | No records, no projections, no tables. |
| **12,942-line `App.tsx`** | The architecture's central problem. See [`trd/04-rendering.md`](trd/04-rendering.md). |

### Its collaboration model is not what it appears to be

**Excalidraw does not use Yjs.** We assumed it did; it does not.
`excalidraw-app/package.json` contains `socket.io-client@4.7.2`, `firebase@11.3.1`,
and `idb-keyval@6.0.3`, and **no** `yjs`, `y-websocket`, or `y-protocols`.

The entire merge algorithm is **118 lines** in `packages/excalidraw/data/reconcile.ts`:
per-element last-writer-wins on `(version, versionNonce)`, with fractional-index
z-order and a 20-second full-scene resync as a divergence backstop.

It converges, and it is deterministic. It is also **genuinely lossy**: two users
editing different properties of the *same* element lose one of the edits. That is
acceptable for a sketch and unacceptable for a shared task table.

Its end-to-end encryption is **AES-GCM with a 128-bit symmetric key**, carried in
the URL fragment, with no asymmetric handshake, no forward secrecy, and no
revocation. The server (`excalidraw/excalidraw-room`) is a dumb Socket.IO relay —
all merge logic is client-side, which is why self-hosting is easy.

**Conclusion: keep the element model, replace the reconciliation.** See
[`ADR-0002`](adr/0002-yjs-as-concurrency-engine.md).

---

## 4. Weje — the right lesson, closed source, shutting down

### It is not open source

Weje is made by **HyperTech, Inc.** (220 East 23rd St, New York). Its source is a
**paid product** — [weje.io/free-online-whiteboard](https://weje.io/free-online-whiteboard)
lists "✅ Source codes ✅ Weje white-label" among paid cooperation offers, contact
`wj@weje.io`. Open-sourcing was "considered" in August 2023
([weje.io/news](https://weje.io/news)) and never happened. The company's GitHub
org publishes `.dmg` and `.exe` binaries only.

There is nothing to fork. We cite Weje as a design reference, never as prior art.

### It is being retired

Every signup on weje.io now redirects to `app.hyper8.tech`, whose login page reads:

> "Hyper8 is a next-generation whiteboard by the Weje team — much faster, with
> desktop apps for all platforms. We recommend everyone to migrate to Hyper8. Weje
> is available here for a limited time."

Its tech stack (recovered from a public source map): **Vue 2 + Vuetify + CoffeeScript**,
Vuex, **Firebase Realtime Database**, a custom WebSocket relay, OpenVidu voice,
Quill. Notably it renders with **SVG/DOM, not Canvas2D**.

Its successor Hyper8 is React 19 + Vite + Zustand + **React Flow** + TipTap +
Supabase + Electron, with an MCP-over-WebSocket endpoint.

### What we take from it

**Arbitrary container nesting.** Cards and lists are arbitrarily nestable
containers. Any selection can be grouped into a list; a list can contain lists and
boards. Collapse/expand on `Space`. Ordering is fractional-index
(`generateSort` computes `(before + closest)/2` — the same primitive Excalidraw
converged on independently, which is a good sign). This is the single best idea in
Weje and we adopt it wholesale ([`ADR-0007`](adr/0007-arbitrary-container-nesting.md)).

**"Green information."** Weje's third named failure mode of over-organisation is
*"non-green approach to information leads to loss of efficiency"* — information that
stays live on one surface, legible at a glance, with no separate status table. This
became a core constraint in [`vision.md`](vision.md).

**Low clutter as a feature.** Weje's entire pitch is that a board should have
"somewhere between data collection and a visual library" — not a tool. We adopt the
discipline, not the aesthetic.

**The business model.** Weje went fully free in August 2023 and survives on
donations ($19 one-time / $9 monthly). It is a live demonstration that a
donation-funded whiteboard can operate — and a live demonstration of how long that
takes.

### What it lacks

Verified absent from its source: **no `vote` or `poll` object type** (despite
marketing GIFs), **no timer**, no estimation, no diagram shape library, no proper
flowcharting. On-board chat was **removed for low usage** with "a better commenting
feature is coming soon" as the explanation.

So the entire facilitation surface is uncontested. That is Phase 5 and it is our
cleanest wedge against both Miro and Weje.

**Unverified:** Weje's Firebase security rules (our model of its data is inferred
from client code); whether voting works in production (advertised but no code path
found).

---

## 5. The rest of the landscape

Licences verified against source, 30 September 2026.

| Project | Stack | Licence | Self-host | Realtime | Assessment |
| --- | --- | --- | --- | --- | --- |
| **AFFiNE** | TypeScript, 73k★ | Mixed — `packages/backend` and `packages/common/native` under own licence, rest MIT | Yes (Docker) | CRDT-based | Closest architectural analog: docs + whiteboard unified, local-first-ish. Canvas is secondary. **The licence is not clean** — read before adopting. |
| **AppFlowy** | Dart/Flutter, 77k★ | AGPL-3.0 | Yes | Custom + cloud | Strong Notion alternative, weak canvas. Flutter is a mismatch for a canvas. |
| **Penpot** | Clojure, 60k★ | MPL-2.0 | Yes | Rust server, WebSocket | Best-in-class *vector design*, SVG-native. Not a workshop tool. |
| **Huly** | TypeScript, 28k★ | EPL-2.0 | Yes | MongoDB + realtime | Excellent PM layer, **no canvas**. Worth mining for patterns. |
| **Docmost** | TypeScript, 22k★ | AGPL-3.0 | Yes | Yjs/WS | Confluence alternative. Docs, not canvas. |
| **Anytype** | TypeScript | Custom (`NOASSERTION`) | Local-first, P2P | P2P / E2EE | The most interesting *local-first object graph* reference. No canvas. |
| **Focalboard** | TypeScript + Go | Mattermost custom (AGPL source / MIT build) | Yes | Polling + WS | Last push 18 May 2026 — **effectively dormant**. Do not build on it. |
| **Planka** | TypeScript | "PLANKA Community License" v1.1 (custom, not OSI) | Yes | Socket.IO | Trello clone, not a Miro alternative. Read the licence before use. |
| **Eraser** | TypeScript, 270★ | MIT | Early | Limited | Diagram-as-code (Mermaid/PlantUML/D2). A SaaS. Useful as a format reference. |
| **Penpot/Eraser/Focalboard** | — | — | — | — | None of these combine a canvas with facilitation. |

**Nobody in the open-source space combines:** a real infinite canvas + structured
multi-view records + facilitation tooling + a project layer + local-first storage +
a permissive licence.

- Excalidraw has the canvas and lacks structure.
- AFFiNE has structure and local-first, but a secondary canvas and a dirty licence.
- Huly has the project layer and no canvas.
- Miro has all of it, and is closed, cloud-only, and wall-gated at three boards.

**That intersection is the thesis.**

---

## 6. What we borrow from tldraw even though we cannot use it

tldraw remains the best-engineered canvas SDK in existence and its architecture is
worth studying from a distance. Three ideas go directly into our design.

**A record store with a schema layer, not a canvas of typed nodes.**
`@tldraw/store` (records), `@tldraw/tlschema` (validation + per-shape migrations),
`@tldraw/editor` (shapes + bindings). The separation of *schema* from *shape
rendering* is exactly the seam we need for records and projections.

**A signals-based reactive state layer rather than a class component with
immutable state.** `@tldraw/state` replaces Excalidraw's 12,942-line `App` class.

**A server-authoritative sync room with a SQLite storage adapter.**
`TLSocketRoom` + `SQLiteSyncStorage` (one SQLite file per room) + per-shape
migrations + a separate "object-store lane" for comments, so a commenter can write
without an editor's permissions. That lane is a genuinely good idea we should copy
regardless of which sync engine we use.

**And a warning.** Hyper8 — a team rebuilding a whiteboard from scratch with money
and time — chose **React Flow** for its board canvas rather than writing a custom
renderer. That is evidence that a node-graph library gets you most of a *structured*
board cheaply. It is also exactly what Excalidraw's users reject: no hand-drawn
feel, no freehand, no fine canvas control, and a node-shaped mental model. We are
choosing the harder path because the aesthetic is a genuine differentiator — but
Phase 2's risk is evidenced, not hypothetical.

---

## 7. What we will not compete on

From Miro's feature surface, these are procurement checklists rather than
product-defining, and chasing them would consume the roadmap:

- Shape-pack breadth (BPMN, AWS, Visio import)
- 250+ marketplace integrations
- eDiscovery, legal holds, audit logs, SIEM
- ISO 27001 / ISO 42001 / SOC 2 / TISAX certification
- 6,000-character → unlimited text is a genuine win, but it is a bug fix, not a
  strategy

## 8. The wedge, ranked

| # | Wedge | Cost to us | Defensibility |
| --- | --- | --- | --- |
| 1 | Unlimited boards, members, private boards, no watermark — free, forever | Near zero | **Direct attack on the 3-board wall** |
| 2 | The entire facilitation loop free: voting, timer, private mode, presenting | Moderate | **Attacks Miro's hardest paywall** |
| 3 | Local-first, offline-first, self-hostable, no seat minimum | Already paid for | **A category Miro does not compete in at all** |
| 4 | No AI credit meter — local models when we get there | Deferred | **Structural, not competitive** |
| 5 | A real, lossless, diffable, human-readable file format | Moderate | **Miro cannot re-import its own board** |
| 6 | Miro-compatible SVG canvas protocol with stable IDs | Low | **Inherits the agent ecosystem for free** |
| 7 | WCAG 2.2 AA shipped and claimed, with a VPAT | Moderate | **Miro bolts an a11y tree over rendered pixels** |
| 8 | An MCP server with no daily cap | Low | **Miro caps free at 100 calls/day** |
| 9 | Arbitrary container nesting | Low | **Weje has it; nobody else does** |
