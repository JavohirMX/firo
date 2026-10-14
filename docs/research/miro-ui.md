# Miro's board shell — observed structure

What Firo's Phase 7.5 shell is modelled on, and where each claim comes from.

**Status: partially verified.** The layout below is taken from Miro's own
documentation. Live inspection of a running board — DOM structure, computed
styles, CSS custom properties, interaction timings and the full keyboard map —
is **not yet done**; it is task 7.5.0 and it needs REA plus its Chrome DevTools
provider, which are not installed here. Every claim that rests on documentation
alone is marked, and §"Unverified" lists what still has to be looked at directly.

**Decision (2026-10-14).** Live inspection also needs an *authenticated Miro
board*, which the maintainer chose not to supply: the phase proceeds on the
documented-behaviour fallback and every documentation-only claim stays flagged
rather than asserted. The clean-room guardrail below is unaffected — it is a
constraint on what may be used, not on what may be observed.

Researched **13 October 2026**.

## Clean-room guardrail

This document exists so the shell can be re-implemented from **behaviour and
layout**. It is a specification, not a source of assets.

- **Emulated:** where controls sit, what they do, when a tool reverts, what the
  keyboard does, how a selection presents its actions. Interaction patterns are
  functional.
- **Not used, ever:** Miro's source code, icon files, typefaces (Roobert PRO is
  commercial and unlicensed for redistribution — see
  [ADR-0023](../adr/0023-open-icons-and-ui-typeface.md)), brand marks, colour
  tokens copied verbatim, or marketing copy.

The icons are authored in-repo and the chrome typeface is Plus Jakarta Sans for
exactly this reason.

## The shell, as documented

Miro's board screen is four regions plus a selection behaviour. This is the shape
Firo adopts ([ADR-0021](../adr/0021-miro-style-shell-and-clean-aesthetic.md)).

| Region | Contents | Source |
| --- | --- | --- |
| **Top-left** | Board menu: hamburger, dashboard button, board name, classification, three-dot main menu | Miro Help — *Toolbars* |
| **Top-right** | Collaboration tools (Reactions, Voting, Timer, Private mode, Notes) and People (activity feed, talktrack, users, presentation mode, Share) | Miro Help — *Toolbars* |
| **Left, vertical** | **Creation toolbar**: Select/Hand, sticky note, shapes, text, connector, pen, frame, more. Customisable. **Undo/Redo sit directly beneath it.** | Miro Help — *Toolbars* |
| **Bottom-right** | **Navigation toolbar**: zoom in/out, zoom percentage, fit-to-screen, minimap, grid, Frames, Layers | Miro Help — *Toolbars* |
| **On selection** | A **context menu appears near the object**, not in a fixed side panel | Miro Help — *Toolbars* |

Documented, and each has a consequence for us:

1. **Tools are one-time.** A creation tool reverts to Select after it is used.
   The current Excalidraw behaviour keeps the active tool until it is changed
   again, so this is a real behavioural change and not a CSS move.
2. **Tools can be dragged onto the board.** The rail is a source, not only a
   mode switch.
3. **Select and Hand cannot be removed** from the rail; the rest can. The rail is
   customisable, which means the rail has an ordering/persistence question that
   the current fixed toolbar does not.
4. **Undo/Redo are part of the rail region, not a footer.** In Firo today they
   live in the bottom-left footer.
5. **Zoom lives bottom-right.** In Firo today it also lives bottom-left.

## Firo mapping

How the documented structure maps onto this repository. The right column is the
tunnel that hosts it ([ADR-0022](../adr/0022-ui-package-owns-the-chrome.md)).

| Miro region | Firo component (new) | Hosted by | Today |
| --- | --- | --- | --- |
| Top-left board menu | `BoardMenu` | `renderBoardMenuUI` | Excalidraw main menu (top-left hamburger) |
| Top-right collaboration | `CollabBar` | existing top-right tunnel | `FacilitatorBar` (custom, in `apps/web`) |
| Left creation rail | `CreationRail` | `renderCreationRailUI` | Excalidraw `Toolbar` (top-centre) |
| Undo/Redo | part of `CreationRail` | `renderCreationRailUI` | `Footer` (bottom-left) |
| Bottom-right navigation | `NavToolbar` | `renderNavigationUI` | `Footer` (bottom-left) |
| Selection context menu | `SelectionToolbar` | `renderSelectionUI` | `SelectedShapeActions` (top-left island) |
| Object properties | `Inspector` | `renderInspectorUI` | `SelectedShapeActions` (top-left island) |

Two of these — the creation rail and the navigation toolbar — are *placements*
that Excalidraw's toolbar CSS does not express. That is the specific reason
ADR-0022 permits bounded edits inside `@firo/editor`.

## Unverified — inspect live before building

These are the claims the documentation does not settle, and the reason the live
inspection step exists. None of them should be asserted in code comments or in
the ADRs until they are observed.

- **Geometry.** Rail width, icon size and stroke weight, control hit-target
  sizes, the gap between the rail and undo/redo, toolbar corner radii and
  offsets. Needed for the icon grid and the tokens.
- **The exact one-time-tool rule.** Does *every* creation tool revert, or only
  some? What happens for a drag-created object versus a click?
- **Rail customisation.** Ordering rules, persistence, and whether Hide/Show is
  per-board or per-user.
- **Selection context menu.** Exact actions, and whether it is always near the
  object or sometimes docks.
- **The keyboard map.** Miro's full shortcuts, including conflicts with any Firo
  already binds. AC-8 requires the whole workshop to be keyboard-drivable, so
  this must be reconciled rather than copied.
- **Zoom bounds and the zoom-percentage control's behaviour.**
- **Colour and motion tokens.** Durations and easings for tool switches and
  panel transitions.

## Sources

| Source | What it establishes |
| --- | --- |
| [Miro Help — Toolbars](https://help.miro.com/hc/en-us/articles/360017730553-Toolbars) | The four regions, undo/redo under the creation toolbar, the navigation toolbar's contents, one-time tools, drag-to-board, and Select/Hand being non-removable |
| [Miro Help — Board interface](https://help.miro.com/hc/en-us/sections/360001412314-Board-interface) | The board screen's sections |
| [Miro Help — Board access rights](https://help.miro.com/hc/en-us/articles/360017572194-Board-access-rights) | The permission matrix (commenter/edit/viewer) that Firo's comments lane defers to v2 |

Contrast, licences and the API surface for Miro as a product are catalogued
separately in [`sources.md`](sources.md).
