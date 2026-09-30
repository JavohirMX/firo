# Stack and conventions

## Runtime

| Layer | Choice | Version | Source |
| --- | --- | --- | --- |
| Language | TypeScript | 5.9.3 | Inherited |
| UI | React | 19.0.0 | Inherited |
| State (UI) | jotai | 2.11.0 | Inherited |
| State (document) | **Yjs** | current | **New** — [`ADR-0002`](../adr/0002-yjs-as-concurrency-engine.md) |
| Rich text | **ProseMirror** | current | **New** — [`ADR-0004`](../adr/0004-prosemirror-for-rich-text.md) |
| Drawing | roughjs + perfect-freehand | 4.6.4 / 1.2.0 | Inherited |
| UI primitives | radix-ui | 1.4.3 | Inherited |
| Persistence | **idb-keyval** | 6.0.3 | Inherited from upstream; now the primary store — [`ADR-0005`](../adr/0005-indexeddb-via-idb-keyval.md) |
| Spatial index | **rbush** | 3.x | **New** — [`04-rendering.md`](04-rendering.md) |
| Build (app) | Vite | 5.0.12 | Inherited — [`ADR-0010`](../adr/0010-keep-upstream-tooling.md) |
| Build (packages) | esbuild | 0.19.10 | Inherited |
| Types | tsc → `.d.ts` | — | Inherited |
| Test | vitest + jsdom + vitest-canvas-mock | 3.0.6 | Inherited |
| PWA | vite-plugin-pwa | 0.21.1 | Inherited |
| Server (v2) | Node + `ws` | — | New — [`08-server-and-auth.md`](08-server-and-auth.md) |

**Package manager: Yarn 1 classic workspaces.** We keep this deliberately. It is
the oldest part of the toolchain and the least pleasant, and switching to pnpm and
Turborepo would gain faster installs while desynchronising us from upstream for no
benefit, since we have already decided not to track upstream
([`ADR-0010`](../adr/0010-keep-upstream-tooling.md)).

**Workspace versions are pinned exactly.** Upstream uses `"0.18.0"`, not
`^0.18.0`, for internal dependencies so resolution is deterministic. Keep it.

## Package layout

```
packages/
  geometry/     from @excalidraw/math    — pure maths, branded types
  common/       from @excalidraw/common  — constants, colours, utility types, events
  schema/       NEW  element + record schema, typed, with migrations
  doc/          NEW  the Yjs document — single source of truth
  render/       NEW  canvas renderer, culling, LOD, caches
  interact/     NEW  pointer/keyboard state machine, selection, tools
  text/         NEW  ProseMirror integration
  records/      NEW  collections, typed columns, projection interface
  storage/      NEW  IndexedDB, file format, import/export
  sync/         NEW  Yjs providers (v1 local, v2 websocket)
  ui/           NEW  our panels, dialogs, and chrome
apps/
  web/              the PWA
  server/       v2  the optional self-host sync server
```

Dependency direction is one-way and enforced by the build:

```
geometry ← common ← schema ← doc ← render ← interact ← ui
                  ↘         ↘      ↘
                   text    records  storage ← sync
```

A circular import **fails CI**. This matters more than usual here, because the
inherited Excalidraw packages are not cleanly layered and it would be easy to
reintroduce the coupling we are removing.

## Type system conventions

**Branded types for anything spatial.** Inherited from `@excalidraw/math` and
non-negotiable — passing a `LocalPoint` where a `GlobalPoint` belongs is a real bug
class, not a style preference.

```ts
import { GlobalPoint, LocalPoint, Radians } from "@firo/geometry"
```

**No `any` in our own packages.** Upstream's element types are heavily branded and
require casts; we do not extend that pattern.

**Discriminated unions for elements and records**, not optional fields. Adding a
field to a union member is a schema migration; adding an optional field to an
interface is a silent behaviour change.

```ts
// Yes
type FiroElement =
  | StickyNoteElement
  | CardElement
  | FrameElement
  | ShapeElement
  | LinearElement
  | TextElement
  | ImageElement
  | FreedrawElement

// No
interface FiroElement { type: string; stickyNote?: StickyNoteProps; ... }
```

## Styling

SCSS, co-located with components, themed with CSS custom properties. Inherited from
upstream, and there is no reason to change it.

No CSS-in-JS, no Tailwind. The reason is not preference: co-located SCSS with
custom properties is what makes the whole surface themable from one place, which we
need for the light/dark requirement and for the reduced-motion requirement.

## The embedding rule

**Inherited from upstream `AGENTS.md`, and it is a real constraint:**

> For new DOM/browser API usage, use `app.ownerDocument` and `app.ownerWindow`
> instead of globals.

The editor is designed to be embedded in iframes, portals, and shadow roots. Code
that reaches for a bare `document` or `window` breaks in those contexts. Inherit
this rule without exception.

**Utility types:** prefer `Merge<Base, Overrides>` from
`@firo/common/utility-types` over `Omit<Base, keyof Overrides> & Overrides`.

## Testing

vitest, jsdom, `vitest-canvas-mock`, `fake-indexeddb`.

**Canvas output is tested by reference image.** `vitest-canvas-mock` is for
behaviour, not appearance. The renderer gate in
[`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) AC-11 requires
comparing rendered output against Excalidraw's for inherited element types, which
means snapshotting to a real canvas in a headless browser rather than in jsdom.

**Performance is a test, not a benchmark.** The Phase 2 gate has numeric budgets.
Encode them as tests that construct a 10,000-element scene and assert frame timings,
so a regression is a red test.

**The four architectural rules are enforced by tests.** Each is one refactor away
from being violated by someone who did not read the ADR. See
[`05-non-functional-requirements.md`](../prd/05-non-functional-requirements.md) NFR-7.

## What we deleted from upstream, and why

| Removed | Reason |
| --- | --- |
| Firebase | External service, contrary to NFR-3. It is only a file-blob store and `FileManager` abstracts it. |
| Excalidraw+ gating | A paid feature gate in MIT-licensed code. Not ours to carry. |
| `socket.io-client` + `Collab.tsx` | Replaced by Yjs. [`03-crdt-and-sync.md`](03-crdt-and-sync.md) |
| localStorage element storage | 5–10 MB ceiling. [`07-persistence-and-formats.md`](07-persistence-and-formats.md) |
| Excalidraw Plus Iframe export | Tied to their product. |
| Virgil font | **Licensing.** [`ADR-0013`](../adr/0013-replace-the-virgil-font.md) |
