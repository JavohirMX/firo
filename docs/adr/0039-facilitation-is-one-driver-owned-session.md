---
status: accepted
date: 2026-10-19
deciders: maintainer
---

# Facilitation is one driver-owned session: votes are durable, the live session is ephemeral

## Context and Problem Statement

C7 is the facilitation cluster: matrix rows 33–37, the six observed surfaces
from reactions to presentation. Row 38, **Notes**, was listed in Miro's menu
but never activated; it stays unobserved and is not decided here.

The live pass measured the surfaces
([`miro-parity-matrix.md`](../research/miro-parity-matrix.md) §Facilitation and
presentation; [`miro-geometry.md`](../research/miro-geometry.md) §People bar
internals, §Panels, dialogs and popovers;
[`miro-interactions.md`](../research/miro-interactions.md) §Facilitation:
reactions, Timer, Voting):

- The people bar's first control opens a **facilitation menu**: a row of six
  reactions above **Timer**, **Voting**, **Private mode**, and **Notes**.
- **Timer** opens a `280 × 102` setup popover with a minute stepper, a music
  combobox, **Start**, and a close control. No timer was started.
- **Voting** opens the `380 × 746` side panel: **New session** / **Results**
  tabs; steppers for votes (observed `3`) and minutes (observed `2`); switches
  **One vote per object** (off) and **Show results on the board** (on); a
  **Filter** box listing eligible types and counts; a footer with **Start** and
  a second, unactivated control labelled **Add to board**. Opening the panel
  places a transient **Voting area** frame on the canvas; closing removes it,
  and the board was clean afterwards.
- **Private mode** and **Notes** were listed but not activated.
- **Present** enters a presenter overlay with navigation and a laser; start and
  exit were verified.

Firo already has the durable half and none of the session half.
`packages/facilitation/src/` implements the timer as an anchor, votes as
records, the reveal predicate, and frames-as-slides. `packages/schema` carries
`hiddenUntilRevealed` and `hideInPresentation` as durable element flags.
`apps/web/board/facilitatorActions.ts` exposes `Alt+D` / `Alt+W` / `Alt+L` dot
commands and timer, reveal, and presentation commands.
`apps/web/components/FacilitatorBar.tsx` shows the local timer, private state,
and slide number.

The gap is not one widget. It is a missing session contract:

- **The live state is local, not shared.** The timer, reveal mode, and
  presentation live in `FiroDoc.getEphemeral()`, which is this client's
  awareness entry. `FacilitatorBar` reads it, and `BoardSync` reads it, but no
  code reads another client's facilitator state. In a room, one person pressing
  `Alt+T` changes only their own chip. The plan's exit criterion "a facilitator
  change propagates to everyone"
  ([`phase-5-facilitation.md`](../plans/phase-5-facilitation.md) exit criterion)
  is unmet.
- **Votes have no round, settings, limit, or results surface.** They are
  anonymous dots in an `firo-votes` collection; every press adds a dot to each
  selected element, and a named voter's existing dot anywhere is archived. There
  is no votes-per-person limit, no one-vote-per-object rule, no eligible-type
  filter, no deadline, no panel, and no badge on the canvas. `placeVote`'s
  auto-move contradicts a limit greater than one.
- **The timer has no setup.** The commands start the default five minutes,
  pause, reset, and add a minute. There is no minute stepper and no Start in a
  popover.
- **Private mode and presentation have no authoring surface.** The two durable
  flags exist and the renderer honours them, but there is no object-lane row or
  palette command that sets them.
- **Presentation order is draw order.** `slidesFor` walks the document's
  elements, so slide order is z-order rather than the reading order the Frames
  panel uses. Moving a frame changes its z-order, not its slide position.
- **Reactions do not exist.** There is no reaction state, surface, or overlay.

The contract question C7 must settle is the one the matrix names: **durable
votes versus ephemeral session state** — and, because Firo is multiplayer, **who
owns a live session and how the room follows it**.

## Decision Drivers

- **Rule 1 is the boundary.** Cursor, timer anchors, reveal mode, presentation
  position, voting settings, and reactions are live-meeting state. Votes and
  per-object visibility flags are board content. No live state enters the Yjs
  document.
- **One driver, one room.** Two clients must not be able to run two timers, two
  decks, or two voting rounds at once. The room needs a deterministic driver
  without a server round trip.
