---
status: accepted
date: 2026-10-19
deciders: maintainer
---

# Give the shell one right dock, and make it the home of activity, versions and frames

## Context and Problem Statement

The deep pass measured the right side panel and named the lists that use it
([`miro-geometry.md`](../research/miro-geometry.md) §Shell regions,
§Panels, dialogs and popovers;
[`miro-interactions.md`](../research/miro-interactions.md) §Side panels,
§Activity and version history). The measured facts:

- A right dock at `(852, 64) 340 × 746`, or `(812, 64) 380 × 746` for voting.
  Its right edge is the 8 px inset; its bottom is the 8 px inset.
- A docked panel **pushes the bottom-right control strip left**: the strip's
  usual right edge is 1188 (12 px inset), and with a panel open it sits 12 px
  left of the panel — a shift of the panel width + 8.
- Panels carry their **own close control**, and **Escape does not close them**.
- Activity opens the comments side panel with **Board / Team** tabs; the
  activity list's bundle also carries a **versions** tab, not opened live.
- Comments and Frames are the two panels opened live; voting is the wide one.

Four matrix rows need a contract here:

| Row | State | What is missing |
| --- | --- | --- |
| 16 | absent | no panel shell at all; comments are canvas pins, activity is a dialog |
| 26 | absent | no frames panel |
| 47 | partial | an activity dialog; no panel, no tabs |
| 48 | partial | a version-history modal with revisions, restore, download and manual snapshots; no preview or diff |
| 49 | met | comments already meet the row as pins ([`ADR-0027`](0027-comments-are-their-own-lane.md)); mentions and read/unread are deferred in code |

Firo already has more of this than the row states, in the wrong shapes.
`ActivityFeed` is a right drawer — fixed, 340 wide, top 56, right 16, bottom
16 — but it is a **modal** (`role="dialog"`, `aria-modal`, Escape closes).
`VersionHistoryModal` is a **640-wide modal** with a rolling ten local
revisions, 30 s auto snapshots, a manual snapshot, download and a storage
estimate. Restoring replaces the board's elements, collections, records and
comments **in place**, and it does not snapshot the state it replaces — a
restore is irreversible past the rolling window. The `Inspector`
([`ADR-0021`](0021-miro-style-shell-and-clean-aesthetic.md),
[`ADR-0025`](0025-the-host-reuses-the-editors-property-controls.md)) is a
244-wide card at top 4.5 rem, right 1 rem, shown only while a selection has
shape actions. The `NavToolbar` is a 40-tall strip at right/bottom 1 rem.
Frames have inline name editing and an export path, but no list.

The shell has no notion of "a panel is open", so every list invents its own
anchor. Adding a frames drawer on top of the two modals would ship three
floating surfaces that each re-solve the same geometry. The missing contract
is one right slot, one precedence rule, and one home per list.

Clean-room note: the dock's anchors, width and behaviour are functional and
structural parity. Its labels, icons, colours and content are Firo's.

## Decision Drivers

- **One right slot.** The inspector, the feed, history and the future frames
  list cannot each claim the right edge. At 1200 px a second column would cost
  604 px of chrome.
- **Evidence over invention.** The no-Escape rule, the own close control and
  the strip push are observed; exclusivity and the frames action set are not.
- **Reuse the existing data.** `listActivity` already filters by board;
  revisions are already local and listed; frames are already in the doc. The
  work is placement and composition, not a new model.
- **Restore must be reversible.** A history surface that can destroy the
  current state without recording it is not a history surface.
- **No dead affordances.** A comments list without mentions or read state
  would be a second, weaker view of the pins.
- **Tokens, not literals.** Widths and anchors come from
  [`ADR-0034`](0034-the-measured-geometry-as-tokens.md).

## Considered Options

- **One right dock, panels exclusive, inspector yields** (chosen). The dock
  replaces the modal chrome; the inspector steps aside while it is open.
- **Keep the modals, add a frames drawer.** Unmet row 16; three floating
  surfaces; no strip coordination; the measured panel is still unbuilt.
- **Two right columns: dock plus inspector.** Faithful to both, but 340 + 8 +
  244 + insets is over half the canvas at the reference viewport.
- **Absorb the inspector into the dock as a "Properties" panel.** One slot,
  but it reopens the inspector decision of ADR-0021/0025 and makes properties
  disappear behind an unrelated list.

## Decision Outcome

### 1. The dock

`@firo/ui` gains `SidePanel`: an `<aside>` with an accessible name, a header
(title and close control), an optional tab strip, and a scrolling body. It is
a shell; the host supplies the content.

- **Anchors.** Inline-end `SPACE.sm` (8), block-end `SPACE.sm`, block-start
  derived as `SPACE.sm + BAR.height + SPACE.sm` (8 + 48 + 8 = 64). Width
  `PANEL.width` (340); `PANEL.widthWide` (380) is reserved for voting (C7) and
  never mixed in one panel. Radius and elevation come from the panel tokens.
