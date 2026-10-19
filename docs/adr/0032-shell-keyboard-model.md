---
status: accepted
date: 2026-10-19
deciders: maintainer
---

# Bind `⌘K`, make the shell keyboard-navigable, generate the shortcut reference from the registries, and put single-key shortcuts behind one preference

## Context and Problem Statement

Phase 11's deep pass measured the shell's keyboard surface against Miro's. The
research is [`miro-ui.md`](../research/miro-ui.md) §The keyboard, as observed
and [`miro-interactions.md`](../research/miro-interactions.md) §Command palette,
§Command palette and the shortcuts modal and §Editing, navigation and modifiers;
the deltas are rows 8, 9 and 15 of
[`miro-parity-matrix.md`](../research/miro-parity-matrix.md):

- **The palette (row 8).** Miro's `⌘K` opens one searchable list of apps and
  actions with key chips. Firo's palette exists and is registry-driven but
  opens with `Ctrl/Cmd+/` and `Ctrl/Cmd+Shift+P`; `⌘K` belongs to the link
  action. Miro keeps add-or-edit-link on `⌥⌘K`, and Firo leaves that free.
- **The reference (row 9).** Miro's Help → Keyboard shortcuts renders a
  read-only cheat-sheet, 78 rows captured. Firo has the modal — the inherited
  Help dialog, opened by `?`, the Help menu and the palette — but its rows mix
  hardcoded keys with map lookups and Firo's later chords are absent. The
  Wave-0 pass recorded the row as *absent* and missed the modal; the row is
  corrected in place, and what remains missing is the generation.
- **The accessibility layer (row 15).** Miro ships skip links, a board
  overview, and a preference that turns single-character shortcuts off (Main
  menu → Accessibility). Firo has the tree, the overview and reduce-motion —
  no skip link, and no user-facing single-key switch; single-character
  shortcuts can only be switched off from host configuration, one action at a
  time.

This is the work [ADR-0030](0030-keyboard-parity-with-miro.md) deliberately
left out:

> Miro's shell is itself keyboard-navigable (Tab between toolbars, arrows
> within one, `B` to the board, Escape back) and offers an accessibility
> preference that turns single-character shortcuts off for screen-reader
> users. Firo has neither the roving-focus toolbar behaviour nor that
> preference.

and named as its own revisit trigger:

> if the roving-focus toolbar work lands, the chrome shortcuts should move
> behind the same registry so the single-character toggle can govern them too
> — the accessibility preference is the reason that work is worth doing.

The observed mechanics frame the decisions: the live rail's `[role=toolbar]`
carries a roving-focus listener (`rovingFocusGroup.onEntryFocus`); `⌘K` opens
the palette and `⌥⌘K` adds or edits an object's link; `B` focuses the board;
Escape "stops editing, quits, and returns to the toolbars"; and the
single-character switch lives under Accessibility. Firo's board tree already
implements the roving pattern the toolbars are owed
([`AccessibilityTree.tsx`](../../packages/ui/src/components/AccessibilityTree.tsx))
— one tab stop, moved by roving `tabindex`.

## Decision Drivers

- **Miro-first on collisions** ([ADR-0030](0030-keyboard-parity-with-miro.md)).
  `⌘K` and `B` are both collisions, so both take Miro's meaning.
- **One registry per owner.** The editor owns canvas keys, the host owns
  chrome keys ([`chromeShortcuts.ts`](../../apps/web/board/chromeShortcuts.ts)),
  and `@firo/editor` never learns about host components
  ([ADR-0022](0022-ui-package-owns-the-chrome.md)). The gate is one preference
  every owner consults, not a merged table.
- **One list per surface.** A palette row, a menu row, a reference row and
  the key are one command ([ADR-0030](0030-keyboard-parity-with-miro.md),
  [ADR-0031](0031-rail-slot-kinds-and-the-phase-11-composition.md)). The
  shortcut reference is generated, not transcribed.
