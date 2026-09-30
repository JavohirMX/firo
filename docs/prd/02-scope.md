# Scope

## The version boundary principle

**Version 1 is a single-player application that is excellent at running a workshop
alone, with a data model built for multiplayer.** Multiplayer is a deployment
change, never a rewrite.

This is deliberate and it is the most important scope decision in the project.
Real-time collaboration — presence, sync, auth, permissions — is weeks of work on
its own. Doing it first means shipping a worse whiteboard later. Doing it in v2
means shipping a great whiteboard now and adding sync to a model that was designed
for it.

## Version 1 — single-player (Phases 0–7)

**Ships when:** a team can run a full workshop on one machine, offline, with no
account, and walk away with a file they own.

| Area | In v1 |
| --- | --- |
| **Canvas** | Infinite pan and zoom, grid, minimap, selection (marquee, click, shift-click), multi-select, align and distribute, undo/redo, full keyboard navigation |
| **Shapes** | Rectangle, ellipse, diamond, triangle, and a shape library; arrow and line with endpoint binding; freehand; text; image upload and drop |
| **Aesthetic** | Hand-drawn rendering with adjustable roughness; a clean mode at roughness 0; light and dark themes |
| **Miro objects** | Sticky notes, cards, frames, sections, tags, arbitrary container nesting, connectors with labels |
| **Facilitation** | Dot voting, timer, private/reveal mode, reactions, presentation mode over frames |
| **Records** | One record store with typed columns; **table and board (kanban) projections**; drag between columns updates the record |
| **Mind map** | Node tree with auto-layout, over the same record store |
| **Persistence** | IndexedDB, autosave, board list, trash with restore, `.firo` archive import/export, and `.excalidraw` import |
| **Export** | PNG, SVG, PDF (one page per frame), CSV, Mermaid export and import |
| **Projects** | Board index with folders and tags, local search, recent boards |
| **Accessibility** | Full keyboard operation, screen-reader board navigation, WCAG 2.2 AA targets, reduced motion |
| **Offline** | Everything, always. No feature requires a network. |

**Explicitly not in v1:** multiplayer, accounts, the server, table→timeline
projection, doc blocks, AI, MCP, desktop app, mobile, SSO, templates marketplace,
comments, Google Docs embedding.

## Version 2 — self-hosted collaboration (Phases 8–9)

| Area | In v2 |
| --- | --- |
| **Sync server** | Single container, SQLite, Yjs WebSocket sync, no external database |
| **Auth** | Local accounts on the server, board-level roles (owner / editor / commenter / viewer) |
| **Presence** | Live cursors, laser pointer, user list, follow-me |
| **Comments** | Threaded, object-anchored, resolvable — with a separate permission lane so commenters need not be editors |
| **Timeline projection** | Fourth view over the same record store |
| **Share links** | Read-only and edit links, optionally with E2EE |
| **Version history** | Board snapshots with restore |
| **Import** | Miro board import via their export formats; Weje import |

## Version 3 — everything else (Phase 10)

| Area | In v3 |
| --- | --- |
| **AI** | Local-model clustering of stickies, board summaries, text-to-diagram, text-to-record-table |
| **MCP server** | Board addressable by agents via a declarative SVG protocol with stable IDs, modelled on Miro's |
| **Accessibility** | Shipped VPAT, third-party audit |
| **Desktop** | Tauri shell, filesystem integration, offline updates |
| **Doc blocks** | Notion-style structured documents on the canvas |
| **Mind map + timeline as records** | Full unification |
| **Templates** | A small curated set, shipped in-app. Not a marketplace |
| **Tablet** | First-class touch and stylus support |

## Never

These are permanent non-goals. See [`vision.md`](../vision.md) for reasoning.

- A paid tier, seat limit, watermark, or usage meter of any kind
- SAML, SCIM, audit logs, SIEM, eDiscovery, or compliance certification
- A third-party app marketplace
- Real-time video, audio calls, or screen sharing
- A Gantt critical-path scheduler or resource levelling
- Figma-class vector fidelity
- Phone-first design

## The three hardest scope calls

**Timeline projection in v2, not v1.** Four projections over one store is
architecturally cheap once two work. Building four before any of them are proven is
how projects die. Two proven projections plus a clean projection interface is a
better bet than four half-built ones.

**Doc blocks in v3.** A structured document editor is a whole product. Miro's own
Docs are new and thinly supported in its API. We do not start until the record store
is solid.

**Templates as a shipped feature, not a gallery.** A template marketplace is a
community problem we do not have yet. We will ship a dozen good ones and let
contributors add more through the file format.
