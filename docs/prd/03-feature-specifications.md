# Feature specifications

Requirements are numbered `FR-n`. Each specification states the requirement, the
capability it replaces, the behaviour, and the edge cases that are easy to get
wrong.

Phase references point to [`../plans/`](../plans/).

---

## 1. Canvas and viewport

**FR-1 — Infinite canvas** (Phase 2)
Replace: Miro's infinite canvas; Excalidraw's, which is equivalent.
Pan without bounds, zoom between 10% and 4000%, zoom to 100%, zoom to fit, zoom to
selection. Panning must not be limited by element extents.
*Edge cases:* zoom anchored at the cursor, not the viewport centre; sub-pixel
scrolling must not produce shimmering; pinch-zoom and trackpad two-finger scroll
must not fight each other.

**FR-2 — Viewport culling** (Phase 2)
Replace: Excalidraw's flat `filter` over all elements.
Only elements intersecting the viewport (plus a margin) are rendered or hit-tested.
Backed by a spatial index — `rbush` is the leading candidate
([`trd/04-rendering.md`](../trd/04-rendering.md)).
*Edge cases:* elements rotated outside their bounds must still be found; the index
must be updated within the same frame as the mutation, or fast drags drop elements.

**FR-3 — Level of detail** (Phase 2)
Replace: Miro's vector-LoD work; Excalidraw has none.
Below a zoom threshold, simplify geometry: drop roughjs jitter, reduce freedraw
point density, replace hatching with flat fills, skip fine strokes. Above it, render
in full. Thresholds must be hysteresis-damped or the canvas flickers on zoom.
*Borrow:* Miro's published finding that vector-LoD beats raster-LoD on memory
([`competitive.md` §2](../competitive.md)).

**FR-4 — Grid and minimap** (Phase 2, 3)
Replace: Miro's grid (`G`) and minimap (`M`); Excalidraw's grid only.
*Edge cases:* the grid must render at a whole number of device pixels and centre on
the half-pixel when odd, or it renders as two lighter lines at every zoom level
except 100%.

**FR-5 — Selection** (Phase 3)
Click, shift-click, marquee, and select-all. Multi-select across containers.
*Edge cases:* marquee must be able to select a container's children without
selecting the container, and vice versa.

---

## 2. Shapes and drawing

**FR-6 — Primitive shapes** (Phase 3)
Rectangle, ellipse, diamond, triangle. Plus a shape library covering flowchart
shapes, and the common diagramming set. Resizable with eight handles, rotatable,
flip-able.
*Replaces:* Miro's Basic and Flowchart shape packs.
*Unverified:* Miro gates BPMN, Data Flow and AWS shape packs behind Business+. We
do not replicate the gate; we may not build all of them at all.

**FR-7 — Arrows and connectors** (Phase 3, 4)
Replace: Excalidraw's arrows (already good, MIT); Miro's smart connectors.
Bind an endpoint to an element and it tracks moves and resizes. Labelled arrows.
Elbow routing. Three line styles: solid, dashed, dotted.
*Edge cases:* binding during a resize must not oscillate; an arrow bound to an
element that is deleted must be deleted or unbound predictably; a connector inside
a container must bind to siblings, not escape the container.

**FR-8 — Freehand** (Phase 2, 3)
Pressure-variable strokes via `perfect-freehand`, plus a constant-width variant for
the laser pointer. Stylus pressure and tilt on supported hardware.
*Inherited:* Excalidraw's dual freedraw renderer, which is MIT and works.

**FR-9 — Text** (Phase 4, see also §5)
See [`trd/05-rich-text.md`](../trd/05-rich-text.md). Rendering on canvas, editing
with ProseMirror overlaid at the exact screen position.

**FR-10 — Images** (Phase 3)
Upload, drag and drop, paste from clipboard. Resize with crop. Store as blobs in
IndexedDB, not inlined as base64 in the element.
*Fixes an inherited problem:* Excalidraw inlines files as base64 data URLs in
`"local"` serialisation, which is why its element JSON hits the localStorage quota.
Ours stores a reference; the blob lives in IndexedDB.

---

## 3. Miro object vocabulary

**FR-11 — Sticky notes** (Phase 4)
Colour, text, size presets, resize by content, font size. Bulk creation (Enter adds
another).
*Note:* Excalidraw already has a `stickynote` element type (MIT). We extend it
rather than reinvent it.

**FR-12 — Cards** (Phase 4)
A card is a container with a title, optional body, optional metadata row, an
assignee, a due date, and a status. Cards are the substrate for records
(§6) and the primary object in Weje's model.
*Replaces:* Miro's Cards (`D` key).

