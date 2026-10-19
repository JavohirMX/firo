---
status: accepted
date: 2026-10-19
deciders: maintainer
---

# Draw the two context-menu lanes, add a submenu row, and bind `⌘ + Enter`

## Context and Problem Statement

Phase 11's deep pass rendered Miro's context menus item by item. The research is
[`miro-interactions.md`](../research/miro-interactions.md) §The two context-menu
lanes, rendered and §The two context-menu lanes **[bundle]**,
[`miro-geometry.md`](../research/miro-geometry.md) §Menus — three metric systems
and §The selection toolbar ("horizontal context menu"), and
[`miro-ui.md`](../research/miro-ui.md) §The keyboard, as observed; the deltas
are rows 12 and 13 of
[`miro-parity-matrix.md`](../research/miro-parity-matrix.md):

- **The empty-canvas lane (row 12).** Paste · Unlock all · Add text · Add
  sticky note · Add comment · Set start view · Set current view as start · a
  checkable group (Show grid, Show comments on board, Snap to grid, Snap
  objects, Show object size, Suggest object size) · Mouse or trackpad · Show
  all. Near the bottom edge the menu flips above the cursor; measured 293 ×
  544.
- **The object lane (row 13).** Sixteen items in groups, with separators after
  Delete, Clear content, Arrange, Create frame and Export to CSV: Copy · Copy
  link · Copy as image · Duplicate · Delete · Add comment · Copy style · Paste
  style · Clear content · Arrange ▸ · Link to · Lock · Create frame · Save as
  template · Export to CSV (Excel) · Info ▸. Painted shortcuts per item;
  measured 295 × 618, items 274 × 32 at 36 px pitch. The Arrange and Info
  submenus were not opened; the bundle supplies Info's item list (`infoItem`:
  content, copy, created, last modified, requested by, word count, and Miro
  AI).

The pass also confirmed the lane model around the menus: the floating
selection toolbar is the quick lane for a live selection (16 controls, measured
in [`miro-geometry.md`](../research/miro-geometry.md) §The selection toolbar),
and the right-click menu is the full lane, with two variants keyed by what the
pointer hits. Miro's keyboard map adds the missing trigger: `⌘ + Enter` opens an
object's context menu.

Firo has both surfaces but not the model:

- **The right-click menu** is the inherited Excalidraw component
  ([`ContextMenu.tsx`](../../packages/editor/components/ContextMenu.tsx)): a
  flat list of actions in a `Popover`, opened at the pointer by
  `openContextMenu` and split into a canvas and an element variant by hit
  test; right-clicking an unselected element selects it first. Rows already
  support a checkmark (`item.checked`), a danger style for delete, and painted
  shortcuts from the registry. The item lists
  ([`App.tsx`](../../packages/editor/components/App.tsx) `getContextMenuItems`)
  mix eras: the canvas menu carries view-mode and statistics toggles but no
  creation rows; the object menu carries frames, crop, the library and the
  linear editor but no duplicate, no comment and no info.
- **The floating lane** exists — `SelectionToolbar` in
  [`@firo/ui`](../../packages/ui/src/components/SelectionToolbar.tsx), six
  controls today. That is row 14, and C5 owns its content.
- **The menu has no structure beyond rows.** There is no submenu item kind;
  the menu has no roles (`ul` / `li` / `button`), no arrow-key walk and no
  menu-scoped Escape. The `Popover` only cycles `Tab` and closes on an outside
  `pointerdown`; with a selection, Escape clears the menu as a side effect of
  the deselect action, which also drops the selection, and with none it does
  nothing. The menu is also clamped into the viewport rather than flipped
  above the pointer.
- **`⌘ + Enter` is unbound at the shell.** Firo binds it only inside the
  sticky editor, where it adds the next sticky below
  ([`stickyNotes.test.tsx`](../../packages/editor/tests/stickyNotes.test.tsx)) —
  a text-editing path, not a shell key.

This is the key [ADR-0032](0032-shell-keyboard-model.md) deferred — "the object
context menu's key is C3's" — and the lane model is the ADR gate the matrix
named for C3. The clean-room guardrail holds throughout: labels and prose are
ours; the structure, the item set and the geometry are functional facts
([`miro-interactions.md`](../research/miro-interactions.md) §Clean-room
guardrail).

