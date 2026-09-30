# Firo documentation

## Reading order

If you are new, read these four in sequence. They take about forty minutes and
they are the whole design.

1. **[`vision.md`](vision.md)** — the problem, the thesis, and what we refuse to build
2. **[`competitive.md`](competitive.md)** — how Firo compares to Miro, Excalidraw, Weje, tldraw and AFFiNE
3. **[`prd/`](prd/)** — what we build, for whom, and what "done" means
4. **[`trd/`](trd/)** — how it works

Then, as needed:

| Directory | Contents |
| --- | --- |
| [`prd/`](prd/) | Product requirements: personas, scope, feature specifications, acceptance criteria |
| [`trd/`](trd/) | Technical requirements: data model, sync, rendering, text, storage, security, accessibility |
| [`adr/`](adr/) | Architecture decision records. One file per decision, in MADR format |
| [`architecture/`](architecture/) | Descriptive documentation of how the system fits together |
| [`plans/`](plans/) | Phase-by-phase implementation plans with exit criteria |
| [`research/`](research/) | The source research the decisions are based on, with citations |
| [`contributing/`](contributing/) | How we work together |
| [`roadmap.md`](roadmap.md) | Phases, milestones, exit criteria |

## The one-page version

Firo is a free, MIT-licensed, local-first infinite canvas. It is a Miro replacement
with Excalidraw's hand-drawn aesthetic and Weje's low-clutter discipline.

Four ideas carry the product:

- **Local-first.** Boards live on your machine. No account, no network, no server
  required. Collaboration is optional, never a prerequisite.
- **One data set, many views.** A task exists once and is viewed as a table, a
  board, a grid, or a timeline.
- **Anything can hold anything.** Any object is a container; containers nest to any
  depth.
- **Green information.** Information stays live on one surface. We do not build a
  second status table to keep in sync.

## How decisions are made

Every significant decision gets an ADR in [`adr/`](adr/) recording context,
options considered, the decision, and consequences. Accepted ADRs are immutable —
to change one, write a new ADR that supersedes it.

The decisions that shaped everything else:

| ADR | Decision |
| --- | --- |
| [0001](adr/0001-fork-excalidraw-and-refactor-aggressively.md) | Fork Excalidraw; refactor aggressively; stop tracking upstream |
| [0002](adr/0002-yjs-as-concurrency-engine.md) | Yjs as the concurrency engine, from day one |
| [0003](adr/0003-records-with-switchable-projections.md) | One record store with switchable projections |
| [0004](adr/0004-prosemirror-for-rich-text.md) | ProseMirror for all rich text |
| [0005](adr/0005-indexeddb-via-idb-keyval.md) | IndexedDB via idb-keyval for local persistence |
| [0006](adr/0006-one-board-unlimited-frames.md) | One board, unlimited frames |
| [0007](adr/0007-arbitrary-container-nesting.md) | Arbitrary container nesting |
| [0008](adr/0008-local-accounts-on-self-hosted-server.md) | Local accounts on the self-hosted server |
| [0009](adr/0009-mit-licence-and-donation-funding.md) | MIT licence, free forever, donations only |
| [0010](adr/0010-keep-upstream-tooling.md) | Keep Yarn v1 workspaces and Vite 5 |
| [0011](adr/0011-plain-markdown-docs.md) | Plain Markdown docs, separate from inherited `dev-docs/` |
| [0012](adr/0012-no-ai-in-v1.md) | No AI in version 1 |
| [0013](adr/0013-replace-the-virgil-font.md) | Replace the Virgil font |

## Document conventions

- **Markdown only.** No site generator, no build step. Every document must render
  legibly on GitHub and be greppable by an agent.
- **State facts, not aspirations, in `trd/` and `adr/`.** Aspiration belongs in
  `vision.md` and the roadmap.
- **Mark unverified claims.** If a claim about a third party could not be
  confirmed from a primary source, say so inline.
- **Link, do not restate.** A document that duplicates another document will drift
  out of sync with it.

## Repository records

These live at the repository root, not under `docs/`, because they are legal
records rather than design documents.

| File | What it is |
| --- | --- |
| [`NOTICE`](../NOTICE) | Provenance. The exact upstream commit, a map of where Excalidraw code now lives, and the retained dependencies |
| [`FONT-LICENSES.md`](../FONT-LICENSES.md) | Per-font licence audit. **Incomplete — a release blocker.** See [ADR-0014](adr/0014-font-position-after-phase-0.md) |
| [`LICENSE`](../LICENSE) | MIT, with the Excalidraw notice embedded. Never alter it |