**FR-13 — Frames** (Phase 4)
Replace: Miro's frames; Excalidraw has a `frame` type but with different semantics.
A frame is a named, nestable rectangle that groups content, defines PDF page order,
and becomes a slide in presentation mode. Frames can be hidden by the board owner.
*Edge cases:* a frame containing a frame must produce sane PDF page order; an object
can belong to at most one frame per nesting level.

**FR-14 — Sections** (Phase 4)
A lighter grouping than a frame — a labelled background region without page or
slide semantics. This is the Miro/Weje distinction: frames structure output,
sections structure the board.

**FR-15 — Tags** (Phase 8)
Labels on elements, filterable, colourable. Not a category system.

**FR-16 — Arbitrary container nesting** (Phase 4)
Replace: Weje's nesting model. **The distinguishing feature of Firo.**
Any object can become a container. Containers nest to any depth. Collapse and
expand. Ordering within a container is fractional-index.
*Rules:*
- Nesting depth is unbounded in the model; the UI should discourage more than ~4
  levels but must not forbid more.
- A container's children move and resize with it.
- Deleting a container deletes its children, or re-parents them — this must be a
  user choice, not a default.
- A record can be rendered inside a container without becoming a child of it.
See [`ADR-0007`](../adr/0007-arbitrary-container-nesting.md).

---

## 4. Facilitation

**This entire section is the cleanest wedge we have.** Miro gates all of it behind
Starter ($8/seat/mo). Weje has none of it — no vote or poll object type exists in
its source, and no timer.

**FR-17 — Dot voting** (Phase 5)
Place N votes on any element. Anonymous or named. Private until revealed. Results
visible as a badge.
*Edge cases:* changing a vote must move a dot, not accumulate one; votes must survive
a save/load cycle; a vote on an object inside a collapsed container must still
count.

**FR-18 — Timer** (Phase 5)
A shared countdown visible to everyone. Start, pause, reset, adjust. A facilitator
may force a duration change for everyone.

**FR-19 — Private / reveal mode** (Phase 5)
Hide all content authored after a point in time, or hide selected content, until the
facilitator reveals. This is how a brainstorm avoids anchoring.
*Replaces:* Miro's "Private mode", paid.

**FR-20 — Reactions** (Phase 5)
Emoji attached to an element. Single-player shows a personal reaction set.

**FR-21 — Presentation mode** (Phase 5)
Frames become slides. Navigate, present, follow-me, and a laser pointer. Per-object
`hideInPresentation` so scaffolding can be hidden from the audience.
*Replaces:* Miro's presentation and interactive presentation mode.

**FR-22 — Attention management** (Phase 5)
Follow a collaborator's viewport; "bring user to me"; "bring everyone to me".
Single-player v1 has only the laser pointer; the rest arrives with presence in v2.

---

## 5. Records and projections

**The largest bet in the project.** See
[`ADR-0003`](../adr/0003-records-with-switchable-projections.md) and
[`trd/06-records-and-projections.md`](../trd/06-records-and-projections.md).

**FR-23 — Record store** (Phase 6)
A board holds **collections**. A collection has **typed columns** and **records** (rows).
A record is a typed row: field values keyed by column, plus the fields every record
has — id, created, updated, order, container.
*Distinction that must not blur:* a **record** is a typed row in a collection. An
**element** is a positioned object on a canvas. Projections are views over records,
not element types.

**FR-24 — Typed columns** (Phase 6)
Column types: short text, long text (rich), number, currency, date, single select,
multi select, checkbox, person, duration, link to record, formula (v3), rollup (v3).
Each carries a name, and optionally colour and grouping.

**FR-25 — Table projection** (Phase 6)
Editable grid over a collection. Column resize, reorder, sort, filter, group.
*Edge cases:* editing a cell must not steal the canvas keyboard shortcuts; scroll
performance on a 10,000-row collection.

**FR-26 — Board (kanban) projection** (Phase 6)
Columns from a single-select column, or manual column definitions. Drag a card
between columns and the record's field updates.
*Acceptance:* a card dragged from "Doing" to "Done" in the board projection appears
in "Done" in the table projection with **no manual sync step and no reload**.

**FR-27 — Grid projection** (Phase 6)
One card per record, free-arranged, filterable. Weje's natural board, generalised.

**FR-28 — Timeline projection** (Phase 2 scope: v2)
A Gantt-style view from a date column and an optional duration column.

**FR-29 — Mind map** (Phase 6)
A node tree over the record store, with auto-layout and expand/collapse.
*Edge case:* mind-map nodes are records, so a task appears as both a node and a table
row. This is the unification that justifies the whole record layer.

**FR-30 — Card rendering on the canvas** (Phase 6)
A card element is a *projection* of a record onto the canvas. Editing the canvas
card edits the record. A card can also be free-floating and unlinked, in which case
it is an ordinary element, not a record — both must work.

**FR-31 — Projections are a plugin point** (Phase 6)
Registering a new projection must not require touching the record store or the
canvas renderer. This constraint is what makes v2's timeline and v3's rollups cheap.

