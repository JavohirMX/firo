---
status: accepted
date: 2026-10-15
deciders: maintainer
---

# Bind `G` and `M`, keep the numeric tool keys, and let the host own its own chrome keys

## Context and Problem Statement

Task 7.5.9 aligns Firo's keyboard map with Miro's. The two maps were compared
key by key — `TOOLS` and `getToolShortcut` in
`packages/editor/components/Tools.tsx`, every `keyTest` in
`packages/editor/actions/`, against Miro's published *Shortcuts and hotkeys* and
the shortcut registry recovered from Miro's bundles — and are recorded in
[`../research/miro-interactions.md`](../research/miro-interactions.md).

The comparison came out shorter than expected: the two maps **already agree** on
almost every tool key (`T`, `P`, `E`, `F`, `R`, `O`, `L`, `N`). The real work is
four questions, and each one had to be decided rather than assumed:

1. **Two Miro keys have a Firo feature but no binding.** `M` toggles the minimap
   in Miro and `G` toggles the grid; Firo has both features and neither key.
2. **The numeric keys collide and cannot be reconciled.** Miro's `1`–`9` are
   *positional* — `2` is always the second rail slot, whatever that is, and the
   mapping is explicitly unremappable. Firo inherited Excalidraw's *type-based*
   numbering, where the number names the tool (`2` is rectangle). Both cannot be
   true at once.
3. **Some Miro keys have no Firo target.** `S` is Miro's shapes group, `C` its
   comment tool, `D` its card. Firo has no group tool, comments are threads
   rather than a tool mode, and `D` is diamond. Nothing to bind.
4. **Where does a key for host chrome live?** The minimap is not a canvas
   concept: `apps/web/components/Minimap.tsx` draws it and `App.tsx` holds
   `minimapVisible`. The editor is never told it exists.

## Decision Drivers

- **Miro-first on collisions.** Someone who knows Miro should be able to use
  Firo without relearning. Where the maps collide and a decision is needed, Miro
  wins.
- **The standard editing keys are the exception, and it is a real exception.**
  Copy, cut, paste, select-all, undo and redo are platform muscle memory that
  long predate Miro, and the browser and OS reserve chords around them. Aligning
  those with Miro would be a regression, not parity.
- **One registry per owner.** `AGENTS.md` and
  [ADR-0022](0022-ui-package-owns-the-chrome.md) keep the editor and the host
  apart. A shortcut table that spans both would be the coupling ADR-0022 exists
  to prevent; so would teaching `@firo/editor` about a host component.
- **AC-8 must still hold.** The accessibility criterion is that a full workshop
  runs on the keyboard alone. A remap that fixes parity but breaks keyboard-only
  use has failed.
- **`G` must not cost `Ctrl+G`.** `Ctrl`/`⌘`+`G` is group in Firo *and* in Miro.
  `G` for the grid is only acceptable if the modified chord still groups.
- **A text field is not a canvas.** No single-character shortcut may fire while
  the user is typing. This is Miro's own `shouldIgnoreShortcut` guard, and Firo
  already has the predicate for it.

## Considered Options

### The numeric keys

1. **Adopt Miro's positional numbering.** Rejected. It requires dropping the
   type-based numbers, which are binding-independent and stable, in exchange for
   numbers whose meaning changes whenever the rail is rearranged. It would also
   make `2` ambiguous against a customised rail (7.5.8) and would break the
   numbering every Firo user's muscle memory already has.
2. **Keep the type-based `1`–`9` and document the divergence.** **Chosen.** The
   divergence is stated here, in the research document, and in the tooltips,
   which show the letter and the number for the same tool.

### `M` (minimap)

1. **Put `M` in the editor's action registry.** Rejected: the registry is for
   canvas actions, and there is no minimap action to register — the state lives
   in `apps/web`. Reaching across the seam is exactly what ADR-0022 forbids.
2. **The host owns its own chrome keys.** **Chosen.** `apps/web/board/chromeShortcuts.ts`
   holds `isMinimapShortcut`, a pure predicate with no dependency on the editor
   except `isWritableElement` — the editor's own "a text field has focus"
   predicate, which the host already uses to bail out before dispatching actions.
   This is a third registry, not a second one: one for tools, one for actions,
   and one for chrome, each owned by the code it belongs to.

### `G` (grid)

1. **Leave the existing chord (`Ctrl/⌘ + '`).** Rejected: Miro does not have it,
   the whole point of the task is parity where it is free, and nothing else uses
   plain `G`.
2. **Bind plain `G`, keeping the modifier path clear for `Ctrl+G`.** **Chosen.**
   `actionToggleGridMode`'s `keyTest` becomes a plain `CODES.G` with an explicit
   refusal of all modifiers, so `Ctrl`/`⌘`+`G` still reaches `actionGroup`
   untouched.

### What plain `G` does

1. **Match Miro exactly: a binary on/off.** Rejected: Firo has four grid types
   (`dots`, `lines`, `crosses`, `isometric`) where Miro has one, and collapsing
   plain `G` to a binary toggle would orphan three of them behind the menu. The
   existing cycle — off → dots → lines → crosses → isometric → off — is the
   feature; the key chooses it.
2. **Keep the cycle and say so.** **Chosen.** The difference from Miro is that
   repeated presses keep going; the first press and the on/off outcome match.

