---
status: accepted
date: 2026-10-13
deciders: maintainer
---

# `@firo/ui` owns the app chrome; `@firo/editor` exposes layout tunnels

## Context and Problem Statement

[ADR-0021](0021-miro-style-shell-and-clean-aesthetic.md) replaces Excalidraw's
shell with Miro's layout: a left creation rail, a bottom-right navigation
toolbar, a top-left board menu, a top-right facilitation region, a right-side
inspector, and a floating selection toolbar.

Today that chrome is not a unit. It is spread across three layers:

1. **Inherited Excalidraw chrome**, inside `@firo/editor`:
   `components/LayerUI.tsx` (which composes the whole overlay),
   `components/Toolbar.tsx` (the top-centre tool strip),
   `components/SelectedShapeActions.tsx` (the top-left properties island), and
   `components/footer/Footer.tsx` (zoom and undo/redo, bottom-left).
2. **Custom surfaces bolted on** from `apps/web` through Excalidraw's
   tunnel-rat slots: the facilitator bar, the records projection overlay, the
   save-status indicator, and the main-menu additions.
3. **Ad-hoc styling**, in `packages/editor/css/theme.scss` and
   `variables.module.scss`, plus component SCSS beside the inherited
   components.

Building a Miro layout on that arrangement means the shell is edited in
`@firo/editor`, the custom surfaces stay in `apps/web`, and styling is split
between the two plus a shared theme file. That is the structure the next four
pieces of shell work — inspector, dashboard, template gallery, comments — would
all have to copy.

`docs/architecture/overview.md` already lists a `@firo/ui` package as *planned*.
This ADR makes it real and puts the chrome in it.

## Decision Drivers

- **The chrome is a product surface, and it is currently an accident of the
  fork's history.** It has no owner, no package, and no boundary.
- **`@firo/editor` is inherited and 12,946 lines of `App.tsx` deep.** Every
  edit to it is a merge-hazard we chose to accept once
  ([ADR-0001](0001-fork-excalidraw-and-refactor-aggressively.md)); the number of
  edits should still be kept small and *named*.
- **Excalidraw's tunnel API is the sanctioned seam.** It already hosts custom
  surfaces in `apps/web`, and the app does not otherwise reach into the editor.
  Extending that seam is cheaper than forking the overlay wholesale.
- **A tunnel cannot always express a layout.** Excalidraw's toolbar is
  positioned by its own CSS at top-centre; a tunnel injects *content*, not a new
  *placement*. A left rail is a placement. Pretending otherwise would produce a
  rail hacked into a top-centre container.
- **The tool registry should not be forked.** `Tools.tsx` already maps tool ids
  to icons, labels and shortcuts. The left rail is a different presentation of
  the same registry, not a second one.

## Considered Options

1. **Modify `@firo/editor`'s `LayerUI`/`Toolbar` in place.** Put the Miro
   layout inside the inherited overlay.
2. **A new `@firo/ui` package owns the chrome; `@firo/editor` gains a small,
   named set of layout tunnels** (and a flag to stop rendering its own chrome).
3. **CSS-only restyle.** Keep the inherited DOM; move things with stylesheets.
4. **Fork `LayerUI.tsx` into `apps/web`.** Replace the whole overlay from the
   app.

## Decision Outcome

**Option 2.**

1. **A new `@firo/ui` package owns the shell.** It exports the chrome
   components — `CreationRail`, `BoardMenu`, `CollabBar`, `NavToolbar`,
   `Inspector`, `SelectionToolbar` — and the design tokens they are built from
   ([`packages/ui/src/tokens.ts`](../../packages/ui/src/tokens.ts)). It is
   consumed by `apps/web`, which composes the chrome and owns the app-level
   state.