- **Durable votes must survive.** A vote is a record, not a widget. It survives
  save/load, export/import, and a driver disconnecting. The plan's "all
  facilitation state survives save/load" is read as **durable** state: a live
  timer must not reopen frozen, and a deck must not reopen mid-slide.
- **A vote is one dot.** One record per dot, one undo step per press, and a
  withdrawal that archives rather than deletes. The round boundary must not
  require deleting records the document model cannot delete.
- **The allowance is a facilitation rule, not a security boundary.** Votes per
  person is enforced by the client that casts them; the server remains the
  authority on whether a role may write at all.
- **Anonymous by default, named only as a live view.** A ballot key is opaque
  and never a person. A name may be shown while that voter is connected; it is
  never written into the board file.
- **Keyboard parity.** Every facilitator action is a command in the existing
  action registry and the `⌘K` palette. The object flags are reachable through
  `⌘ + Enter` and the palette; no new single-key collision is introduced.
- **Measured shell, not invented chrome.** The voting panel uses
  `PANEL.widthWide` (`380`) in the one right dock; the timer popover is `280`
  wide on the menu line. The internal composition is Firo's.
- **Honest evidence.** The music tracks are omitted (licensed audio), the
  second voting footer control was never activated, Private mode's per-object
  flow was never opened, and Notes was never opened. Those are recorded as
  adaptations or absences, not copied.
- **Clean room.** The six reaction kinds are functional; Firo uses Unicode
  emoji and its own labels. No Miro asset, icon, font, or verbatim colour token
  enters the code.

## Considered Options

### What a voting session owns

- **Durable votes plus an ephemeral, driver-owned round** (chosen). The votes
  are records. The round's settings, deadline, and presence live in awareness.
  Starting a round archives the previous round's unarchived dots in one commit;
  the round's own configuration never enters the document.
- **Ephemeral votes.** Rejected: a vote lost on reload or a driver disconnect
  fails the plan's exit criterion, contradicts the existing record model, and
  cannot be exported. Dots placed by a facilitator walking a room are exactly
  the thing that must survive.
- **A durable session record.** Rejected: it would put a timer, a deadline, a
  reveal mode, and a deck position into the file, where they reopen stale. It
  also makes every workshop a permanent row in the board, which is the failure
  the record model's `archiveRecords` lifecycle exists to avoid.
- **A session id on every vote record.** Rejected for this phase: it adds a
  column and a read-time migration, and an ephemeral id leaves orphaned rounds
  after the driver disappears with no way to name them. The archive boundary
  gives the same clean tally with the existing record lifecycle.

### The round boundary

- **Start archives the previous round's unarchived dots** (chosen). One commit,
  one undo step, and the tally is simply the unarchived votes on live elements.
  The records remain recoverable through undo; the next round starts clean.
- **No clear; tally every unarchived vote.** Rejected: a second workshop would
  inherit the first workshop's dots, and "Results" would mix rounds.
- **Tag votes with a round id.** Rejected above; it does not remove the need to
  decide what happens to old rounds, and the id is lost with the session.
- **Delete records.** Rejected: there is no record-delete mutation. Archive is
  the explicit lifecycle, and deleting would make withdrawal irreversible.

### Who drives the room

- **The client that claims the session, published in awareness** (chosen). Any
  owner or editor may claim when no session exists. The claim names the
  awareness `clientID`; followers read that entry. If two clients claim at the
  same instant, the lower `clientID` wins and the other yields.
- **The board owner only.** Rejected: local boards have no server owner, share
  roles are optional, and the evidence does not show an owner-only gate. It
  would make a facilitator unable to run a session on their own local board.
- **A server-owned room session.** Rejected for this phase: it needs a second
  relay protocol and room state on the server, plus a local-only fallback, for a
  property awareness already provides. The server still authorises durable
  writes by role.
- **Per-client local state (today).** Rejected: it is the bug. The room does not
  follow, and two clients can present different slides.
- **A durable `meta` field.** Rejected: rule 1. A timer or reveal mode in the
  file would reopen stale and would put an undoable entry on a live change.

### Ballot identity

- **An opaque per-session ballot key** (chosen). A random key per client per
  round, kept in `sessionStorage`, written to the existing `voter` column.
  Counts, limits, one-per-object, and "take back" all work without a person's
  identity entering the file. Names can be resolved through live awareness for
  display only.
- **The account user id.** Rejected: local boards have no account; a durable
  user id is still identity in the file; the editor has no participant
  directory yet. ADR-0037's account surface can supply a stable id later, but it
  is not required to run a local workshop.