---

## 6. Persistence and formats

**FR-32 — Local persistence** (Phase 7)
Replace: Excalidraw's localStorage (elements) + IndexedDB (files).
Everything in IndexedDB via `idb-keyval`. Debounced autosave. A visible save state.
*Fixes:* Excalidraw stores element JSON in localStorage, which caps at roughly
5–10 MB and is fatal for an image-heavy workshop board.
See [`ADR-0005`](../adr/0005-indexeddb-via-idb-keyval.md).

**FR-33 — The `.firo` archive** (Phase 7)
A **directory** containing the board document, assets, and a manifest.
**Text-based, readable, diffable, git-friendly.** Assets are content-addressed and
stored alongside rather than inlined as base64.

> **Amended by [ADR-0018](../adr/0018-a-firo-is-a-directory.md).** This originally read
> "A single file containing the board document, assets, and a manifest". A single file
> cannot carry image bytes and stay diffable: base64 in JSON is unreadable, 33% larger,
> and one edited character rewrites the whole value. The two are mutually exclusive, and
> the readable diff is the promise rather than the convenience. `cat board.firo` is
> therefore `cat board.firo/board.json`.
>
> A format-v1 single JSON file still loads, for ever. Import dispatches on shape rather
> than on the extension, so both containers coexist.
*Borrow:* Excalidraw's forward-compat pattern from `data/restore.ts` — spread the
original object first to preserve unknown keys, then normalise.

**FR-34 — File format versioning** (Phase 7)
Every element and record type carries a version. Loads run a migration chain.
Loading a file from a future version must fail loudly, not silently drop data.
*Acceptance:* a fixture written by version N-1 loads correctly in version N with no
data loss, tested for every released version.

**FR-35 — Export** (Phase 7)
PNG and SVG (with selection or frame scope), PDF (one page per frame, in frame
order), CSV, Mermaid (for diagrams and mind maps).
*Replaces:* Miro's export set, plus the watermarked-free version Miro charges for.

**FR-36 — Import** (Phase 7)
`.excalidraw` (lossless enough to be useful), `.firo`, Mermaid, PNG and PDF as
background images, CSV into a collection.
*v2:* Miro board import via their export formats.
*Note:* Miro **cannot import its own board file** (`.rtb`) — board migration is
copy-paste. A lossless round-trip is a genuine differentiator.

**FR-37 — Board list and trash** (Phase 7)
All local boards, sortable and filterable. Deleting moves to trash with restore.
*Replaces:* Excalidraw's localStorage single-board model.

---

## 7. Project layer

**FR-38 — Board index** (Phase 8)
Folders, tags, search across board titles and (from v2) content. Recent boards.
*Replaces:* Miro's dashboard; Weje's All / Mine / Shared / Starred / Trash sections.
*Constraint:* no metric on this screen may require the user to maintain information
that already exists on a board. See "green information" in [`vision.md`](../vision.md).

**FR-39 — Activity feed** (Phase 8, v2)
Recent changes. Single-player shows local history; v2 shows collaborators'.

---

## 8. Collaboration (v2)

**FR-40 — Sync server** (Phase 9)
One container. SQLite. Yjs WebSocket sync. No external database, no Redis, no
message queue. See [`ADR-0008`](../adr/0008-local-accounts-on-self-hosted-server.md).

**FR-41 — Local accounts** (Phase 9)
Username and password on the server. Sessions. Board roles: owner, editor,
commenter, viewer. Invitations by link.
*Replaces:* a cloud vendor's account system, with a user table we own.

**FR-42 — Presence** (Phase 9)
Live cursors, laser pointer, user list, follow-me, idle state.
*Borrow:* tldraw's separate permission lane for comments, so a commenter can write
comments without edit rights.

**FR-43 — Comments** (v2)
Threaded, object-anchored, resolvable, mentionable. A comment survives its anchor
being deleted, as a tombstone.

**FR-44 — Version history** (v2)
Board snapshots with restore. Excalidraw retains deleted elements for 24 hours; we
retain them until the board is compacted.

---

## 9. Deferred

| Requirement | Version | Note |
| --- | --- | --- |
| AI clustering, summaries, text-to-diagram | v3 | Needs a real document graph first. [`ADR-0012`](../adr/0012-no-ai-in-v1.md) |
| MCP server | v3 | Board as declarative SVG with stable IDs, modelled on Miro's |
| Doc blocks | v3 | Whole product; Miro's own Docs are thin |
| Desktop (Tauri) | v3 | |
| Tablet and stylus first-class | v3 | Supported from v1, optimised in v3 |
| SSO / OIDC | Never | [`vision.md`](../vision.md) non-goals |
| App marketplace | Never | |
| Video, audio, screen share | Never | |
