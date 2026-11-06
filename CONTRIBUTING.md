# Contributing to Firo

Thanks for considering it. Firo is a solo project in its pre-alpha phase, so this document is short and will change as the project grows.

## Read this first

Before proposing a feature, read [`docs/vision.md`](docs/vision.md). It contains the **non-goals**, and they are load-bearing. A large fraction of "this tool should also do X" requests are answered there.

If your idea is not in the non-goals and not on the roadmap, open an issue and discuss it before writing code. If it _is_ a listed non-goal and you think we are wrong, say so in the issue — we would rather have the argument than the code.

## Status

Pre-alpha, and running. The web app, document model, records/projections, facilitation tools and optional sync server are implemented. Coverage and limitations vary by feature. Use the [parity matrix](docs/research/miro-parity-matrix.md) for current evidence; older phase plans describe design intent, not a release checklist.

## How to help

- Report reproducible bugs with a minimal synthetic board, browser and commit.
- Add regression tests, especially for role permissions, persistence and imports.
- Improve keyboard and screen-reader access. See the [accessibility specification](docs/trd/09-accessibility.md).
- Improve documentation when setup or behavior does not match the code.
- Discuss schema, sync protocol and other large changes before implementation.

## Provenance and licensing rules

These are not optional and they are the most common way contributions get rejected.

Firo is a fork of [Excalidraw](https://github.com/excalidraw/excalidraw), MIT licensed. See [`NOTICE`](NOTICE).

- **Every Excalidraw-derived file keeps its MIT copyright notice.** Do not strip headers, do not "clean up" attribution.
- **Do not reintroduce the Virgil font.** It ships in the upstream repository with no licence file. See [`docs/adr/0013-replace-the-virgil-font.md`](docs/adr/0013-replace-the-virgil-font.md).
- **Check the licence of every new dependency.** Permissive only (MIT, Apache-2.0, BSD, ISC, CC0). Copyleft and source-available licences are out — see [`ADR-0009`](docs/adr/0009-mit-licence-and-donation-funding.md) for why tldraw specifically cannot be a dependency.
- **Say where code came from.** If you port or copy from another project, name the origin in the pull request. We would rather have an honest fork than an unattributed one.
- **Do not use the words "Miro" or "Excalidraw" in product surfaces** — package names, UI copy, the file extension. They are active trademarks. Comparative documentation is fine.

## Upstream policy

We forked Excalidraw and are refactoring aggressively. We deliberately do **not** track upstream releases ([`ADR-0001`](docs/adr/0001-fork-excalidraw-and-refactor-aggressively.md)).

Practical consequences for contributors:

- Do not open pull requests that "sync with upstream" or cherry-pick upstream fixes.
- Do not write code that tries to stay compatible with upstream's structure. Porting upstream _ideas_ is welcome; preserving upstream _layout_ is not a goal.
- The trade-off is real and we made it knowingly: we lose upstream bug fixes and improvements. If you think that decision was wrong, that is a legitimate thing to argue in an issue.

## Development setup

Follow the [README quickstart](README.md#get-started) for the current Node and Yarn versions and web-app startup. The checks are listed under [Develop and contribute](README.md#develop-and-contribute). The web dev server and collaboration server are separate; [self-hosting](docs/hosting.md) runs the combined app from source with Docker Compose.

We use Yarn Classic workspaces and Vite. Do not upgrade the package manager or regenerate the lockfile as part of an unrelated change.

## Working agreements

- [`docs/contributing/code-review.md`](docs/contributing/code-review.md)
- [`docs/contributing/commits-and-branches.md`](docs/contributing/commits-and-branches.md)
- [`docs/contributing/documentation.md`](docs/contributing/documentation.md)

## Reporting security issues

Do not open a public issue for a security vulnerability. Contact the maintainer directly. We will credit you in the fix unless you would rather we did not.

## Code of conduct

Be decent. Assume good faith. Critique the work, never the person. Disagree substantively and in detail, which is different from being abrasive.
