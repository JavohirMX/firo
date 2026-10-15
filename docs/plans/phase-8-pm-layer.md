# Phase 8 — Project layer

**Goal:** the board becomes an artefact that outlives the meeting.

Version 2. Ships after v1, but designed for during v1: the board list from Phase 7 is
already the seed of it.

## Exit criterion

- Board index with folders, tags, and search across board titles
- Search reaches board content, not just titles
- Recent boards
- Activity feed: what changed and when
- The timeline projection over the existing record store
- **No metric on the index requires the user to maintain information that already
  exists on a board**

## The constraint that shapes this screen

From [`../vision.md`](../vision.md) — **green information**: information that stays
live on one surface, legible at a glance. Weje names "non-green approach to
information" as its third failure mode of over-organisation.

**We do not build a second place for information to live.** No status table to keep in
sync with the board. No dashboard that summarises something already visible. If a
feature here requires the user to maintain the same information twice, it is the wrong
feature.

This is a real constraint and it rules out most of what a "dashboard" normally
contains. It is also the reason this phase is smaller than it looks.

## Tasks

### 8.1 — Board index (Completed)

Folders, tags, search, recent, starring, duplication. Implemented in `@firo/ui` and `apps/web/board/library.ts` ([ADR-0028](../adr/0028-project-layer-folders-and-content-search.md)).

Replaces Miro's dashboard with Recent, Starred, All Boards, Folders, and Trash sections, with grid/list view switcher and sorting.

### 8.2 — Content search (Completed)

Search reaches text inside sticky notes, cards, and comment threads. Implemented in `apps/web/board/search.ts` ([ADR-0028](../adr/0028-project-layer-folders-and-content-search.md)). Reads stored board documents and searches in memory with contextual preview snippets.

**Revisit trigger:** if the index needs cross-board queries over more than a few
hundred boards, SQLite-in-the-browser becomes the right answer
([ADR-0005](../adr/0005-indexeddb-via-idb-keyval.md)).

### 8.3 — Tags (Completed)

Colourable labels on elements, filterable. **Not a category system.** Tags are for
finding things, not for organising everything, and the moment they become a taxonomy
we are rebuilding Miro's Spaces. Shipped schema v3 migration (`V2_TO_V3_ELEMENT_TAGS`),
element overlay badges (`TagLayer`), and tag-aware board content search.

### 8.4 — Activity feed (Completed)

Recent changes, per board and across boards. In v1 this is local history; with
presence in v2 it shows collaborators. Shipped presentational feed in `@firo/ui`,
IndexedDB activity log in `apps/web/board/activity.ts`, and activity tracking
on library, comments, and storage changes.

### 8.5 — Timeline projection (Completed)

The fourth projection
([ADR-0003](../adr/0003-records-with-switchable-projections.md)). A Gantt-style view
from a date column and an optional duration column.

**This is the test of whether the projection interface was right.** Adding the timeline
projection touched only `packages/records/src/timeline.ts` and exports in `index.ts` — zero
modifications to `@firo/records` core abstractions and zero modifications to `@firo/render`.
Integrated into `ProjectionView` with day-interval time headers, row labels, duration bars,
and interactive date adjustments.

## Verification

- Search finds text inside a sticky note, a card body and a table cell
- Filtering by tag across boards
- **Adding the timeline projection touches only the projection implementation** — no
  change to `@firo/records` or `@firo/render`. Assert this in review; it is the real
  acceptance criterion.
- An empty workspace has a useful empty state
- No screen in this phase requires the user to enter information that already exists
  on a board

## Risks

| Risk | Mitigation |
| --- | --- |
| The index becomes a second place for information | The green-information constraint, written into the exit criterion |
| Search over many boards becomes slow | The SQLite-WASM revisit trigger above |
| The projection interface turns out to be wrong | The timeline is the test. If it needs core changes, fix the interface before shipping it |
| Tags become a category system | Explicit non-goal. Tags are for finding, not organising |