## Decision Drivers

- **One lane per job.** The quick lane belongs to a live selection; the full
  lane is a view over every command, reachable with the pointer and the
  keyboard. The division has to be written down once, or the two surfaces
  will drift into duplicates of each other.
- **The registry seam.** Menus are views over the action registry
  ([ADR-0022](0022-ui-package-owns-the-chrome.md)); the record adds item kinds,
  not a second command table.
- **No dead affordances.** Rows whose feature belongs to a later cluster wait
  for it ([ADR-0031](0031-rail-slot-kinds-and-the-phase-11-composition.md));
  the lane records who owns each waiting row.
- **Keyboard parity.** The object lane needs a key (0032 deferred it), and the
  open lane has to be walkable — arrows, submenus, Escape — for the shell to be
  usable without a pointer.
- **Metric honesty.** The product has three menu metric systems; the canvas
  lanes take the canvas one. C4 names the tokens; this record forbids a fourth
  system.
- **No regression.** Commands that live only in Firo's inherited menus keep a
  home.

## Considered Options

- **A. Adopt the lane model and reshape both variants.** Keep the inherited
  component's mechanics (predicates, checkmarks, painted shortcuts, pointer
  anchoring), add the item kinds and the keyboard model, and rebuild the two
  item lists to Miro's composition with Firo's extras carried at the tail.
- **B. Restyle only.** Keep the inherited item lists and apply the canvas
  metrics. Cheapest, but rows 12 and 13 would stay *partial*: the lane model
  remains unstated and the menus remain grab bags.
- **C. Flatten the object lane.** Adopt the item set but diverge on submenus,
  inlining Arrange and Info. Avoids a new item kind, at the cost of a menu
  whose length no longer reads in groups — and Miro's structure is the
  evidence the row records.

## Decision Outcome

**The lane model.** Two lanes, one division of labour:

- **The floating lane** — the quick lane. It appears with a live selection,
  carries a single row of controls, and its content belongs to C5 (row 14).
  This record fixes only the rule that the toolbar is never the only home of a
  command: everything it offers also exists in the right-click lane.
- **The right-click lane** — the full lane. It opens at the pointer, in two
  variants chosen by hit test: the canvas variant when nothing is hit and the
  pointer is outside the selection's common bounds, the object variant
  otherwise. Right-clicking an unselected element selects it first (existing
  behaviour). The platform `contextmenu` event covers touch; no custom
  gesture is added.

The variants keep their character: the canvas lane is creation, display and
navigation; the object lane is commands on the selection. Firo's existing
extras that have no Miro counterpart stay, grouped at the tail — they are not
parity rows.

**The canvas variant.** In this order, with separators between the groups:

| Miro row | This record | Firo's row |
| --- | --- | --- |
| Paste | adopt | `actionPaste` |
| Unlock all | adopt | `actionUnlockAllElements`, hidden when nothing is locked |
| Add text | adopt | creates an empty text element at the anchor and enters edit mode |
| Add sticky note | adopt | creates a sticky at the anchor, in edit mode (Miro lands in edit mode too) |
| Add comment | adopt | opens the pinned composer at the anchor |
| Set start view · Set current view as start | omit | no presentation surface exists; revisit with one |
| Show grid | adopt | toggle in the checkable group (`gridMode`) |
| Show comments on board | defer — C8 | comments visibility is the comment lane's |
| Snap to grid | omit | no grid snapping exists; snapping depth is untested (plan §11.3) |
| Snap objects | adopt | toggle in the group (`objectsSnapMode`) |
| Show object size | defer — C10 | the dimensions toggle is row 11's |
| Suggest object size | omit | no suggestion mechanic |
| Mouse or trackpad | omit | one motion model; no preference exists |
| Show all | adopt | `actionZoomToFit`, paints its own chord |

Firo's snapping toggles — arrow binding and midpoint snapping — join the
checkable group: Miro's group is where snapping lives. Zen mode, view mode and
statistics stay as a trailing group of extras.

**The object variant.** In this order, with separators between the groups:

