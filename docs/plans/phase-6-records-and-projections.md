# Phase 6 — Records and projections

**Goal:** one record store, two working projections, and AC-3 passing.

**The largest architectural bet in the project** ([ADR-0003](../adr/0003-records-with-switchable-projections.md)). If it works, Firo is a different category of tool. If it is built badly, we have four half-working widgets instead of one working one.

**Two projections, not four.** The timeline waits for v2. Four half-built projections are worse than two good ones.

## Exit criterion

- Collections with typed columns; 10,000 records load and render within budget
- **Table projection:** virtualised, sortable, filterable, groupable, cell-editable
- **Board projection:** columns from a single-select column; drag between columns updates the record
- **AC-3 passes**: drag a card from "Doing" to "Done", switch to table, the Status cell reads "Done", with no reload and no manual sync step — and the same after a page reload and after an export/import cycle
- A `table` element contains **no row data** — only a collection id and projection configuration
- No `kanban` element type exists in the schema

## Start here: answer the open questions

Three questions are deliberately unspecified ([`../trd/06-records-and-projections.md`](../trd/06-records-and-projections.md#what-this-section-does-not-specify)). **Answer them by writing the board projection first and seeing what it needs.** Do not design them abstractly.

| Question | How it gets answered |
| --- | --- |
| Does a projected element have its own type, or is it render-only? | Build the board projection both ways at small scale and compare |
| Multi-level sort and filter? | Build single-level, then see what the UI actually asks for |
| Can a record live in two collections? | Notice when someone asks, and write down what happens today |

## Tasks

### 6.1 — Collections and columns

`Collection`, `Column`, `Record` per [`../trd/02-data-model.md`](../trd/02-data-model.md).

Column types for v1: short text, long text (ProseMirror), number, date, single select, multi select, checkbox, person, duration.

**Two decisions that look like over-engineering and are not:**

- **Values are keyed by `Column.key`, not `Column.id`.** Keys are stable across column deletion and re-creation; ids are not. This prevents the most common data-loss bug in a record store.
- **Values for deleted columns are retained.** Deleting a column hides it. Restoring the column restores the data. This is a deliberate departure from common behaviour and it is right for a tool whose thesis is that you own your data.

### 6.2 — The projection interface

**Implemented, with two members outstanding.** `Projection` in `packages/records/src/types.ts` has `id`, `name`, `supports`, `layout`, `interpret` and `group`; `applyChange` and `order` are not there yet, which is why property 2 below cannot be enforced by a call-count test and property 4 is a documented v1 compromise rather than a guarantee. Both projections read `record.order`, so reordering a kanban column also moves the table row — recorded in `src/ordering.ts` and `src/board.ts`.

The original shape:

```ts
interface Projection {
  readonly id: string;
  readonly name: string;
  layout(collection, records, context): readonly ProjectionElement[];
  applyChange(previous, next, elements): readonly ProjectionElement[];
  interpret(intent: ProjectionIntent): RecordMutation | null;
  order: ProjectionOrderStrategy;
}
```

Four properties, each of which will be violated by accident if it is not enforced:

1. **`layout` is pure.** No mutation, no side effects.
2. **`applyChange` is O(changed records), not O(all).** A projection that re-lays-out the whole collection on every keystroke fails the performance budget.
3. **`interpret` returns a mutation, it does not apply one.** The projection never writes to a record directly. This is what makes the record the single source of truth and it is what makes AC-3 true.
4. **`order` belongs to the projection, not the record.** A record ordered second in a table and second in a kanban is a coincidence.

**Enforce all four with tests.** A pure-function test for `layout`, a call-count test for `applyChange`, and a test that `interpret` mutates nothing.

### 6.3 — Table projection

Virtualised grid. Column resize, reorder, sort, filter, group.

**The hard part is not the grid.** It is that **cell editing must not steal the canvas keyboard shortcuts.** A focused cell owns its keys; the canvas does not see them. `Cmd+A` in a cell selects cell text, not the board.

This is the same class of bug as the ProseMirror overlay, and it is the most likely thing to be discovered by a user rather than by a test.

**Measure text cost here.** ProseMirror in 10,000 cells is a real measurement and layout cost. Cells must lay out lazily, on becoming visible.

### 6.4 — Board projection

Columns from a single-select column, or manual column definitions when the collection has no status column.

Drag a card between columns → the record's field updates → the table reflects it.

**This is the projection that carries AC-3. If only one ships, ship this one.**

### 6.5 — Cards on the canvas

Three cases, all supported ([`../trd/06-records-and-projections.md`](../trd/06-records-and-projections.md#records-on-the-canvas)):

| Case          | `recordId` | Behaviour                                       |
| ------------- | ---------- | ----------------------------------------------- |
| Linked card   | set        | Editing edits the record. Appears in every view |
| Free card     | `null`     | An ordinary element. No record                  |
| Detached card | cleared    | The record survives; the card is free-floating  |

The third case matters more than it looks: a team will move a card out of a board to use it as a note, and it must not delete the task.

One record may have two cards on one board, from two projections. Both stay in sync because both read the record.

### 6.6 — Grid projection

One card per record, free-arranged, filterable. Weje's natural board, generalised to typed data.

### 6.7 — Mind map

A projection with a `parentId` relation. Nodes are records, so a task is a node, a table row, and a kanban card simultaneously.

**This is the clearest justification for the whole record layer:** without it, a mind map is another element type that cannot participate in anything else.

### 6.8 — Performance

| Scenario                            | Budget                     |
| ----------------------------------- | -------------------------- |
| 10,000 records load into a table    | Under 2 s                  |
| Scroll a 10,000-row table           | 60 fps                     |
| Edit one cell                       | Under 50 ms input-to-paint |
| Drag a card between columns         | Under 16 ms                |
| Switch projection on 10,000 records | Under 500 ms               |

Encode these as tests. A regression should be red, not noticed.

### 6.9 — Measure the text cost

A ProseMirror document is verbose JSON — a one-word bolded label is roughly 120 bytes. A board of 10,000 records with text fields could produce a large CRDT document.

**Measure it here.** If a board exceeds 100 MB, the record store needs a different text strategy, and this is the phase to find out, not production.

## Verification

- **AC-3 passes in full.** A drag becomes a `RecordMutation`, the mutation becomes a document commit, and the other projection reads the new value from that same record — across reload, across export/import, and as one undo step. The canvas overlay renderer (`ProjectionView.tsx`), switchable Board, Table, and Grid views with zero reload, drag-and-drop card movement, and inline cell editing are implemented and verified in `apps/web/board/tests/projectionView.test.tsx` and `apps/web/board/tests/records.test.ts`.
- A `table` element contains no row data
- No `kanban` element type in the schema
- `layout` purity test; `applyChange` call-count test; `interpret` non-mutation test
- Column deletion then restoration restores values
- Recreating a deleted column with the same name does not resurrect old values
- All performance budgets above
- Board size after compaction, against the NFR-7 budget
- Keyboard: a table cell is fully editable without capturing canvas shortcuts

## Risks

| Risk | Mitigation |
| --- | --- |
| `applyChange` is O(all) and the budget is missed | Call-count test. Enforce from the first commit |
| Cell editing steals canvas shortcuts | Explicit test; the most likely user-discovered bug in this phase |
| ProseMirror in 10,000 cells is too slow | Lazy cell layout; measure in this phase, not later |
| A record rendered inside a container is deleted with it | The record is not a child. Test it explicitly |
| The projection interface is wrong and everything is built on it | Build the board projection first, at small scale, before committing to the interface |
| Scope expands to four projections | Timeline is v2. Two done beats four broken |