- **An empty voter key.** Rejected: it is what makes "which dot is mine" and a
  per-person allowance impossible. Every anonymous participant currently writes
  `""`; the result is indistinguishable dots and a withdrawal that can remove
  someone else's.
- **Names in the record.** Rejected: durable PII with no retention story.

### The timer surface

- **The facilitation menu opens a `280`-wide setup popover** (chosen). It
  carries the minute stepper, Start, and close; a running timer shows its
  remaining time and the existing pause/reset actions. It is not a modal.
- **Controls in the FacilitatorBar.** Rejected: the bar is the readout, and a
  second set of controls would be a mouse-only path that drifts from the
  keyboard commands. The bar keeps its single reveal control only because that
  state is otherwise invisible.
- **A modal.** Rejected: the measured surface is a small popover on the menu
  line.
- **Music.** Omitted: the observed combobox plays licensed audio; Firo ships no
  music library and no external audio search.

### Reactions

- **Six Unicode reactions over per-client awareness** (chosen). The menu shows
  the six kinds; a reaction is a short-lived awareness value with an id and a
  target. Peers render it for a few seconds. Nothing is stored.
- **Element metadata or records.** Rejected: reactions are not content; they
  would enter the file, undo, and export, and a board would accumulate every
  reaction ever sent.
- **No reactions.** Rejected: row 33 is an adopt.

### Reveal and presentation authoring

- **Object-lane checkable rows plus palette commands** (chosen). **Hide until
  reveal** and **Hide in presentation** are visibility flags on the selected
  object, so they belong in the object lane beside **Lock**, and they are
  available as commands for keyboard and palette.
- **A facilitation submenu.** Rejected: it separates an object-scoped flag from
  the object it applies to and forces a round trip through a board-level menu.
- **No authoring UI.** Rejected: the flags exist and the row is partial for want
  of a surface; a flag nobody can set is not parity.

### Presentation order

- **Reading order: top-left first, then down** (chosen). It is the order the
  Frames panel already uses, and moving a frame on the canvas changes its slide
  position without a second ordering structure.
- **Document/z-order (today).** Rejected: drawing order is not a running order,
  and moving a frame to the back would silently change the deck.
- **A separate deck-order field and reorder panel.** Rejected for this phase: it
  adds schema and a second ordering UI for a property the frames' positions
  already express. The live pass did not show a deck-reorder surface.

### The voting area

- **A non-persistent viewport outline while the panel is open** (chosen). It
  marks the area the facilitator was looking at, follows the observed transient
  cue, and never enters the document, undo, or export. It does not scope votes.
- **A real frame element.** Rejected: opening a panel would mutate the board,
  create an undo entry, and leave a frame behind on a crash. The observed frame
  was transient and the board was clean after close.
- **No outline.** Rejected: the observed opening cue is part of the surface.

### Results on the board

- **A host overlay of count badges** (chosen). It reads durable votes and
  visible elements, draws nothing into the canvas or export, and disappears when
  the setting is off.
- **Element fields or records.** Rejected: a count on an element is the
  "counter per element" shape that loses voter identity, and a record per badge
  is derived state in the file.
- **No badges.** Rejected: **Show results on the board** is observed and on by
  default.

## Decision Outcome

### 1. One shared session, one driver

Firo has **one live facilitation session per board**, owned by one client and
published through Yjs awareness. It carries the timer, the board reveal mode,
the presentation position, and the voting round. It never enters the Yjs
document, board metadata, `localStorage`, or the file format.

**The claim.** The driver's awareness entry adds a session claim:

```
session: { leader: number } | null    // leader === the publishing clientID
```

Followers publish `session: null`. A claim is valid only when `leader` equals
the publishing awareness `clientID` **and** at least one live state is present.
A claim with no live state is ignored, so an expired round does not hold the
room even if its marker has not been cleared yet. If more than one valid claim
exists, the **lowest `leader` client id** wins; the other client clears its own
claim and its facilitator fields and shows "Another facilitator started a
session." This is a deterministic tie-break for a simultaneous start, not a
priority order.

**The state.** The driver's own awareness entry holds the fields the room reads:

```
timer:        EphemeralTimer | null
reveal:       { mode: "private" | "revealed" }
presentation: { active, slideIds, index }
voting:       EphemeralVoting | null
```

