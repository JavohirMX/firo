---
status: accepted
date: 2026-09-30
deciders: maintainer
supersedes: ADR-0011 (partially — the `dev-docs/` clause only)
---

# Delete `dev-docs/`

## Context and Problem Statement

[ADR-0011](0011-plain-markdown-docs.md) decided that Firo's own documentation
would be plain Markdown under `docs/`, and that upstream's `dev-docs/` would be
"left as inherited and not used for Firo documentation".

The intent was reasonable: it avoided spending Phase 0 rewriting somebody else's
documentation. The plan named a cost too — `dev-docs/` "will drift out of date"
— and Phase 0 is where that cost landed.

`dev-docs/` is a Docusaurus site documenting the **npm package
`@excalidraw/excalidraw`**. Phase 0 renamed that package to `@firo/editor`, so
after the rebrand the site was not merely stale but **actively wrong**: it
described an API under a name that no longer exists, and its live examples
imported `@excalidraw/excalidraw` from a project that no longer provides it.

It was 1.9 MB across 11 files, containing 39 references to a package name the
repository had just eliminated.

## Decision Drivers

- A documentation site that documents a non-existent package is worse than no
  documentation. It costs a reader time and it is confident while being wrong.
- The site is not built or tested by us: it is not in the root workspaces and
  not in CI. It was already unmaintained infrastructure.
- It documented a library that Phase 2 replaces wholesale, so any content
  migration would be work thrown away within two phases.
- The useful knowledge in it — the scene JSON schema, the frame semantics — is
  already covered by Firo's own
  [`../trd/02-data-model.md`](../trd/02-data-model.md) and
  [`../trd/07-persistence-and-formats.md`](../trd/07-persistence-and-formats.md),
  which are written against the format Firo will actually ship.

## Considered Options

1. Leave it as inherited, as ADR-0011 said
2. Update its package references so it stays useful
3. Delete it
4. Keep it but add a prominent "this is upstream's, out of date" banner

## Decision Outcome

**Option 3 — delete it.**

The rest of ADR-0011 stands without change: Firo's documentation is plain
Markdown under `docs/`, hand-maintained, deliberately not prettier-formatted, and
it is the only documentation a contributor is expected to read.

Option 2 was rejected because it converts inherited material into Firo
documentation, which is the outcome ADR-0011 was written to avoid — and it would
be documentation of an API scheduled for replacement in Phase 2. Option 4 was
rejected as a half-measure: a banner does not stop a reader trusting the code
samples underneath it.

## Consequences

- (+) One documentation system, and it is correct. No reader can land on a page
  describing an API we removed.
- (+) 1.9 MB and 11 files of dead weight gone, including a Docusaurus
  installation, a Babel config and a second lockfile.
- (+) The one place in the repository that could still reintroduce
  `@excalidraw/excalidraw` is gone, which makes the "no Excalidraw" invariant
  cheap to verify.
- (-) The provenance chain for inherited decisions is weaker. If someone later
  wants to know *why* upstream shaped a particular file, that context is gone
  from the tree.
  Mitigation: the upstream commit hash is recorded in
  [`../../NOTICE`](../../NOTICE), and we deliberately do not merge upstream, so
  the fork point is always re-fetchable with `git fetch` and `git show`.
- (-) Any API documentation for `@firo/editor` as an embeddable library has to
  be written fresh. It is not a v1 deliverable — v1 is the self-hosted app — so
  this is correctly deferred.

## Confirmation

- [x] `dev-docs/` does not exist in the repository.
- [x] `NOTICE` records the upstream commit hash, so the fork point is
      reconstructible.
- [x] No file in the repository references `@excalidraw/excalidraw` except the
      two third-party `@excalidraw/*` packages that genuinely still exist.

## More Information

- [ADR-0011](0011-plain-markdown-docs.md) — the original decision
- [`../contributing/documentation.md`](../contributing/documentation.md) — how to
  write Firo's documentation
- [`../../NOTICE`](../../NOTICE) — provenance and the upstream commit
