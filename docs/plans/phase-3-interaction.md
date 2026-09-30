# Phase 3 — Interaction

**Goal:** a canvas you can actually work on — tools, selection, transforms, binding,
undo, and full keyboard operation.

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