- **Non-modal.** No backdrop, no focus trap; the canvas stays interactive.
  Opening moves focus into the panel (heading or close control); closing
  returns it to the trigger. Triggers carry `aria-expanded` and `aria-controls`.
- **One at a time.** Opening another panel replaces the current one; a trigger
  that is already open switches tab instead of stacking a second panel.
- **Escape does not close it.** This is observed Miro behaviour and it keeps
  the Escape ladder of [`ADR-0032`](0032-shell-keyboard-model.md) intact: a
  menu or popover opened inside the dock still closes on Escape first, then
  the ladder continues on the canvas. The dock closes by its close control or
  by its trigger.
- **Ephemeral state.** Which panel is open, and which tab, live in host state.
  They never enter the Yjs document and are not persisted across reloads.
- **Host chrome, not a new editor tunnel.** `apps/web` renders the dock fixed
  at the anchors above the editor's overlays. The selection lane does not draw
  across it; a selected object that lies under the dock keeps its object lane
  (`⌘ + Enter`, right-click), and its floating toolbar is occluded while the
  panel covers it.
- **The strip yields.** With a panel open, the bottom-right strip's inline-end
  inset becomes panel right inset + panel width + 12, i.e. 8 + 340 + 12. From
  the strip's default 12 px inset that is the measured shift of width + 8.
  The host sets the navigation overlay's inset through one custom property
  (`--firo-navigation-inset`, defaulting to the token) consumed by the
  existing container in `LayerUI.scss`. That single CSS property is the
  ADR-0022 clause-6 authorisation this decision needs; no editor TypeScript
  changes and no new tunnel.
- **The inspector yields.** While the dock is open the `Inspector` does not
  render, even with a shape selection; when the dock closes it returns if its
  own condition still holds. This keeps one right slot without folding the
  inspector into the dock. It costs no Miro parity: Miro has no persistent
  properties panel. The inspector's own geometry and contract are unchanged.

### 2. Activity (row 47)

The existing feed becomes the dock's **Activity** panel, with three tabs:

- **This board** — `listActivity({ boardId })`, the current dialog's default.
- **All boards** — `listActivity()`; rows keep their board names and the
  existing board-selection callback.
- **Versions** — the board's history (below).

The grouping (Today / Yesterday / Earlier), icons, relative times and the
clear action are kept; Clear clears the visible scope. The dialog chrome
retires: no `aria-modal`, no backdrop, no Escape-to-close, no focus trap.

Per-element "added / edited / deleted" attribution with actors is **not**
adopted. Firo records app-level events with a summary (saved, created,
comment, tag) and has no local actor identity to attribute element edits to.
Row 47 remains partial on that sub-point by decision, not by omission.

Comments do not gain a list. Row 49 is met by the pins; mentions and
read/unread remain deferred ([`ADR-0027`](0027-comments-are-their-own-lane.md)).
If they land, the list is a tab here, not another dock.

### 3. Versions (row 48)

The history surface moves into the Activity panel's **Versions** tab; the
640-wide modal retires. It keeps:

- the rolling revision list, newest first, with time, element count and label;
- the manual snapshot;
- download of a revision;
- the storage persistence state and estimate;
- restore, with its confirmation.

Two changes:

- **Restore is made reversible.** Before applying a revision, Firo saves a
  labelled safety revision of the current state ("Before restore"). The action
  is therefore undoable through the same list within the rolling window. The
  ten-revision window and 30 s cadence are unchanged.
- **No visual preview or diff this phase.** A preview needs an offscreen
  render of a serialised snapshot; the tab is a list. Row 48 remains partial
  on preview/diff and is revisited when the side-by-side shows the list is
  insufficient, or when board copy gives restore-into-a-copy a home.

Restore stays **in place**. Miro's bundle describes restore into a new board
(`saveAsCopyModal`, with a paywall); Firo's history is local document
snapshots and in-place restore is its primitive. Divergence recorded.

### 4. Frames (row 26)

A **Frames** panel lists frames in reading order — top-left first, then down
(y, then x). Each row shows the frame name, highlights the frame(s) currently
selected, and selects and scrolls to the frame on activation. The empty state
names the frame tool.

Row actions are Firo's composition: **rename**, using the same inline name
edit as the canvas, and **export frame**, routed to the existing export
surface with that frame. The live pass reached the frames panel's entry point
but not its action set, so this set is explicit invention, not a copy.

The trigger lands with the rail's frame family (C1) and the command palette;
no new top-level menu row is invented for the panel. There is no manual
reorder: reading order is derived, and moving a frame on the canvas already
changes it.

### 5. What this does not decide

- Voting's session state (C7); this ADR reserves the 380 width and the
  exclusivity rule.
- Comments list, mentions, read/unread ([`ADR-0027`](0027-comments-are-their-own-lane.md)).
- The media library (C6), which is left-docked at the same height but a
  different anchor and belongs to its own contract.
