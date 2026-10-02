# Phase 3 — Interaction

**Goal:** a canvas you can actually work on — tools, selection, transforms, binding,
undo, and full keyboard operation.

## Settled before the phase started

Two questions that were open are now answered by measurement. Both are recorded
here so they are not re-opened.

### A note's text does reach the document

This was carried as unverified for a long time, because the test for it
*emulated* the renderer — it hand-built a label with an `originalText` field rather
than going through what Excalidraw writes when a person types. Verified in the app
instead: draw a note, double-click it, type, read the document. Three note sizes,
including one small enough to wrap five times. In every case the document holds
exactly the string that was typed, with no hard line breaks baked in — which is the
specific corruption the fold's `originalText` comment warns about.

It did not work at first, and the cause was not what it looked like.

### Editing a note leaves two labels bound to one container

Double-clicking a note does not edit its bound label. It **tombstones the label and
creates a replacement bound to the same container**:

```
after draw:     note 3KqHnq + label XcLcXL          (live)
after dblclick: note 3KqHnq + label gbDe2B (live) + label XcLcXL (deleted)
```

So for as long as the note lives there are two labels pointing at it. The fold built
its label lookup with `set()`, which is last-write-wins, so which label supplied the
note's text depended on scene order. Measured both ways: on a note small enough to
wrap, the tombstone sorted last and overwrote the live one, and the document held an
empty string while the canvas showed the text. On a larger note the order came out
the other way and it worked. Intermittent, and really just ordering.

The fold now skips tombstoned labels. Two tests cover it, one per order, because the
bug *was* that the answer depended on order — a single test would have passed on
whichever side of the coin it landed.

**The editor behaviour is still worth a decision.** Tombstoning a label and creating
another for every edit is churn: a Yjs tombstone per keystroke-session, and a note
that accumulates dead labels over its life. It is also why this was hard to see —
the scene is correct, just noisier than it needs to be. Phase 3 should decide whether
double-click edits the existing bound label instead. Not urgent: it is correct today,
only wasteful.

## Exit criterion

- Every tool in the Miro/Excalidraw overlap set works: select, hand, rectangle, ellipse,
  diamond, triangle, arrow, line, draw, eraser, text, image, frame
- Selection: click, shift-click, marquee, select-all, across containers
- Resize with eight handles, rotate, flip, with correct bounds
- Arrow binding: bind on connect, track moves and resizes, unbind predictably
- Undo and redo across every operation, including group and nest
- **Every function is reachable by keyboard alone**, and the command palette
  (`Ctrl/Cmd+K`) gives full function access
- Screen reader announces element type, content, and position in group

## Tasks

### 3.1 — Pointer and keyboard state machine

One explicit state machine for input. Not event handlers scattered through
components — a state machine is the only way to make drag-then-click-then-escape
predictable, and predictability here is most of what "feels good" means.

States: idle, panning, marquee-selecting, creating, dragging, resizing, rotating,
linear-editing, text-editing, container-editing.

