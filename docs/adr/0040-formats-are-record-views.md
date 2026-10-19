---
status: accepted
date: 2026-10-19
deciders: maintainer
---

# Formats are record views, and the selection lane is content-first

## Context and Problem Statement

C5 is the objects-and-formats cluster: matrix rows 14, 20, 27, 28, 29, 31
and 32. The live pass measured the surfaces
([`miro-parity-matrix.md`](../research/miro-parity-matrix.md) §Objects,
styling and creation flows; [`miro-geometry.md`](../research/miro-geometry.md)
§The selection toolbar; [`miro-interactions.md`](../research/miro-interactions.md)
§The two context-menu lanes, rendered, §Rail flyouts, rendered, §Creating an
object):

- **The selection toolbar** is a 48-high floating lane, centred above the
  selection, with **16 controls** in the observed full state: Switch type ·
  Convert to · Font style (family) · font size ± · Font style · Alignment ·
  Insert link · Sticky note size · Fill color · Show author · Add tag · Add
  emoji · Comment · Lock · Miro AI · More. Icon cells are 40 × 40; the full
  lane also carries a 127 × 40 Convert cell, a 30 × 24 font stepper and a
  46 × 40 AI cell. Group gaps are ≈ 10–15, and the bar was 874 × 48 in the
  full observation. The pass captured only a sticky note; other object kinds
  and multi-select states were not exercised.
- **Sticky notes** have a **Sticky note size** control on the selection lane,
  labelled **M** in the captured state; the matrix records S / M / L. The
  flyout carries **Stack**, **Templates** and **Bulk mode** below a 2 × 8
  colour grid; a size row in the flyout was not observed. The exact preset
  dimensions, the Stack behaviour and the Bulk-mode behaviour were not
  exercised.
- **Cards** are a card element with fields, and a card can be dragged into a
  kanban. The card's field depth and its free/detached cases were not
  observed.
- **Mind maps** are an auto-layout map format. Only the palette entry was
  observed; the object body was not.
- **Tables and charts**: the table is a format; charts appear in the palette.
  Firo has table, board, grid and timeline projections, and charts are
  paste-driven bar, line and radar element groups.
- **Grid and snapping**: the empty-canvas lane showed **Show grid ✓**, **Snap
  to grid ☐**, **Snap objects ✓**, **Show object size ☐**, **Suggest object
  size ✓**. The Grid submenu offered None / Line / Dot and a separate **Snap
  to grid** checkbox. The size-hint behaviours were not exercised.
- **The styling surface**: Miro puts font, fill and alignment on the floating
  lane. Firo has a persistent Inspector built from the editor's own property
  controls ([`ADR-0025`](0025-the-host-reuses-the-editors-property-controls.md));
  the matrix records that as a deliberate divergence.

Firo's current state is smaller than the reference in every one of these
places. The selection toolbar has six items (comment, tags, duplicate, lock,
bring to front, delete) at 30 px cells. Sticky notes have one 250 px default
and are resizable; there are no presets, no bulk create and no stack. There is
no card element — records and their projections are the card vocabulary
([`ADR-0003`](0003-records-with-switchable-projections.md)). There is no
relation column and no mind-map projection. Charts are pasted element groups.
Grid visibility implies grid snapping, because `getEffectiveGridSize` reads
`gridModeEnabled`; there is no separate snap preference. The Inspector is the
full styling surface.

The question is not "how do we reproduce a 16-control lane". It is **which
format concepts are records, which are views over records, which are elements,
and where styling lives.** If that boundary is wrong, C5 adds five widgets that
each own a copy of the same data, and the record model stops being the reason
the formats agree.

## Decision Drivers

- **Rule 4: records are not elements.** A card, a mind-map node, a table row
  and a chart series are things a person sees; they are not positioned objects
  in the element store. A format that needs a new element type needs a reason
  stronger than "Miro has one".
- **Rule 1: ephemeral state never enters the Yjs document.** A chart type, an
  active projection, a bulk-mode toggle and a snap preference are view state.
  They stay out of the document, history and export unless they are content.
- **One identity, many views.** Editing a record in a table must be visible in
  its board card, mind map and chart with no sync step. That is
  [`ADR-0003`](0003-records-with-switchable-projections.md)'s reason to exist.
- **One styling implementation.** The Inspector already owns font, fill,
  stroke, opacity, alignment and layer order through
  [`ADR-0025`](0025-the-host-reuses-the-editors-property-controls.md). A
  second styling surface on the floating lane would drift the moment either
  side changed.
- **The measured geometry is a contract.**
  [`ADR-0034`](0034-the-measured-geometry-as-tokens.md) fixes the 48-high bar
  and 40 px cells; the current 30 px cells are the pre-C4 state, not a
  preference to preserve.
- **The clean-room guardrail.** Functional, structural and geometric parity
  only. The 16 control names are evidence about a surface; no icon, asset,
  font, colour value or measured colour token crosses over. The sticky sizes
  and the map/chart geometry below are Firo's own, not reconstructions of
  unobserved Miro numbers.
- **No dead controls.** A control ships with its target. A deferred row is
  absent and named in this record; it is not a disabled button that teaches a
  person the feature does not work.
- **Unobserved behaviour is not invented.** The reference's Stack, Bulk mode,
  card depth, mind-map body and chart behaviour were not exercised. Where this
  record defines a behaviour, it says that the behaviour is Firo's; where it
  cannot, it defers.
- **Durable content uses the document; view preferences do not.** Schema
  changes are versioned and fixtured; view state is browser-local and
  disposable.

## Considered Options

### The floating selection lane

1. **Copy the observed 16-control composition.** Put font, fill, alignment,
   sticky size, link, tags, comment, lock and More on the lane, and keep the
   Inspector as a second style surface.
2. **Make the lane content-and-selection, and keep styling in the Inspector.**
   The lane carries conversion, link, sticky size, tags, comment, lock,
   duplicate, front, delete and More; font, fill and alignment live in the
   Inspector.