The session claim exists while the timer is non-null, the board is private,
presentation is active, or a voting round is **open**. An ended or expired round
keeps its final state in the driver's panel for display, but no longer holds the
claim: the durable votes are readable without a session, and another editor may
start the next round. When every one of those live states is back to default,
the driver clears the claim. A session with no live state is not a session.

**Who may drive.** A board owner or editor may claim when no session exists; a
viewer or commenter may watch but not start or change one. A local-only board
has no roles and its only client may always claim. The role check is UI policy;
the server remains the authority for durable writes. The driver is a **client**,
not an account: closing the tab or reloading ends the session, and the next
client may claim a new one. Durable votes and flags remain.

**How the room follows.** One reader, `getSession`, scans awareness for the
winning claim and returns the driver's four fields. `FacilitatorBar`,
`BoardSync`, the presentation viewport, the voting panel, and the vote-badge
layer all read it. A change to awareness re-renders the bar, repaints the
withheld set, moves a follower's viewport to the current slide, and updates the
badges. A follower never writes `timer`, `reveal`, `presentation`, or `voting`;
the commands that would do so are disabled with an explanation.

**Awareness is the transport.** No server protocol and no document writes are
added. The existing relay already carries awareness and drops it when a peer
disconnects. A driver who leaves takes the session with them; the room returns
to the ordinary editing state. A clock anchor is an absolute epoch time, so
small device-clock skew is accepted; a one-second timer readout does not warrant
a time-sync protocol.

**Absent fields are old clients.** An awareness entry without `session`,
`voting`, `ballot`, or `reaction` is read as no session, no voting round, no
ballot, and no reaction. No durable migration is needed.

### 2. Votes are durable; the round is live

The existing record model is kept:

- One record per dot in the fixed `firo-votes` collection, with `target`,
  `voter`, and `placedAt` columns. A vote is never element metadata.
- Placing or withdrawing a dot is one `commit`, so it is one undo step.
- Withdrawal archives the record rather than deleting it. The document model
  has no record delete, and an archived dot can be restored by undo.
- A vote whose target is deleted or absent is **filtered at read time**, not
  cascaded or archived. A restored element brings its dots back. The tally,
  results panel, and badges all read live, currently visible elements, so a
  tombstoned or privately withheld target cannot win a round or leak a hidden
  note's count.

**The round.** A driver starts a voting round from the panel. The settings are:

| Setting | Default | Range / values |
| --- | --- | --- |
| Votes per person | `3` | `1`–`9` |
| Minutes | `2` | `1`–`60` |
| One vote per object | off | on / off |
| Show results on the board | on | on / off |
| Filter | all types | element types with live counts |

The settings are fixed at **Start**. The one exception is **Show results on the
board**, a display switch that cannot invalidate a vote; it stays live. To
change a rule that affects ballots, end the round and start another.

**Start archives the previous round.** Starting a round commits an archive of
every unarchived vote in one step. The previous dots remain in the document as
archived records, recoverable by undo, and the new round's tally is exactly the
unarchived dots on live elements. Closing the panel does not archive; ending the
round early does not archive; a deadline does not archive. Results remain
readable after the round ends, and the next Start is the boundary that makes a
fresh tally. Undoing the Start restores the old dots into the active tally
because undo is a board action and the round is not part of the document; the
facilitator can then clear or keep them deliberately.

**The deadline is derived.** `startsAt + minutes` is stored in the round state;
`isVotingOpen` compares it with the current clock on read. No per-second value
is written. Votes placed after the deadline are refused with a message. The
round is inactive when the deadline passes but remains readable, so the results
do not vanish at zero.

**The eligibility filter** is a rule for **new** votes. It lists element types
with live counts and lets the driver check which types may receive dots. The
results count every live unarchived vote; eligibility is a rule for placing a
dot, not a retroactive filter. Hiding a vote from the results would make the
tally disagree with the dots on the board. The filter's counts update as elements
are added or deleted.

### 3. A ballot is opaque; a name is a live view

Every client that votes mints a random **ballot key** for the round and stores it
in `sessionStorage` under the board and round. The key goes into the existing
`voter` column. It is not an account id and is never displayed as an identity.

- The same ballot key on the same element is "my dot"; `Alt+W` finds it and
  archives it. Two anonymous participants no longer share `""`.
- **Votes per person** counts that ballot's unarchived dots, including a dot on
  a temporarily deleted target. The tally and badges still require a live
  target, but deleting one does not refund a vote and restoring it cannot push
  the ballot over its limit. If a press would exceed the allowance, the whole
  press is refused with a message and nothing is written; a partial
  multi-selection write would make the tally disagree with what the facilitator
  saw.