- Share, publish and templates (C9).
- Snapshot cadence, retention, server-side history, or history across devices.
- Per-element activity attribution.
- A snapshot preview or diff renderer.
- Narrow-viewport behaviour beyond the panel width tokens. The board
  experience remains desktop-scoped, as the rest of Phase 11.
- Persisting the open panel across reloads.

## Consequences

- `@firo/ui` gains `SidePanel` and `FramesPanel`; `ActivityFeed` becomes panel
  content rather than a modal; the Activity panel composes the feed and the
  versions lane; `apps/web` owns the open panel and tab, the data and the
  handlers.
- `VersionHistoryModal` retires as a modal. Its content and tests move to the
  dock.
- `WebInspector` gains one condition: no inspector while the dock is open.
  ADR-0025's seam is untouched.
- The navigation overlay consumes `--firo-navigation-inset`; this is the only
  editor change and it is CSS-only.
- Activity and history lose their modal Escape handling and focus traps. Any
  test that asserts those behaviours is updated deliberately, not deleted.
- Restore writes a safety revision first. The storage tests extend; the
  rolling window's eviction is now observable in that flow.
- Matrix: 16 adopt; 26 adopt (trigger pending C1); 47 adapt (per-element
  detail omitted); 48 adapt (preview/diff deferred, restore in place); 49
  unchanged.
- Voting (C7) must use the wide width and the same exclusivity.

## Confirmation

- **Geometry.** At 1200 × 818 the panel rect is `(852, 64, 340, 746)` within
  the measured ±1 px tolerance; the wide panel is `(812, 64, 380, 746)`; the
  strip's right edge is `840` with a panel open; the inspector is absent while
  the dock is open and present after close when a shape is selected.
- **Behaviour tests.** One panel at a time; a trigger toggles and switches
  tabs; Escape leaves the dock open and still closes a menu above it; close
  returns focus to the trigger; the tabs scope the feed correctly; the
  versions tab lists, snapshots, downloads and restores; a restore writes a
  "Before restore" revision; frames are ordered, selectable, renameable and
  exportable; no dialog role, backdrop or focus trap remains on either lane.
- **Side-by-side.** Open the comments and frames panels on the Miro scratch
  board and the dock in Firo at the same viewport; compare anchors, width,
  close control, strip shift and Escape. Content differences (feed entries,
  revisions) are excluded and stated per capture.
- **Suites.** `yarn test:typecheck`, `yarn test`, `yarn test:code`,
  `yarn test:other`.

## Pros and Cons of the Options

**One dock, inspector yields**

- (+) Meets row 16 exactly; one slot, one precedence rule, one strip rule.
- (+) Reuses the feed's and history's data and retires two modal chromes.
- (+) Makes restore reversible, which the current modal does not.
- (−) Properties are hidden while a panel is open; the user must close the
  dock to see them.
- (−) Merges history into a 340-wide tab; the modal had 640.

**Keep the modals, add a frames drawer**

- (+) Smallest diff; no inspector precedence question.
- (−) Row 16 stays absent; three surfaces float over the canvas; the strip
  never coordinates; the measured behaviour is unbuilt.

**Two right columns**

- (+) Both surfaces visible at once.
- (−) Over half the reference viewport becomes chrome; the canvas loses the
  space the row's 340 width was chosen to bound.

**Inspector as a dock panel**

- (+) One slot, one component.
- (−) Reopens ADR-0021/0025; properties vanish behind an unrelated list;
  a persistent inspector becomes a toggled one.

## More Information

- Evidence: [`miro-geometry.md`](../research/miro-geometry.md) §Shell regions
  and §Panels, dialogs and popovers;
  [`miro-interactions.md`](../research/miro-interactions.md) §Side panels and
  §Activity and version history;
  [`miro-parity-matrix.md`](../research/miro-parity-matrix.md) rows 16, 26,
  47, 48, 49.
- Current code: `packages/ui/src/components/ActivityFeed.tsx` (drawer, modal
  semantics), `apps/web/components/VersionHistoryModal.tsx`,
  `apps/web/board/storage.ts` (`MAX_REVISIONS`, `saveBoardRevision`,
  `restoreBoardRevision`), `apps/web/board/activity.ts` (`listActivity`),
  `packages/ui/src/components/Inspector.tsx`,
  `packages/editor/components/LayerUI.scss` (navigation and inspector
  containers).
- Related ADRs: [`ADR-0021`](0021-miro-style-shell-and-clean-aesthetic.md),
  [`ADR-0022`](0022-ui-package-owns-the-chrome.md),
  [`ADR-0025`](0025-the-host-reuses-the-editors-property-controls.md),
  [`ADR-0027`](0027-comments-are-their-own-lane.md),
  [`ADR-0032`](0032-shell-keyboard-model.md),
  [`ADR-0034`](0034-the-measured-geometry-as-tokens.md).
- Recon: Miro Business build `1.104717.0`, 19 October 2026, 1200 × 818 CSS.
  Comments and frames panels were opened live; the versions tab and the frames
  action set come from the bundle and the entry-point pass only. Raw captures
  stay out of the repository.
