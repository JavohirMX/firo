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

### 8.1 — Board index

Folders, tags, search, recent.

Replaces Miro's dashboard and Weje's All / Mine / Shared / Starred / Trash sections.
**We do not have "shared" in v1** — everything is local until v2.

### 8.2 — Content search

Search reaches text inside sticky notes, cards, table cells and docs. In v1 this
means loading board documents and searching in memory; with a few hundred boards this
is fine.

**Revisit trigger:** if the index needs cross-board queries over more than a few
hundred boards, SQLite-in-the-browser becomes the right answer
([ADR-0005](../adr/0005-indexeddb-via-idb-keyval.md)).

### 8.3 — Tags

Colourable labels on elements, filterable. **Not a category system.** Tags are for
finding things, not for organising everything, and the moment they become a taxonomy
we are rebuilding Miro's Spaces.

### 8.4 — Activity feed

Recent changes, per board and across boards. In v1 this is local history; with
presence in v2 it shows collaborators.

### 8.5 — Timeline projection

The fourth projection
([ADR-0003](../adr/0003-records-with-switchable-projections.md)). A Gantt-style view
from a date column and an optional duration column.

**This is the test of whether the projection interface was right.** If adding a fourth
projection requires touching the record store or the renderer, the interface in Phase
6 was wrong and the fix is more valuable than the timeline.

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