3. **Keep the current six controls.** Add nothing; accept that the lane remains
   a selection utility rather than a format surface.

### Sticky formats

1. **One default size, resize by hand.** The current behaviour.
2. **S / M / L presets and bulk mode; no stack.** The flyout gains a size
   default and a keep-armed placement toggle; Stack is deferred.
3. **S / M / L, bulk mode and a stack container.** Add a durable stack object
   with its own order, count and flip behaviour.

### Cards

1. **A card element with `recordId`.** Implement the linked / free / detached
   card cases from TRD-06 as a new element type.
2. **Records and projections only.** A card is a view of a record; a free card
   is a sticky or text; there is no detached card state.
3. **A hybrid.** A card element for free cards, but records for linked cards.

### Mind maps

1. **A mind-map element with its own node tree.**
2. **A projection over records with a parent relation column.**
3. **Frames and arrows.** Build maps out of existing containers.

### Charts

1. **A fifth record projection with its own canvas element and persisted chart
   configuration.** The chart is a first-class object with a collection id,
   chart type and series configuration.
2. **A live chart view over records, plus an explicit snapshot output.** The
   chart is read-only; records are the source; a person may place a snapshot
   group on the canvas for export or presentation.
3. **A snapshot only.** The current paste path, generalized to a table action.
4. **Omit charts.** The table is enough.

### Grid and snapping

1. **Keep grid visibility and grid snapping tied together.**
2. **Separate them.** Visibility is a paint toggle; snap is an independent
   browser-local preference.
3. **No grid snapping.** Keep object and midpoint snapping only.

### The Inspector

1. **Keep the Inspector as the full styling surface.**
2. **Replace it with the floating lane's popovers.**
3. **Keep it and also duplicate font/fill/alignment on the lane.**

## Decision Outcome

The model this record settles:

| Surface | What it is | What is durable |
| --- | --- | --- |
| Sticky note | a canvas element | the element, its geometry and text |
| Card in a board, table or grid | a view of a record | the record; the card is not persisted |
| Mind map | a projection over records with a parent relation | the records and relation values; the layout is not persisted |
| Chart view | a read-only view over records | the records; the chart type is local view state |
| Chart placed on the canvas | an ordinary element group, an explicit snapshot | the group; it is derived, not linked |
| Selection lane | chrome | nothing; it is recomputed from the selection |
| Grid snap and chart type | browser-local view preferences | a local preference, not the document |

**"Projection" means the `@firo/records` contract:** `layout` describes
`ProjectionElement`s and `interpret` turns a gesture into a `RecordMutation`.
A **view** reads records and draws them without a mutation contract. A chart is
a view, not a `Projection` implementation; a mind map is a projection because
it has both a layout and a reparent mutation. A **format** is the user-facing
name for any of these.

### 1. The floating lane is content and selection, not styling

The reference's lane is styling-heavy: it puts font, fill and alignment on the
floating surface. Firo has a persistent Inspector that already owns those
properties. Copying the 16 controls would create a second style
surface and would move the colour picker, font controls and alignment out of
the one implementation that already owns them. The floating lane therefore
becomes the **quick content-and-selection lane**; the Inspector is the **full
styling lane**; the right-click object lane is the **complete command lane**
([`ADR-0033`](0033-the-two-context-menu-lanes.md)).

**The reconciliation.** Every observed control has a home, a deliberate move,
or a stated omission:

| Miro control | Firo home | Why |
| --- | --- | --- |
| Switch type | omitted | Firo has no form/widget type picker; shapes have Convert. |
| Convert to | **Convert** on the lane | The existing shape/line conversion popup; the only conversion target Firo has. |
| Font family | Inspector | One styling implementation; not duplicated on the lane. |
| Font size ± | Inspector | Same. |
| Font style | Inspector | Same. |
| Alignment | Inspector; Arrange in the object lane | The Inspector has the property fields; the lane has the align commands. |
| Insert link | **Link** on the lane | Single-element selection only, matching the existing hyperlink action. |
| Sticky note size | **Size** on the lane | A format preset, not free styling; sticky-only. |
| Fill color | Inspector | The colour picker's target resolution belongs in one place. |
| Show author | omitted | Firo elements have no author metadata; comments do. Adding an author field to elements is not a format decision. |
| Add tag | **Tag** on the lane | The existing tag popover. |
| Add emoji | omitted from C5 | The C6 picker inserts a text element ([`ADR-0036`](0036-media-scope-emoji-and-embed-frames.md)); Miro's control attaches an emoji to the object. A detached text is not the same thing. |
| Comment | **Comment** on the lane | Single-element selection only; a thread has one anchor. |
| Lock | **Lock** on the lane | The existing toggle, with the label and pressed state following the selection. |
| Miro AI | omitted | The AI assistant is its own modal; a selection-scoped AI action is not a format and the cloud-metered product is a non-goal. |
| More | **More** on the lane | Opens the full object lane at the trigger. |

Firo keeps three selection actions the reference puts in its object menu:
**Duplicate**, **Bring to front** and **Delete**. They are common enough that
removing them would make the quick lane slower without making it more
faithful. They remain in the complete lane as well.

**The lane's composition**, left to right, in groups:

| Group | Items |
| --- | --- |
| Object | Convert (when the selection has a conversion target), Link (single), Sticky size (all sticky notes) |
| Annotate | Tag, Comment (single) |
| Selection | Lock, Duplicate, Bring to front, Delete |
| More | More |

A control that does not apply is **absent**, not disabled. The only disabled
state is the inherited `disabled` flag for a genuinely unavailable action. The
bar's width is therefore content-driven; it is not the measured 874 and does
not reserve empty slots.

