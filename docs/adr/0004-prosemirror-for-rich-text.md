---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# Use ProseMirror for all rich text

## Context and Problem Statement

Miro's text widgets support bold, italic, links, and lists, inside cards, sticky
notes, table cells and documents. Firo needs the same, and needs it to merge cleanly
when two people edit the same card.

Excalidraw stores text as `text: string` with a `containerId` binding, renders it to
canvas, and edits it by mounting **CodeMirror 6** over the canvas for the duration of
the edit. The overlay pattern is good and we keep it. The string storage is the
problem:

- No inline formatting, so no mixed content and no lists.
- **Last-writer-wins on the whole string.** Two people typing in the same card, one
  of them loses their edit — the exact failure mode
  [ADR-0002](0002-yjs-as-concurrency-engine.md) exists to prevent.
- Miro caps text widgets at **6,000 characters**
  ([source](https://medium.com/miro-engineering/why-we-developed-a-code-block-widget-in-miro-f6c5ec23085c)),
  which is a consequence of the text-as-a-single-renderable-value model.

## Decision Drivers

- Structural merge on rich text, so concurrent editing does not lose work.
- Lists, links, and inline formatting, because Miro-class workflows need them in
  cards and table cells.
- Layout computed by a mature text engine, so we do not write one.
- Canvas rendering stays the default; the DOM editor appears only during editing.

## Considered Options

1. ProseMirror
2. Lexical
3. TipTap (ProseMirror plus a React layer)
4. Extend Excalidraw's CodeMirror text model
5. Structured styled runs in the element payload
6. Plain strings, formatted in v2

## Decision Outcome

Chosen option: **1 — ProseMirror**, bound to Yjs through `y-prosemirror`.

Every editable text surface stores a ProseMirror document. Rendering happens on
canvas from the computed layout; editing mounts a ProseMirror `EditorView` positioned
from that same layout, so the two are pixel-identical.

**Deliberate exceptions**, which are plain strings: frame names, connector labels,
and file paths. A frame name is a filename-like identifier where formatting is
meaningless, and a ProseMirror instance per frame is a real cost on a board with 200
of them.

**Two more, added later and enforced as exceptions.** A **sticky note** holds a short
label in a box — the same argument, and Excalidraw's own note stores a string. A
**free-standing text annotation** is stronger still: Excalidraw's text element has no
rich text at all, so a ProseMirror document could only ever hold a single text node and
the renderer would draw a plain string regardless. Both become migrations, not
breaking changes, if either gains formatting. See the Confirmation section for the test
that keeps the list at two.

## Consequences

- (+) Concurrent text edits merge structurally, via `y-prosemirror`. Two people
  editing one card both keep their text.
- (+) Lists, links, headings and code blocks become available everywhere, and they
  compose: a list inside a card inside a table cell.
- (+) Layout comes from a mature engine. We do not write a text layout algorithm,
  which is the decision that makes rich text affordable at this scale.
- (+) `y-prosemirror` is a first-party Yjs binding, so it is on the ecosystem path
  we already chose.
- (-) **The overlay alignment problem is genuinely hard.** The DOM editor must be
  positioned from the canvas layout accounting for scroll, zoom, and device pixel
  ratio simultaneously. A common failure is an editor that is correct at 1:1 and
  subtly offset at other zooms, which is easy to miss in casual testing and must
  therefore be an explicit test.
- (-) ProseMirror CSS must not be scaled by `transform: scale()`. Miro rejected
  CodeMirror for exactly this reason. The overlay must be positioned and sized
  explicitly.
- (-) A ProseMirror document is verbose JSON — a one-word bolded label is roughly 120
  bytes. A board of 10,000 records with text fields could produce a large CRDT
  document. **This must be measured in Phase 6**, not discovered in production.
- (-) Screen reader behaviour for a `contenteditable` overlay over a canvas element
  is the riskiest accessibility interaction in the project
  ([`../trd/09-accessibility.md`](../trd/09-accessibility.md)).
- (-) One editing session must be one undo step, not one per keystroke. Requires
  careful `Y.UndoManager` tuning.

## Confirmation

- **No text field in the schema is a string.** A test walks the schema and fails if
  any text-bearing field is typed `string`. This is rule 3 in
  [`../../AGENTS.md`](../../AGENTS.md) and it is the rule most likely to be violated
  by a well-meaning "temporary" simplification.

  **That test did not exist until the second exception did.** Two types hold `text` as
  a plain string — `stickynote`, argued in `packages/schema/src/types/stickynote.ts`,
  and `text`, the free-standing annotation, argued in `types/text.ts`. Both arguments
  are sound; the problem was that nothing was counting, so an exception with no gate is
  a precedent and a precedent with no gate is how a third arrives silently. The gate is
  [`packages/schema/tests/richText.test.ts`](../../packages/schema/tests/richText.test.ts),
  which walks `ELEMENT_TYPES` and fails on any text-bearing field that is a string
  unless the type is on an allow-list where every entry carries a stated reason.

  Writing it exposed why nobody had: **`ProseMirrorDoc` was `any`.** It was
  `ReturnType<ProseMirrorNode["toJSON"]>`, and ProseMirror types `toJSON()` as
  returning `any`. So the rule's central comparison resolved to both branches and
  accepted everything — the promised test could not have failed, for any input. The
  type is now written out structurally, and that immediately surfaced two contradictory
  intersections (`ProseMirrorDoc & string`) that `any` had been quietly absorbing. Both
  exceptions now declare `Omit<ElementBase, "text">`, which puts the exception in the
  type instead of leaving it to be inferred from an intersection that means nothing.

  The two deliberate exceptions above stand, and are now enforced as *two*.
- Overlay alignment is tested at 0.1×, 0.5×, 1×, 1.5×, 3.7×, and at 200% browser
  zoom.
- Concurrent-edit behaviour is tested: two simulated users editing one card, both
  edits survive.
- ProseMirror documents are measured in Phase 6 at 10,000 records. If a board exceeds
  100 MB, the record store's text strategy is revisited.

## Pros and Cons of the Options

### 2. Lexical

- (+) Excellent React integration and performance; Meta-authored.
- (-) Smaller ecosystem for CRDT collaboration. Lexical has collaboration support but
  it is not a `yjs`-native binding of the same maturity.
- (-) Younger than ProseMirror, with fewer years of production use.

### 3. TipTap

- (+) ProseMirror plus a well-designed React layer, extensions for most needs, and
  `Collaboration` and `CollaborationCursor` extensions already built.
- (+) Would reduce our own integration code considerably.
- (-) An abstraction layer between us and ProseMirror. The overlay lifecycle in
  [`../trd/05-rich-text.md`](../trd/05-rich-text.md) needs precise control, and TipTap
  is a layer we would be fighting rather than using.
- (-) Harder to reason about when something goes wrong in the positioning code.
- **Note:** Hyper8, a competing product, uses TipTap. That is a mild argument for it
  and not a decisive one.

### 4. Extend Excalidraw's CodeMirror model

- (+) Least disruption; the overlay pattern already exists in the fork.
- (+) CodeMirror is already a dependency.
- (-) **No structural merge.** The field is still a string, so
  [ADR-0002](0002-yjs-as-concurrency-engine.md) is violated for the richest object
  on the board.
- (-) No lists, no headings, no mixed content. Cards cannot contain a checklist.
- (-) CodeMirror is a code editor. ProseMirror is a document editor. Forcing cards
  and table cells into CodeMirror's model is a mismatch, not a saving.

### 5. Structured styled runs in the element payload

- (+) Full control, no dependency, no WASM.
- (+) Serialises compactly — cheaper than ProseMirror JSON.
- (-) **We would write the text layout engine ourselves**, which is the single most
  expensive thing on this list.
- (-) No structural merge unless we build it, which means building a CRDT for text
  from scratch.
- (-) Selection, IME, undo, and accessibility would all be ours. Years of work.

### 6. Plain strings, formatted in v2

- (+) Simplest possible v1.
- (-) **A migration of every text-bearing element**, including every record, every
  card, and every table cell, on a format we promise to keep readable for ten years.
- (-) The migration is the expensive part. Deferring the decision does not defer the
  cost.

## More Information

- [ProseMirror](https://prosemirror.net/) · [y-prosemirror](https://github.com/yjs/y-prosemirror)
- [`../trd/05-rich-text.md`](../trd/05-rich-text.md) — the full design
- [Miro's code block widget, and the 6,000-character limit](https://medium.com/miro-engineering/why-we-developed-a-code-block-widget-in-miro-f6c5ec23085c)