2. **`@firo/editor` gains a small, named set of layout tunnels**, so the app can
   place chrome the inherited overlay cannot express:

   | Tunnel | Purpose |
   | --- | --- |
   | `renderCreationRailUI` | The left vertical creation rail and its undo/redo. |
   | `renderNavigationUI` | The bottom-right navigation toolbar. |
   | `renderBoardMenuUI` | The top-left board menu. |
   | `renderInspectorUI` | The right-side adaptive inspector. |
   | `renderSelectionUI` | The floating selection toolbar. |

   Each is a tunnel-rat slot rendered from a host-provided callback, in the same
   style as the existing `renderTopRightUI` and the app's current surfaces. The
   list is deliberately closed: adding a sixth requires a new decision, not a
   new callback.

3. **`@firo/editor` grows one flag, `defaultChromeEnabled`.** When a host
   supplies its own chrome, `LayerUI.tsx` stops rendering Excalidraw's
   top-centre `Toolbar`, `SelectedShapeActions` and bottom-left `Footer`. When
   it is absent, the current behaviour is unchanged — this is what keeps
   `examples/` and the standalone editor working.

4. **The tool registry is not forked.** `CreationRail` reads the existing tool
   list from `@firo/editor` and re-presents it. `@firo/ui` does not own a second
   copy of the tool set, its labels or its shortcuts.

5. **`components/App.tsx` is not touched.** The editor's imperative API and the
   12,946-line class remain the integration point they already are.

6. **Boundaries on the `@firo/editor` changes.** The edits are limited to: the
   tunnels above, the `defaultChromeEnabled` flag, and removing the placement
   assumptions the flag now makes conditional. No renderer, schema, binding or
   scene code is touched. Anything larger is a new ADR.

## Consequences

- (+) The chrome has an owner, a package and a test target. The four shell
  pieces queued behind this one have somewhere to land.
- (+) The blast radius inside `@firo/editor` is a named, closed list rather than
  an open-ended "we'll restyle the overlay".
- (+) `@firo/ui` can be unit-tested without mounting the editor, because tokens
  and chrome components are pure.
- (-) **There is now a third UI layer**, and the boundary between it and
  `@firo/editor` has to be held. A tunnel added for convenience erodes the
  boundary; hence the closed list in clause 2 and the ADR requirement in
  clause 6.
- (-) **The tunnel API is upstream-shaped and may not fit every piece.** If a
  tunnel proves unable to host a component without an unrelated edit, that is a
  signal to stop and reconsider, not to widen the tunnel.
- (-) Two theming surfaces now exist — `@firo/ui/theme.scss` and the editor's
  `css/theme.scss`. The editor's keeps working; `@firo/ui` re-declares the
  values it depends on and the app loads both. Consolidating them is future
  work, recorded in the plan.
- (-) `build:packages` grows a package, and the workspace gains a build script
  and tsconfig path. Small, but it is the kind of growth that has to be
  deliberate.

## Confirmation

- [x] `packages/ui` exists, is in the workspace, and `yarn build:packages`
      builds it.
- [x] `@firo/ui` is resolvable from both `tsconfig.json` and
      `vitest.config.mts` without going through `dist/`.
- [ ] The five tunnels exist in `@firo/editor` and each is exercised by the app.
      **Open — task 7.5.3.**
- [ ] `defaultChromeEnabled` defaults to the current behaviour: with no host
      chrome, the editor renders exactly as it does today.
- [ ] `CreationRail` reads the tool registry from `@firo/editor` rather than
      re-declaring it.
- [ ] No change to `packages/editor/components/App.tsx`.

## More Information

- [ADR-0021](0021-miro-style-shell-and-clean-aesthetic.md) — the shell this
  package implements
- [ADR-0001](0001-fork-excalidraw-and-refactor-aggressively.md) — the
  refactor-aggressively policy that makes `@firo/ui` the right move rather than
  keeping edits small for upstream's sake
- [`../architecture/overview.md`](../architecture/overview.md) — where
  `@firo/ui` was already listed as planned
