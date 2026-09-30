---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# Keep Yarn v1 workspaces and Vite 5

## Context and Problem Statement

The Excalidraw fork uses **Yarn 1 classic workspaces**, **Vite 5** for the app,
**esbuild** for the packages, and **vitest** for tests. Yarn 1 is the oldest part of
the toolchain: it is slow, its workspace resolution is weak, and it is not what a
2026 project would choose from scratch.

We are already committed to diverging structurally
([ADR-0001](0001-fork-excalidraw-and-refactor-aggressively.md)), so there is a
reasonable argument for modernising the build while we are already touching
everything. pnpm workspaces plus Turborepo would give much faster installs and
incremental builds.

## Decision Drivers

- The fork must build and test the way upstream does, so that inherited code,
  configuration, and documentation stay valid without translation.
- A contributor arriving from Excalidraw should be able to run `yarn install && yarn start`.
- Tooling we keep is tooling we do not have to debug during a renderer rewrite.
- Fewer variables during the riskiest phase of the project.

## Considered Options

1. Keep Yarn 1 workspaces and Vite 5
2. Migrate to pnpm workspaces and Turborepo
3. Keep the tooling, reorganise the package layout
4. Keep Yarn 1, adopt Vite 6 or 7

## Decision Outcome

Chosen option: **1 — keep Yarn 1 classic workspaces and Vite 5, unchanged.**

We **do** reorganise the package layout into our own clean structure
([`../trd/01-stack-and-conventions.md`](../trd/01-stack-and-conventions.md)), because
that is a structural change we want, not a tooling change. Options 1 and 3 are
compatible and both are adopted.

Workspace versions stay **pinned exactly** (`"0.18.0"`, not `^0.18.0`), which is what
upstream does for deterministic resolution.

## Consequences

- (+) The fork builds and tests exactly as upstream does. Inherited CI configuration,
  test setup, and documentation are valid without translation.
- (+) `yarn install && yarn start` works for anyone who knows Excalidraw.
- (+) No tooling risk during the renderer rewrite. That is the phase where we can
  least afford a build system that surprises us.
- (-) **Slow installs.** Yarn 1 is materially slower than pnpm on a large dependency
  tree. This is a real daily cost.
- (-) Weak workspace tooling. No built-in constraint enforcement between packages;
  we enforce it in the build and CI instead.
- (-) Yarn 1 is in maintenance mode. Over a multi-year project this will get worse,
  and eventually the toolchain will need attention regardless.
- (-) No incremental build caching. Turborepo's caching would help, particularly for
  the renderer's large test suite.

## Confirmation

- `packageManager` is pinned to the upstream Yarn version. `yarn.lock` is committed
  and installed with `--frozen-lockfile`.
- Internal workspace dependencies are exact-pinned. A test or CI check fails on a
  range.
- The commands in [`../../AGENTS.md`](../../AGENTS.md) are the upstream commands,
  unchanged.

## Pros and Cons of the Options

### 2. pnpm workspaces and Turborepo

- (+) Much faster installs and incremental builds. Materially better for a large
  monorepo with a big test suite.
- (+) Better workspace isolation, which would help enforce package boundaries.
- (-) **Desynchronises us from upstream immediately**, even though we do not track
  upstream releases. Every inherited config file, CI workflow, and documentation
  snippet that references Yarn or a Vite plugin needs translating.
- (-) The package layout changes anyway
  ([`../trd/01-stack-and-conventions.md`](../trd/01-stack-and-conventions.md)), so we
  would be changing two things at once in the riskiest phase of the project.
- (-) Turborepo's own docs recommend **against** TypeScript project references,
  which is a sign of how much implicit complexity a monorepo tool adds.

### 3. Keep tooling, reorganise packages

- (+) The right change to make: our package structure should be ours.
- (-) If adopted *instead of* option 1 it implies a tooling change. It is adopted
  *alongside* option 1.
- (–) Reorganising during the fork makes the initial diff against upstream larger.
  Accepted, and the `NOTICE` file is what makes provenance clear rather than the
  diff.

### 4. Adopt a newer Vite

- (+) Current security patches and plugin compatibility.
- (+) Vite 6 and 7 are both supported.
- (-) Vite's plugin ecosystem is where Excalidraw's build actually lives
  (`vite-plugin-pwa`, `vite-plugin-checker`, `vite-plugin-sitemap`). A major version
  bump risks each of them.
- (-) Benefit deferred; cost immediate. Revisit in v2 if there is a security reason.

## More Information

- [Vite](https://vite.dev/) · [esbuild](https://esbuild.github.io/) · [vitest](https://vitest.dev/)
- [Turborepo on TypeScript project references](https://turborepo.dev/docs/guides/tools/typescript)
- [`../trd/01-stack-and-conventions.md`](../trd/01-stack-and-conventions.md) — the package layout
