# Excalidraw upstream analysis

Code-level analysis of `excalidraw/excalidraw@master`, researched 30 September 2026.
This is the evidence base for
[`../adr/0001-fork-excalidraw-and-refactor-aggressively.md`](../adr/0001-fork-excalidraw-and-refactor-aggressively.md)
and [`../adr/0002-yjs-as-concurrency-engine.md`](../adr/0002-yjs-as-concurrency-engine.md).

## Monorepo

Yarn **1.22.22** classic workspaces. `workspaces: ["excalidraw-app", "packages/*", "examples/*"]`.

| Package | Version | Licence | Published |
| --- | --- | --- | --- |
| `@excalidraw/common` | 0.18.0 | MIT | yes |
| `@excalidraw/math` | 0.18.0 | MIT | yes |
| `@excalidraw/element` | 0.18.0 | MIT | yes |
| `@excalidraw/excalidraw` | 0.18.0 | MIT | yes |
| `@excalidraw/utils` | 0.1.2 | MIT | yes |
| `@excalidraw/laser-pointer` | 1.3.1 | MIT | yes |
| `@excalidraw/fractional-indexing` | 3.3.0 | **CC0-1.0** | yes |
| `excalidraw-app` | 1.0.0 | inherits MIT | **no** — `private: true` |

Dependency direction: `common ← math ← element ← excalidraw`. Internal versions are
pinned **exactly** (`"0.18.0"`, not `^`) for deterministic resolution — we keep this.

`excalidraw-app` being unpublished matters: **the npm package does not include
collaboration, persistence, PWA, or share links.** Depending on the package gets us
less than forking. (`data/encryption.ts`, `data/encode.ts`, `data/json.ts` and
`data/library.ts` have since moved into the published package, so those primitives
are reusable.)

## Stack

| Concern | Choice |
| --- | --- |
| Build (app) | Vite 5.0.12 · `@vitejs/plugin-react` 3.1.0 |
| Build (packages) | esbuild 0.19.10 |
| Types | TypeScript 5.9.3 |
| Test | vitest 3.0.6, jsdom 22.1.0, `vitest-canvas-mock` 0.3.3, `fake-indexeddb` 3.1.7 |
| PWA | `vite-plugin-pwa` 0.21.1 |
| React | 19.0.0 (peer range `^17 \|\| ^18 \|\| ^19`) |
| State | **jotai 2.11.0** for UI; `AppState` in a class component for the editor |
| Drawing | roughjs 4.6.4, perfect-freehand 1.2.0, `points-on-curve` 1.0.1 |
| Rich text | CodeMirror 6 (`@codemirror/*`), `@lezer/highlight` |
| UI | radix-ui 1.4.3, SCSS with CSS custom properties |
| Other | pako 2.0.3, pica 7.1.1, browser-fs-access 0.38.0, nanoid 3.3.3, pwacompat 2.0.17, `png-chunk-*`, image-blob-reduce |

## The element schema

Everything lives in `packages/element/src/types.ts` — 14,954 bytes, the single most
important file to read before deciding what to reuse.

The base is `Readonly<>`, which is the reason the codebase needs branded wrapper types
(`ElementsMap`, `NonDeletedElementsMap`, `SceneElementsMap`, `Ordered<T>`) and the
casts that come with them.

**The three fields that matter to us:**

```ts
version: number          // "sequentially incremented on each change. Used to reconcile
                         //  elements during collaboration or when saving to server."
versionNonce: number     // "regenerated on each change. Used for deterministic
                         //  reconciliation of updates during collaboration, in case
                         //  the versions are identical."
index: FractionalIndex   // rocicorp fractional indexing string; z-order
```

`index` is the genuinely conflict-free part of their model — fractional indexing
**is** a CRDT for ordering. We keep all three.

**A trap worth recording:** `created` is explicitly documented as *not* a Lamport
clock — "client wall-clock creation; NOT in ElementUpdate" and "It is not an ordering
clock." Do not use it for conflict resolution.

**Mutation discipline:** two functions only.

- `mutateElement(element, updates)` — in place, for performance
- `newElementWith(element, updates)` — copy-based, for collab and history paths

Both produce an `ElementUpdate` and deliberately exclude `created`.

## The file format

```ts
interface ExportedDataState {
  type: string          // "excalidraw"
  version: number
  source: string        // "https://excalidraw.com"
  elements: readonly ExcalidrawElement[]
  appState: ReturnType<typeof cleanAppStateForExport>
  files: BinaryFiles | undefined
}
```

`serializeAsJSON(..., "local")` inlines files as base64 data URLs, so a `.excalidraw`
file is self-contained — and large, which is part of why elements do not fit in
`localStorage`. `"database"` mode strips files and hardens `appState`.

**Validation is permissive by design:**

```ts
data?.type === "excalidraw" &&
(!data.elements || (Array.isArray(data.elements) && (!data.appState || typeof data.appState === "object")))
```

### `restore.ts` — the most valuable inherited file

1,415 lines. The core primitive spreads the original first to preserve unknown keys,
then overwrites with normalised values:

```ts
const ret = { ...element, ...base, ...getNormalizedDimensions(base), ...extra }
delete ret.strokeSharpness      // remove legacy props only after migrating them
```

Migrations visible in the code: legacy `strokeSharpness: "round"` → `ROUNDNESS.LEGACY`;
legacy `boundElementIds: string[]` → `[{type:"arrow", id}]`; legacy
`font: "20px Virgil"` → `fontSize` + `fontFamily`; `lineHeight` back-derived from
`height`/`fontSize` via `detectLineHeight`.

Two behaviours worth knowing:

- **Deleted elements are retained** for `DELETED_ELEMENT_TIMEOUT = 24h`, with versions
  bumped rather than elements dropped.
- **Oversized lines are destroyed.** `handleOversizedLinearElements` with
  `MAX_LINEAR_PX = 75_000` deletes absurd lines that would freeze the editor — an
  explicit admission that the model has no size limit.

## Rendering

Two stacked canvases, plus an SVG path for export.

| File | Size | Role |
| --- | --- | --- |
| `renderer/staticScene.ts` | 545 lines | Elements, grid, frame clipping |
| `renderer/interactiveScene.ts` | 2,166 lines | Selection, handles, remote cursors, scrollbars |
| `renderer/staticSvgScene.ts` | 933 lines | SVG export |
| `element/renderElement.ts` | 41.6 KB | Canvas draw + per-element bitmap cache |
| `element/shape.ts` | 39.4 KB | roughjs / perfect-freehand generation + cache |
| `components/App.tsx` | **12,942 lines** | Everything else |

**`renderer/renderScene.ts` no longer exists** — it was split.

### The cache-key design

`Scene.triggerUpdate()` sets `sceneNonce = randomInteger()`. That nonce is the single
cache key driving both canvases, memoised against the viewport. The comment at
`Scene.ts:138` is candid: "Does not relate to elements versions, it's only a renderer
cache-invalidation nonce at the moment."

A `newElement.versionNonce` is folded into the key to handle a real bug: "A new
element being drag-sized is mutated in place without informing the scene."

This works, and it is undocumented and undebuggable. It is one of the things we
replace.

### Three caching layers

1. **`ShapeCache`** — `WeakMap<ExcalidrawElement, {shape, theme}>`. Keyed on object
   identity, so **copy-on-write mutation is what makes the cache work**. `null` is a
   valid cached value meaning "no rough shape for this type".
2. **`elementWithCanvasCache`** — `WeakMap<ExcalidrawElement, ExcalidrawElementWithCanvas>`,
   one offscreen canvas per element. Invalidate on zoom (unless
   `shouldCacheIgnoreZoom`), theme, crop, containing-frame opacity. Browser limits:
   `AREA_LIMIT = 16777216`, `WIDTH_HEIGHT_LIMIT = 32767`.
3. **The visible canvases.**

### roughjs

`generateRoughOptions` maps element state to roughjs options. `seed` is what makes a
shape stable across renders.

`adjustRoughness` scales roughness **down** for small shapes, keeping full roughness
only when `(minSize>=20 && maxSize>=50) || round-and-minSize>=15 || linear-and-maxSize>=50`;
otherwise `Math.min(roughness / (maxSize<10 ? 3 : 2), 2.5)`. This is why tiny shapes
do not look scribbly, and it is worth porting verbatim.

`roughness: 0` gives clean geometry — the standard clean-mode toggle.

### perfect-freehand

Two renderers, selected by `strokeOptions.variability`:

- **Variable** (the original look) — `perfect-freehand`'s `getStroke` with
  `easing: (t) => Math.sin((t * Math.PI) / 2)`. When `simulatePressure` is false,
  per-point pressure is injected as `[x, y, pressures[i]]`.
- **Constant** (newer) — `@excalidraw/laser-pointer`'s `LaserPointer` at fixed
  pressure 1. **This is why `laser-pointer` is a separately published package** — and
  it is the same renderer our facilitation laser pointer will use.

## Hit testing

`element/collision.ts`, 942 lines. Two tiers with an aggressive bail:

1. A single-entry result cache — stores `cachedHit`, `cachedThreshold`, a `WeakRef` to
   the element, reused only if `id`/`version`/`versionNonce` still match.
   **Threshold is monotonic:** a cached hit is valid for any larger threshold, a cached
   miss only for a threshold no larger than cached.
2. Frame-name rect test.
3. Coarse: `isPointInRotatedBounds(point, getElementBounds(...), angle, threshold + freedrawMaxStrokeRadius)`.
   The comment at the bail is: **"saves 99%"**.
4. Precise: `isPointInElement` or `isPointOnElementOutline`.

`shouldTestInside` returns `false` for arrows, so an arrow's bounding box is not
clickable. Port all of this verbatim.

## Collaboration — the surprise

**There is no Yjs.** `excalidraw-app/package.json` contains `socket.io-client@4.7.2`,
`firebase@11.3.1`, `idb-keyval@6.0.3`, and nothing else.

The merge algorithm is **118 lines** in `data/reconcile.ts`:

```ts
shouldDiscardRemoteElement = (localAppState, local, remote) =>
  local && (local.id === editingTextElement?.id
        || local.id === resizingElement?.id
        || local.id === newElement?.id
        || local.version > remote.version
        || (local.version === remote.version && local.versionNonce <= remote.versionNonce))
```

Then: iterate remote, keep local on discard, append remaining locals, `orderByFractionalIndex`,
`syncInvalidIndices`.

**Honest properties:**

- **Not a CRDT.** Per-element LWW with local-edit-wins exceptions. Two users editing
  *different properties of the same element* lose one edit. Two users creating
  independent elements concurrently is safe (union).
- Convergence is guaranteed by fractional indices plus a **20-second full-scene
  resync** as a divergence backstop. That is a mitigation, not a guarantee.
- Deterministic tie-break: on equal `version`, **lower `versionNonce` wins**.

Remote changes are applied with `captureUpdate: CaptureUpdateAction.NEVER`, so they
never enter local undo history. Worth copying.

**The wire protocol** (`app_constants.ts`) has two channels — `SERVER` (reliable) for
scene data and `SERVER_VOLATILE` (droppable) for cursors and idle state. `SERVER`
is right and we inherit the principle through Yjs awareness.

**The server** is [`excalidraw/excalidraw-room`](https://github.com/excalidraw/excalidraw-room)
(MIT): a dumb Socket.IO relay. All merge logic is client-side, which is why
self-hosting is easy today.

## E2EE

`data/encryption.ts`, 94 lines. WebCrypto AES-GCM. **128-bit symmetric key**
(`alg: "A128GCM"`), `extractable: true`, exported to a raw string, carried in the URL
fragment.

```ts
getCollaborationLink = ({roomId, roomKey}) =>
  `${location.origin}${location.pathname}#room=${roomId},${roomKey}`
```

The 22-character key length is asserted client-side — a cheap sanity check worth
copying.

**Properties:** no asymmetric handshake, no identity, no forward secrecy, no rotation,
**no revocation**. Anyone with the link has the key. Requires a secure context, so
`crypto.subtle` is unavailable over plain HTTP on non-localhost.

## Persistence

| Data | Store | Key |
| --- | --- | --- |
| elements | **localStorage** | `"excalidraw"` |
| appState | **localStorage** | `"excalidraw-state"` |
| image blobs | IndexedDB (`idb-keyval`) | fileId |
| library | IndexedDB | `"libraryData"` |
| collab username, theme | localStorage | — |
| TTD chats | IndexedDB | — |

**Elements in `localStorage` is the 5–10 MB ceiling** that
[ADR-0005](../adr/0005-indexeddb-via-idb-keyval.md) exists to fix.

`LocalData.save` is debounced 300 ms and **paused when `document.hidden`** or when a
`Locker` is held by collaboration. Quota errors set an atom that surfaces a UI warning —
correct, but it means the product fails for image-heavy boards.

Orphaned files are collected: unused and older than 24 hours are deleted, tracked by
`lastRetrieved`, which is rewritten on every load — so it is "last used on canvas",
not "last created".

**`tabSync.ts` is best-effort**, and the code says so: "before we use `storage` event
synchronization, let's update the flag optimistically. Hopefully nothing fails."
Two tabs editing the same board clobber each other. We will not inherit this.

## The imperative API

`ExcalidrawImperativeAPI` — the surface any host app uses.

Two observations that shaped our design:

1. **`onIncrement` distinguishes `DurableIncrement` from `EphemeralIncrement`.** That
   is exactly the ephemeral/durable split, already modelled, and underdocumented
   externally. We inherit and formalise it
   ([ADR-0002](../adr/0002-yjs-as-concurrency-engine.md)).
2. **There is no `serialize` method.** You build the payload yourself with
   `serializeAsJSON(elements, appState, files, "local")`.

Also relevant: `ui` and `interaction` props separate chrome from input, and
`updateScene({ captureUpdate: CaptureUpdateAction.NEVER })` is the mechanism for
applying remote state without polluting undo. We do not need the API — we own the
editor — but the design is sound.

## Unexplored

- **`element/delta.ts`, 70.5 KB.** `applyDeltas` is on the imperative API. A
  purpose-built incremental-update mechanism that may be directly relevant to sync.
  **The largest unexamined surface in the codebase.**
- **`packages/utils`** — geometry-to-path helpers (`getFreedrawShape`,
  `getClosedCurveShape`, `getCurveShape`, `getEllipseShape`, `getPolygonShape`).
  Relevant if shape generation is extracted.
- `element/bucketFill.ts`, 68.9 KB — flood fill.
- `element/linearElementEditor.ts`, 83.5 KB — polyline point editing.

## What to read before Phase 2

1. `packages/element/src/types.ts` — the schema
2. `packages/element/src/collision.ts` — hit testing
3. `packages/element/src/shape.ts` — roughjs and the freedraw renderers
4. `packages/element/src/renderElement.ts` — bitmap caching
5. `packages/excalidraw/data/restore.ts` — the migration pattern
6. `packages/excalidraw/data/reconcile.ts` — all 118 lines, to understand what we are
   replacing
7. `packages/element/src/delta.ts` — the unexamined surface
