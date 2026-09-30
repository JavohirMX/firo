# Documentation

## Rules

**Markdown only. No site generator, no build step**
([ADR-0011](../adr/0011-plain-markdown-docs.md)). Every document must render on
GitHub and be greppable by an agent.

1. **A feature without a document is not finished.** It is in the definition of done
   in [`../../AGENTS.md`](../../AGENTS.md).
2. **Link, do not restate.** A document that duplicates another will drift out of sync
   with it.
3. **State facts, not aspirations, in `trd/` and `adr/`.** Aspiration belongs in
   `vision.md` and the roadmap.
4. **Mark unverified claims inline.** If a claim about a third party could not be
   confirmed from a primary source, say so where the claim is made.
5. **Accepted ADRs are immutable.** To change a decision, write a new ADR that
   supersedes it. Never edit the old one.

## Where does it go

| Content | Location |
| --- | --- |
| What we are and are not building | [`../vision.md`](../vision.md) |
| Comparison with other products | [`../competitive.md`](../competitive.md) |
| What to build, for whom, done criteria | [`../prd/`](../prd/) |
| How it works | [`../trd/`](../trd/) |
| Why a decision was made | [`../adr/`](../adr/) |
| How the system fits together | [`../architecture/`](../architecture/) |
| What to do next | [`../plans/`](../plans/) |
| The evidence behind a decision | [`../research/`](../research/) |
| For humans, first | [`../../README.md`](../../README.md) |
| For agents | [`../../AGENTS.md`](../../AGENTS.md) |
| For contributors | [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) |

**The `trd` versus `architecture` distinction:** `trd/` is prescriptive — this is how
it must work, and why. `architecture/` is descriptive — this is how it does work.
When they disagree, `trd/` is correct and `architecture/` is a bug.

## Writing for agents

A large share of readers are coding agents loading one file to answer one question.

- **Put the answer near the top.** A decision buried in a long document is a decision
  that gets missed.
- **Use tables for anything enumerable.** They are cheap to scan and cheap to parse.
- **Link to the detail rather than inlining it.** One level of indirection costs a
  file read; a stale copy costs a bug.
- **Use imperative, testable language.** "Must not write outside `doc.commit()`" is
  checkable. "Be careful with the document" is not.

## Writing for humans

- Lead with the conclusion. Most readers want the answer, not the derivation.
- Prefer a table to a paragraph when there is a natural mapping.
- Cut a sentence that repeats another document. Link instead.
- **Do not describe unimplemented behaviour in the present tense.** The README says
  the project is pre-alpha; the other documents should not imply otherwise. Use
  "will" or "is designed to", and point at the phase.

## Style

- British or American spelling: pick one and be consistent. This project uses
  **British** ("behaviour", "colour", "licence" as a noun).
- "Licence" is the noun; "license" is the verb. Note that US spellings are correct in
  code and in proper nouns (`MIT License` in `LICENSE`).
- Sentence case for headings.
- No emoji in technical documents. They are fine in the README.
- Line length is not enforced. Readability is.

## Checking

Before committing documentation:

```sh
# Every internal link resolves
npx --yes markdown-link-check docs/**/*.md README.md CONTRIBUTING.md

# No leftover placeholders
grep -rniE '\b(TODO|FIXME|XXX|TBD)\b' docs/ README.md
```

**Check that no claim has drifted.** The most common documentation failure in this
project will be a table in `competitive.md` describing a competitor's pricing that
changed three months ago. Date-stamp research
([`../research/sources.md`](../research/sources.md) is dated) and re-verify before
relying on it.

## Adding a document

1. Put it in the right directory per the table above.
2. Add it to the index for that directory.
3. Link it from [`../index.md`](../index.md) if it is an entry point.
4. If it changes a decision, write an ADR rather than editing a document.
