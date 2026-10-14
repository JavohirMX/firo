# Vision

## The problem

Teams that think visually have three options today, and all three are bad in
some way that matters.

**Miro is excellent and priced out of reach for most teams.** The free plan allows
three editable boards per workspace, and creating a fourth silently downgrades the
oldest. Everything a team actually uses to *run a meeting* — voting, a timer,
private mode, anonymous participation, presenting — is behind a paid tier starting
at $8 per person per month. There is no self-hosted edition at any price, including
Enterprise. Export on the free tier is watermarked. Teams that do pay are subject
to per-seat cost growth, and their boards live on someone else's cloud.

**Excalidraw is free, open, and genuinely good — but it is a sketching tool.**
It has no backend worth the name, no facilitation layer, no structure, no project
concept, and one canvas per file. Its users have asked for multi-page support for
years. It is a diagram tool that people are using as a whiteboard, and it shows.

**Weje understood the right lesson and could not survive it.** It showed that
whiteboards should be *simple* — cards, lists, connections, no clutter — and it went
free in August 2023. It is donation-funded, it is closed source (the source is sold
commercially as a white-label product), and as of 2026 the company is winding it
down in favour of a new product.

Nobody occupies the intersection: **a real infinite canvas, Miro's object vocabulary
and facilitation loop, a project layer, local-first storage, and a permissive
licence.**

## The thesis

Firo is that intersection. It is a Miro replacement that is free forever, stores
your boards on your own machine, and can be self-hosted by a team with one
container.

We are not trying to be a better Excalidraw or a cheaper Miro. We are taking the
part of Miro that people actually pay for — the object vocabulary and the
facilitation loop — and putting it on a canvas that feels good, in a data model
that does not need a server, under a licence that cannot be revoked.

## Four ideas

Everything in the product should trace back to one of these.

### 1. Local-first means local

Your boards live in IndexedDB on your device and export to a plain archive file you
own and can read without our software. The application is fully functional with no
account, no network, and no server.

Collaboration is an **optional addition, never a prerequisite**. This is a hard
architectural commitment, not a feature. It means the data model must work with
exactly one user, offline, forever — which in turn means the data model must be
mergeable, which is why we chose Yjs
([`ADR-0002`](adr/0002-yjs-as-concurrency-engine.md)).

### 2. One data set, many views

A task exists once. You can look at it as a table, a board, a grid, or a timeline.
Miro calls this the "Intelligent Canvas"; Hyper8 calls the record the "universal
unit of structured data". Both arrived at it independently, and so have we.

This is the single largest bet in the project. It is also the thing that most
separates Firo from a pile of disconnected widgets — and the reason a task edited
in a kanban immediately shows up in a table and on a timeline
([`ADR-0003`](adr/0003-records-with-switchable-projections.md)).

### 3. Anything can hold anything

Any object can become a container, and containers nest to any depth. Sticky notes
inside a card inside a list inside a frame. There is no fixed taxonomy of what may
contain what.

This comes from Weje, and it is the best idea in that product. It works because
structure emerges from arrangement rather than from a schema the user had to learn.
It also means a board can be both a brainstorm and a plan without changing tools
([`ADR-0007`](adr/0007-arbitrary-container-nesting.md)).

### 4. Green information

Weje names its third failure mode of over-organisation: *"non-green approach to
information leads to loss of efficiency."* Green means information that stays live
on one surface, legible at a glance.

The practical rule: **we do not build a second place for information to live.** No
status table to keep in sync with the board. No separate task pane. No dashboard
that summarises something already visible on the canvas. If a feature requires the
user to maintain the same information twice, it is the wrong feature.

## Who it is for

**Primary: a self-hosting team running workshops.** They currently pay Miro, they
hate paying Miro, and they have tried to self-host and found the open-source options
either cannot run a workshop (Excalidraw) or cannot be trusted with their data
(cloud SaaS). They want facilitation, structure, and to own their data.

