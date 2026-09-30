---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# Record architecture decisions

## Context and Problem Statement

Firo is a fork of a 133,000-star project with 4,114 commits and roughly 500,000 lines
of TypeScript. We are about to diverge from it substantially. Six months from now,
nobody — including the maintainer — will remember *why* a particular structural
choice was made, or which alternatives were rejected and on what grounds.

The upstream project does not have this problem because it has not needed to make
choices against itself. We do, from the first commit.

## Decision Drivers

- A future contributor must be able to reconstruct the reasoning behind a structural
  choice without archaeology through git history.
- Decisions that constrain the whole system must be discoverable before someone
  violates them.
- The record must be cheap to write, or it will not be written.
- The record must be immutable once accepted, or it cannot be trusted.

## Considered Options

1. Git history and commit messages
2. A single `DECISIONS.md` file
3. Architecture decision records, one file per decision
4. No formal record; rely on documentation

## Decision Outcome

Chosen option: **3 — ADRs, one file per decision, in `docs/adr/`**, using
[MADR](https://adr.github.io/madr/) 4.0 format.

Accepted ADRs are **immutable**. A decision that changes is superseded by a new ADR
that names its predecessor. The old file is never edited.

**ADR 0000 is this decision**, following the convention that `adr init` generates.

## Consequences

- (+) Reasoning is preserved over time, not just the outcome.
- (+) A new contributor has one place to look for "why is it like this".
- (+) A superseding chain shows how the design evolved, which is more useful than a
  snapshot of where it ended up.
- (-) Writing an ADR is overhead on every significant decision.
- (-) Accepted ADRs that turn out to be wrong remain in the repository forever. This
  is intended, and is the reason immutability is the rule.
- (~) The set rots unless it is linked from `AGENTS.md` and from the docs index. Both
  are maintained for exactly this reason.

## Confirmation

Every significant architectural decision has an ADR file in `docs/adr/` and an entry
in [`index.md`](index.md). The index is checked as part of the documentation review.

## Pros and Cons of the Options

### 1. Git history

- (+) Already exists, zero overhead.
- (-) `git log` gives you *what* changed, never *why*. The reasoning is in commit
  messages and PR discussion, both of which are lossy and unsearchable in the way we
  need.
- (-) Six months on, a `git blame` on a design decision is a research project.

### 2. A single DECISIONS.md

- (+) One file, easy to read top to bottom.
- (-) Becomes unmaintainable past a dozen decisions.
- (-) Cannot be superseded without rewriting history in place, which destroys the
  chain.

### 4. No formal record

- (+) Zero overhead.
- (-) Every major decision becomes tribal knowledge.
- (-) The four architectural rules in `AGENTS.md` have no stated justification, and
  they are exactly the rules most likely to be violated by someone who does not
  understand why they exist.

## More Information

- [Michael Nygard, *Documenting Architecture Decisions*](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions.html) — the original article that popularised the format
- [MADR specification](https://adr.github.io/madr/)