**Geometry.** The bar is `BAR.height` (48) high with `CONTROL.size` (40) cells,
inset by `SPACE.xs` (4), with `2` px within a group and `SPACE.md` (12)
between groups. It keeps `RADIUS.md` (8) and `ELEVATION.floating`; it is
centred on the selection and sits 10 px above it. The measured 874 px width
and ≈105 px offset at 70 % zoom are observations of the reference's
composition, not constants of Firo's. `@firo/ui` consumes the C4 tokens; the
current 30 px cells become 40 in the same change.

**The component contract.** `SelectionToolbar` takes groups instead of a flat
item list:

```ts
interface SelectionToolbarGroup {
  id: string;
  /** Announced as the group's accessible name. */
  label: string;
  items: readonly SelectionToolbarItem[];
}
```

- The outer element stays `role="toolbar"` with `aria-label="Selection
  actions"`. Each group is a `role="group"` with its label. The button labels
  remain the accessible names.
- The component remains deliberately dumb: it knows nothing about the scene,
  the selection or the actions. The host computes the anchor, the predicates
  and the handlers.
- Roving focus follows [`ADR-0032`](0032-shell-keyboard-model.md): the toolbar
  is one tab stop; Left/Right move across items and across groups; Home/End
  reach the ends; Tab leaves the toolbar. Groups do not add tab stops.
- Popovers are one at a time and anchor to their trigger, not the bar's centre.
  The tag editor and the size editor share the behaviour: Escape closes and
  returns focus to the trigger; an outside pointer closes it. The current tag
  popover's centre anchoring is replaced.
- `More` opens the object lane at the More button's rectangle. Until C3's lane
  is implemented, the host may open the existing object context menu; the
  control is never a dead end.

**The lane rule.** Anything on the floating lane also exists in the complete
object lane ([`ADR-0033`](0033-the-two-context-menu-lanes.md)). C5 adds
**Convert**, **Tags…** and **Sticky note size ▸** to that lane; **Link**,
**Comment**, **Lock**, **Duplicate**, **Delete** and the Arrange rows already
have homes. The floating lane is the shortcut, never the only route.

**The Inspector stays.** The toolbar carries no font family, font size, font
style, fill or alignment control. Those remain in
`SelectedShapeActions` through [`ADR-0025`](0025-the-host-reuses-the-editors-property-controls.md).
Row 32's "diverge — keep the Inspector" is confirmed; the toolbar still adapts
(row 14), but it adapts as a content lane rather than as a second style
surface.

### 2. Sticky notes get three presets and bulk mode, not Stack

Firo keeps the sticky note as an element. The presets are **geometry**, not a
new field:

| Preset | Side | Default use |
| --- | --- | --- |
| S | 180 | dense clusters, short prompts |
| M | 250 | the existing default; ordinary notes |
| L | 340 | headlines, long prompts |

The numbers are Firo's. The reference's exact preset dimensions were not
exercised; the names S / M / L are the functional vocabulary recorded by the
matrix, not a measurement claim. **M is exactly
`DEFAULT_STICKY_NOTE_SIZE`**, so the existing default does not move. A note
whose content cannot fit at a preset stays at the existing minimum size
(`STICKY_NOTE_MIN_SIZE`, 75) or at the size its text needs, and the size
control reports **Custom**. A preset sets `width`, `height` and the note's
base height together, so the existing auto-grow does not undo the preset; there
is no separate `stickySize` field, no migration, and one element mutation.

**Two surfaces, two jobs.**

- The **rail flyout** carries the observed rows: the C1 colour grid,
  **Templates** and **Bulk mode**. It does not gain a size row: the
  reference's flyout had none, and its **Sticky note size** control was on the
  selection lane. New notes are M (250) until a person changes them after
  creation; the creation default does not move.

**This corrects [`ADR-0031`](0031-rail-slot-kinds-and-the-phase-11-composition.md).**
ADR-0031 expected the sticky flyout's size presets, Stack and Bulk mode to join
the same flyout when C5 built them. The live pass puts the size control on the
selection lane and no size row in the flyout; Stack is deferred. This record
supersedes that sentence: Bulk mode joins the flyout, Templates comes from C9,
and size is a selection-lane control. The rest of ADR-0031's rail composition
stands.
- The **selection lane** edits the selected notes. Its `Size` control appears
  when every selected element is a `stickynote`; it shows `S`, `M` or `L` when
  the selection agrees, and a dash when it does not. Its popover applies one
  preset to every selected note in a single undoable mutation. It does **not**
  change the creation default; editing a note should not silently change what
  the next click creates.

**Bulk mode.** The flyout's **Bulk mode** is a toggle row, not a new tool
mode. It is a browser-local `stickyBulkMode` preference. When it is on and the
sticky tool is armed or active, the existing `activeTool.locked` flag is set,
so each canvas click places one note and the tool stays armed; Escape or
switching to the selection tool ends the placement, and the preference stays
on until it is toggled off. The existing Shift/double-click temporary lock is
unchanged. Bulk mode is a **keep-armed placement** preference: it is not a
multi-line text importer, it does not batch a whole session into one undo step,
and it does not turn the notes into a stack. The reference's button was
observed but its behaviour was not exercised; this is Firo's smallest useful
reading, stated as ours.

**Templates.** The flyout's **Templates** row opens the one C9 gallery
([`ADR-0038`](0038-templates-are-content.md)). There is no second template
store and no sticky-only gallery. The row is rendered only when the host has
the C9 gallery callback; until then it is absent rather than a broken
affordance.

**Stack is deferred.** The live pass observed a **Stack** button and nothing
about what it creates. A stack is a durable container with an order, a count
and a flip or reveal action; building one from a button label would invent both
the object and its persistence. Frames and groups already express spatial
containment; a stack is a different object. C5 does not render the row. The
matrix's row 20 clause reads, after this record, "S / M / L, Templates (C9),
Bulk mode; Stack deferred". Revisit it only when a live pass observes the
behaviour, or when a durable stack container is designed with its own schema.

The sticky note remains an element. There is no new element type, no schema
change, and no change to the note's text model.

### 3. Cards remain records; a board card shows fields