- **One vote per object** means at most one dot from a ballot on a target. If it
  is on and the ballot already has a dot there, the press is refused; use
  `Alt+W` to take it back.
- **Changing a vote is take-back plus place.** The old auto-move of a named
  voter's dot anywhere is retired: it made "votes per person: 3" impossible and
  silently archived a dot on another object. A press adds or removes one dot;
  the allowance is the only limit.
- Outside a voting round, the commands still work: one ballot may place one dot
  per target, with no total allowance. Those free dots are what the next Start
  archives.
- A legacy vote with an empty `voter` is counted but cannot be attributed or
  withdrawn by a ballot. Starting a round archives it.

**Anonymous is the record.** The Results tab defaults to counts and element
labels. A local **Show names** display switch may resolve a ballot key to the
publishing client's live awareness name while that client is connected. Each
client publishes its current `ballot: { sessionId, key } | null` in awareness for
this resolution; the key is never a vote value and is not a person. Names never
enter the document, are not required for a result, and disappear when the voter
leaves. This is the named view the plan asks for without durable PII. A
local-only board has no other names to show and keeps the switch off.

### 4. The voting surface

The panel is the right dock's **wide** slot: `PANEL.widthWide` (`380`), the
`(812, 64) 380 × 746` measured surface, exclusive with Comments and Frames
([`ADR-0035`](0035-the-right-dock-and-its-panels.md)). It is non-modal and
Escape does not close it.

- **Header:** **Voting** and the panel's own close control.
- **Tabs:** **New session** and **Results**.
- **New session:** votes stepper, minutes stepper, the two switches, the
  eligible-type list with live counts, and the footer **Start**. When unarchived
  dots exist, Start names the count it will clear, because that is the round
  boundary. The observed second footer control was never activated and its
  effect is unrecorded; no second action is invented. If it turns out to place
  the voting area as a frame, the outline decision below already covers the
  need.
- **While a round is active:** the New session tab shows the fixed settings,
  the time remaining, and **End session** for the driver. A non-driver sees the
  same settings read-only. The Results tab updates live.
- **Results:** rows sorted by count descending, ties by element id for the same
  cross-client stability `leaders` already buys; each row names the element and
  its count, and activating it selects and scrolls to the target. Rows obey the
  same reveal/presentation visibility predicate as the badges, so a hidden
  target's count does not appear in the panel either. The empty state names the
  first action. A local **Show names** display switch is described in §3.
- **Voting area:** while the panel is open, a non-interactive dashed outline
  marks the viewport that was visible when it opened. It is not a frame, is not
  an element, does not scope the round, and is not in undo or export. This is
  the transient cue without the durable side effect.
- **Badges:** when **Show results on the board** is on, a count badge sits at
  each visible target with at least one live unarchived vote. The layer is host
  chrome, not canvas content: it is filtered by the same reveal/presentation
  visibility predicate, so a hidden note's count cannot leak it, and it is not
  included in PNG/SVG/PDF exports. Votes themselves are durable records in the
  file; the badge is a view.
- **Driver-only controls.** Start, End, the settings, and the results toggle are
  driver actions. Any owner or editor may start a round when none exists; once
  one exists, only its driver changes it. Participants cast and withdraw their
  own dots.

### 5. The timer is one anchor

The facilitation menu's **Timer** opens a `280`-wide popover anchored on the menu
line, with a minute stepper (`1`–`60`, default `5`), **Start**, and close. The
music combobox is omitted; Firo has no licensed music library and adds no
external audio service.

- Starting publishes the anchor once. The room derives the remainder from its
  own clock; no tick is written.
- A running timer's popover shows the remaining time and the existing **Pause**
  / **Reset** / **Add minute** actions. This running-state composition is
  Firo's, not observed; the measured setup state is the no-timer state.
- The existing `Alt+T` (start/pause), `Alt+Shift+T` (reset), and `Alt+M` (add a
  minute) commands remain, driver-only. The bar stays a readout; its one button
  is the reveal toggle, whose effect is otherwise invisible.
- At zero the anchor stays with zero remaining; the bar reads `0:00` and its
  accessible label says "Time is up" until the driver resets. Ending the session
  does not clear a deliberately finished timer.