| Miro row | This record | Firo's row |
| --- | --- | --- |
| Copy | adopt | `actionCopy`; cut and paste stay as extras in the same group |
| Copy link | adopt | `actionCopyElementLink`, whose payload is the host's link generator; C9 upgrades it to server-issued share links |
| Copy as image | adopt | `actionCopyAsPng`; SVG and text copies stay as extras |
| Duplicate | adopt | `actionDuplicateSelection` |
| Delete | adopt | `actionDeleteSelected`, danger row (exists) |
| Add comment | adapt | single-element selection only — a thread anchors to one element, the toolbar's rule |
| Copy style · Paste style | adopt | existing |
| Clear content | omit | no clearable-content command; editing clears text |
| Arrange ▸ | adopt | submenu: order (front, forward, backward, back), align (six), group and ungroup; distribute waits for an action |
| Link to | adopt | `actionLink`, printing `⌥⌘K` since 0032 |
| Lock | adopt | `actionToggleElementLock`, label follows state |
| Create frame | adopt | `actionWrapSelectionInFrame` (label stays ours) |
| Save as template | defer — C9 | row 56; lands with C9's template store |
| Export to CSV (Excel) | omit | document export is met (row 57) and lives in the export surface; there is no object-level CSV |
| Info ▸ | adopt | facts: Created (`element.created`), Last modified (`element.updated`), Word count; Copy content for text-bearing elements; omit requested-by (a facilitation concept — C7's if it lands) and the AI row (the AI entry point is the modal; no cloud meters) |

The Arrange and Info submenus were not opened in the pass. Info's list comes
from the bundle; Arrange's composition is ours, built from the actions Firo
has, and is recorded as ours rather than as observed. Firo's own rows keep
their home in the lane: frames' select/remove commands, crop, text fit and
binding, flip, the linear editor, add to library and select all.

**The structure.** One item type in `ContextMenu.tsx` with five kinds:

- **action** — label, painted shortcut, optional danger style;
- **checkable action** — the existing checkmark, exposed as a checkbox item;
- **submenu** — label, a chevron icon of ours, one level only;
- **fact** — a non-actionable label and value, used by Info alone;
- **separator** — the existing collapse rules (never leading, trailing or
  doubled).

The menu adopts `role="menu"` and `role="menuitem"` /
`role="menuitemcheckbox"`; submenu parents carry `aria-haspopup="menu"` and
`aria-expanded`. Groups are separators only — no headings, as in Miro.
Predicates hide rows at open and checkable rows reflect state at open, so the
menu never renders a state it did not read. Every row still resolves through
the action manager; the palette sees the same commands.

**Keyboard and focus.**

- **`⌘ + Enter` opens the object lane** — `Ctrl+Enter` off macOS — for the
  current selection, anchored at the selection's top-left corner in screen
  coordinates and flipped or clamped like the pointer path. With nothing
  selected it does nothing. While text is being edited the editor's own
  binding wins, so the sticky quick-add keeps working; the two uses are
  mode-scoped and do not collide.
- **On open, focus moves into the lane**, to its first actionable row.
  `ArrowDown`/`ArrowUp` walk rows, skipping separators and fact rows;
  `Home`/`End` jump to the ends; `ArrowRight` opens a submenu and
  `ArrowLeft` closes it; `Enter`/`Space` activate; `Escape` closes the
  submenu first, then the lane; `Tab` closes the lane and moves focus onward.
- **On close, focus returns to the board container** — the canvas for the
  pointer path, the same target `B` focuses for the keyboard path — unless a
  command opened a dialog, which takes focus.
- **Escape gains a menu rung.** It slots into 0032's ladder ahead of the
  deselect: with a lane open, the press closes the lane and keeps the
  selection. The inherited side effect — closing by deselecting — is retired.

**Placement.** The lane prefers below-right of the anchor. When it does not fit
below in the viewport it opens above the anchor; when it fits in neither
direction it clamps and scrolls, the `Popover`'s current fallback. This adopts
the observed flip (row 12) rather than the current clamp-only behaviour.

**Styling and metrics.** The canvas lanes take the canvas metric system: rows
32 px high at 36 px pitch, a separator costing ≈ 5 px between item starts,
items inset by ≈ 11 px, widths sized to content (Miro measured 293 / 295), menu
radius 8 and `ELEVATION.floating` by role. App menus keep 40 px items at 44 px
pitch (C10's) and the sidebar create menu keeps 48 px (C1's). ADR-0034 names
the tokens; this record fixes which system each surface uses and forbids a
fourth.

**What this record does not decide.** The floating lane's control set (row 14,
C5). Comments visibility (C8), object dimensions (C10), grid snapping (the
untested snapping pass) and any presentation surface. Save as template and the
share-link payload (C9). App-menu metrics (C10) and every token name (C4).
Whether Arrange grows distribute — that needs an action first.

