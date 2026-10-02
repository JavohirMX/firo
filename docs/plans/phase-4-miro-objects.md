# Phase 4 — Miro objects and nesting

**Goal:** the object vocabulary that makes Firo a Miro replacement rather than a
sketching tool.

## Exit criterion

- Sticky notes: colour, ProseMirror text, size presets, resize by content, font size,
  bulk creation with `Enter`
- Cards: title, body, metadata row, assignee, due date, status, and containment
- Frames: named, nestable, hideable, define PDF page order and presentation slides
- Sections: lighter grouping with no page or slide semantics
- Connectors between any two objects, with labels and three line styles
- **Arbitrary container nesting works to any depth** — AC-4 passes
- Every object type survives a save/load round trip

## Tasks

### 4.1 — Sticky notes

Excalidraw already has a `stickynote` element type (MIT). **Extend it** rather than
reinventing it. It already handles the layout problem — fitting text to a resized
note — in 29 KB of code that works.

Add: colour presets, font size, bulk creation, and ProseMirror text
([ADR-0004](../adr/0004-prosemirror-for-rich-text.md)).

### 4.2 — Cards

A card is a **container** and usually a **projection of a record**. Phase 4 ships the
card element and its containment; the record binding lands in Phase 6.

Title, optional body, optional metadata row, optional status pill. A card with no
`recordId` is an ordinary free-floating element, and that must work fully
([ADR-0003](../adr/0003-records-with-switchable-projections.md)).

### 4.3 — Frames and sections

> **Started early.** `frame` is in `@firo/schema` and in the fold, because the fold
> was skipping it: a frame drawn in the app reached the document as nothing at all, so
> a board could contain content that no file and no autosave ever mentioned. What the
> document holds is `ElementBase` and a nullable `name` — nesting is `frameId` on the
> inner frame and `containerId` for the general case, so no containment structure of
> its own was needed. What is left for this phase is everything a frame *does*:
> hideable, page order, presentation slides, and the sections that are lighter grouping
> with none of it.

**The distinction is load-bearing and must be clear in the UI:** frames structure
*output*; sections structure the *board*.

| | Frame | Section |
| --- | --- | --- |
| Named | Yes | Yes |
| Nestable | Yes | Yes |
| Defines PDF page order | Yes | No |
| Becomes a presentation slide | Yes | No |
| Hideable by the owner | Yes | No |
| Use for | "This is the retrospective" | "These are the parking lots" |

Nested frames must produce sane PDF page order. An object belongs to at most one
frame per nesting level — enforce it in the model, not in the UI.

### 4.4 — Connectors

Replace the arrow-only `boundElements` with a two-way `bindings` relation so that any
object can be an endpoint. Labels, three line styles, elbow routing.

Bind on drag from an object's connection handle, with a visible target indicator.

### 4.5 — Arbitrary nesting

The one nullable field — `containerId: string | null` — plus fractional-index ordering
within each container ([ADR-0007](../adr/0007-arbitrary-container-nesting.md)).

**What is a container:** `card`, `frame`, `section`, and any shape promoted to one.
**What is not:** `stickynote`. A sticky note that needs to hold others becomes a
`section` with a note's styling. Promotion is a type change and therefore a schema
migration.

**Deleting a container is a user choice, never a default** (AC-10): delete the
children, or re-parent them.

**The interaction detail that makes this feel good:** dropping a card into a list
should feel like putting a thing in a box, not like reparenting a DOM node. Auto-nest
on overlap, `Ctrl+G` to group explicitly, `Space` to collapse and expand.

### 4.6 — Shape library

Beyond the primitives: flowchart shapes and the common diagramming set. Users can
save their own to a library file (`.firolib`, following Excalidraw's `.excalidrawlib`
format for familiarity).

**Not in v1:** BPMN, AWS, and Visio shape packs. Miro gates these behind Business
and we do not need to replicate the gate; we may never build them
([`../competitive.md`](../competitive.md) §7).

### 4.7 — Accessibility

Phase 3's tree must now cover the new types. A screen-reader user must be able to
create a sticky note, type into it, format the text bold, resize it, group it into a
frame, and connect two notes — **from the keyboard alone**.

Test with VoiceOver and NVDA. Two of the three target ATs are free and this is the
phase where the overlay behaviour is most likely to break.

## Verification

- **AC-4**: three levels of nesting, collapse and expand, move-with-parent, undo and
  redo at every step, and no combination of container types producing an error
- Every element type round-trips through save/load
- Frame order drives PDF page order and presentation slide order
- A card whose `recordId` is set, placed inside a frame, survives frame deletion with
  "re-parent children"
- Composed transform for a child of a rotated, nested container matches a
  hand-computed value
- Keyboard: a full workshop on the keyboard alone, including rich text editing

## Risks

| Risk | Mitigation |
| --- | --- |
| Deep nesting breaks transform maths | Hand-computed test values; test depth 5+ explicitly |
| Nesting conflicts with the record store in Phase 6 | The rule is written down now: a record rendered inside a container is **not** owned by it |
| "Card as container" versus "card as record projection" is confusing | The distinction is documented in [`../trd/02-data-model.md`](../trd/02-data-model.md) and is rule 4 in [`../../AGENTS.md`](../../AGENTS.md) |
| Bulk shape library work expands indefinitely | Cap the v1 set; the library file format lets users add their own |
| Auto-nest on overlap is annoying | Make it toggleable, and make explicit grouping always available |
