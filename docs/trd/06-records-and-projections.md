# Records and projections

**The largest bet in the project.** If this works, Firo is a different category of
tool from a whiteboard. If it is built badly, we have four half-working widgets
instead of one working one
([`ADR-0003`](../adr/0003-records-with-switchable-projections.md)).

## The idea

A record exists once. You look at it as a table, a board, a grid, or a timeline.

Miro calls this the "Intelligent Canvas". Hyper8 describes its `entry` type as "the
universal unit of structured data". Weje has no such thing and does not need one —
its kanban is just five lists. All three informed us; only the first two have the
full version.

**Miro's API is the evidence this is hard.** From
[Miro's own MCP documentation](https://developers.miro.com/docs/miro-mcp-tools):

> "Tables with typed columns, switchable between table, grid, timeline, and kanban
> views."

And from the REST API board-items documentation, **`kanban`, `table`, `timeline`,
`document`, and `mindmap` have no public CRUD support.** Miro's own platform can
only reach them through the newer SVG/MCP channel. A first-class multi-view record
store is not a solved problem even for Miro with a hundred engineers.

## Why not five widgets

| Approach | Outcome |
| --- | --- |
| Five separate element types | A task moved from a kanban to a table becomes two objects that drift. No switching. Every cross-view feature is a sync problem. |
| **One record store, four projections** | One identity. Switching is free. Cross-view features are queries. |

The second is more work up front and it is the only version that satisfies AC-3.

## The projection interface

This is the contract. Everything else follows from it.

```ts
interface Projection {
  readonly id: string
  readonly name: string
  readonly supports: readonly ProjectionFeature[]

  /** Render a collection into canvas elements. */
  layout(
    collection: Collection,
    records: readonly Record[],
    context: LayoutContext,
  ): readonly ProjectionElement[]

  /** React to a record field change. Must be O(changed). */
  applyChange(
    previous: Record,
    next: Record,
    elements: readonly ProjectionElement[],
  ): readonly ProjectionElement[]

  /** Handle a user interaction on a projected element. */
  interpret(intent: ProjectionIntent): RecordMutation | null

  /** Own the ordering this projection uses. */
  order: ProjectionOrderStrategy
}
```

**Four properties that make this work:**

1. **`layout` is a pure function** of `(collection, records, viewport)`. It does not
   mutate anything. This is what makes a projection swappable and what makes a
   projection renderable at a different zoom without touching the data.

2. **`applyChange` is O(changed records), not O(all records).** A projection that
   re-lays-out the whole collection on every keystroke will fail AC-5. The
   `previous`/`next` pair is the incremental path.

3. **`interpret` returns a record mutation, not a document mutation.** Dragging a
   kanban card produces `{ set: { status: "Done" } }`. The projection never writes to
   the record directly — it requests a change, and `@firo/records` applies it. This
   is what makes the record the single source of truth.

4. **`order` is the projection's, not the record's.** A record ordered second in a
   table and second in a kanban is a coincidence. If the record store owned order,
   switching views would fight the user.

## The four projections

### Table (v1)

Editable grid. Column resize, reorder, sort, filter, group.

The hard part is not the grid — it is that **cell editing must not steal the canvas
keyboard shortcuts.** A focused cell owns its keys; the canvas does not see them.
`Cmd+A` in a cell selects cell text, not the board.

**Acceptance:** 10,000 rows scroll without dropping frames. Virtualised.

### Board / kanban (v1)

Columns from a single-select column, or manual column definitions when the
collection has no status column. Drag a card between columns → the record's field
updates → the table view reflects it with no reload.

This is the projection that carries AC-3, and it is the one to build first. If only
one projection ships, ship this one.

### Grid (v1)

One card per record, free-arranged, filterable. Weje's natural board, generalised to
typed data.

### Timeline (v2)

A Gantt-style view from a date column and an optional duration column. Deferred
because a fourth projection is only cheap once two work
([`../prd/02-scope.md`](../prd/02-scope.md)).

## Records on the canvas

A **card element** is a projection of a record. Three cases, all supported:

| Case | `recordId` | Behaviour |
| --- | --- | --- |
| Linked card | set | Editing the card edits the record. Appears in every view. |
| Free card | `null` | An ordinary element. No record. Does not appear in any view. |
| Detached card | was set, now `null` | The record survives; the card is now free-floating. |

The third case matters more than it looks: a team will absolutely move a card out of
the board to use it as a note, and it must not delete the task.

**One record, two cards.** Allowed. Two different projections on the same board may
render the same record. They stay in sync because both read the same record.

## Mind map over records

A mind map is a projection with a `parentId` relation. Nodes are records, so a task
is a node, a table row, and a kanban card simultaneously.

This is the clearest justification for the record layer: without it, a mind map is
another element type that cannot participate in anything else.

## Collections

A board holds collections. A collection has typed columns and records.

**Collections are board-scoped, not workspace-scoped, in v1.** Cross-board
references are a v3 feature and a substantial one, because they make a record's
identity non-local. Deferring it is what keeps the model simple enough to build
correctly.

**A column's `key` is stable; its `name` is not.** Values are keyed by `key`, so
deleting a column and recreating it with the same name does not resurrect old values.
This is the single most common data-loss bug in record stores, and it is prevented by
the data model rather than by a check ([`02-data-model.md`](02-data-model.md)).

**Values for deleted columns are retained.** Deleting a column hides it. Restoring
the column restores the data. This is a deliberate departure from the common
behaviour and it is the right one for a tool whose thesis is that you own your data.

## Relation columns

`linkToRecord` and `rollup` are v3. `linkToRecord` requires cross-collection
references, which requires deciding whether a linked record can be deleted, and that
decision is worth more thought than we have given it.

## What this section does not specify

Deliberately unspecified until Phase 6 starts:

- The exact projection element representation. It may be a dedicated element type
  with a `projectionId` and `recordId`, or a render-only construct. **Decide this by
  writing the kanban projection first** and seeing what it needs.
- Sorting and filtering semantics beyond a single sort key. Multi-level sort and
  filter composition is a rabbit hole.
- Whether a record can appear in more than one collection. It can, today, by
  duplication, and the merge story is undefined.

These are noted here so that Phase 6 starts by answering them rather than
discovering them.
