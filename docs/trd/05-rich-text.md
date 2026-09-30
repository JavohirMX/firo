# Rich text

## The decision

**Every editable text surface in Firo is a ProseMirror document.** Not a string, not
a markdown blob, not an array of styled runs
([`ADR-0004`](../adr/0004-prosemirror-for-rich-text.md)).

This is rule 3 in [`../../AGENTS.md`](../../AGENTS.md). The most likely violation is a
"temporary" refactor that flattens a text field to a string because the simple case
did not need formatting. It will be found in review, or it will be found in
production.

## What Excalidraw does, and why we replace it

Excalidraw's text is a plain `text: string` with a `containerId` binding, rendered to
canvas, and edited by mounting **CodeMirror 6** over the canvas for the duration of
the edit.

That is a good pattern and we keep the *architecture* — render to canvas, mount a DOM
editor on double-click, unmount on commit. We change the editor and the model:

| | Excalidraw | Firo |
| --- | --- | --- |
| Storage | `text: string` | ProseMirror `Node` (JSON) |
| Editor | CodeMirror 6 | ProseMirror |
| Formatting | None inline | Bold, italic, code, links, lists, headings |
| Mixed content | Not possible | **Yes** — a list inside a card inside a doc |
| CRDT merge | Whole string, LWW | **Per-node merge** via `y-prosemirror` |

The last row is why this decision is not about formatting. With Yjs, ProseMirror
gets proper structural merging through `y-prosemirror`. Two people typing in the same
card both keep their text. With a plain string, one of them loses their edit.

## The rendering model

The hard problem: canvas-rendered text with a DOM editor on top, and they must line
up exactly.

```
Idle                          Editing
─────                         ───────
ProseMirror node              ProseMirror node
      │                             │
      ▼                             ▼
getLayout()                   getLayout()
      │                             │
      ▼                             ▼
Canvas draw                    Canvas draw (frozen)
                                    +
                              ProseMirror DOM view
                              positioned by the same
                              layout, at device scale
```

**Both paths consume the same layout.** The DOM editor is not a second rendering of
the text — it is a second *view* of the identical computed layout, positioned from
it. This is what makes the overlay invisible to the user.

**Transform, carefully.** The overlay position is:

```
screen = (layoutPosition + sceneOffset) * zoom * devicePixelRatio
```

and it must account for scroll, zoom, and device pixel ratio simultaneously. Getting
this wrong produces an editor that is subtly offset at some zooms and correct at
1:1, which is the classic symptom and is easy to miss in casual testing. **Test at
0.1×, 0.5×, 1×, 1.5×, 3.7×, and with browser zoom at 200%.**

**ProseMirror CSS must not be scaled by `transform: scale()`.** Miro rejected
CodeMirror for exactly this reason
([source](https://medium.com/miro-engineering/why-we-developed-a-code-block-widget-in-miro-f6c5ec23085c)):
scaled text editors break under CSS transforms. We position and size the overlay
explicitly rather than scaling it.

## The overlay lifecycle

```
double-click / Enter on a text-bearing element
  │
  ├─ 1. Freeze the canvas render of this element
  ├─ 2. Create a detached ProseMirror EditorView
  ├─ 3. Bind it to a Yjs fragment via y-prosemirror
  ├─ 4. Position it from the computed layout
  ├─ 5. Focus, place the cursor, select-all if appropriate
  │
  ... user types ...
  │
  ├─ Escape          → discard if the doc is untouched, else commit
  ├─ click outside    → commit
  ├─ Ctrl/Cmd+Enter   → commit and exit
  └─ blur             → commit
  │
  ├─ 6. Commit the ProseMirror doc to Yjs (durable — see rule 1)
  ├─ 7. Unmount the EditorView
  ├─ 8. Recompute the layout and resume canvas rendering
```

**Committed edits are durable; the in-progress editor is not.** A keystroke inside
the overlay goes to the Yjs fragment, which is a document write. That is correct —
text is durable — but it means `Y.UndoManager` must be configured so that one editing
session is one undo step, not one per keystroke. Tune `captureTimeout` and use
explicit transaction boundaries at commit and at Escape.

**Never destroy an EditorView without committing or discarding.** A destroyed view
with uncommitted state is data loss.

## Text surfaces

| Surface | Model | Phase |
| --- | --- | --- |
| Standalone text element | ProseMirror | 3 |
| Sticky note body | ProseMirror | 4 |
| Card title and body | ProseMirror, two fragments | 4 |
| Frame name | Plain string | 4 — an exception, deliberately |
| Connector label | Plain string | 4 |
| Table cell | ProseMirror | 6 |
| Mind map node label | ProseMirror | 6 |
| Comment body | ProseMirror | v2 |
| Doc block | Full ProseMirror schema | v3 |

**Frame names and connector labels are plain strings on purpose.** A frame name is a
filename-like identifier; formatting it is meaningless and a ProseMirror instance
per frame is a real cost on a board with 200 frames. This is a deliberate exception,
not an oversight.

## Schema

A restricted schema. ProseMirror's full default schema is more than we need and its
serialisation is large.

```ts
marks:  bold, italic, code, link, textColor (v3)
nodes:  doc, paragraph, heading(1-3), bulletList, orderedList, listItem,
        blockquote, codeBlock, hardBreak, horizontalRule, text
```

**No tables inside a table cell** (v1). Nested tables are a rendering and editing
problem out of proportion to their value, and the record store already provides
tabular structure.

## Storage and size

A ProseMirror document is JSON, and JSON is verbose. A one-word bolded label is
roughly 120 bytes of `{"type":"text","marks":[{"type":"bold"}],"text":"word"}`.

**This matters for CRDT document size.** Mitigations:

1. **Store the ProseMirror doc as a Yjs fragment, not as a JSON string.** Two people
   editing the same card then merge structurally rather than last-writer-wins on a
   blob. This is the main one.
2. Do not store a ProseMirror document for surfaces that are plain strings
   (frame names, connector labels).
3. Compact the document on save, not on every keystroke.

If a board of 10,000 records with text fields produces a CRDT document over 100 MB,
that is a signal the record store needs a different text strategy. **Measure this in
Phase 6**, not in production.

## Rendering text on canvas

`getLayout()` returns a positioned tree; `@firo/render` draws it.

**Font loading must be complete before layout.** A fallback font produces different
metrics, which produces wrong wrapping, which produces a misaligned editor overlay
the moment the real font arrives. Fonts are local
([`../prd/05-non-functional-requirements.md`](../prd/05-non-functional-requirements.md)
NFR-6) and are loaded at application start, before the first board opens.

**Measurement is cached** per `(fontFamily, fontSize, fontWeight, text)` tuple.
Uncached `measureText` per layout node is the most common source of canvas text jank.

**Line breaking is ProseMirror's, not ours.** Do not write a text layout engine. That
is the single decision that makes rich text affordable at this scale.
