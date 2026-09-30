---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# Arbitrary container nesting

## Context and Problem Statement

Most whiteboards have a fixed taxonomy: a sticky note cannot contain a shape, a
frame cannot go inside a card, and structure must be created by choosing from a menu
of types.

Weje does not. From its own documentation:

> "Create infinite number of cards and lists on your boards… Arrange lists anyhow you
> like — up, down, left, right, in, or inside-out."

and:

> "I really like the concept of the boxes, to be able to nest them and combine them
> together."

In Weje, cards and lists are arbitrarily nestable containers. Any selection can be
grouped into a list with `Ctrl+G`; a list can contain lists, and boards. Collapse and
expand with `Space`. Ordering within a container is fractional-index
(`generateSort` computes `(before + closest)/2`).

**This is the single best idea in Weje**, and it converged independently with
Excalidraw's fractional indexing — two unrelated implementations arriving at the same
primitive is a good signal.

Our education persona
([`../prd/01-personas.md`](../prd/01-personas.md)) needs this most: a fourteen-year-old
contributing to a board should not have to learn a type system.

## Decision Drivers

- Structure should emerge from arrangement, not from a schema the user learned first.
- A board should be able to be a brainstorm and a plan without changing tools.
- Nesting depth must be effectively unbounded so no user hits a wall.
- It must not conflict with the record store
  ([ADR-0003](0003-records-with-switchable-projections.md)).

## Considered Options

1. Arbitrary nesting, any container in any container
2. A fixed containment hierarchy (frame > section > card > list)
3. Nesting for cards only, as Weje
4. No nesting; structure through grouping and frames alone

## Decision Outcome

Chosen option: **1 — arbitrary container nesting.**

Any element can become a container. Containers nest to any depth. The implementation
is a single `containerId: string | null` field on the element base, plus
fractional-index ordering within each container. There is no nesting-specific type
system.

**Containers:** `card`, `frame`, `section`, and any shape promoted to one.
**Not a container:** `stickynote`. A sticky note that needs to hold other sticky
notes becomes a `section` with a note's styling.

Promotion is a type change, and therefore a schema migration
([`../trd/02-data-model.md`](../trd/02-data-model.md)).

## Consequences

- (+) A board can hold a brainstorm, a plan, and an archive in one surface, which is
  what "green information" requires.
- (+) One mechanism, not several. No per-type containment rules to learn, document, or
  test.
- (+) It is the feature Weje has and neither Excalidraw nor Miro has, and it costs
  one nullable field.
- (-) **Deep nesting is a UX problem we cannot fully solve.** The model is unbounded;
  the interface should discourage more than about four levels without forbidding it.
- (-) **Deleting a container is a data-loss decision.** Delete the children, or
  re-parent them? This must be an explicit user choice, never a default (AC-10).
- (-) Transform maths get harder: a child of a rotated, nested, scaled container
  needs a composed transform, not a single offset. This touches bounds, hit testing,
  and the culler.
- (-) **A record rendered inside a container must not become a child of it.** A card
  projecting a task that happens to sit inside a frame is not owned by that frame.
  This distinction is easy to lose and expensive to debug.
- (-) Deeply nested elements are expensive to hit-test and cull, and a bug there
  presents as "elements cannot be selected inside groups", which is a bad bug to
  have.

## Confirmation

- AC-4 in [`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md):
  three levels of nesting, collapse and expand, move-with-parent, undo and redo at
  each step, and no combination of container types producing an error.
- A test asserts that a card whose `recordId` is set and which is placed inside a
  frame is **not** deleted when the frame is deleted with "re-parent children"
  selected.
- A test asserts the composed transform for a child of a rotated, nested container
  matches a hand-computed value.

## Pros and Cons of the Options

### 2. A fixed containment hierarchy

- (+) Fewer states to reason about; the UI can assume a shallow tree.
- (+) Simpler transform maths.
- (-) **The user hits a wall.** "I want to put this list inside that card inside that
  frame" would be impossible, and it is a request we know people make.
- (-) Requires a fixed taxonomy to be designed up front, which is the anti-pattern
  Weje explicitly identified.

### 3. Nesting for cards only, as Weje

- (+) Proven, and simpler than fully arbitrary nesting.
- (+) Captures most of the value — the card/list nestable container is the common case.
- (-) Leaves a mixed taxonomy: cards nest, frames do not. Inconsistent, and the
  inconsistency is arbitrary rather than principled.
- (-) A sticky note still cannot hold a card, which is the case a teacher hits first.

### 4. No nesting

- (+) Simplest model; grouping and frames provide structure.
- (-) **Forces a choice between freeform and organised**, which is precisely the
  choice Firo exists to remove.
- (-) Our education persona cannot use it.

## More Information

- [Weje — how to work with lists](https://weje.io/knowledgebase/how-to-work-with-lists)
- [Weje — how to group objects on a board](https://weje.io/knowledgebase/how-to-group-objects-on-a-board)
- [`../competitive.md`](../competitive.md) §4 — what we take from Weje, and what we do not
- [`../prd/03-feature-specifications.md`](../prd/03-feature-specifications.md) — FR-16