Pointer Events throughout, including pressure and tilt
([`pwacompat`](https://www.npmjs.com/package/pwacompat) is already a dependency).

**`touch-action: none`** on the canvas, or touch scrolling fights the canvas.

### 3.2 — Selection

- Click, shift-click to extend, marquee, `Ctrl/Cmd+A`
- Multi-select across container boundaries
- A marquee must be able to select a container's children without selecting the
  container, and vice versa. This is subtle and it is the difference between a board
  that feels solid and one that does not.

### 3.3 — Transforms

- Eight resize handles, rotation, flip
- Multi-element resize and rotate with correct bounds maths
- Shift for aspect-ratio lock, Alt for centre-anchored resize
- **Composed transforms for nested containers** ([ADR-0007](../adr/0007-arbitrary-container-nesting.md)):
  a child of a rotated, nested container needs a composed transform, not an offset.
  Touches bounds, hit testing and the culler.

### 3.4 — Arrow binding

Port Excalidraw's `binding.ts` (94 KB, MIT) and adapt it. It is the single largest
and most valuable file we inherit, and the hardest thing in a canvas editor to do
well.

Replace `boundElements` with a two-way `bindings` relation — a Miro board has
connectors that are not arrows
([`../trd/02-data-model.md`](../trd/02-data-model.md)).

**Edge cases that are not optional:**

- Binding during a resize must not oscillate.
- An arrow bound to a deleted element must be deleted or unbound predictably.
- A connector inside a container must bind to siblings, not escape the container.

### 3.5 — Undo and redo

`Y.UndoManager` with `captureTimeout` tuned per tool, not globally. A drag commits on
pointer-up and must be **one** undo step.

Undo is local and per-user; a collaborator's change is never in the stack.

**Test:** undo a group, undo a nest, undo a move of a nested container, and assert
the tree is correct at every step.

#### Settled: the editor's own undo already works, and the document is not in its path

The inherited editor's history was suspected broken and was, in fact, working the
whole time. Recorded here so the question does not get reopened.

Measured in the app, three shapes drawn, then undo/redo one step at a time:

```
start:      { document: 3, editor: 3 }
undo 1:     { document: 2, editor: 2 }
undo 2:     { document: 1, editor: 1 }
undo 3:     { document: 0, editor: 0 }
redo 1:     { document: 1, editor: 1 }
redo 2:     { document: 2, editor: 2 }
redo 3:     { document: 3, editor: 3 }
```

No errors. The recorded delta for a creation is a removal, and applying it flips
`isDeleted`.

**The trap.** Undo *tombstones*: it flips `isDeleted` and leaves the element in the
scene, so a restored shape has its identity and history back. Every element list
therefore has a **stable length across an undo**, and `.length` on one reports a
working undo as a no-op. Both counters used to check it had this shape —
`__firoBoard.read` in the browser and `h.elements` in tests — and both were
including tombstones. A correct undo looked exactly like a broken one for a long
stretch, and cost a wrong "fix" to the store's `EVENTUALLY` guard along the way
(that change was reverted: the guard was correct, and `EVENTUALLY` commits
genuinely produce nothing, so the "fix" was a no-op with a confident story on it).

Rules that follow, and are enforced by `packages/editor/tests/historyBasic.test.tsx`:

- **Count live elements, never all elements.** `h.elements` and
  `getSceneElementsIncludingDeleted()` include tombstones.
- **`__firoBoard.live()`** exists for browser checks, for this reason. Use it.
- The document tombstones the same way, by design, so a concurrent edit cannot
  resurrect a deleted element silently.
- The basic case was untested. `history.test.tsx` had fourteen tests, all corners —
  corrupted entries, empty deltas, redo-stack clearing, drag-and-drop and paste
  imports — and none for "draw, undo, gone". That gap is why a working undo could
  go unverified. The missing test is now the missing test.

One genuine quirk, not a bug: the first `Cmd+Z` after a click that deselected
restores the *selection highlight* and does not change the element count. That is a
real visible change, so history correctly stops there rather than eating two entries
in one press.

### 3.6 — Keyboard and command palette

Every function reachable by keyboard. This is a hard requirement
([AC-8](../prd/04-acceptance-criteria.md#ac-8--accessibility)) and the one most likely
to be quietly skipped.

| Key | Action |
| --- | --- |
| `Tab` / `Shift+Tab` | Move between elements |
| `Enter` | Edit or activate |
| `Escape` | Exit editing, deselect, close |
| `Delete` | Delete selection |
| Arrows | Nudge 1 px, `Shift` 10 px |
| `Ctrl/Cmd+A` | Select all |
| `Ctrl/Cmd+G` | Group into a container |
| `Ctrl/Cmd+K` | Command palette |
| `Ctrl/Cmd+Z` / `Shift+Z` | Undo / redo |
| `V T N S R O L D P E F` | Select tool |
| `?` | Shortcut reference |

**The command palette is the accessibility backstop.** Anything without a shortcut
goes in the palette, and the palette must be fully keyboard-navigable. If a feature
cannot be reached from the palette, it is not accessible.

**Single-key shortcuts must be individually disableable.** Voice-control and
screen-reader users need single keys to do other things. Follow Miro's pattern.

### 3.7 — Accessibility foundation

- Canvas gets `role="application"` and a label
- The accessibility tree: a parallel DOM tree mirroring the scene, **clipped and not
  hidden** — `display:none` and `visibility:hidden` both remove it from the
  accessibility tree
- `aria-posinset` / `aria-setsize` from element order, so a screen reader announces
  "4 of 12"
- Focus is never lost to `<body>` or to a removed element
- Every dialog and palette traps focus and restores it on close

### 3.8 — ProseMirror text overlay

Per [`../trd/05-rich-text.md`](../trd/05-rich-text.md). This is the riskiest
interaction in the project.

**The offset symptom to watch for:** an editor that is correct at 1:1 and subtly
offset at other zooms. It is easy to miss in casual testing and must therefore be an
explicit test at 0.1×, 0.5×, 1×, 1.5×, 3.7×, and 200% browser zoom.

**ProseMirror CSS must not be scaled by `transform: scale()`** — position and size
the overlay explicitly. Miro rejected CodeMirror for this reason.

**Never destroy an EditorView without committing or discarding.**

### 3.9 — Rename

Rename the internal `Excalidraw*` types to `Firo*`. Deferred from Phase 0
specifically so that the real work of Phases 1 and 2 is not buried in a 10,000-line
mechanical diff.

## Verification

- Every tool has a unit test and an interaction test
- Hit testing at 0.1×, 0.5×, 1×, 1.5×, 3.7×, with rotation, bounds-exceeding
  elements, and inside nested containers
- Undo/redo produces a correct tree at every step
- **AC-8**: a full workshop completed with the keyboard alone
- Text overlay alignment across the zoom matrix, asserted numerically on both the
  DOM element's screen rect and the canvas layout's screen rect
- Screen reader tested with VoiceOver and NVDA — not simulated

## Risks

| Risk | Mitigation |
| --- | --- |
| Text overlay alignment is subtly wrong at some zooms | Explicit numeric test matrix |
| Arrow binding oscillates during resize | Test specifically; it is the classic binding bug |
| Nested transform maths is wrong in an edge case | Hand-computed expected values in tests |
| Keyboard support gets skipped under schedule | It is an exit criterion, not a nice-to-have. It is also the wedge it is |
| Undo granularity is wrong per tool | Per-tool `captureTimeout`, tested per tool |