## Consequences

- `ContextMenu.tsx` gains the item kinds, the roving keyboard model, the
  roles, and the flip-or-clamp placement; `getContextMenuItems` is rebuilt to
  the two compositions above, reusing existing actions.
- New small wiring: create-at-anchor for text, sticky and comment; word count
  and copy content for Info. No new registry.
- The shortcut map gains a `contextMenu` entry (`⌘ + Enter`); 0032's generated
  reference picks the row up through its completeness test, so the cheat-sheet
  and the menu cannot disagree.
- Deferred rows are named with owners and do not render until their cluster
  lands — no dead rows, no hidden affordances.
- C4 receives the canvas metric requirement; C8 and C10 the toggle rows; C9
  the two payload rows.
- The menu stays a view over the registry (ADR-0022's seam); hosts learn
  nothing new.

## Confirmation

- `packages/editor` tests: right-click on canvas and on an object render the
  two compositions in order, with predicates hiding rows; checkable rows
  toggle and paint their state; Arrange and Info open on hover and on
  `ArrowRight`, close on `ArrowLeft` and on `Escape`; `⌘ + Enter` opens the
  object lane for a selection and does nothing without one; Escape closes the
  lane and keeps the selection; near the bottom edge the lane renders above
  the anchor; Save as template and Export to CSV are absent.
- `apps/web` side-by-side (C3's verification pass, per the plan's
  §Verification): both lanes against the live captures, the flip, Info's
  facts, `⌘ + Enter`, and the overlap rule — duplicate, lock and comment
  appear in both lanes.
- C2's interaction: the reference lists `⌘ + Enter` once; the single-key gate
  leaves it alone (a chord).
- The `+` menu and the toolbar are untouched; row 14 remains C5's.

## Pros and Cons of the Options

- **The lane model.** Pro: the division is stated and testable, and the
  toolbar can grow under C5 without becoming the only home of a command. Con:
  the object lane keeps Firo extras, so it will not match Miro's sixteen rows
  exactly.
- **The submenu kind.** Pro: the platform pattern for Arrange and Info, one
  level deep, and the object lane stays readable in groups. Con: new focus
  management inside a `Popover` that today only cycles `Tab`.
- **`⌘ + Enter`.** Pro: Miro's key, no registry collision, and the reference
  gains it automatically. Con: one more chord in the map, and an in-editor
  binding shares the chord in a different mode.
- **Keeping the extras.** Pro: no command loses its home and no working
  surface shrinks. Con: the menus are longer than the parity target.

## More Information

- Matrix rows 12 and 13; the cluster map's C3
  ([`miro-parity-matrix.md`](../research/miro-parity-matrix.md)).
- Research: [`miro-interactions.md`](../research/miro-interactions.md) §The two
  context-menu lanes, §The two context-menu lanes, rendered, §Menus carry three
  metric systems; [`miro-geometry.md`](../research/miro-geometry.md) §Menus —
  three metric systems, §The selection toolbar ("horizontal context menu"),
  §Shadows and radii; [`miro-ui.md`](../research/miro-ui.md) §The keyboard, as
  observed.
- Plan: [`phase-11-miro-parity.md`](../plans/phase-11-miro-parity.md) §11.2 and
  §11.3 (the deep pass's item-by-item capture, and the open submenu render).
- The seam: [ADR-0022](0022-ui-package-owns-the-chrome.md). The rule that no
  affordance may be dead:
  [ADR-0031](0031-rail-slot-kinds-and-the-phase-11-composition.md). The
  deferred key and the Escape ladder:
  [ADR-0032](0032-shell-keyboard-model.md).
- Clean-room: the lane model, the item set and the metrics are functional
  facts; labels, prose and icons are ours
  ([`miro-interactions.md`](../research/miro-interactions.md) §Clean-room
  guardrail).