A **card is a view of a record**, not an element. The board, table, grid and
timeline are projections over the same collection; a record can appear in every
one of them without a copy or a sync step. This is
[`ADR-0003`](0003-records-with-switchable-projections.md)'s central claim and
rule 4 of [`AGENTS.md`](../../AGENTS.md).

TRD-06's card table is read as a description of **projection cards**, not as a
requirement for an element type:

| TRD-06 case | Firo's reading |
| --- | --- |
| Linked card | A record drawn in a board projection. Editing the card edits the record; every view sees the change. |
| Free card | Not adopted. A free object is a sticky note or a text element; it is not a record and does not appear in any projection. |
| Detached card | Not adopted. A record cannot be detached from its collection. Copying a card's text into an element produces text, not a detached record. |

This is a deliberate narrowing. It removes the "card element" from the model
rather than adding a second identity next to the record. The retained
behaviour — one record, two views, no reload — is what AC-3 actually asks for.

**The board card's content.** The board view currently shows a title only. C5
adds a small set of read-only field lines:

- The title uses the same **title column** as the table
  (`titleColumnKeyFor`), not a hardcoded `title` key.
- Up to **three** other populated columns, in column order, excluding the
  title and the board's grouping column, are shown as compact lines using
  `displayValue` with the collection/record context. Empty values are omitted.
- Three is Firo's choice. The reference's card field depth was not observed;
  this is not a claim about Miro's card configuration.
- The card remains draggable. The existing quick-move buttons remain the
  keyboard-accessible path between columns. Dragging a card into a column still
  writes the grouping field through a `RecordMutation`; nothing about the record
  model changes.
- Editing stays in the table. The card's fields are a display, not inline
  editors; the table is the full record editor and the map's relation picker
  is the full relation editor.

There is no **Convert to card** action. Converting an arbitrary selection into a
record would invent the collection, the columns and the field values; the
record store is not a dumping ground for canvas content. A person who wants an
unstructured card uses a sticky note.

No element schema change is needed. The card is still a `ProjectionElement` of
type `card` when a canvas renderer uses the projection; the board's DOM view
draws the same record with more fields.

### 4. Mind maps are a projection over a relation column

A mind map is a tree of records. The parent link is a **relation** column in
the same collection, not an element field and not a second store:

```ts
// ColumnType gains "relation".
type FieldValue =
  | { type: "relation"; value: string | null }   // a record id in this collection
  | ...;
```

**The schema change is additive, and still a version bump.** `COLUMN_TYPES`
gains `relation`; `FieldValue` gains the member; `FIELD_TYPE_FOR_COLUMN`
maps `relation` to `relation`. The loader's coercion checks that a relation
value is a string id or null; any other payload is repaired to null and logged,
so a malformed value cannot point a node at a number. The record schema moves
to **v3** with an identity migration and a v3 record fixture. The migration
does not move data — there is no relation to invent — but the bump is
load-bearing: an older build that does not know the column type would
otherwise load the board and drop the values on the next save.
`CURRENT_RECORD_VERSION` is the promise, and the fixture pins it. The element
schema does not change.

The relation is a **same-collection parent**, not the cross-collection
`linkToRecord` / `rollup` that TRD-06 defers to a later product phase. It does
not introduce record identity across collections or a delete-cascade question.

**Which column.** The mind map uses the **first `relation` column in column
order**, found rather than configured, for the same reason
`groupingColumnFor` finds the first single-select
(`packages/records/src/types.ts`). A collection with no relation column shows
an empty map with one action: **Add parent relation**. The action appends a
column with key `parent` (or the first free `parent-2`), name **Parent**, type
`relation`, through the existing `updateCollection` mutation. It is undoable
and does not rewrite existing records: every record is a root until a parent is
set.

**The projection.** `mindmapProjection` joins `PROJECTIONS` as `mindmap`. It
supports `edit` only: the map's drag gesture is a **reparent**, not free
placement. The layout is a tidy tree:

- `orderedRecords` defines sibling order. Roots are records with no parent, a
  parent that is not in the collection, or a parent that creates a cycle.
- Sibling gap 16, level gap 80, node 220 × 80. These are Firo's local
  projection constants, not chrome tokens: the map is content, and a second
  surface does not consume them.
- A node is a `ProjectionElement` of type `card`, carrying the title column's
  display value. An edge is a new `ProjectionElement` type `edge`, with
  `fromId` / `toId` naming the node ids; its `recordId` is the child record's
  id. The edge's `x/y/width/height` is its bounding box; the renderer draws the
  line between the node anchors. `ProjectionElement` is still a description,
  never persisted.
- `ProjectionIntent` gains
  `Readonly<{ kind: "reparent"; recordId: string; parentId: string | null }>`.
  `interpret` returns a `setField` mutation on the relation column, or `null`
  for a rejected gesture. It rejects self-parenting, a parent outside the
  collection, and a parent that is a descendant of the moved record. The same
  guard is used by the table's relation picker, so a cycle cannot be created
  through either surface.
- A cycle that already exists in a document is **broken at read time**: the
  first record in the cycle, by `record.order`, becomes a root and the closing
  edge is omitted. The layout does not rewrite the stored values. A cycle is a
  data state to survive, not a reason to throw.

**The view.** The collection switcher gains **Mind map**. The view renders the
projection's nodes and edges as DOM/SVG inside the projection body; it does not
create canvas elements. Double-clicking a node edits its title through the
existing `edit` intent when the title column is text; a collection without a
text title column edits in the table. Dragging a node onto another reparents
it; dropping on empty space makes it a root; a rejected drop leaves the tree
unchanged and announces the reason. Sibling order is not editable on the map
in C5; the table's `order` is the one order.

**The table is the accessible editor.** The relation column renders as a
record picker, not a text cell:

- It lists the collection's non-archived records by title, plus **None**,
  excluding the record itself and its descendants.
