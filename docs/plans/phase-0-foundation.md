# Phase 0 — Fork, rebrand, documentation

**Goal:** a building, tested, correctly-licensed fork that we can develop on, with
the documentation in place.

This phase is mostly deletion and renaming. That is deliberate — everything it
removes makes the next phase's work smaller.

## Exit criterion

- `yarn install --frozen-lockfile && yarn start` runs a working editor
- `yarn test:typecheck && yarn test` pass
- The Excalidraw name, logo, URLs, analytics, and paid-product references are gone
- Virgil is absent from the repository and the build output
- `docs/` is navigable from the root `README.md`
- `NOTICE` accurately enumerates every derived file

## Tasks

### 0.1 — Fork and pin

```sh
git clone --depth 1 https://github.com/excalidraw/excalidraw firo
cd firo
git remote remove origin
git remote add origin <firo-origin>
```

**Record the exact upstream commit** in `NOTICE`. Without it, "derived from Excalidraw"
is not traceable and
[ADR-0001](../adr/0001-fork-excalidraw-and-refactor-aggressively.md) loses its
provenance anchor.

Bring in the `docs/` tree from this repository.

### 0.2 — Rebrand

| Change | Notes |
| --- | --- |
| Package names `@excalidraw/*` → `@firo/*` | The root `yarn.lock` must be regenerated |
| `excalidraw-app` → `apps/web` | Per the layout in [`../trd/01-stack-and-conventions.md`](../trd/01-stack-and-conventions.md) |
| `EXCALIDRAW_ASSET_PATH` → `FIRO_ASSET_PATH` | Set in `index.html` |
| `window.EXCALIDRAW` → `window.FIRO` | Embedded API |
| `.excalidraw` extension → `.firo` | Deliberate. "Excalidraw" is an active trademark |
| Logos, favicon, app icons, social preview | Replace all of them |
| Sentry, Vercel Analytics, any telemetry | **Delete.** NFR-3 |
| `COOKIES.AUTH_STATE_COOKIE`, `isExcalidrawPlusSignedUser` | **Delete.** Paid-product gating is not ours to carry |
| `excalidraw-assets` CDN references | **Delete.** No third-party origins |
| `source: "https://excalidraw.com"` in exported files | → `source: "firo"` |

**Do not** rename the internal `Excalidraw*` type names yet. They are pervasive and
renaming them creates a 10,000-line diff that makes the real Phase 1 work harder to
review. Rename in Phase 3, when we rewrite the surrounding code anyway.

### 0.3 — Delete

| Target | Reason |
| --- | --- |
| `excalidraw-app/data/firebase.ts` | External service. NFR-3 |
| `excalidraw-app/collab/` (`Collab.tsx`, `Portal.tsx`) | Replaced by Yjs ([ADR-0002](../adr/0002-yjs-as-concurrency-engine.md)) |
| `socket.io-client` dependency | Same |
| `excalidraw-app/ExcalidrawPlusIframeExport.tsx` | Their product |
| `excalidraw-app/data/TTDStorage.ts` | Upstream debugging tool, not a feature |
| Virgil font files | [ADR-0013](../adr/0013-replace-the-virgil-font.md) |
| `public/` brand assets | Replaced in 0.2 |

### 0.4 — Font replacement

**Blocking item.** Until resolved, ship the clean font stack with roughness 0 as the
default.

Evaluate the candidates in
[ADR-0013](../adr/0013-replace-the-virgil-font.md#decision-outcome) against five
criteria, of which the hardest is **legibility at 12 px with roughjs jitter**. Measure
rendered contrast; do not eyeball it.

Adapt the inherited font-subsetting machinery (`font-metadata.ts`,
`fonteditor-core`, `harfbuzzjs`) to the replacement.

### 0.5 — Documentation

Already written: `docs/`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `LICENSE`,
`NOTICE`.

Verify:

```sh
npx --yes markdown-link-check docs/**/*.md README.md CONTRIBUTING.md
grep -rniE '\b(TODO|FIXME|XXX|TBD)\b' docs/ README.md
```

### 0.6 — Provenance

Update `NOTICE` with the real file list, verified against the working tree rather
than from memory:

```sh
# Every file that still carries an Excalidraw copyright header
grep -rl "Copyright (c) 2020 Excalidraw" packages/ | sort
```

Every one of those files is a derived work. The list in `NOTICE` must match.

## Verification

```sh
yarn install --frozen-lockfile
yarn test:typecheck
yarn test
yarn build:app

# No Excalidraw branding in the build output
grep -ri "excalidraw" dist/ | grep -v "LICENSE\|NOTICE" | grep -v "Copyright"

# No Virgil
find dist/ -name "*.woff*" -o -name "*.ttf" | xargs -I{} sh -c \
  'echo "{}"; file "{}"'

# No telemetry endpoints
grep -rn "sentry\|google-analytics\|googletagmanager\|posthog" packages/ apps/
```

## Risks

| Risk | Mitigation |
| --- | --- |
| The `yarn.lock` regeneration cascades into unrelated changes | Commit the lockfile separately from everything else |
| A hidden Excalidraw branding reference survives | The `dist/` grep is the check; it is not optional |
| No legible licensed hand-drawn font exists | Ship the clean stack. The aesthetic is recoverable; a licence violation is not |
| Renaming packages breaks every import path | Do it in one mechanical commit, verified by a clean typecheck |
