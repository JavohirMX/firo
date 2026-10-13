# Phase 5 — Facilitation

**Status: Complete and demonstrated.** Implemented in `@firo/facilitation` and `apps/web/board/`.

**Goal:** the loop that Miro charges $8 per person per month for, free.

## Why this phase matters more than its size suggests

Miro gates **everything** in this section behind Starter: voting, timer, private mode, anonymous participation, presentation mode, facilitation controls, and watermarked-free export. A team that cannot run a workshop is not using Miro for what Miro is for.

And Weje has **none of it**. There is no `vote` or `poll` object type anywhere in its source despite marketing GIFs, and no timer. On-board chat was removed for low usage.

**This is the cleanest uncontested ground we have.** It is also mostly UI plus small amounts of state, so it is a good phase to do well rather than quickly.

## Exit criterion

- Dot voting: place, change, remove; anonymous or named; private until revealed
- Timer: start, pause, reset, adjust; a facilitator change propagates to everyone
- Private/reveal mode: hide content until revealed; hides anchoring in a brainstorm
- Reactions: emoji on an element
- Presentation mode: frames become slides, navigable, with a laser pointer and per-object `hideInPresentation`
- **Everything keyboard-operable** — voting in particular, since a facilitator collecting votes by hand defeats the purpose
- All facilitation state survives a save/load cycle

## Tasks

### 5.1 — Dot voting

Place N votes on any element. Anonymous or named. Private until the facilitator reveals.

**Edge cases that are the actual work:**

- **Changing a vote must move a dot, not accumulate one.** This is the bug every voting implementation has.
- Votes must survive save/load, including votes on objects inside collapsed containers.
- A vote on a deleted object is deleted, or becomes a tombstone — decided explicitly, not by accident.
- In single-player v1, "anonymous" is meaningless. Say so in the UI rather than offering a mode that does not work. It becomes real in v2.

**Model votes as a special column on the record store**, not as element metadata. That way a vote is queryable and appears in a table view — which is the point of [ADR-0003](../adr/0003-records-with-switchable-projections.md).

### 5.2 — Timer

A shared countdown. Start, pause, reset, adjust. A facilitator can force a duration change for everyone.

**Timer state is ephemeral and board-level.** It is never persisted beyond the session and never enters the document. This is rule 1 in [`../../AGENTS.md`](../../AGENTS.md) — a per-second countdown in the Yjs document would be a miniature version of the drag problem.

### 5.3 — Private and reveal mode

Hide content authored after a point in time, or hide selected content, until the facilitator reveals.

This is how a brainstorm avoids anchoring: everyone writes privately, then everything is revealed at once. It is the single most-used facilitation feature in practice and Miro charges for it.

**Implementation:** a board-level ephemeral reveal state plus a per-element `hiddenUntilRevealed` flag on the durable side. The flag is document state; the reveal toggle is session state.

### 5.4 — Reactions

Emoji on an element. In single-player v1 this is a personal reaction set. It becomes a shared set with presence in v2.

### 5.5 — Presentation mode

Frames become slides, in frame order ([ADR-0006](../adr/0006-one-board-unlimited-frames.md)). Navigate, present, follow-me (the v2 part), and a laser pointer.

**`hideInPresentation` per object** so scaffolding can be hidden from the audience. Weje has exactly this and it is a small thing that makes presentation mode usable.

The laser pointer uses Excalidraw's constant-width freedraw renderer (`@excalidraw/laser-pointer`, MIT), which is why that is a separate published package upstream.

### 5.6 — Attention management

Follow a collaborator's viewport, "bring user to me", "bring everyone to me".

**Single-player v1 has only the laser pointer.** The rest requires presence and is v2. Do not build a UI for it now.

### 5.7 — Keyboard operation

**Voting must be fully keyboard-operable.** A facilitator walking a room cannot pick up a mouse to cast each vote, and a participant using a screen reader cannot vote at all if it is pointer-only.

This is a hard requirement, not an enhancement.

## Verification

- Changing a vote moves a dot; the total never exceeds the allowance
- A vote on an object inside a collapsed container still counts
- Votes and reveal flags survive save/load
- **A five-minute timer does not produce a single Yjs document update** — it is ephemeral, and this is testable
- Presentation mode enumerates frames in frame order and honours `hideInPresentation`
- **A full workshop is completable on the keyboard alone, voting included**
- Screen reader announces vote counts and timer state through a polite live region, not on every tick

## Risks

| Risk | Mitigation |
| --- | --- |
| Timer state leaks into the document | Explicit test: five minutes of timer produces zero document updates |
| Private mode leaks content through a thumbnail or export | Private-mode content must be excluded from exports while hidden. Test it |
| Facilitation features read as gimmicks without good empty states | Design the states first; a vote with no votes should invite the first one |
| Scope creep into video calls and screen sharing | These are on the never-list in [`../vision.md`](../vision.md) |
