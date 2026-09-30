# Weje and Hyper8

Reverse-engineering notes on Weje and its successor, researched 30 September 2026.
This is the evidence base for
[`../adr/0007-arbitrary-container-nesting.md`](../adr/0007-arbitrary-container-nesting.md)
and the "green information" constraint in [`../vision.md`](../vision.md).

## Licensing — there is nothing to fork

**Weje is not open source, and its source is a paid product.**

| Evidence | Detail |
| --- | --- |
| [weje.io/free-online-whiteboard](https://weje.io/free-online-whiteboard) | Paid cooperation offers list "✅ Source codes ✅ Weje white-label". Contact `wj@weje.io` |
| [weje.io/news](https://weje.io/news) | August 2023: "We're also considering making Weje an open-source project." No announcement since |
| [weje.io/legal/terms](https://weje.io/legal/terms) | "This Agreement does not transfer from Website operator to you any Website operator or third party intellectual property" — no licence grant to users at all |
| `github.com/Hyper8-Tech` | Org name field is literally "HyperTech Inc". `public_repos: 1` |
| `Hyper8-Tech/hyper8-releases` | `.dmg` and `-Setup.exe` assets. **No licence field, `size: 0`, root contains only `README.md`**: "Internal builds + electron-updater feed" |
| npm | `weje`, `weje.io`, `@weje/board`, `@hyper8/core`, `hyper8` all 404 |
| PyPI | `/pypi/weje/json` → 404 |

**Conclusion: cite Weje as a design reference, never as prior art or as a codebase.**

## The product is being retired

Every "Sign up" link on weje.io redirects to `app.hyper8.tech`, whose login page reads:

> "Hyper8 is a next-generation whiteboard by the Weje team — much faster, with desktop
> apps for all platforms. We recommend everyone to migrate to Hyper8. Weje is
> available here for a limited time."

Confirmed by the company on LinkedIn, 15 May 2026: "we're rebuilding the core of
Webjets / Weje from the ground up. It's called HYPER8 (codename) — one workspace
where your whiteboards, pages, and content collections actually live together."

## Company

**HyperTech, Inc.**, 220 East 23rd St, Office 401, New York, NY 10010.
Team per the about page: Eugene (CEO), Egor (Technology), Paul (Strategy/Vision).
Product Hunt handles: `@egor_okrepilov`, `@medvednikov`.

Product lineage: began as **"Webjets"**; public release 13 September 2021; Product
Hunt Product of the Day December 2022 and 1,200-upvote launch September 2021. Free
since August 2023.

## Tech stack

### Weje (legacy) — recovered from a public source map

`app.weje.io/js/app.3834e8b5.js` ships a **public source map** (3.5 MB, 1,523
sources, `sourcesContent` populated).

| Layer | Technology |
| --- | --- |
| Framework | **Vue 2 + Vuetify**, with business logic in **CoffeeScript** |
| State | Vuex plus a custom undo/redo "operation" layer |
| Backend | **Google Firebase Realtime Database** |
| Board sync | A custom WebSocket layer to `board.app.weje.io` |
| Voice | **OpenVidu** at `service.openvidu.app.weje.io` |
| Rich text | **Quill** (deltas at `data.contentDelta.ops`) |
| PWA | Service worker, with a `share_target` for Android Web Share |
| **Rendering** | **SVG/DOM, not Canvas2D** — a `w-graffiti-canvas` SVG with `<path>` strokes |

Firebase paths: `/boards/{id}`, `/boardsData/{boardId}/…`, `/data/{uid}/…`,
`/users/{uid}`, `/teams/{id}`, `/projects/{id}`,
`/teamAccess/{teamId}/roles|projects|openProjects`, `/teamBilling/{teamId}/plan`.

**There is no REST API, OpenAPI spec, or GraphQL schema.** `/api`, `/swagger`,
`/graphql`, `/api/v1` on `app.weje.io` all return the SPA shell.

### Hyper8 (successor)

| Layer | Technology |
| --- | --- |
| Framework | **React 19 + Vite + Zustand** + React Router |
| Board canvas | **React Flow** — `react-flow__background`, 60 refs in the board chunk; edge types `CardLabeledEdge`, `ConnectionLine`; auto-layout via dagre |
| Rich text | **TipTap** |
| Backend | Own API on Cloudflare h3, **Supabase**, n8n, PostHog, Sentry |
| Desktop | Electron + `electron-updater` |
| Agents | MCP over WebSocket at `/api/mcp/ws`, plus a realtime graph stream at `/api/graph/stream` |

No source map is published.

## Information model

**Hierarchy:** Team → Project → Board.

**Board** is a container at `/webjets/containers/webjets/canvas`. Two siblings exist:
`mindmap` and `navigator`.

**A "webjet"** is a content object at `/boardsData/{boardId}/{key}` with fields
`{category, data, meta, shared, connections}`.

**A "connection"** is the *placement* record that links a webjet into a parent:

```
{ id, src, side, point, sortKey, coordinates: {x, y}, size: {w, h},
  presentation: 'card' | 'row', trashClear, anchorSortKey }
```

Parents hold `connections.items`, `.relations`, `.parents`, `.trash`, `.count`.

**Ordering is fractional-index arithmetic** — `generateSort` computes
`(before + closest)/2`. This is the same primitive as Excalidraw's
`fractional-indexing`, arrived at independently. Two unrelated implementations
converging on the same primitive is a good signal, and it is part of why we adopted
it.

**A "relation"** is a connector: its own webjet at `category: 'relation'`, anchored by
two connections at `point: 1` and `point: 2`.

**Frames and bookmarks** are `category: 'anchor'`, ordered by `anchorSortKey`, driving
the navigation panel and presentation mode. They are interconvertible.

## The three ideas we take

### 1. Arbitrary container nesting

Cards and lists are arbitrarily nestable containers. Any selection can be grouped into
a list with `Ctrl+G`; a list can contain lists, and boards. Collapse and expand with
`Space`. `presentation: 'card' | 'row'` per object.

From the site: *"I really like the concept of the boxes, to be able to nest them and
combine them together."*

From the docs: *"Create infinite number of cards and lists on your boards… Arrange
lists anyhow you like — up, down, left, right, in, or inside-out."*

**This is the best idea in Weje** and we adopt it wholesale
([ADR-0007](../adr/0007-arbitrary-container-nesting.md)).

### 2. "Green information"

Weje's third named failure mode of over-organisation, from the homepage:

> "Non-green approach to information leads to loss of efficiency."

The other two: systematising chaos loses efficiency; a project is always changing so
the system must adapt.

"Green" means information that is live, on one visual surface, legible at a glance —
no separate status table. This became a **core constraint** in
[`../vision.md`](../vision.md) and it rules out most of what a dashboard normally
contains.

### 3. Kanban is emergent

**There is no `kanban` object type.** A kanban board is five lists (To Do, In
Progress, Needs Feedback, Done, Rejected) as nested or adjacent lists with cards
dragged between them.

This is informative in two directions: it validates the simplicity, and it shows the
limit — an emergent kanban cannot answer "show me everything due this week", because
there is no query layer.

## The paradigm, in their words

**"Native-agile" for horizontal teams:** "Project management method specifically
designed for horizontal teams. All your workflows are organized on endless boards in
the form of task cards, lists and connections."

The founder's five principles, from the Product Hunt launch comment:

1. Only real work processes — work over analysis
2. Native perception of information — understand by looking at the picture
3. The system must not hinder or limit — "input and consumption of information should
   be as simple as human dialogue"
4. No abstract entities, only entities everyone understands
5. Don't try to replace familiar tools

**DIKW** — Data (raw unsorted ideas) → Information (labelled, meaningful) → Knowledge
(connected, classified) → Wisdom (purpose, vision). Mapped onto board mechanics:
gather raw cards → classify into lists → set connections → the board *is* the
decision. The long-form post extends it to a fifth step, "the decision itself", and
says: "The canvas you worked on is a true prototype of the project. You don't need to
transfer findings into documents or separate presentations."

That last sentence is the strongest statement of our thesis we found anywhere, from a
competitor.

## Object inventory

Category strings and renderers, read from `src/webjets/Webjet.vue` in the source map
and cross-checked against `src/webjets/all.coffee`.

| Category | Object |
| --- | --- |
| `/webjets/containers/webjets/canvas` | Board |
| `/webjets/containers/webjets/mindmap` | Mind map container |
| `/webjets/containers/webjets/navigator` | Navigation container |
| `/webjets/containers/webjets/list` | List — multi-column container of cards |
| `/webjets/content/webjets/note` | Text card — Quill, colour, nesting |
| `/webjets/content/webjets/photo` | Image |
| `/webjets/content/webjets/html5video` | Video |
| `/services/youtube/webjets/video` | YouTube embed |
| `/webjets/content/webjets/audio` | Audio file, playable in-card |
| `/webjets/content/webjets/embed` | Embed — Google Docs/Sheets/Slides/Forms, rich URLs |
| `/webjets/content/webjets/pdf` | PDF |
| `/webjets/content/webjets/link` | Link card |
| `/webjets/content/webjets/graffiti` | Freehand — SVG strokes, 1–2 sizes |
| `/webjets/content/webjets/shape` | Shape — 14 variants: star, circle, square, trapezoid, diamond, triangle ×4, data-base, parallelogram ×2, ellipse, doc |
| `checklist` | Checklist card — check/uncheck, hide-checked, reorderable |
| `voice` | Voice message — MediaRecorder, webm, 1:00 max, push-to-talk |
| `table` | Table — editable rows/columns, drag column resizers |
| `date` | Date object |
| `mention` | @Mention |
| `comments` | Comment thread |
| `anchor` | Frame / bookmark, with `hideInPresentation` |
| `btnLink` | Button linking to a frame or bookmark |
| `embedcode` | Embed code block |
| `tradingview` | TradingView widget |
| `relation` | Connection / arrow — 3 line styles, title, width |
| `/paints/…` | Painted region |

**Verified absent from the source:** no `vote` or `poll` object type, no timer, no
estimation, no diagram shape library, no proper flowcharting. On-board chat was
**removed for low usage** with "a better commenting feature is coming soon" as the
explanation — the `Chat.vue` code still ships, with the feature off.

**Unverified:** the sticky-notes page advertises polls with a `Voting-1.gif`, but no
vote or poll code path exists. Cannot confirm without a live account.

## Collaboration

- Real-time multi-user editing, live cursors, **pointer/laser mode**
- Per-board collaborators with view/edit rights, admin tools, remove user
- **Voice chat per board** via OpenVidu
- **Ephemeral collaborative drawing**: "drawings disappear in 15 sec" — a genuinely
  good idea we have not adopted
- Public boards with "can view" / "can edit" toggles
- **Frames carry their own permissions** — view or edit access to a selected region
  only (Weje 3.0). An interesting idea, noted for later.

## Media and embeds

Upload: JPEG/PNG, MP3/FLAC/WAV, MP4, PDF. Audio and video playable in-card.

Paste-to-embed recognises YouTube, Google Docs, Slides/Presentations, Sheets, Forms,
generic Google links, TradingView, and any URL.

## Business model

$0 since August 2023, donations only: $19 one-time, $9 monthly, or PayPal.

Security claims: Firebase infrastructure, TLS 1.2, AES-256 at rest, hashed passwords,
Google OAuth 2.0, GDPR and CCPA, 30-day workspace deletion purge. **No SOC 2, no ISO
27001, no HIPAA.** No export-to-open-format guarantee, no self-host, no status page.

**This is the most directly relevant business data point in the whole research set:** a
fully free, donation-funded whiteboard is a viable short-term model and an unreliable
long-term one. Weje is being wound down. Our own funding plan
([ADR-0009](../adr/0009-mit-licence-and-donation-funding.md)) accepts the same risk
knowingly.

## Hyper8's architecture — the one to learn from

Hyper8 uses a **declarative, module-extensible entity/component registry** rather than
hardcoded components. Every entity declares `{type, picker: {tier}, title,
description, icon, refs, fieldEnums, meta.usage, renderers}`.

Its `entry` type is described as:

> "A typed record (category + values) or a freeform block list. **The universal unit of
> structured data**"

That is the same convergence as Miro's "Intelligent Canvas"
([ADR-0003](../adr/0003-records-with-switchable-projections.md)). Three independent
products have arrived at "records are the unit, views are projections".

Other notable types: `actor` ("a participant in a space — a person **or an agent**"),
`task` (status, priority, effort, subtasks as real child task entities, acceptance
criteria, assignees, `blockedBy`), `routine` (scheduled agent task with RRULE),
`signal` (ephemeral pub/sub), `decorator-sticky-note`, `decorator-shape`, and 41
registered modules under `ux.*`, `data.*`, `ai.*`, `dev.*`, `game.*`, `service.*`.

A `vibe` module is described as "ask the agent for a module that does not exist yet".
An interesting direction, and a warning about scope.

**Its canvas is React Flow, not a custom renderer** — a funded team rebuilding a
whiteboard chose the node-graph library. That is the evidence behind the risk note in
[`../plans/phase-2-renderer.md`](../plans/phase-2-renderer.md).
