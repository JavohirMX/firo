# Contributing to Firo

Thanks for considering it. Firo is a solo project in its pre-alpha phase, so this
document is short and will change as the project grows.

## Read this first

Before proposing a feature, read [`docs/vision.md`](docs/vision.md). It contains
the **non-goals**, and they are load-bearing. A large fraction of "this tool should
also do X" requests are answered there.

If your idea is not in the non-goals and not on the roadmap, open an issue and
discuss it before writing code. If it *is* a listed non-goal and you think we are
wrong, say so in the issue — we would rather have the argument than the code.

## Status

Pre-alpha, and running. The Excalidraw fork builds, tests and starts; the Yjs
document model and the board bridge are wired into the app. See
[`docs/roadmap.md`](docs/roadmap.md) for what each phase actually means and
[`docs/plans/`](docs/plans) for per-phase status.

| Phase | State |
| --- | --- |
| 0 — Fork, rebrand, documentation | Done |
| 1 — Document model | Done |
| 2 — Renderer | Done — the rewrite was cancelled, the inherited renderer kept ([`ADR-0017`](docs/adr/0017-do-not-rewrite-the-renderer.md)) |
| 3 — Interaction | Largely inherited from the fork; the seam and accessibility remain |
| 4 — Miro objects and nesting | Sticky notes, frames, connectors and nesting exist; cards and sections do not |
| 5 — Facilitation | Not started |
| 6 — Records and projections | Record store built; projections not started |
| 7 — Persistence and formats | Autosave and single-file `.firo` export done; the directory container is not |
| 8 — Project layer | Not started |
| 9 — Sync server | Not started |
| 10 — AI, MCP, accessibility, desktop | Not started |

Contributions to early phases are far more valuable than contributions to late
ones, because the architecture is still cheap to change.

## How to help, in order of usefulness

1. **Find a bug in the plan.** The documents in `docs/` are the design. Reading them
   adversarially and finding an inconsistency is genuinely useful work.
2. **Write or improve tests** once the fork exists. The renderer rewrite (Phase 2) is
   the riskiest part of the project and the thinnest on test coverage.
3. **Prototype a single Phase 2 renderer technique** in an isolated spike: viewport
   culling, level-of-detail, or text-on-canvas measurement. Bring a result, not a
   vague plan.
4. **Improve accessibility.** Canvas applications are hard to make accessible and
   almost nobody does it properly. See
   [`docs/trd/09-accessibility.md`](docs/trd/09-accessibility.md).
5. **Write documentation** for anything you build. A feature without a document in
   `docs/` is not finished.

## Provenance and licensing rules

These are not optional and they are the most common way contributions get rejected.

Firo is a fork of [Excalidraw](https://github.com/excalidraw/excalidraw), MIT
licensed. See [`NOTICE`](NOTICE).

- **Every Excalidraw-derived file keeps its MIT copyright notice.** Do not strip
  headers, do not "clean up" attribution.
- **Do not reintroduce the Virgil font.** It ships in the upstream repository with
  no licence file. See
  [`docs/adr/0013-replace-the-virgil-font.md`](docs/adr/0013-replace-the-virgil-font.md).
- **Check the licence of every new dependency.** Permissive only (MIT, Apache-2.0,
  BSD, ISC, CC0). Copyleft and source-available licences are out — see
  [`ADR-0009`](docs/adr/0009-mit-licence-and-donation-funding.md) for why tldraw
  specifically cannot be a dependency.
- **Say where code came from.** If you port or copy from another project, name the
  origin in the pull request. We would rather have an honest fork than an
  unattributed one.
- **Do not use the words "Miro" or "Excalidraw" in product surfaces** — package
  names, UI copy, the file extension. They are active trademarks. Comparative
  documentation is fine.

## Upstream policy

We forked Excalidraw and are refactoring aggressively. We deliberately do **not**
track upstream releases
([`ADR-0001`](docs/adr/0001-fork-excalidraw-and-refactor-aggressively.md)).

Practical consequences for contributors:

- Do not open pull requests that "sync with upstream" or cherry-pick upstream fixes.
- Do not write code that tries to stay compatible with upstream's structure.
  Porting upstream *ideas* is welcome; preserving upstream *layout* is not a goal.
- The trade-off is real and we made it knowingly: we lose upstream bug fixes and
  improvements. If you think that decision was wrong, that is a legitimate thing to
  argue in an issue.

## Development setup

Once the fork lands (Phase 0):

```sh
git clone https://github.com/<org>/firo
cd firo
yarn install --frozen-lockfile
yarn start
```

We keep upstream's Yarn v1 workspaces and Vite 5 toolchain
([`ADR-0010`](docs/adr/0010-keep-upstream-tooling.md)) so that the fork builds the
way Excalidraw does.

## Working agreements

- [`docs/contributing/code-review.md`](docs/contributing/code-review.md)
- [`docs/contributing/commits-and-branches.md`](docs/contributing/commits-and-branches.md)
- [`docs/contributing/documentation.md`](docs/contributing/documentation.md)

## Reporting security issues

Do not open a public issue for a security vulnerability. Contact the maintainer
directly. We will credit you in the fix unless you would rather we did not.

## Code of conduct

Be decent. Assume good faith. Critique the work, never the person. Disagree
substantively and in detail, which is different from being abrasive.