**Secondary: an engineer or researcher who thinks in diagrams.** They want the
Excalidraw feel, offline, on their own files, without an account.

Full personas with needs and success criteria: [`prd/01-personas.md`](prd/01-personas.md).

## Non-goals

These are decisions, not omissions. Each one exists because building it would make
the product worse.

**We will not build a paid tier.** No feature is held back. No seat limits, no
watermarks, no credit meters. Funding will be voluntary
([`ADR-0009`](adr/0009-mit-licence-and-donation-funding.md)).

**We will not chase enterprise compliance.** No SAML, SCIM, audit logs, SIEM
integration, eDiscovery, data-loss prevention, or ISO certification. These are
procurement checklists, not product. A team that needs them should buy Miro.

**We will not build an app marketplace.** Miro has 250+ integrations. We will not.
Firo's integration story is a file format and an API, not a monetised ecosystem.

**We will not build presentation software.** Presentation *mode* on a board, yes —
frames become slides. A deck-authoring tool with themes and animations, no.

**We will not build a full project-management system.** No Gantt critical path, no
resource levelling, no workload balancing, no timesheets, no sprint automation. We
do the visual planning layer well and we link out from there.

**We will not chase vector-design fidelity.** Firo is not a Figma replacement. Its
default surface is clean rather than hand-drawn, so that a board reads as the tool
teams already know ([`ADR-0021`](adr/0021-miro-style-shell-and-clean-aesthetic.md));
the sketch stroke is kept as a per-element option, for the divergent half of a
session. What we still refuse is production-asset rigour: no pixel-perfect design
tooling, no pressure to make a thing look finished before it is.

**We will not support real-time video, audio calls, or screen sharing.** Miro added
these in beta. They are a conferencing product, not a whiteboard, and building them
would dwarf everything else in the roadmap.

**We will not make AI a feature of version 1.** Not because we think AI is
useless — Miro's AI is measurably weak, because it reads the board with OCR over
rendered pixels rather than from a document graph — but because the structured data
model has to exist first for AI to be worth anything
([`ADR-0012`](adr/0012-no-ai-in-v1.md)).

**We will not make a mobile-first product.** The canvas needs a pointer and a
keyboard. Tablets are supported. Phones get a viewer. A phone-first whiteboard is a
different and much worse product.

**We will not track upstream Excalidraw.** We took what we needed, we credit it
generously, and we are building our own thing
([`ADR-0001`](adr/0001-fork-excalidraw-and-refactor-aggressively.md)).

## What success looks like

Firo is working when a team runs a two-hour retrospective on it, the board exports
to a file that still opens in three years, nobody had to create an account, nobody
had to buy a seat, and the board is still on the facilitator's laptop the next
morning.

The measurable version:

- A team of five runs a full workshop session without a single paid account.
- The board opens with no network connection and every feature still works.
- A board exported as `.firo` can be read, diffed, and version-controlled as text.
- A record edited in a kanban appears in the table view with no manual sync step.
- 10,000 objects on a board pan at 60fps on a five-year-old laptop.
- The whole thing is one `docker compose up` away for a team that wants a server.

## The honest risk

The largest risk is no longer the renderer. Phase 2's gate measured the inherited
one rather than assuming, and closed it — 73 fps at 9,766 elements, no rewrite
([`ADR-0017`](adr/0017-do-not-rewrite-the-renderer.md)).

The risk that remains is **the shell**. Firo's data model is Miro's, but the canvas
and chrome it inherited are Excalidraw's, and a person who decides in the first
thirty seconds that this is a sketch pad never reaches the object vocabulary.
[Phase 7.5](plans/phase-7-5-miro-ui.md) exists to close that gap, and it is a real
risk precisely because the differentiator is not a drawing style. It is the
workshop loop, the object vocabulary and local-first storage — none of which are
visible until the shell stops hiding them.