- **AC-8 must still hold.** A full workshop runs on the keyboard alone
  ([`trd/09-accessibility.md`](../trd/09-accessibility.md)). A key set a
  screen-reader user cannot silence fails the criterion.
- **A text field is not a canvas.** `isWritableElement` already guards every
  surface; nothing here weakens it.
- **No dead affordances.** A menu row, a skip link or a key ships with its
  target.

## Considered Options

### The palette chord and the link it displaces

1. **Leave the palette where it is; do not take `⌘K`.** Rejected: the key is
   row 8's whole finding, and Miro's map gives link a key of its own.
2. **`⌘K` opens the palette; the link moves to `⌥⌘K`; the two inherited chords
   stay as extras.** **Chosen.** Every key lands on Miro's map (`⌘K` palette,
   `⌥⌘K` link — Miro's own link chord), and nothing is taken from Firo users.
3. **`⌘K` opens the palette; the inherited chords retire.** Rejected:
   removing working muscle memory buys nothing; the first-chord rule makes
   every surface advertise `⌘K` anyway.

### The shortcut reference

1. **Keep the hand-written dialog.** Rejected: it is the second list ADR-0030
   exists to prevent, and C1's and this record's changes would make it lie
   within one wave.
2. **Generated rows, curated sections, composed like the palette.** **Chosen.**
   `shortcutMap` and `TOOLS` already carry label, chords and letters; the host
   already injects rows through `customCommandPaletteItems`; the reference
   uses the same seam and a completeness test keeps it honest.
3. **No modal; the palette is the only discovery surface.** Rejected: the
   reference is a teaching surface a workshop leans on; Miro ships both.

### The keyboard model

1. **Roving toolbars, `B` to the board, Escape back, bucket fill moves to
   `Shift+B`.** **Chosen.** One idiom with the tree, and the colliding keys
   take Miro's meaning.
2. **Leave bare `B` to bucket fill; bind no board-focus key.** Rejected:
   Miro-first — and bucket fill's interaction is pointer-shaped (it fills
   what the cursor is over) while board focus is the keyboard-only run's way
   home.
3. **Rove the rail only.** Rejected: Miro's model is toolbars, plural — "Tab
   between toolbars, arrows within one" — and two idioms for two toolbars is
   what this wave exists to remove.

### The single-key preference

1. **One stored preference, one gate, three owners.** **Chosen.** The user
   surface row 15 requires, without merging registries the seam keeps apart.