- The timer is not in the file and does not survive a reload. That is the point
  of it being ephemeral, not a gap.

### 6. Reveal and presentation are shared state over durable flags

**Per-object flags.** The object lane gains a visibility group beside **Lock**,
with two checkable rows: **Hide until reveal** and **Hide in presentation**.
They set the existing `hiddenUntilRevealed` and `hideInPresentation` fields and
are also palette commands. They get no new single-key shortcut; the palette and
`⌘ + Enter` are the keyboard paths, and the generated shortcut reference stays
honest. The rows are Firo's composition, not observed; the live pass listed
Private mode but did not open its per-object flow.

**Private mode.** The facilitation menu's **Private mode** is a checkable row
that toggles the board-level reveal mode. It is driver-only and shared. Flagged
elements are withheld from the canvas, the vote-badge layer, and every export
while private. To edit a hidden object, the driver reveals the board; the flags
are durable and survive save/load, while the mode does not.

**Presentation.** The menu and the existing commands start and stop presenting,
driver-only. The deck is the board's frames in **reading order** — top-left
first, then down, the order the Frames panel uses — recomputed while presenting.
If a frame is deleted, the current frame is preserved by id when it still
exists; otherwise the index clamps to the nearest slide. Moving a frame changes
its slide position; there is no separate deck-order field or reorder panel in
this phase.

- The driver advances and stops; followers follow the current slide and their
  viewport moves to the same frame. The command predicates are disabled for
  followers.
- **Hide in presentation** is authored in the object lane and withheld from the
  presenter's filtered board, the followers' boards, and exports.
- The laser pointer stays as the inherited per-client pointer; the presenter's
  navigation is the existing commands and palette. No full-screen overlay is
  added: the filtered canvas plus the bar is Firo's presentation surface, and the
  row's named gaps were deck order and hidden-object authoring, both closed
  here.
- Presenting is board-wide; a follower cannot locally opt out and see the
  editing board. A room watching one slide is the feature.

### 7. Reactions are ephemeral, not content

The facilitation menu carries six reactions above its items: thumbs up, love,
fire, wow, celebration, and wave. They are Unicode glyphs with Firo's labels;
no Miro art is used.

- A reaction is a per-client awareness value:
  `{ id, kind, targetId, x, y, at } | null`. The newest reaction replaces the
  client's previous one; awareness is a latest-value channel, not a message log.
- If exactly one element is selected, the reaction anchors to it; otherwise it
  floats from the sender's cursor or the viewport centre.
- Peers render a new id for four seconds. No reaction enters the document, the
  undo stack, the activity feed, or an export. It is gone when the tab closes.
- Any connected participant may react; reactions are not durable writes and do
  not need an editor role. A local confirmation is announced; the remote stream
  is decorative and `aria-hidden` so a screen reader is not interrupted by every
  emoji.
- Reduced motion uses a static fade rather than travel.

### 8. Notes stays open

Row 38 was listed but not activated. The facilitation menu omits **Notes** until
its flow is observed; a menu row that opens nothing would be a dead affordance.
No data model, surface, or placeholder is invented for it.

### 9. Roles, keyboard, and failure

- **Roles.** Owner and editor may claim a session, change its settings, set
  visibility flags, and vote. Viewer and commenter see the timer, private state,
  slide, results, and badges; they cannot start or change a session or cast a
  dot. The server's role check remains authoritative for durable writes.
- **Keyboard.** Every new action is in the action registry and the `⌘K` palette:
  timer setup, voting panel, vote add/withdraw/tally, reveal, presentation,
  hide-until-reveal, hide-in-presentation, and the six reactions. Existing
  shortcuts stay. The object flags use `⌘ + Enter`; the palette is the
  keyboard path for reactions. The generated shortcut reference gains a row
  only where a shortcut exists.
- **Escape.** The timer popover closes on Escape and focus returns to its
  trigger; the right dock does not close on Escape
  ([`ADR-0035`](0035-the-right-dock-and-its-panels.md)). Presentation is ended
  by its command, not by an Escape that could be mistaken for closing a
  popover.
- **Failure states.** Starting when another session exists says who drives and
  offers to follow; a vote over the allowance or on an ineligible type refuses
  the whole press; a deleted target is not selectable and its dots do not count;
  Start with no frames in presentation says to draw one; a disconnected driver
  ends the session and leaves the durable votes and flags intact.

## Consequences