### `event.key` or `event.code`

1. **`event.key` only.** Rejected for the two new keys: on a non-Latin layout the
   physical key Miro puts the minimap on is still the same key.
2. **`event.code` for the new chrome and `G`, `event.key` for tool letters.**
   **Chosen**, and the asymmetry is deliberate and tested. Tool letters follow
   the layout's letters, because they *are* letters. `G` and `M` follow the
   physical position, matching Miro. `actionGroup`'s existing `Ctrl+G` continues
   to use `event.key`, where the distinction does not matter because the chord is
   modified.

## Decision Outcome

Chosen: **the smallest change that buys the parity, and explicit records for
everything else.**

- `actionToggleGridMode` binds plain `G` (`event.code === "KeyG"`, no modifiers,
  no shift, no alt) in the editor's existing registry. `CODES.G` is added to
  `packages/common/src/keys.ts`.
- The host binds plain `M` to the minimap toggle, in
  `apps/web/board/chromeShortcuts.ts` + a `window` listener beside
  `minimapVisible` in `App.tsx`, guarded by `isWritableElement` and refusing any
  modifier and auto-repeat.
- `NavToolbar` advertises both: the grid button's title reads `(G)` and the
  minimap button's `(M)`, with `aria-keyshortcuts` on both, so the binding is
  discoverable without a shortcut list.
- **The `1`–`9` keys stay type-based and this divergence is deliberate.** The
  rail's tooltips show letter and number together, so nothing is hidden.
- **`S`, `C` and `D` stay unbound.** There is no shapes group, no comment tool
  mode and no card tool to bind them to, and inventing targets to satisfy a table
  would be worse than a documented gap.
- **Firo's extras stay**: `X` / `Shift+X` (autoshape), `B` (bucket fill) and `K`
  (laser) are recorded here as deliberate, not as drift.
- **The standard editing keys and the browser/OS-reserved chords stay as the
  platform expects**, and are the stated exception to Miro-first.

What this deliberately does **not** do, recorded rather than silently dropped:
Miro's shell is itself keyboard-navigable (Tab between toolbars, arrows within
one, `B` to the board, Escape back) and offers an accessibility preference that
turns single-character shortcuts off for screen-reader users. Firo has neither
the roving-focus toolbar behaviour nor that preference. Both are larger than a
remap and are tracked in the research document's gaps, not folded in here.

## Consequences

- Someone who knows Miro finds `G` and `M` where they expect them, and the rest
  of the map was already right.
- `@firo/editor` learns nothing about the host; `apps/web` gains one small pure
  predicate with its own tests.
- The `aria-keyshortcuts` on the toolbar buttons makes the binding assertable in
  the shell tests, which is how the binding is kept from silently drifting.
- One divergence is now permanent and documented: Firo's numbers are tool types,
  Miro's are rail positions. A user who expects Miro's `2` will get a rectangle.
- Revisit trigger: if the roving-focus toolbar work lands, the chrome shortcuts
  should move behind the same registry so the single-character toggle can govern
  them too — the accessibility preference is the reason that work is worth doing.

## Confirmation

- `packages/editor/tests/shortcuts.test.tsx` proves plain `G` turns the grid on
  with `dots`, cycles to `lines` and `isometric`, then off, **and** that
  `Ctrl+G` does not toggle the grid while still grouping the selection.
- `apps/web/board/tests/chromeShortcuts.test.ts` proves the `M` predicate:
  accepts the bare physical key, refuses every modifier, refuses auto-repeat, and
  refuses when a writable element has focus.
- `apps/web/tests/minimap.test.tsx` and `packages/ui/tests/shell.test.tsx` assert
  the `aria-keyshortcuts` and titles, so the advertised key and the bound key
  cannot disagree.
- AC-8 is re-proven by a keyboard-only run of a workshop, including the two new
  keys.

## Pros and Cons of the Options

### Miro's positional numeric keys

- Good: literal parity with Miro's numbered tool switching.
- Bad: the numbers stop meaning a tool. They would change meaning when the rail
  is rearranged by 7.5.8, and every existing Firo number would move.

### `M` in the editor registry

- Good: all shortcuts in one place.
- Bad: there is no editor action to register, so it would mean inventing one that
  reaches into host state — the coupling ADR-0022 exists to prevent.

### A binary `G`

- Good: exact Miro parity.
- Bad: it orphans three of Firo's four grid types behind a menu.

### `event.key` for the new keys

- Good: one rule, no asymmetry to explain.
- Bad: the minimap would move on a non-Latin layout, and Miro's key would not.

## More Information

- [`../research/miro-interactions.md`](../research/miro-interactions.md) — the
  comparison, the key-by-key table, and the evidence for each Miro binding
  (including that `G` for grid rests on Miro's published list rather than the
  bundle scan).
- [`../plans/phase-7-5-miro-ui.md`](../plans/phase-7-5-miro-ui.md) §7.5.9 — the
  task's checklist and the follow-on work kept out of it.
- [ADR-0022](0022-ui-package-owns-the-chrome.md) — why the host owns the
  minimap's key.
- [ADR-0029](0029-the-rail-is-a-per-user-arrangement.md) — the rail work this
  map sits beside, and the reason the numeric keys cannot be positional.
