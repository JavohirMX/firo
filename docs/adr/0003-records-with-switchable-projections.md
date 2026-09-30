---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# One record store with switchable projections

## Context and Problem Statement

Miro's product surface includes tables, kanban boards, timelines, mind maps and
documents. The interesting thing is not that these exist — it is that they are
**the same data with different views**. From
[Miro's MCP documentation](https://developers.miro.com/docs/miro-mcp-tools):

> "Tables with typed columns, switchable between table, grid, timeline, and kanban
> views."

Miro calls this the "Intelligent Canvas". Hyper8 describes its `entry` type as "the
universal unit of structured data". Two independent teams converged on it.

The evidence that it is hard: from Miro's own REST API board-items documentation,
**`kanban`, `table`, `timeline`, `document` and `mindmap` have no public CRUD
support.** A team with a hundred engineers has not exposed these as first-class API
objects.

Weje takes the opposite approach and it is instructive: there is no `kanban` type in
Weje at all. A kanban is five lists with cards dragged between them. That is
emergent structure and it works — it is also why Weje cannot offer a table view of
the same data.

## Decision Drivers

- A task must have **one identity**. Editing it in a board must be visible in a table
  with no sync step and no reload.
- Adding a fifth view must not require touching the data model or the renderer.
- Structured data must not live on the canvas, or it becomes unqueryable,
  unsyncable and unsearchable.
- The first two views must ship before a third is attempted. Four half-built
  projections are worse than two good ones.

## Considered Options

1. Five separate element types (table, kanban, timeline, mindmap, doc)
2. One record store with a switchable projection interface
3. Records in a document-level store, decoupled from the canvas
4. Emergent structure only, as Weje does
5. Miro API compatibility for these types

## Decision Outcome

Chosen option: **2 — one record store with a switchable projection interface.**

- A **record** is a typed row in a **collection**. It has no geometry and no style.
- A **projection** renders a collection into canvas elements. Table, grid, board
  (kanban), and timeline are projections.
- A **card element on the canvas is a projection of a record**, not a record and not
  an independent copy.
- A projection never writes to a record directly. It returns a `RecordMutation`,
  which the record store applies.

Version 1 ships **table and board**. Timeline is v2. Grid and mind map follow once
the interface is proven.

## Consequences

- (+) AC-3 holds trivially: one identity, one store, every view a projection.
- (+) A card dragged from "Doing" to "Done" updates the record; the table shows "Done"
  with no reload.
- (-) **The projection interface is the hardest interface in the project to get
  right**, and getting it wrong is expensive. `layout` must be pure, `applyChange`
  must be O(changed records) rather than O(all), and `interpret` must return a
  mutation rather than applying one.
- (-) A board with 10,000 records has a 10,000-element scene. The renderer budget
  (AC-5) applies to the projected elements like any other, and the culler must
  handle them.
- (-) ProseMirror in 10,000 table cells is a serious measurement and layout cost.
  Virtualisation is mandatory and cells must be laid out lazily.
- (-) A record can legitimately appear in more than one projection, which means the
  "one card per record" intuition breaks. Handled explicitly, not accidentally.
- (-) Crossing the record/element boundary — "is this card a record?" — is a constant
  source of confusion. It is rule 4 in [`../../AGENTS.md`](../../AGENTS.md) and it is
  the rule most likely to be violated by someone adding a feature quickly.

## Confirmation

- **AC-3** in [`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) is
  the acceptance test: drag between columns, switch projections, no reload, and
  repeat across a save/load/export cycle.
- A test asserts that a `table` element contains **no row data** — only a collection
  id and projection configuration. This is the mechanical check that option 1 has not
  crept back in.
- A test asserts that no `kanban` element type exists in the schema.

## Pros and Cons of the Options

### 1. Five separate element types

- (+) Each is independently simple; a team can build them in parallel.
- (+) No abstraction to learn.
- (-) **A task moved from a kanban to a table becomes two objects.** They drift
  immediately and there is no correct answer to "which one is real".
- (-) Switching views is not a feature, it is a migration.
- (-) Every cross-view feature becomes a sync problem, which is the hardest kind of
  problem to get right.
- (-) This is what most "whiteboard with a kanban" tools have done, and it is why
  they all feel like a canvas with some extra widgets bolted on.

### 3. Records in a document-level store, decoupled from the canvas

- (+) Cleanly separates concerns; records are queryable independent of any rendering.
- (+) A database view could exist with no canvas at all.
- (-) **The canvas is the point.** Decoupling means the user cannot see a record
  without us building a second surface for it, and "green information" says there
  should be one surface.
- (-) Loses the visual arrangement that makes a board valuable: a kanban column
  position, a mind map's shape, a timeline's density are all meaningful.

### 4. Emergent structure only, as Weje

- (+) Extremely simple, and genuinely good for brainstorming. Weje's nesting model is
  the best idea in that product and we adopt it in full
  ([ADR-0007](0007-arbitrary-container-nesting.md)).
- (+) Zero schema, zero projections, no migration burden.
- (-) **A kanban is five lists. It cannot answer "show me all tasks due this week
  across boards."** There is no query layer, so there is no reporting, no filtering
  across projects, and no timeline.
- (-) As boards grow, emergent structure becomes exactly the "non-green approach to
  information" that Weje itself names as a failure mode.

### 5. Miro API compatibility

- (+) Drop-in migration for Miro users.
- (-) **Miro has no public API for these types.** There is nothing to be compatible
  with.
- (-) Miro's SVG channel expresses them only through their MCP layer, which is a
  rendering contract, not a data model.

## More Information

- [Miro MCP tools — multi-view records](https://developers.miro.com/docs/miro-mcp-tools)
- [`../trd/06-records-and-projections.md`](../trd/06-records-and-projections.md) — the projection interface
- [`../trd/02-data-model.md`](../trd/02-data-model.md) — the element/record distinction
- [`../competitive.md`](../competitive.md) §4 — Weje's emergent model