- `packages/doc/src/ephemeral.ts` gains `session`, `voting`, `ballot`, and
  `reaction` fields plus their empty defaults. They are awareness-only and
  optional on the wire; absent fields from older clients mean "no session".
- `packages/facilitation/src/` gains pure session selection, round settings and
  deadline, ballot allowance, live-target filtering, and slide-order functions.
  The existing `placeVote` auto-move is retired and its tests change; `tally`
  and `leaders` remain.
- `apps/web/board/` gains a session reader/holder, the ballot-key store, the
  timer popover state, the voting panel, the vote-badge layer, the reaction
  layer, and the follower presentation viewport. `FacilitatorBar` reads
  `getSession`; `BoardSync` reads it for reveal and presentation.
- `apps/web/components/` gains the timer popover, the voting dock content, the
  reaction layer, and the vote badges. The rail and people bar themselves are
  C10's; C7 supplies the menu contents and surfaces.
- `apps/web/board/facilitatorActions.ts` gains the new palette entries and
  driver predicates; the object lane gains the two visibility rows.
- No element schema change, no vote-collection schema change, and no server
  change. The vote collection keeps `target`, `voter`, `placedAt`; the ballot key
  is a value in `voter`.
- The Phase 5 goal "All facilitation state survives a save/load cycle" is read
  as **durable** state: votes and flags survive; the live timer, reveal mode,
  deck position, and round settings do not. The plan already declares the timer
  and the reveal toggle ephemeral; this record makes the reading explicit.
- Matrix rows 33–37 can be closed after the side-by-side, each with its
  deliberate divergences: music omitted, second footer control not invented,
  Private mode's per-object flow ours, reading-order deck, badges not exported,
  named view ephemeral. Row 38 stays open.
- The proof that the ephemeral/durable split held is testable: a five-minute
  timer, a slide change, a reveal toggle, a reaction, and a voting deadline
  produce zero durable updates; placing, withdrawing, archiving a round, and
  setting a visibility flag produce real, undoable document updates.

## Confirmation

- **Session selection.** Two claims choose the lower client id; the loser
  clears its fields and is told. A follower reads the driver's live timer,
  reveal, presentation, and voting state. An ended or expired round releases the
  claim and leaves its durable votes readable. A driver disconnect removes the
  session; a stale claim whose `leader` does not match its publishing client is
  ignored. No follower command writes facilitator fields.
- **Timer.** A running timer produces zero document updates; the bar reads the
  shared anchor; pause/resume/reset/add-minute work from every driver surface;
  a non-driver is read-only.
- **Votes.** Placing one dot on a multi-selection writes one record per target
  in one commit; the allowance refuses the whole press when it would overflow;
  one-vote-per-object refuses a second dot from the same ballot; withdrawal
  archives exactly that ballot's dot; a ballot key is stable across a reload in
  the same tab; a legacy empty-voter dot is counted and can be cleared by Start.
  The allowance counts a ballot's unarchived dots even when a target is
  temporarily deleted, so deleting and restoring cannot refund a vote.
- **Rounds.** Start archives all unarchived votes and one undo restores them;
  closing the panel and the deadline do not archive; the deadline refuses late
  votes; Results counts live, currently visible unarchived votes only; deleted
  and privately withheld targets disappear from results and badges and return
  when restored or revealed.
- **Presentation.** Slides follow reading order; moving a frame changes the
  order; deleting the current frame clamps; `hideInPresentation` removes an
  element from the presenter's and followers' boards and from exports; followers
  move to the driver's frame.
- **Reveal.** Flagged elements are withheld from the canvas, badges, and exports
  while private; revealing brings them back; the mode does not persist; the flag
  does.
- **Reactions.** A reaction produces zero document updates, renders for its
  lifetime, and leaves no state after disconnect.
- **Keyboard and roles.** Every new command is in the palette; object flags are
  in the `⌘ + Enter` lane; viewer/commenter cannot start or change a session or
  vote; owner/editor can claim and vote.
- **Shell.** The voting panel is `380 × 746` in the right dock; the timer
  popover is `280` wide on the menu line and its height is content-driven (the
  measured `102` includes the omitted music row); the six reactions and the
  menu order match the observed surface; Private mode, Notes, and the second
  footer control are recorded as observed-only or omitted, never silently
  invented.
- **Suites.** `yarn test:typecheck`, `yarn test`, `yarn test:code`,
  `yarn test:other`; plus the awareness-only update tests and the vote lifecycle
  fixture.

## Pros and Cons of the Options

