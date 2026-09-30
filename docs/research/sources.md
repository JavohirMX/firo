# Research sources

Primary sources behind the decisions in [`../adr/`](../adr/). Every claim in
[`../competitive.md`](../competitive.md) and the ADRs traces to something here.

Researched **30 September 2026**. Claims that could not be confirmed from a primary
source are marked **unverified**.

---

## Licences — the eliminations

### tldraw — eliminated, not open source

| Source | What it establishes |
| --- | --- |
| [`LICENSE.md`](https://github.com/tldraw/tldraw/blob/main/LICENSE.md) | "Not to use the Software in Production Environments." A Production Environment is "where the software is used to provide functionality to end users, customers, or the public". "Not to distribute the Software… as a standalone product". Technical enforcement via license key; may "collect and transmit usage data to tldraw for license compliance purposes". |
| [Licence FAQ](https://tldraw.dev/community/license) | "it is not permissively licensed… would not be Open Source by any definition." Using tldraw in an open source project requires downstream users to obtain their own trial, commercial, or hobby license. Hobby license **forces a "made with tldraw" watermark**. |
| [Pricing](https://tldraw.dev/pricing) | 100-day trial; value-based commercial pricing; discounted startup pricing. |
| `package.json` (`tldraw@5.4.2`) | `"license": "SEE LICENSE IN LICENSE.md"`. 20 packages in `packages/`, 10 apps in `apps/`. |

**Licence changed September 2025.** Comparison articles predating it are wrong.

### Excalidraw — our foundation

| Source | What it establishes |
| --- | --- |
| [`LICENSE`](https://github.com/excalidraw/excalidraw/blob/master/LICENSE) | MIT, `Copyright (c) 2020 Excalidraw` |
| `packages/excalidraw/package.json` | `@excalidraw/excalidraw@0.18.0`, React 19 peer range, MIT |
| `packages/fractional-indexing` | **CC0-1.0**, not MIT. Vendored fork of rocicorp/fractional-indexing |
| [`README`](https://github.com/excalidraw/excalidraw) | "The app hosted at excalidraw.com is a minimal showcase… We'll be adding these features as drop-in plugins for the npm package in the future" |
| `packages/excalidraw/fonts/` | **Virgil ships with no licence file anywhere in the repository** |

**Unverified:** the Virgil font's actual terms. The absence of a licence file is
established; what it means legally is not, and the safe response is the same either
way.

---

## Miro — the product being replaced

| Source | What it establishes |
| --- | --- |
| [miro.com/pricing](https://miro.com/pricing/) | 3 editable boards on Free; Starter $8, Business $20, Enterprise from 30 seats; facilitation controls paid from Starter; AI credits by plan; MCP calls/day 100 / 500 / 2000 / 10000 |
| [Help — plans and features](https://help.miro.com/hc/en-us/articles/360017730233-Plans-and-features-available) | The full plan matrix |
| [Help — AI credits](https://help.miro.com/hc/en-us/articles/19756209116178-Miro-AI-credits) | Sticky 1, image 3, board layout 5, diagrams 5, tables 5, prototype 5/screen, slide 5/slide. Pooled org-wide, no rollover, no refund on undo. ⚠️ The pricing FAQ says Free gets 10 credits; this article says 25. **Unverified which is current.** |
| [Help — Miro AI overview](https://help.miro.com/hc/en-us/articles/28765406244498-Miro-AI-overview) | "Miro AI works only with content that is actually visible on the Miro canvas… uses visual context processing, for example optical character recognition (OCR)-style processing" |
| [Miro MCP tools](https://developers.miro.com/docs/miro-mcp-tools) | The board-as-SVG design with stable `data-miro-id` and declarative diffs. Also: legacy `board_list_items`, `context_*`, `layout_*`, `diagram_*`, `doc_*` tools were **removed** |
| [developers.miro.com/llms.txt](https://developers.miro.com/llms.txt) | Complete machine-readable index of the developer platform. Any doc is available as raw `.md` by appending `.md` |
| [Board items](https://developers.miro.com/docs/board-items) | API-supported types. **`kanban`, `table`, `timeline`, `document`, `mindmap` have no public REST CRUD** |
| [Board access rights](https://help.miro.com/hc/en-us/articles/360017572194-Board-access-rights) | The permission matrix: view/comment/edit × member/guest/visitor |
| [Engineering — code block widget](https://medium.com/miro-engineering/why-we-developed-a-code-block-widget-in-miro-f6c5ec23085c) | **6,000-character limit on text widgets.** CodeMirror rejected because it breaks under CSS `transform: scale()` |
| [Engineering — fighting for bytes](https://medium.com/miro-engineering/fighting-for-bytes-in-the-frontend-419c48103ef8) | Vector LoD (~20%), stroke merging (160→105 MB), typed arrays (3×), combined ~40–50% |
| [miroapp/render-playground](https://github.com/miroapp/render-playground) | WebGL/WebGPU batching experiments; a ground-up renderer revamp announced 2024 |
| [miro.com/accessibility](https://miro.com/accessibility/) | "strive to meet" WCAG 2.2 AA — an aspiration, not a certification. VPAT on request. Accessibility Checker exists |
| [Help — export](https://help.miro.com/hc/en-us/articles/360017572754-How-to-export-your-board) | PNG/JPG/SVG/PDF/CSV, `.rtb` backup. Free plan is watermarked and low-res. **Comments and voting results are not exported.** |
| [Help — import](https://help.miro.com/hc/en-us/articles/18656338276626-Import-content-from-other-tools-to-Miro) | Import is **Starter+ only**. Miro **cannot import its own `.rtb` board** |

**Unverified:** minimum/maximum zoom percentages; per-board object limits; sticky-note
counts (there is no published cap — treat "sticky note limit" as a myth); history
retention depth; the realtime sync protocol; the current Canvas-2D-versus-WebGL split.

**Inferred, not denied:** no self-hosted edition. Established from the complete absence
of any such offering across pricing, all plan tables, the developer platform, and the
trust centre. Unambiguous in practice.

---

## Excalidraw internals

Read from `master` at research time. See
[`upstream-excalidraw.md`](upstream-excalidraw.md) for the full analysis.

| Source | What it establishes |
| --- | --- |
| `excalidraw-app/package.json` | `socket.io-client@4.7.2`, `firebase@11.3.1`, `idb-keyval@6.0.3`. **No yjs, no y-websocket, no y-protocols** |
| `packages/excalidraw/data/reconcile.ts` | 118 lines. Per-element LWW on `(version, versionNonce)`, fractional-index ordering, 20 s full-scene resync |
| `packages/excalidraw/data/encryption.ts` | WebCrypto AES-GCM, 128-bit symmetric key, exported as a raw string, carried in the URL fragment. No asymmetric handshake, no forward secrecy, no revocation |
| `packages/excalidraw/data/LocalData.ts` | Elements to **localStorage**; files to IndexedDB. Debounced 300 ms; paused when `document.hidden` |
| `packages/excalidraw/data/restore.ts` | 1,415 lines of migration logic. The `{...element, ...base, ...extra}` forward-compat pattern |
| `packages/excalidraw/components/App.tsx` | 12,942 lines, a React class component holding `AppState` |
| `packages/element/src/collision.ts` | 942 lines. Two-tier hit test with a monotonic-threshold result cache |
| `packages/element/src/binding.ts` | 94.4 KB — arrow binding |
| `packages/element/src/delta.ts` | 70.5 KB — **not read in depth.** `applyDeltas` is on the imperative API. A possible purpose-built incremental-update mechanism, relevant to sync |
| `packages/element/src/types.ts` | 14,954 bytes. The element schema and the `version` / `versionNonce` / `index` triple |
| [`AGENTS.md`](https://github.com/excalidraw/excalidraw/blob/master/AGENTS.md) | Two rules. The `app.ownerDocument` rule exists so the editor can be embedded in iframes and shadow roots |
| [`dev-docs/`](https://github.com/excalidraw/excalidraw/tree/master/dev-docs) | Docusaurus. **The historical `codebase/architecture.md` no longer exists** — only `frames.mdx` and `json-schema.mdx`. There is no upstream architecture document |

---

## Weje and Hyper8

See [`weje-and-hyper8.md`](weje-and-hyper8.md) for the full analysis.

| Source | What it establishes |
| --- | --- |
| [weje.io](https://weje.io) | Made by **HyperTech, Inc.**, 220 East 23rd St, New York |
| [weje.io/about](https://weje.io/about) | Originally "Webjets". Public Sept 2021 |
| [weje.io/pricing](https://weje.io/pricing) | Free since August 2023. Donations: $19 one-time, $9 monthly, PayPal |
| [weje.io/free-online-whiteboard](https://weje.io/free-online-whiteboard) | **Source code is a paid product**: "✅ Source codes ✅ Weje white-label", contact `wj@weje.io` |
| [weje.io/news](https://weje.io/news) | August 2023: "We're also considering making Weje an open-source project." No announcement since |
| [weje.io/legal/terms](https://weje.io/legal/terms) | "This Agreement does not transfer from Website operator to you any… intellectual property" |
| `github.com/Hyper8-Tech` | Org named "HyperTech Inc", `public_repos: 1`. The single repo is `hyper8-releases` — `.dmg` / `.exe` binaries, **no licence, no source** |
| [app.hyper8.tech/login](https://app.hyper8.tech/login) | "Hyper8 is a next-generation whiteboard by the Weje team… **Weje is available here for a limited time.**" |
| [weje.io/knowledgebase](https://weje.io/knowledgebase) | The feature index, from which the object inventory was built |

**Unverified:** Weje's Firebase security rules (the data model is inferred from client
code); whether voting works in production (advertised with a GIF, no code path found);
the status of "Publisher Mode" (labelled coming soon, code exists).

---

## Adjacent projects

Licences verified against source, 30 September 2026.

| Project | Licence | Note |
| --- | --- | --- |
| [AFFiNE](https://github.com/toeverything/AFFiNE) | **Mixed** — `packages/backend` and `packages/common/native` under its own licence, rest MIT | 73k stars. Closest architectural analog. **Read the licence before adopting anything.** |
| [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | AGPL-3.0 | 77k stars. Flutter, so a mismatch for a canvas |
| [Penpot](https://github.com/penpot/penpot) | MPL-2.0 | 60k stars. Best vector design. Not a workshop tool |
| [Huly](https://huly.dev) | EPL-2.0 | 28k stars. Excellent PM layer, no canvas. Worth mining for patterns |
| [Docmost](https://github.com/docmost/docmost) | AGPL-3.0 | 22k stars. Yjs-based, which is corroboration for our CRDT choice |
| [Anytype](https://github.com/anyproto/anytype-ts) | Custom (`NOASSERTION`) | The most interesting local-first object-graph reference. P2P, E2EE |
| [Focalboard](https://github.com/mattermost-community/focalboard) | Mattermost custom | Last push 18 May 2026 — **dormant. Do not build on it** |
| [Planka](https://github.com/plankanban/planka) | "PLANKA Community License" v1.1, **not OSI** | Read the full text before use |
| [Eraser](https://github.com/eraserlabs/eraser-diagrams) | MIT, 270 stars | Diagram-as-code. A SaaS, not a Miro alternative |
| [Liveblocks](https://github.com/liveblocks/liveblocks) | `NOASSERTION` | Commercial. Its Comments package is a good model for anchored threads |

---

## CRDT landscape

| Source | What it establishes |
| --- | --- |
| [Yjs](https://github.com/yjs/yjs) · [pkgpulse comparison](https://www.pkgpulse.com/guides/yjs-vs-automerge-vs-loro-crdt-libraries-2026) | Yjs ~920k weekly downloads, 17k stars, MIT, 18 kB gzipped. Automerge ~85k, Loro ~12k |
| [Loro benchmarks](https://loro.dev/docs/performance) | On the B4 trace (260k characters): Yjs 2,616 ms apply / 226,981 bytes; Loro 2,271 ms / 230,556 bytes; Automerge 7,109 ms / 129,116 bytes |
| [Yjs vs Loro discussion](https://discuss.yjs.dev/t/yjs-vs-loro-new-crdt-lib/2567) | The Yjs author disputed Loro's unreproducible benchmarks. Loro has since published them |
| [y-indexeddb](https://github.com/yjs/y-indexeddb) | Offline persistence in three lines |
| [CRDT benchmark suite](https://github.com/dmonad/crdt-benchmarks) | The reproducible benchmark both projects now use |

**Decision:** Yjs. Reasoning in
[`../adr/0002-yjs-as-concurrency-engine.md`](../adr/0002-yjs-as-concurrency-engine.md).

---

## Format and documentation conventions

| Source | What it establishes |
| --- | --- |
| [adr.github.io](https://adr.github.io/) | ADR practice. MADR 4.0 is the format we use |
| [Michael Nygard, *Documenting Architecture Decisions*](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions.html) | The original article |
| [agents.md](https://agents.md/) | The AGENTS.md open standard. Kept separate from README deliberately: agent operations versus human documentation |
| [aihero — A Complete Guide To AGENTS.md](https://www.aihero.dev/a-complete-guide-to-agents-md) | Monorepo scoping via nested files; Claude Code reads `CLAUDE.md` |
| [blakecrosley — AGENTS.md patterns](https://blakecrosley.com/blog/agents-md-patterns) | "Command-first instructions… every instruction should be verifiable by running something." The basis for our [`../../AGENTS.md`](../../AGENTS.md) |
| [Cursory / best-practice monorepo tooling](https://www.pristren.com/blog/monorepo-with-turborepo-guide/) | pnpm + Turborepo, considered and rejected in [ADR-0010](../adr/0010-keep-upstream-tooling.md) |
