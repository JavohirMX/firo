---
status: accepted
date: 2026-10-14
deciders: maintainer
---

# Reuse the editor's property controls for the inspector, and expose them as named seams

## Context and Problem Statement

[ADR-0022](0022-ui-package-owns-the-chrome.md) gave `@firo/ui` the chrome and gave
`@firo/editor` five layout tunnels plus a `defaultChromeEnabled` flag. Its clause
6 closed the list of permitted editor edits: the tunnels, the flag, and removing
the placement assumptions the flag now makes conditional — *anything larger is a
new ADR*.

Task 7.5.4 builds the right-side `Inspector` and the floating `SelectionToolbar`.
The inspector's whole job is to edit an element's properties — stroke, fill,
width, sloppiness, font, opacity, layer order. Those controls already exist in
`@firo/editor`:

- `components/Actions.tsx` exports `SelectedShapeActions`, the fieldset the
  top-left island renders today. It is wired to the action manager, to the
  element's colour targets and to the editor's own theme, and it re-renders from
  the same `UIAppState` the rest of the editor uses.
- `components/Tools.tsx` exports `TOOLS` (already public) and a private
  `getToolShortcut`, the function that turns a tool id into the "R or 2" hint the
  rail and its tooltips show.

The shell needs both: the inspector needs the actions component, and the rail
needs each tool's label and shortcut. Neither was reachable from `apps/web`.
So the question is not *whether* to touch the editor here — the tunnels are
already the sanctioned seam — but how far, and whether the property UI is
duplicated or reused.

## Decision Drivers

- **One implementation of "how a stroke colour is edited."** Property editing is
  a large, evolving surface with action wiring and colour-target logic behind it.
  A second copy in `@firo/ui` would drift within a release.
- **Keep the editor edits small and named** (ADR-0022 clauses 3 and 6). An
  *export* of an existing symbol is the smallest possible extension; it moves no
  code and changes no behaviour.
- **The tool registry stays single-source** (ADR-0022 clause 4). The rail must not
  grow a second copy of the tool list, its labels or its shortcuts — including the
  *derivation* of a shortcut string, which lives in `getToolShortcut`.
- **The host must not reach into editor internals.** `apps/web` consumes
  `@firo/editor`'s public entry point, not its source tree.

## Considered Options

1. **Reuse the editor's controls, and export the two symbols the host needs.**
   `Inspector` is a presentational shell that takes the controls as `children`;
   `apps/web` renders `SelectedShapeActions` into it through
   `renderInspectorUI`. The rail's tools are built in the host from `TOOLS` and
   `getToolShortcut`.
2. **Re-implement the property controls in `@firo/ui`.** A second `Actions`
   fieldset, styled with the chrome tokens.
3. **Move `SelectedShapeActions` from `@firo/editor` into `@firo/ui`.** Fork the
   fieldset out of the editor and render it from there.
4. **Widen the tunnel to carry the controls.** Have the editor hand the rendered
   actions to the tunnel callback so no export is needed.

## Decision Outcome

**Option 1.**

`@firo/editor`'s public entry point gains exactly two named exports:

| Export | Source | Why the host needs it |
| --- | --- | --- |
| `SelectedShapeActions` | `components/Actions.tsx` | The inspector's content — the one copy of the property fields. |
| `getToolShortcut` | `components/Tools.tsx` | The rail's shortcut hints, derived from the single registry. |

Both symbols already exist and already run inside the editor; this decision only
makes them reachable from the app. **No new tunnel, no new flag, no new
component, and no renderer, schema, binding or scene code is touched.** ADR-0022
clause 6's list is therefore *extended by these two exports*, not reversed: a
sixth tunnel, a third export, or any other edit to `@firo/editor` still requires
a new ADR.

The split that keeps option 1 honest:

- `Inspector` (in `@firo/ui`) owns the panel's **placement and chrome** — the
  header, the accessible name, the close control — and nothing else. It takes its
  content as `children`, so it never imports an editor component.