**Durable votes plus an ephemeral driver-owned round**

- (+) Votes survive reload, export, and a driver leaving; the board file grows
  with its dots, not with its timer ticks.
- (+) One driver gives a room one timer, one deck, and one round, with a
  deterministic tie-break and no server state.
- (+) The round boundary uses the record model's existing archive lifecycle.
- (−) A driver reload ends the live session; the room must start another.
- (−) Starting a round archives the previous dots; undo can bring them back into
  the new round, which is honest but needs a clear label.
- (−) The allowance is client-enforced; a modified client can exceed it.

**A server-owned room session**

- (+) The server is the single authority; a driver disconnect can be detected
  and transferred.
- (+) No awareness election and no clock-skew caveats.
- (−) A second protocol and room state for a property the relay already carries.
- (−) Local-only boards still need the awareness path, so the complexity buys
  only the server case.

**Opaque ballot keys**

- (+) Limits, one-per-object, and withdrawal work for anonymous participants.
- (+) No name or account id enters the durable file.
- (+) A named results view can use live awareness and then forget it.
- (−) A reload in a new tab is a new ballot; there is no cross-device identity.
- (−) A legacy empty-voter dot is not attributable and can only be cleared.

**Reading-order presentation**

- (+) Reuses the Frames panel's order and needs no schema field.
- (+) Moving a frame is the reorder gesture; there is one source of order.
- (−) A facilitator who wants a deck order unrelated to canvas position cannot
  express it in this phase.
- (−) Very large boards with scattered frames need a deliberate layout.

**A host badge overlay**

- (+) Counts can update and filter without touching canvas content or exports.
- (+) Hidden notes cannot leak a count through a badge.
- (−) Badges are not in exported images; a facilitator who exports a results
  board gets the dots' records, not the visual tally.
- (−) The overlay needs the same coordinate math as comments and must be tested
  at zoom and scroll extremes.

## More Information

- Evidence: [`miro-parity-matrix.md`](../research/miro-parity-matrix.md) rows
  33–38 and §Cluster map; [`miro-geometry.md`](../research/miro-geometry.md)
  §People bar internals (`60 × 40` trigger), §Panels, dialogs and popovers
  (`380 × 746` voting, `280 × 102` timer);
  [`miro-interactions.md`](../research/miro-interactions.md) §Facilitation:
  reactions, Timer, Voting, §Board bar and people bar.
- Current code: `packages/facilitation/src/` (`timer`, `voting`, `reveal`,
  `presentation`), `packages/doc/src/ephemeral.ts`,
  `apps/web/board/facilitator.ts`, `apps/web/board/facilitatorActions.ts`,
  `apps/web/board/presentation.ts`, `apps/web/components/FacilitatorBar.tsx`,
  `packages/board/src/sync.ts` (`revealState`, `presentationState`),
  `packages/schema/src/facilitation.ts`, and
  `apps/web/board/collabProvider.ts` (awareness transport and user names).
- Related ADRs: [`ADR-0032`](0032-shell-keyboard-model.md) (Escape ladder and
  palette), [`ADR-0033`](0033-the-two-context-menu-lanes.md) (object lane and
  the deferred presentation surface),
  [`ADR-0034`](0034-the-measured-geometry-as-tokens.md) (tokens and
  tolerances), [`ADR-0035`](0035-the-right-dock-and-its-panels.md) (the one
  right dock and the reserved `380` width),
  [`ADR-0037`](0037-share-links-are-server-capabilities.md) (roles and the
  server's write authority), [`ADR-0003`](0003-records-with-switchable-projections.md)
  (records, not element metadata), [`ADR-0005`](0005-indexeddb-via-idb-keyval.md)
  (local persistence).
- Plan: [`phase-5-facilitation.md`](../plans/phase-5-facilitation.md) §5.1–5.7
  and its verification list; [`phase-11-miro-parity.md`](../plans/phase-11-miro-parity.md)
  §11.2 C7.
- TRD: [`03-crdt-and-sync.md`](../trd/03-crdt-and-sync.md) §The ephemeral/durable
  split; [`04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) AC-8.
- Recon: Miro Business build `1.104717.0`, 19 October 2026, `1200 × 818` CSS.
  The facilitation menu, timer popover, and voting panel were opened and
  measured; Private mode's per-object flow, Notes, and the second voting footer
  control were not activated. Raw captures stay out of the repository; no Miro
  asset or content is copied.