- It writes the parent record id, or `null`.
- A value naming a missing or archived record displays **Missing record** and
  is retained. The map treats that record as a root. Deleting a parent does not
  cascade; undo restores the tree because the value was never rewritten.
- The table picker is the keyboard path. The map's drag is a shortcut, never
  the only way to reparent.

`displayValue` gains an optional context
(`{ collection, records }`). For a relation it resolves the parent's title; a
dangling id is shown as **Missing record**, not silently as an empty cell.
Existing callers that pass no context remain type-correct; a relation rendered
without context falls back to the record id, and every view that renders a
relation (table, map, board card, chart labels) passes the context so the UI
never shows a raw id.

**The starter command.** An **Insert mind map** palette item creates a
collection with two columns — **Title** (text) and **Parent** (relation) — and
one root record titled **Central idea**. The command asks the projection layer
to open the new collection in the Mind map view. The view choice remains local,
like the other projection tabs; no `defaultProjection` field is added to the
collection schema.

**What the map is not.** It is not an element type; it has no geometry in the
element store, no `mindmap` element, and no free placement. It is not a
cross-collection graph, and it does not implement TRD-06's `linkToRecord` or
`rollup`. It is one tree per collection, with one parent per record.

### 5. Charts are live views, with an explicit snapshot

The plan's Formats row names charts alongside the table, kanban, timeline and
mind map as "projections over the record store"
([`phase-11-miro-parity.md`](../plans/phase-11-miro-parity.md) §Scope). The
right reading is **a view over the same records**, not a fifth store and not a
chart element that owns a copy of the numbers. In the plan's product
vocabulary it is a format projection; in the `@firo/records` vocabulary it is a
read-only view, because the contract's `layout` and `interpret` exist for
canvas geometry and record mutations and a chart has neither.

**The chart view.** The collection switcher gains **Chart**:

- It is read-only with respect to records. It has no `Projection`
  implementation and no `interpret`; the table is the editor.
- It builds a `Spreadsheet` from the ordered records on every document update:
  labels from the title column (the first text column; row numbers when there
  is no text column), series from every **number** column that has a value in
  every ordered record. An incomplete numeric column is skipped rather than
  filled with zero, because a zero is a claim about the data. If no series
  remains, the view shows an empty state naming the requirement.
- The chart type is local view state: bar, line or radar, filtered by the
  existing `isSpreadsheetValidForChartType`. The default is bar. The type is
  not persisted; a reload returns to bar. There is no per-chart series
  configuration, no filter and no aggregation in C5.