- The host (`apps/web`) is the only place the two are joined, because the host is
  the only layer that depends on both packages. It builds the rail's `tools` from
  `TOOLS` + `getToolShortcut` + `@firo/ui`'s `RAIL_TOOL_ICONS`, and renders
  `SelectedShapeActions` inside `Inspector` through `renderInspectorUI`.
- `@firo/ui` gains no second tool list, no tool labels and no shortcut strings.

The same reading applies to `SelectionToolbar`: it is a dumb presentational
component (`x`, `y`, `items`), and the host computes the anchor and supplies the
actions. That needs no editor export at all — its actions come from the action
manager `apps/web` already uses.

## Consequences

- (+) There is one property-editing implementation in the repository, and the
  inspector is a repositioning of it rather than a parallel one.
- (+) The rail's labels and shortcuts cannot drift from the tools that actually
  run, because both come from `TOOLS` / `getToolShortcut`.
- (+) The editor edit is two `export` keywords on symbols that already existed and
  were already exercised by the editor's own tests — the smallest change that
  makes the layout possible.
- (-) **`SelectedShapeActions` and `getToolShortcut` are now public API of
  `@firo/editor`.** Changing their props or return shape is a breaking change for
  hosts. That is a real cost, accepted because the alternative is a duplicated
  property surface.
- (-) **The inspector's controls wear the editor's styling, not the chrome
  tokens.** Reconciling the two is task 7.5.7; until then the panel is Miro-shaped
  but not yet Miro-skinned.
- (-) **ADR-0022 clause 6's "closed list" is now two longer.** This ADR is the
  record; the list is not otherwise widened.

## Confirmation

- [x] `Inspector` takes its controls as `children` and imports no editor
      component (`packages/ui/src/components/Inspector.tsx`).
- [x] `apps/web` renders `SelectedShapeActions` inside `Inspector` through
      `renderInspectorUI`, and builds the rail's `tools` from `TOOLS` +
      `getToolShortcut`.
- [x] `getToolShortcut` and `SelectedShapeActions` are exported from
      `packages/editor/index.tsx`; no other editor file changed for the inspector
      or the rail.
- [x] `@firo/ui` holds no tool list, tool label or shortcut string; `CreationRail`
      takes `tools` as a required prop.
- [x] `yarn test:typecheck`, `yarn test` and `yarn build:packages` pass with the
      new surface.

## Pros and Cons of the Options

### 2. Re-implement the controls in `@firo/ui`

- (+) The inspector would be styled with the chrome tokens on day one, and the
  panel could be edited without touching the editor.
- (-) Two implementations of property editing, with the action wiring and colour
  logic copied behind them. This is the exact drift ADR-0022 clause 4 rules out
  for the tool registry, and it applies at least as strongly here.
- (-) The copy would have to be kept correct as the editor's controls evolve,
  which is where "the inspector is subtly wrong" bugs live.

### 3. Move `SelectedShapeActions` into `@firo/ui`

- (+) One implementation, styled by the chrome.
- (-) It is not a *move*: the component imports editor internals (the action
  manager, colour targets, theme). Moving it means moving or re-exposing all of
  them, which is a far larger editor edit than two exports and is the opposite of
  the bounded-edit rule.

### 4. Widen the tunnel to carry the controls

- (+) No new export: the editor would render the actions and hand them to the
  callback.
- (-) It makes the tunnel a contract about *content* rather than *placement*, which
  is the thing ADR-0022 clause 2 warns against ("a tunnel injects content, not a
  new placement"). And it would still be an editor edit of the same size, with a
  worse shape.

## More Information

- [ADR-0022](0022-ui-package-owns-the-chrome.md) — the tunnels, the flag, and the
  closed edit list this ADR extends by two exports
- [ADR-0021](0021-miro-style-shell-and-clean-aesthetic.md) — the shell, including
  the right-side inspector
- [`../plans/phase-7-5-miro-ui.md`](../plans/phase-7-5-miro-ui.md) — task 7.5.4,
  where this was carried out
- [`../research/miro-ui.md`](../research/miro-ui.md) — the observed placement this
  follows