2. **Per-action switches only (today's state).** Rejected as the only
   mechanism: capability without a surface; a screen-reader user cannot reach
   host configuration.
3. **Skip the preference.** Rejected: ADR-0030 named it the reason this work
   is worth doing.

## Decision Outcome

**The palette.** `shortcutMap.commandPalette` becomes
`[CtrlOrCmd+K, CtrlOrCmd+/, CtrlOrCmd+Shift+P]` — `⌘K` first, so every surface
that prints one chord prints `⌘K` (`getShortcutFromShortcutName` takes the
first). The link chord moves from `⌘K` to `⌥⌘K` everywhere it exists: the
registry line, the action's `keyTest` and the panel title that prints it. The
two inherited palette chords stay, recorded as extras.

**The reference.** The Help dialog stays the component and stays read-only;
its surfaces are labelled *Keyboard shortcuts* (`?`, the Help menu row and the
palette row already open it). Its keyed rows are generated from the registries:

- one row per bound command in `shortcutMap` — label from the command, chords
  printed in full (the reference lists all of a command's chords; menus and
  tooltips keep printing the first);
- one row per tool in `TOOLS` — label, letter via `getToolLetter`, numeric key;
- the host's chrome keys arrive through a prop in the
  `customCommandPaletteItems` shape — the editor never learns the host's
  tables, and the host never learns the editor's.

Prose rows — click sequences such as the curved arrow — stay hand-written;
they name gestures the registries do not model. A completeness test asserts
every bound command and every tool appears exactly once, so a new binding
without a row fails CI. The dialog's Firefox branch retires with the
hand-written islands.

**The keyboard model.**

- `CreationRail` and `NavToolbar` each become one tab stop with roving
  `tabindex`, the pattern the board tree already implements: the focused
  control is the stop; the rail starts on the active tool's entry, the nav
  toolbar on its first control. `ArrowUp`/`ArrowDown` move within the rail
  (which gains `aria-orientation="vertical"`), `ArrowLeft`/`ArrowRight` within
  the nav toolbar, `Home`/`End` jump to the ends; `Tab`/`Shift+Tab` leave for
  the next region. Every control in render order participates — slot buttons,
  their option chevrons, `+`, undo and redo.
- **`B` focuses the board.** Plain `B`, no modifiers, never while typing:
  focus moves to the board contents tree at its current entry. The bucket
  fill keeps its tool and moves its letter to `Shift+B` — the `TOOLS` entry
  gains `shiftKey`, and tooltips, chips and the reference follow through
  `getToolLetter`. This moves the `B` extra ADR-0030 recorded to Miro's
  meaning.
- **`Escape` returns to the rail.** The press's existing cancellations run in
  their order (close the dialog, stop editing, cancel, deselect); when the
  press lands with no dialog open and focus in the board content region — the
  tree or the canvas, not a text editor — it ends with focus on the rail, at
  the active tool's entry: Miro's "stops editing, quits, and returns to the
  toolbars".
- **The skip link.** The shell's first focusable element is *Skip to board
  content*, invisible until focused, moving focus to the same target as `B`.
  Miro's accessibility layer offers a skip link, an overview and a help
  entry; Firo's tree is the overview, so one link covers the first two, and
  the help entry waits for a help surface — the shortcut reference is not
  one.

**The single-key preference.** *Prevent single-key shortcuts* — a checkable
main menu item in a new *Accessibility* group beside Settings & Appearance
(Miro's grouping), and a palette row naming the state it will produce (the
pattern the Reduce motion row set). Stored locally — `STORAGE_KEYS` gains
`LOCAL_STORAGE_SINGLE_KEY_SHORTCUTS`, per-user like the rail layout, not
per-session like reduce-motion — and mirrored into the editor as one prop,
`singleKeyShortcutsEnabled`, default true. When it is off, an event with no
Ctrl/Cmd and no Alt whose key is a single letter or digit is not dispatched to
the tool finder or to action `keyTest`s; the host's own listeners (`M`, `B`)
consult the same preference. Chords, punctuation (`?`), navigation keys (Tab,
the arrows, Enter, Escape, Space, Delete) and the palette are untouched.
Shift is not a rescue clause for a single character: the shifted letter
bindings go quiet with the rest, because the point is that one keystroke
cannot act on the canvas. The per-action host switches stay for finer
control.

This answers ADR-0030's revisit trigger: the registries stay per-owner; what
the canvas keys and the chrome keys share is the gate.

**What this record does not decide.** The board overview's key stays unbound —
the research records an unresolved observation, and the tree is reachable by
skip link, `B` and Tab. The object context menu's key is C3's. Keys for tools
that do not exist yet — C1's pen modes and stencils — land with C1's
enumeration, under this record's rules: one `TOOLS` table, and every tool's
key either in it or nowhere.

## Consequences

- `⌘K` and `⌥⌘K` land where Miro's map has them; the palette's two inherited
  chords remain; the link's new chord is one modifier from its old one.
- The reference stops being a transcription job: a binding cannot be added,
  removed or moved without the test noticing, so the surfaces cannot disagree
  about a key.
- `@firo/ui` gains roving focus on `CreationRail` and `NavToolbar`, on the
  tree's existing template — one keyboard idiom, not two.
- `apps/web` gains the Accessibility menu group, the palette row, the storage
  key, the skip link, the `B` predicate beside `M`'s, and Escape's focus
  move; the chrome registry grows from one key to two and stays one registry.
- `@firo/editor` gains one prop and one gate consult ahead of the
  single-character path; it learns nothing about the host.
- Divergences recorded rather than fixed: the palette's extra chords; the
  overview key unbound; the numeric keys stay type-based (ADR-0030's standing
  divergence).
- Existing profiles behave as today with the preference on — which is the
  default.

## Confirmation

- `packages/editor` tests: `getShortcutFromShortcutName("commandPalette")`
  returns `⌘K`; `⌘K` opens the palette while `⌥⌘K` edits links; the reference
  renders one row for every bound `shortcutMap` entry and every `TOOLS` entry,
  and a moved chord's row follows the map; with the gate off, `R`, `1`,
  `Shift+X` and `Q` do nothing while `⌘K`, `?`, `Ctrl/Cmd+Z` and `Escape`
  still act.
- `apps/web` tests: the preference round-trips through storage; the menu item
  and the palette row flip it; `B` focuses the tree and `M`/`B` fall silent
  under the gate; Escape from the tree returns focus to the rail; the skip
  link is first in tab order and moves focus to the tree; the rail exposes its
  active entry for the focus move.
- `packages/ui` tests: each toolbar holds one tab stop; arrows, `Home`/`End`
  and `Tab` behave; the rail declares vertical orientation.
- Side by side (C2's verification pass, per the plan's §Verification): the
  live palette chord; the reference's reachability and read-only nature; the
  rail's arrow walk; `B`; Escape's ladder; and the live preference's exact
  silence — any scope difference is recorded in the C2 log.
- AC-8 is re-proven twice: gate on and gate off.

## Pros and Cons of the Options

- **`⌘K` with the link on `⌥⌘K`.** Pro: both chords land on Miro's map, and
  the displaced command moves to the same feature's key one modifier away.
  Con: anyone who learned `⌘K` as Firo's link relearns one chord.
- **The inherited palette chords stay.** Pro: no muscle memory breaks, and
  three chords on one command cannot drift apart — they are one entry. Con:
  the reference prints three chords where Miro's shows one.
- **A generated reference.** Pro: it cannot lie, and completeness becomes a
  CI property. Con: prose rows stay hand-maintained, and the test cannot see
  them.
- **Roving toolbars.** Pro: matches Miro and the tree's own idiom; Tab walks
  regions, not controls. Con: `@firo/ui` grows focus management that must not
  fight the flyouts' focus.
- **`B` to the board.** Pro: the keyboard-only run gains its way home from
  anywhere. Con: bucket fill's letter moves, and every surface printing it
  must follow the table — they do, through `getToolLetter`.
- **One gate.** Pro: the preference the accessibility layer needs, without
  merging the registries the seam keeps apart. Con: three owners must all
  consult it, and the tests pin each one.

## More Information

- Matrix rows 8, 9 and 15; the cluster map's C2
  ([`miro-parity-matrix.md`](../research/miro-parity-matrix.md)).
- Research: [`miro-ui.md`](../research/miro-ui.md) §The keyboard, as observed;
  [`miro-interactions.md`](../research/miro-interactions.md) §Command palette,
  §Command palette and the shortcuts modal, §Editing, navigation and modifiers.
- The accessibility contract this serves:
  [`trd/09-accessibility.md`](../trd/09-accessibility.md) — the palette is the
  backstop for every unkeyed function, and single-key shortcuts must be
  disableable.
- Plan: [`phase-11-miro-parity.md`](../plans/phase-11-miro-parity.md) §11.2.
- This record extends [ADR-0030](0030-keyboard-parity-with-miro.md), moves its
  `B` extra to Miro's meaning, and answers its revisit trigger; the index
  notes the move. The clean-room guardrail holds: labels and prose are ours; key
  chords are functional facts
  ([`miro-ui.md`](../research/miro-ui.md) §Clean-room guardrail).
