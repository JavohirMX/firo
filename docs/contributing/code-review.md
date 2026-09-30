# Code review

## What we optimise for

**Correctness over cleverness, and legibility over brevity.** This is a canvas
application maintained largely by one person, where the failure modes are visual,
subtle, and expensive to diagnose. Code that is obviously correct beats code that is
elegantly clever, every time.

## Review priorities

In order. If time is short, review these first.

1. **Does it break an architectural invariant?** The four rules in
   [`../../AGENTS.md`](../../AGENTS.md) are the ones most likely to be broken by a
   well-meaning change.
2. **Is it correct at the edges?** Empty state, one element, ten thousand elements,
   zoom 0.1×, zoom 4000%, a rotated element whose bounds exceed its container, an
   element inside a collapsed container, a record with a deleted column.
3. **Is it correct offline?** No new network request, and no new assumption that
   something is loaded.
4. **Does it survive a save/load cycle?** Anything touching the schema.
5. **Is it operable from the keyboard?** Anything user-facing.
6. **Is there a test that would fail if this broke?** If not, that is the finding.

## What not to nitpick

- Formatting. Run `yarn fix`.
- Import order. The linter handles it.
- Naming that is not confusing. Do comment on names that mislead.
- Personal style preferences. If you would write it differently and it is not
  clearer, let it go.

## What to always raise

- A new dependency, especially one without a clear MIT/Apache/BSD/ISC/CC0 licence
  ([ADR-0009](../adr/0009-mit-licence-and-donation-funding.md))
- A schema change without a migration and a fixture test
- Code that writes to the Yjs document outside `doc.commit()`
- A string where a ProseMirror document belongs
- A new element type that could have been a record projection
- Anything that makes the renderer do work proportional to document size rather than
  viewport size
- Anything that sends data anywhere
- A silent failure path. Every error is visible.

## Performance review

The budgets are in
[`../prd/05-non-functional-requirements.md`](../prd/05-non-functional-requirements.md).
For any change that touches a hot path, ask:

- Is this O(viewport) or O(document)?
- Does it allocate in a loop? Miro reported 3× memory reduction from typed arrays
  alone.
- Does it invalidate more caches than it needs to?
- Does it run on pointer-move? If so, it belongs in awareness, not the document.

## Test review

- Does the test assert **behaviour**, or does it assert the implementation?
- Would it fail if the feature broke? A test that passes when the code is deleted is
  worse than no test.
- Is there a boundary case, or only the happy path?
- For rendering: is there a reference image, or only a behavioural assertion?
  `vitest-canvas-mock` tests behaviour, not appearance.

## Accessibility review

- Is every new control reachable by keyboard?
- Does it appear in the command palette?
- Is it in the accessibility tree, and does it have an accessible name?
- Does it work at 200% browser zoom and with OS text scaling?
- Does it respect the reduced-motion setting, not only the media query?
- Is state ever encoded in colour alone?

## Merging

- The CI check is `yarn test:typecheck && yarn test && yarn fix --check`. It must be
  green.
- **Run `yarn test:update` before committing.** Snapshot tests fail intentionally
  when rendering changes. Read the diff before accepting a new snapshot; a
  large unexplained snapshot change is a regression, not a test update.
- Squash-merge. A clean commit history matters more than a granular one for a project
  where the *reason* for a change is captured in an ADR rather than in the commits.
- Reference the ADR when a change implements or constrains one.
