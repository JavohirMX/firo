---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# Plain Markdown docs in docs/, separate from inherited dev-docs/

## Context and Problem Statement

The Excalidraw fork ships `dev-docs/`, a Docusaurus 2 site containing the JSON schema
documentation and the frames documentation. It builds with its own package.json and
its own dependency tree.

We need somewhere to put a product vision, a competitive analysis, a PRD, a TRD, an
ADR log, an architecture reference, phase plans, and research notes — none of which
upstream has, and all of which need to be read by contributors and by coding agents.

The question is whether to extend the Docusaurus site, build our own site, or use
plain Markdown.

## Decision Drivers

- Documentation must be readable **on GitHub**, without a build step, because that is
  where contributors arrive and where issues get discussed.
- Documentation must be **greppable and cheap for an agent to load**. A generated
  site adds indirection between a question and its answer.
- We should not add a documentation build to a project that does not have one yet.
- Upstream's `dev-docs/` should stay recognisable so that inherited content remains
  attributable and valid.

## Considered Options

1. Extend upstream's Docusaurus site
2. A separate docs site
3. Plain Markdown in `docs/`, no site
4. Plain Markdown only for our docs, `dev-docs/` left as inherited

## Decision Outcome

Chosen option: **3 with 4 — plain Markdown in `docs/`, no site generator.
`dev-docs/` is left as inherited and is not used for Firo documentation.**

Structure:

```
docs/
  index.md  vision.md  competitive.md  roadmap.md
  prd/  trd/  adr/  architecture/  plans/  research/  contributing/
```

The rationale for 4 over 1: `dev-docs/` is upstream's documentation about upstream's
code. We are diverging from that code
([ADR-0001](0001-fork-excalidraw-and-refactor-aggressively.md)). Documentation that
describes a renderer we have replaced is worse than no documentation, and mixing the
two in one Docusaurus sidebar makes it unclear which is which.

## Consequences

- (+) No build step. Every document renders on GitHub and is directly linkable.
- (+) Greppable and cheap for an agent to load. An agent reading `docs/trd/02-data-model.md`
  gets exactly that file, not a rendered site.
- (+) No documentation toolchain to maintain, in a project maintained by one person.
- (+) Inherited `dev-docs/` stays valid and attributable.
- (-) **No site search, no versioning of the docs, no nicer navigation.** Contributors
  navigate by directory structure and by the index.
- (-) No rendering of Mermaid diagrams, tables of contents anchors, or admonitions.
  Diagrams must be text or images committed to the repository.
- (-) `dev-docs/` will drift out of date as the code diverges, since we do not
  maintain it. This is accepted: it is inherited content about inherited code, and
  `AGENTS.md` points agents at `docs/` instead.
- (-) A public docs site is a genuine gap for a project that wants external
  contributors. Revisit when the project has users, not before.

## Confirmation

- No documentation build step exists in `package.json`.
- All documents are `.md` and render on GitHub.
- `docs/index.md` is the single entry point and lists everything else.
- An internal link check runs over `docs/`, `README.md`, and `CONTRIBUTING.md`
  ([`../../AGENTS.md`](../../AGENTS.md)).

## Pros and Cons of the Options

### 1. Extend upstream's Docusaurus site

- (+) Familiar to Excalidraw contributors.
- (+) Site search, navigation, and versioning.
- (+) A natural home for Mermaid diagrams and interactive examples.
- (-) **A build step and a separate dependency tree** for a documentation set that
  mostly consists of Markdown.
- (-) Documents are not readable on GitHub without the site, which is where
  contributors and issues actually are.
- (-) Mixing Firo's design documentation into a site about someone else's code is
  confusing.
- (-) Upstream's `dev-docs` has its own `package.json` and would need maintaining in
  step with the root.

### 2. A separate docs site

- (+) Full control, modern tooling.
- (-) A second thing to build and maintain, before the product exists.
- (-) Same GitHub-readability problem.
- (-) Defensible at v3, not now.

## More Information

- [Excalidraw `dev-docs`](https://github.com/excalidraw/excalidraw/tree/master/dev-docs)
- [`../trd/01-stack-and-conventions.md`](../trd/01-stack-and-conventions.md) — what we delete from upstream
