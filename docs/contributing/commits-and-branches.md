# Commits and branches

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Always releasable. Protected: CI green, no direct push |
| `phase-N-<slug>` | One branch per phase, per the [`../plans/`](../plans/) |
| `feature/<slug>` | Individual work within a phase |
| `fix/<slug>` | Bug fixes, from anywhere |

**Long-lived branches are fine and expected here.** A phase is a unit of work that may
take weeks, and the main branch should stay releasable rather than accumulating
half-finished phases.

## Commits

**We do not use conventional commits.** The reason for a decision lives in an ADR, not
in a commit message, so there is nothing for a commit-type prefix to disambiguate.

Write a message that answers **why**, not what. The diff already says what.

```
Fix the culling index going stale during fast drags

The spatial index was updated in an effect, which runs after paint. A drag
moving faster than one frame therefore queried an index that did not yet
contain the element's new position, and the element vanished for a frame.

Moving the update into the mutation itself removes the window entirely.

Elements no longer flicker when dragged at speed. Verified with the 10k-element
scene at 60fps.
```

Not:

```
fix: update spatial index in mutation instead of effect
```

**Reference the ADR** when a change implements or constrains one:

```
Add the record projection interface

Implements the interface described in ADR-0003. The board projection is the
first implementation; table and grid follow.

The purity test on layout() and the call-count test on applyChange() are the
two properties that matter, per the ADR's "Confirmation" section.
```

## Commit granularity

**One logical change per commit.** A commit that both refactors a module and changes
its behaviour is hard to review and harder to revert.

Refactoring and behaviour change are separate commits, even when they touch the same
files. This matters more than usual here, because the phase work is large and reviewers
are scarce.

## What not to commit

- Build output, `dist/`, `coverage/`
- Editor and OS files
- Lockfile churn unrelated to the change
- Screenshots in the repository — put them in the pull request
- Secrets, in any form, including `.env` with real values

## Pull requests

**Keep them small.** If a change is large, split it. A 2,000-line pull request gets a
shallow review, and a shallow review on a canvas renderer is how bugs ship.

**The description should state:**
1. What problem this solves
2. Which architectural invariant it touches, if any
3. How it was verified — the actual commands and their output, not "tests pass"
4. What is deliberately not done

**Reference the ADR** for anything that constrains the system. A change that constrains
the system and has no ADR will be asked for one.

## Before you open a pull request

```sh
yarn test:typecheck
yarn test
yarn test:update     # if rendering changed — read the diff
yarn fix
```

**Do not report work as done without running these and showing the output.** If you
could not run them, say so explicitly in the description. "I could not run the tests
because the fork has not landed" is a useful sentence; a claim of passing tests you
did not run is not.

## Releasing

Not yet — there is nothing to release. When there is:

- Version the file format independently of the application, and record the format
  version in `manifest.json`
- **Commit a format fixture on every release.** This is what makes
  [`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) AC-6 testable
  for future versions
- Tag the release, and note in the changelog whether the format changed
- A format change that breaks reading of older files is a **major** version, always
