---
status: accepted
date: 2026-10-15
deciders: maintainer
---

# The creation rail is a per-user arrangement, and Select/Hand is one control

## Context and Problem Statement

Firo's creation rail — the left-hand tool column in `apps/web` — was an array
literal. `RAIL_TOOL_ORDER` in `apps/web/App.tsx` listed thirteen ids and
`CreationRail` mapped them to buttons; the order was compiled in and the only way
to change it was to change the source. Every tool was always visible, and
`selection` and `hand` were rendered as two separate entries.

Miro's rail is not like that. Task 7.5.0's live inspection and the bundle scan
recorded the mechanics in
[`../research/miro-interactions.md`](../research/miro-interactions.md), and
[Miro's *Toolbars* article](https://help.miro.com/hc/en-us/articles/360017730553-Toolbars)
confirms them:

- the rail's context menu offers exactly two commands —
  `creationBar.contextMenu.pinApp` and `creationBar.contextMenu.unpinApp`;
- a tool is **reordered by dragging it**;
- the arrangement is saved **to the user's profile**, not to the board, and is
  **not available on touch devices**;
- **Select cannot be unpinned** — and in Miro *Select* and *Hand* are **one
  toggling control** (`V` / `H`), not two entries.

So three questions have to be answered before any code changes:

1. Where does the arrangement live, and does it belong in the document?
2. Where does the *rendering* of the arrangement live, given that
   [ADR-0022](0022-ui-package-owns-the-chrome.md) puts the chrome in `@firo/ui`
   and the tool registry in `@firo/editor`?
3. What happens to `Select` and `Hand`?

## Decision Drivers

- **`AGENTS.md` rule 1: ephemeral state never enters the Yjs document.** Rule 1
  names cursor, drag and hover, and its stated failure mode is update traffic
  that makes the document unusable. The rail arrangement is the same class of
  thing: it is a *view* of the tool set, not content. It must not be a document
  field, and it must not enter history.
- **`AGENTS.md` rule on persistence: `localStorage` versus IndexedDB.**
  [ADR-0005](0005-indexeddb-via-idb-keyval.md) rejected `localStorage` for the
  board on measurement — roughly 5–10 MB and synchronous. Those constraints are
  about payload size and main-thread cost on a hot path. A preference of a few
  dozen short strings has neither property, and the theme already lives in
  `localStorage` (`STORAGE_KEYS.LOCAL_STORAGE_THEME`).
- **ADR-0022 clause 4: `@firo/ui` owns no second copy of the tool set.** The
  rail's labels, shortcuts and icons come from the editor's `TOOLS` registry and
  `@firo/ui`'s glyph map. A customisable rail must not reintroduce a tool list in
  the UI package, and the *storage seam* must stay in `apps/web`, exactly as
  [ADR-0026](0026-board-home-and-its-index.md) put the board index in the host.
- **Reversibility.** An arrangement is only editable if editing is symmetric.
  Miro pairs Unpin with the Tools/Media/Integrations panel, which is where an
  unpinned tool can be found again. A rail you can only shorten is a rail a user
  can brick in one right-click.
- **Forward compatibility.** Tools get added. If the stored arrangement is the
  *visible* list, then a tool added by a later release is absent from every
  existing stored arrangement, and absence is indistinguishable from "the user
  unpinned it". The new tool would silently never appear.
- **Honesty about the input device.** Miro does not offer rail customisation on
  touch. The two gestures it uses are desktop gestures.

## Considered Options

### Where the arrangement lives

1. **A field in the Yjs document.** Rejected by `AGENTS.md` rule 1: it is not
   content, it would sync between collaborators who should each see their own
   rail, and it would enter undo history.
2. **A board property in the autosave store.** Rejected for the same reason at a
   smaller scale: it is per *board*, and the arrangement is per *user*. Opening a
   second board would silently reset the rail.
3. **A local preference in `localStorage`, read synchronously at mount.**
   **Chosen.** It is what the theme does; it costs no async round-trip, so the
   first paint is already the user's arrangement rather than a flash of the
   default one; and it is scoped to the installation, which is what "per user"
   means in v1 (`AGENTS.md`, "No AI in v1" is the same period — v1 is
   single-player).

### Where the arrangement's UI lives

1. **`CreationRail` owns the order and persists it.** Rejected: `@firo/ui` would
   then reach for browser storage, which is a host concern and would give the UI
   package a second opinion about where state lives.
2. **`CreationRail` renders an arrangement it is handed, and reports gestures
   upward.** **Chosen.** The rail gains `onReorder`, `onUnpin` and `onRestore`,
   plus a `hiddenTools` list to restore from. It renders; the host decides and
   persists. This keeps ADR-0022's seam intact and makes the arrangement logic
   pure and testable without a DOM.
3. **Put the pure arrangement logic in `@firo/ui`.** Rejected: the layout is
   `apps/web`'s data, and the module imports the host's `STORAGE_KEYS`. Keeping
   it in `apps/web/board/railLayout.ts` matches `chromeShortcuts.ts` and
   `storage.ts`.

### The stored shape

1. **Store the visible order only.** Rejected: this is the forward-compatibility
   failure above.
2. **Store the visible order *and* an explicit `unpinned` list.** **Chosen.** The
   visible list preserves order, the hidden list records intent, and any known
   tool that is in neither list is a tool this release added — appended to the
   visible end. "New" then means "visible", which is the only safe direction for
   a new tool to fail in.

### Select and Hand

1. **Keep two entries; make both unremovable.** Rejected: it diverges from Miro
   for no gain, and it leaves the rail with a redundant pair that cannot be
   reordered relative to each other.
2. **One pinned entry with a dynamic glyph that toggles on click.** **Chosen.**
   The entry's id is `selection` — the rail's stable key and the tool a click
   selects from any other tool — while its `activeOn` is `["selection", "hand"]`,
   so either mode lights it, and its glyph follows the active mode. Clicking it
   while it is *already* the pointer switches to the other half. `@firo/ui` gains
   one optional field (`activeOn`) rather than a second tool list; the toggle
   rule lives in the host, which is the only place that knows the live tool.

### How a drop is resolved

1. **HTML drag-and-drop, with the pinned entry fixed at index 0.** **Chosen.**
   It needs no dependency, it is the browser's own reorder gesture, it is
   testable with `fireEvent`, and it has a natural, documented limitation on
   touch — which matches Miro's own limitation rather than inventing a gesture
   Miro does not have.

## Decision Outcome

Chosen: **an arrangement** — `{ order, unpinned }` — held in `apps/web`, persisted
in `localStorage` under `STORAGE_KEYS.LOCAL_STORAGE_RAIL_LAYOUT`, normalised on
every read and every write so no input is trusted; **rendered** by `@firo/ui`'s
`CreationRail`, which reports `onReorder`, `onUnpin` and `onRestore` and never
persists; **edited** by dragging a tool and by right-clicking it to Unpin, with
the unpinned tools offered back through an "Unpinned tools" list; and with
**Select/Hand as one pinned entry** that cannot be dragged or unpinned.

Concretely:

- `apps/web/board/railLayout.ts` — `RAIL_TOOL_DEFAULTS` (the eleven arrangement
  tools, in default order), `RAIL_PINNED_TOOLS` (`selection`, `hand`),
   `normaliseRailLayout`, `readRailLayout`, `writeRailLayout`, `reorderRailTools`,
   `unpinRailTool`, `restoreRailTool`. All pure except the reader and writer.
- `RAIL_TOOL_ORDER` is deleted from `apps/web/App.tsx`; `RAIL_TOOL_DEFAULTS` is
   its replacement, and it lives beside the code that persists it.
- `CreationRail` gains `hiddenTools`, `onReorder`, `onUnpin` and `onRestore`, and
  `RailToolItem` gains `pinned` and `activeOn`.
- `hiddenTools` is why unpinning is not a one-way door.

Two consequences are worth stating plainly rather than leaving to be discovered:

- **Reorder and unpin are pointer gestures.** There is no touch equivalent, and
  none is provided, because HTML drag-and-drop has none and a long-press context
  menu is a different interaction. This mirrors Miro's own touch limitation.
- **The pin is a rail rule, not a permission.** `unpinRailTool` returns the
  layout untouched when handed `selection` or `hand`, and the rail does not offer
  a menu for a pinned entry. Two independent guards, so neither a UI regression
  nor a bad caller can remove the pointer.

## Consequences

- A board opens with the user's own rail, with no network and no document write.
  Nothing about the arrangement syncs, so two collaborators on one board are not
  fighting over it.
- `apps/web` gains one small pure module and one storage key; `@firo/ui` gains
  two optional props fields and no dependency on storage.
- **A new tool defaults to visible.** The cost is that a stored arrangement
  cannot express "hide this tool I have not seen yet", which is not a thing a
  user can want. The benefit is that shipping a tool never requires a migration
  of anyone's arrangement.
- **`normaliseRailLayout` is the only reader and the only writer path.** Unknown
  ids, duplicates, pinned ids and malformed JSON all degrade to the default
  arrangement instead of throwing. A corrupt preference cannot leave a board
  unusable.
- Revisit trigger: when v2 introduces accounts, "per user" stops meaning "this
  installation", and the arrangement has to move to (or be mirrored in) the
  profile. The `RailLayout` shape is the thing to keep; the storage key is not.

## Confirmation

- `apps/web/board/tests/railLayout.test.ts` pins the pure behaviour: the default
  arrangement, dropping unknown and duplicate ids, never storing the pinned
  pointer, showing a tool the stored layout has never heard of, keeping an
  explicitly hidden tool hidden, tolerating empty and unparsable storage, the
  storage round-trip, reorder, unpin, the pin refusal, restore, and restore's
  idempotence.
- `apps/web/tests/creationRail.test.tsx` pins the host contract end to end: one
  entry for Select/Hand and not two, the toggle in both directions, select (not
  toggle) from a third tool, no Unpin and no drag on the pointer, a reorder
  reaching `localStorage`, an unpin reaching `localStorage` and the tool coming
  back, and a stored arrangement being restored on the next mount.
- `packages/ui/tests/shell.test.tsx` pins the rail's own behaviour: the reorder
  callback's argument, that a drop on the pinned entry does not displace it, that
  Unpin is offered only for unpinned-eligible tools, that the hidden list restores,
  and that either half of the pointer lights the entry.

## Pros and Cons of the Options

### A document field for the arrangement

- Good: it would sync, so a collaborator's rail could follow them between devices.
- Bad: it is a view, not content, and `AGENTS.md` rule 1 forbids exactly this.
  It would also put a rail rearrangement in undo history.

### A board property

- Good: no new storage key.
- Bad: it is per board and the arrangement is per user, which is the failure the
  user would notice first — the rail resetting when they switch boards.

### `localStorage`, read synchronously

- Good: no flash of the default arrangement; no async seam; consistent with the
  theme; trivially testable.
- Bad: it does not follow the user to another device. Accepted for v1, where
  there is no account to follow them to.

### `@firo/ui` holds the order

- Good: fewer props, less wiring.
- Bad: it breaks ADR-0022's seam, gives the UI package a storage dependency, and
  makes the ordering logic untestable without rendering.

### Two rail entries for Select and Hand

- Good: no new field on `RailToolItem`, and it is what Firo did.
- Bad: diverges from Miro for no gain, and forces the unnatural choice of which
  one is unpinnable when Miro's answer is that there is only one control.

## More Information

- [`../research/miro-interactions.md`](../research/miro-interactions.md) — the
  rail's live composition, the two context-menu commands, the per-profile and
  touch limitations, and the reconciliation table this decision acts on.
- [`../plans/phase-7-5-miro-ui.md`](../plans/phase-7-5-miro-ui.md) §7.5.8 — the
  task's own checklist, including what is deliberately **not** in scope
  (collapsing the flat shape entries into a flyout, and Miro's `Templates` and
  `Stickers / Emoji / GIFs` entries; those change rail *composition*).
- [ADR-0022](0022-ui-package-owns-the-chrome.md) — the seam this preserves.
- [ADR-0026](0026-board-home-and-its-index.md) — the precedent that the host
  owns the storage seam behind a `@firo/ui` presentation component.
- [ADR-0005](0005-indexeddb-via-idb-keyval.md) — the `localStorage` rejection
  that this decision is explicitly *outside* of, and why.