- The view reuses `renderSpreadsheet` and the existing SVG preview path
  (`PasteChartDialog`'s preview) rather than growing a second chart renderer.
  The colour seed is stable per collection, so a data edit does not reshuffle
  the series.
- The chart is chrome, not canvas content. The table remains the large-set
  path; the chart does not silently truncate a collection to a readable number
  of labels.

**The explicit snapshot.** A **Place on board (snapshot)** action in the chart
view renders the same `Spreadsheet` with the existing renderer and inserts it
as a normal element group near the collection. The button's label or tooltip
says **snapshot**, because that is what it is: a derived output that does not
follow later record edits. It is the canvas chart for presentation and export,
and it is only available in edit mode. It is not linked, has no collection id
stored on the elements, and can be deleted or restyled like any other group.

This resolves the snapshot-versus-live tension without pretending either is the
other:

- The **view** is live and never stale.
- The **placed chart** is an explicit output and visibly a snapshot.
- The **paste path** stays an import. Pasted tabular text has no collection to
  be a view of; `PasteChartDialog` still produces a static chart. The view and
  the dialog share the renderer, so there is one chart implementation.

No schema change is needed. No chart element type, chart config field or
collection `defaultProjection` is added.

### 6. Grid snapping is separate from grid visibility

`gridModeEnabled` currently does two jobs: it paints the grid and it makes
`getEffectiveGridSize` return `gridSize`, so every grid-snapping call is on
whenever the grid is visible. The reference separates them: **Show grid** was
checked while **Snap to grid** was unchecked. C5 separates them.

- `gridModeEnabled` remains the visibility and paint toggle.
- `snapToGridEnabled` is a new browser-local app-state preference, default
  **off**. It is not exported and not synced; it is a view preference like
  object snapping.
- `getEffectiveGridSize` becomes
  `snapToGridEnabled ? gridSize : null`. `isGridModeEnabled` remains the paint
  predicate. A new `isGridSnapEnabled` is used by the snapping path and by the
  Ctrl/Cmd temporary-bypass check. The same effective size governs pointer
  placement and keyboard steps; Ctrl/Cmd still suspends snapping.
- Showing the grid no longer turns snapping on. Hiding the grid no longer turns
  snapping off. A person can have a visible grid with no snap, or a hidden grid
  with snap.
- **Object snapping** (`objectsSnapModeEnabled`), midpoint snapping and the
  alignment guides are unchanged. Grid snapping quantizes the free coordinate;
  object snapping aligns to guides. They remain independent preferences.
- The **Snap to grid** action is registered here. The empty-canvas lane's
  checkable row is C3's to render; the View ▸ Grid submenu is C10's. Both point
  at the same action. This record **supersedes the "Snap to grid — omit" row of
  [`ADR-0033`](0033-the-two-context-menu-lanes.md)**: grid snapping now exists,
  so the row is adopted. `Suggest object size` stays omitted; there is no
  suggestion mechanic.

**Size hints stay C10.** ADR-0033 deferred **Show object size** to C10, and
that ownership stands. C5 does not add a transient size chip or a second
dimensions toggle. The matrix's row 31 size-hint clause is not lost: it lands
with the View menu's **Object dimensions** row, which is C10's. If C10 decides
on a transient chip, it reads the selection's common bounds; C5 does not
pre-empt that decision with a second UI.

The grid's **type** list (Firo's dots, lines, crosses and isometric; the
reference's None / Line / Dot) is C10's submenu. C5 does not change the type
set or add a new grid menu.

Defaults stay Firo's clean canvas: grid hidden, snap off, object snap off. The
reference had the grid visible and object snapping on. The surfaces are the
parity; the defaults are a feel decision recorded here rather than changed by
a format cluster.

### 7. The Inspector remains the one styling surface

C5 confirms row 32's divergence. The Inspector is the only full styling
surface: font family, font size, font style, fill, stroke, opacity, alignment
and layer order. The floating lane carries content and selection actions; the
object lane carries commands and copy/paste style. No new inspector sections
are added.

This is not a gap in the toolbar adaptation. It is the adaptation: the
reference puts styling on the floating lane; Firo puts the style controls in
the persistent Inspector and uses the floating lane for the actions that are
about the object's content and selection. The five style controls that Miro
puts on the lane are not duplicated, and there is no second colour picker or
font popover to drift.

The record formats follow the same split. Editing a card's fields is the
table's job; editing a mind-map relation is the table picker's or the map's
drag; choosing a chart type is local view state. None of those is styling, and
none of them belongs in the Inspector. A placed chart snapshot is ordinary
canvas content, so the Inspector styles its elements like any other group.

### 8. What this record does not decide

| Open item | Where it lands | Why it is not invented here |
| --- | --- | --- |
| Stack | C5 follow-up, only after a live behaviour pass or a designed stack container | Only the button label and size were observed; a stack needs a durable container model. |
| Card field depth and configuration | C5's three-line display is the v1; a card-field picker is future work | The reference's card depth was not exercised. |
| Mind-map free placement, sibling reorder, cross-collection links | Future projection work; `record.order` is the only order in C5 | The map is a tree, not a graph; cross-collection identity is the TRD's deferred `linkToRecord`. |
| Chart filters, aggregation and persisted chart configuration | Future chart-view work | A live view of complete numeric columns is enough to close the paste-only gap without inventing a chart document. |
| Exact sticky preset dimensions and the reference's Bulk-mode details | Revisit with a live pass; Firo's 180 / 250 / 340 and keep-armed reading stand until then | The dimensions and the bulk behaviour were not measured. |
| Show object size / object dimensions | C10, per ADR-0033 | The View menu owns the dimensions toggle; C5 does not add a second one. |
| Add emoji as an object attachment | C6/C7 follow-up if an object-reaction model is wanted | The C6 picker inserts text; the C7 reactions are ephemeral and not object-attached. |
| Object-snap and grid-visibility defaults | Recorded divergences; not changed by C5 | The surfaces exist; the default feel is not a format contract. |

## Consequences

- **Record schema v3.** `FieldValue` and `COLUMN_TYPES` gain `relation`;
  `CURRENT_RECORD_VERSION` becomes 3; the migration is identity and a v3 record
  fixture is committed with it. Older builds refuse a board with a relation
  column instead of loading it and dropping the values on save. The element
  schema stays at 4.
- **`@firo/records` grows a mind-map projection.** `ProjectionElement` gains
  `edge` and `fromId` / `toId`; `ProjectionIntent` gains `reparent`;
  `PROJECTIONS` gains `mindmap`; `displayValue` gains an optional
  collection/records context for relation titles. The existing projections and
  their layouts are otherwise unchanged.
- **`ProjectionView` gains Mind map and Chart.** The switcher grows two tabs;
  the map renders nodes/edges from the projection; the chart builds a
  `Spreadsheet` and renders it with the existing chart renderer. `Place on
  board (snapshot)` is the only new canvas write from the chart view.
- **`SelectionToolbar`'s API changes from `items` to `groups`.** There is one
  host and two existing tests; the host is rewritten in the same change. The
  40 px cells replace the 30 px cells, and the bar adopts the 48 px height.
  Roving focus follows ADR-0032.
- **Sticky notes gain one browser-local preference.** `stickyBulkMode` is app
  state, not document state; the new-note size stays the existing M (250), and
  the S / M / L presets are geometry only, applied to the selection. No schema
  field. Bulk mode reuses `activeTool.locked`.
- **Grid snapping gains one browser-local preference.** `snapToGridEnabled`
  is independent of `gridModeEnabled`; `getEffectiveGridSize` and the Ctrl/Cmd
  bypass change. The visible-grid-without-snap and hidden-grid-with-snap states
  become possible. The **Snap to grid** action lands; C3 renders the lane row
  and C10 the View submenu row.
- **Dependencies are stated, not hidden.** C1 renders the sticky flyout; C5
  adds its Bulk mode preference. C3 adds Convert, Tags and Sticky size to the
  object lane and renders the Snap to grid row; C9 supplies the Templates
  gallery; C10 owns the grid submenu and the object-dimensions toggle. A
  surface whose dependency is absent is not rendered.
- **The deliberate divergences are named.** Stack is deferred. Card fields are
  three, not configurable. Mind maps are trees, not graphs. Charts are a live
  view plus an explicit snapshot, not a persisted chart object. The floating
  lane has no font/fill/alignment controls; the Inspector owns them. Add emoji,
  Show author and Miro AI are absent. The grid and object-snap defaults stay
  Firo's.
- **The TRD needs one correction.** TRD-06's "Records on the canvas" table
  describes linked, free and detached card elements. The implementation has no
  card element; C5's implementation updates that paragraph to the projection
  reading above. The rest of TRD-06's projection contract is unchanged.
- **Performance and accessibility.** The map does not truncate; it is a view
  for a readable tree, while the table remains the large-set path. The table's
  relation picker is the keyboard path for every map edit. The chart's
  accessible name names the collection and chart type; the table remains the
  accessible data. The map's drag is not the only route.
- **Tests.** A v3 fixture loads a relation column and a two-level map; a
  dangling relation and a cycle are laid out without rewriting; a cycle cannot
  be created through either the map or the table; the chart view skips
  incomplete numeric columns and does not mutate records; the sticky presets
  are geometry-only and undoable; grid snap is independent of grid visibility;
  the toolbar's groups, roving focus and popover focus return are asserted;
  and no `card`, `mindmap` or `chart` element type exists.

## Confirmation

- [ ] The floating lane renders four groups in the order Object · Annotate ·
      Selection · More, at 48 px high with 40 px cells, 2 px within and 12 px
      between groups. It carries no font, fill or alignment controls.
- [ ] `SelectionToolbar` takes groups; the outer toolbar is one tab stop;
      Left/Right cross groups; Home/End reach the ends; Tab leaves. The tag and
      size popovers open one at a time, close on Escape and return focus.
- [ ] Convert, Link, Sticky size, Tag, Comment, Lock, Duplicate, Bring to
      front, Delete and More behave as specified. Inapplicable controls are
      absent. More opens the complete object lane.
- [ ] The object lane carries every floating-lane action, including Convert,
      Tags… and Sticky note size ▸; the floating lane is never the only route.
- [ ] Sticky S / M / L are 180 / 250 / 340; M equals the existing default; a
      preset writes width and height in one undoable mutation; content that
      cannot fit reports Custom at the minimum size.
- [ ] The rail flyout has the C1 colour grid, Templates (only when C9's
      gallery is available) and Bulk mode; it has no size row, and new notes
      are M (250) by default. Bulk mode keeps the sticky tool armed through
      repeated placements; Escape ends placement; the preference stays until
      toggled.
- [ ] Stack is not rendered and is recorded as deferred, not as a broken row.
- [ ] No card element exists. A board card shows the title column and up to
      three populated non-title, non-grouping fields; it remains draggable and
      the table remains the editor.
- [ ] `relation` is a column type and a field value; record schema v3 loads the
      fixture; an older build refuses the file; no element schema bump.
- [ ] The mind-map projection lays out roots, children and edges; a dangling
      parent becomes a root; an existing cycle is broken at read time; a
      reparent rejects self, descendant and foreign parents. The table's
      relation picker uses the same guard.
- [ ] The map tab adds a parent relation when asked, edits titles, drags to
      reparent, and is fully operable from the table. `Insert mind map` creates
      Title + Parent + one root and opens the map.
- [ ] The chart tab is live: it reads every ordered record, uses the title
      column for labels and complete number columns for series, skips incomplete
      series, and renders bar/line/radar with the existing renderer. It does not
      mutate records.
- [ ] `Place on board (snapshot)` inserts an ordinary group near the collection
      and is labelled as a snapshot. The paste path remains a static import;
      both use the same renderer.
- [ ] `snapToGridEnabled` is independent of `gridModeEnabled`; a visible grid
      with snap off and a hidden grid with snap on both work; Ctrl/Cmd suspends
      grid snapping; object, midpoint and alignment snapping are unchanged.
- [ ] The Snap to grid action exists and ADR-0033's "omit" row is superseded;
      Show object size remains C10's; Suggest object size remains omitted.
- [ ] The Inspector is still the only full styling surface; the floating lane
      has no duplicate style controls.
- [ ] The clean-room check passes: no Miro asset, icon, font, colour value or
      verbatim token is added; only functional names and geometry are used.

## Pros and Cons of the Options

### The floating lane

**A 16-control styling lane**

- (+) The composition is closest to the observed surface.
- (+) Font and fill are one click from the selection.
- (−) It duplicates the Inspector's colour and font controls, and the two
  surfaces drift.
- (−) It puts 16 controls above a sticky note, many of which do not apply to
  that object; the observed full bar is 874 px wide.
- (−) It contradicts ADR-0025's one styling implementation.

**A content-and-selection lane (chosen)**

- (+) One style implementation, one command lane and one quick lane; each has
  a clear job.
- (+) The bar is small, object-aware and usable at narrow viewports.
- (+) Every action still has a full home in the object lane.
- (−) Fill and font require a trip to the Inspector; that is the cost of one
  implementation.
- (−) The lane's composition is Firo's, not a control-for-control copy; the
  matrix row stays an adaptation rather than a met match.

**Keep six controls**

- (+) No API change, no host rewrite.
- (−) It leaves the lane without conversion, link, size or More, and C5's row
  14 remains a partial.

### Sticky formats

**One default size**

- (+) No new state, no new UI.
- (−) Every note is resized by hand; the reference's preset workflow is absent.

**Presets and bulk mode (chosen)**

- (+) The three common sizes are one click; the new-note default is the
  existing M.
- (+) Bulk placement is useful in workshops and costs one locked-tool
  preference.
- (+) No schema; the note stays an element.
- (−) The exact reference dimensions are unknown, so the sizes are ours.
- (−) Bulk mode is a keep-armed reading, not observed behaviour.

**Presets, bulk and Stack**

- (+) It would close every word in row 20.
- (−) It would invent a durable container from a button label, with order,
  count and flip semantics that were never observed.
- (−) Frames and groups already cover containment; a stack is a second object
  model for the same need.

### Cards

**A card element**

- (+) A free card can sit anywhere, and the linked/detached cases are explicit.
- (−) It gives a record a second identity and reintroduces the sync problem
  ADR-0003 exists to prevent.
- (−) It needs an element field, a migration and a deletion policy.

**Records and projections only (chosen)**

- (+) One record identity; every view is a reader.
- (+) No card element, no card migration, no detached state to reconcile.
- (+) A free card is honestly just a sticky or text.
- (−) A record cannot be dragged out of its collection as a free card; that is
  the deliberate loss.

**A hybrid**

- (+) Free cards and linked cards both exist.
- (−) The boundary between the two is exactly the ambiguity a person cannot
  see; the same-looking card behaves differently.

### Mind maps

**A mind-map element**

- (+) The map can have arbitrary free geometry and be moved as one object.
- (−) Nodes become elements, not records; they cannot be table rows or cards.
- (−) It adds a second tree model and a new element type.

**A relation projection (chosen)**

- (+) Nodes are records; the map, table, board and chart agree with no sync.
- (+) Reparenting is a record mutation and is undoable.
- (+) No element type; the element schema is untouched.
- (−) The layout is derived, so free placement and a hand-drawn branch are
  not available in C5.
- (−) Cross-collection links wait for the TRD's `linkToRecord`.

**Frames and arrows**

- (+) No new model.
- (−) It is a drawing, not a projection; a node cannot be a table row.

### Charts

**A fifth projection with a chart element and persisted config**

- (+) The chart is a first-class canvas object and can carry its own settings.
- (−) It needs a chart config schema, a collection id on an element, and a
  stale-or-live reconciliation; the chart becomes a second source.
- (−) It does not fit the existing `Projection` contract without a new chart
  layout vocabulary.

**A live view plus an explicit snapshot (chosen)**

- (+) The chart follows record edits; there is no stale hidden source.
- (+) The existing chart renderer is reused; no second chart implementation.
- (+) A placed snapshot gives the canvas object, export and presentation path
  without pretending it is live.
- (−) The live chart is a view, not a movable canvas object; the snapshot is
  the movable object.
- (−) The snapshot can go stale; the label says so.

**A snapshot only**

- (+) The smallest change from today.
- (−) Every chart is stale by construction; the record store is only an input
  at the moment of creation.
- (−) It does not satisfy the plan's Formats row.

**Omit charts**

- (+) No new surface.
- (−) The paste-only gap remains; a table with numbers has no chart path.

### Grid and snapping

**Keep them tied**

- (+) No new state; the current behaviour is familiar.
- (−) A visible grid always snaps, and hiding the grid is the only way to stop
  snapping; the reference has the two independent.

**Separate them (chosen)**

- (+) Matches the observed checkboxes and gives a clean alignment aid without
  forcing snapping.
- (+) The snap preference is local and does not touch the document or export.
- (−) Showing the grid no longer turns snapping on; that is a behaviour change
  for anyone who relied on the old coupling.

**No grid snapping**

- (+) Fewer snapping modes.
- (−) The reference has grid snapping and the matrix row is an adapt, not an
  omit.

### The Inspector

**Keep the Inspector (chosen)**

- (+) One implementation of colour, font, stroke and alignment; no drift.
- (+) The floating lane stays small and object-aware.
- (−) It diverges from the reference's styling-on-the-toolbar surface.

**Replace it with the floating lane**

- (+) The reference's composition.
- (−) It duplicates or moves a large, evolving editor surface; the floating
  lane is the wrong container for a persistent property editor.
- (−) It loses the Inspector's always-visible common values for multi-select.

**Keep both and duplicate styles**

- (+) Style is available in two places.
- (−) Two implementations of the same property; the first divergence is a
  support question with no correct answer.

## More Information

- Evidence: [`miro-parity-matrix.md`](../research/miro-parity-matrix.md) rows
  14, 20, 27–29, 31–32 and §Cluster map;
  [`miro-geometry.md`](../research/miro-geometry.md) §The selection toolbar
  ("horizontal context menu"), §Panels, dialogs and popovers;
  [`miro-interactions.md`](../research/miro-interactions.md) §The two
  context-menu lanes, rendered, §Rail flyouts, rendered, §Creating an object.
- Current code: `packages/records/src/` (`types.ts`, `board.ts`, `table.ts`,
  `grid.ts`, `timeline.ts`), `packages/schema/src/` (`types.ts`, `version.ts`,
  `migrate.ts`, `fixtures.ts`), `packages/common/src/constants.ts` (sticky
  sizes), `packages/editor/appState.ts` and `packages/editor/snapping.ts`
  (grid state), `packages/editor/charts/` (the one chart renderer),
  `packages/ui/src/components/SelectionToolbar.tsx`,
  `packages/ui/src/components/Inspector.tsx`, `apps/web/App.tsx`
  (`WebSelectionToolbar`), `apps/web/components/ProjectionView.tsx`,
  `apps/web/board/recordActions.ts`.
- Related ADRs: [`ADR-0003`](0003-records-with-switchable-projections.md)
  (records and projections), [`ADR-0021`](0021-miro-style-shell-and-clean-aesthetic.md)
  (the shell and clean default), [`ADR-0025`](0025-the-host-reuses-the-editors-property-controls.md)
  (the Inspector reuses the editor controls),
  [`ADR-0031`](0031-rail-slot-kinds-and-the-phase-11-composition.md) (the rail
  and its option flyouts; the sticky-flyout size and stack clause is
  superseded), [`ADR-0032`](0032-shell-keyboard-model.md) (roving focus and the
  Escape ladder), [`ADR-0033`](0033-the-two-context-menu-lanes.md) (the two
  lanes; the Snap to grid row is superseded),
  [`ADR-0034`](0034-the-measured-geometry-as-tokens.md) (the 48/40 contract),
  [`ADR-0036`](0036-media-scope-emoji-and-embed-frames.md) (emoji is text, not
  object reaction), [`ADR-0038`](0038-templates-are-content.md) (one template
  gallery).
- Plan: [`phase-11-miro-parity.md`](../plans/phase-11-miro-parity.md) §11.2
  C5 and §11.3; [`phase-6-records-and-projections.md`](../plans/phase-6-records-and-projections.md) for the
  projection contract this extends.
- TRD: [`06-records-and-projections.md`](../trd/06-records-and-projections.md)
  §Records on the canvas (the card paragraph is corrected by this record) and
  §Mind map over records; [`02-data-model.md`](../trd/02-data-model.md) for
  the version-and-fixture rule.
- Recon: Miro Business build `1.104717.0`, 19 October 2026, `1200 × 818` CSS.
  The selection toolbar was captured on a sticky note only; other object kinds
  and multi-select were not exercised. Cards, mind-map bodies and chart
  behaviours were not captured; the sticky Stack and Bulk-mode behaviours were
  not run. The raw captures stay out of the repository; no Miro asset, icon,
  font, colour value or content is copied.
