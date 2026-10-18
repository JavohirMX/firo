# Miro's board shell — observed structure

What Firo's Phase 7.5 shell is modelled on, and where each claim comes from.

**Status: observed and measured.** The layout below was first taken from Miro's
own documentation and has been checked against a **live, authenticated board**
(2026-10-15, Chrome 155) with REA's Chrome DevTools provider. A second,
scenario-driven deep pass (18 October 2026) opened the surfaces the first pass
could not and measured the chrome; its numbers live in
[`miro-geometry.md`](miro-geometry.md). Documentation-only claims have been
replaced by observations wherever the live board could settle them, and the ones
it could not are listed under §"Still unverified". This closes task 7.5.0.

Researched **13 October 2026**. Live observation **15 October 2026**. Deep pass
**18 October 2026**.

The **interaction** inventory behind this shell — the command catalogue, the
menus, the context menus, the panels and the keyboard, each with the mechanism
Miro builds it from — is in the companion document
[`miro-interactions.md`](miro-interactions.md).

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

Live observation does not weaken this guardrail. What was inspected is
**structure and behaviour** — element roles, accessible names, event wiring,
persistence keys and stated rules. No Miro asset, stylesheet or source was copied
into this repository, and none is committed.

## How this was observed

REA driving the Chrome DevTools provider against a signed-in board. Tools used:
`list_browser_targets`, `inspect_web_page` (DOM node tree, accessibility tree,
storage keys, resource list), `inspect_web_event_listeners` and
`capture_web_screenshot`. The raw evidence bundle was kept in a temporary
directory and is **not committed** — only this summary is.

What the method gave, and what it could not:

- **Gave:** the DOM node tree, the accessibility tree (roles, names, states),
  element attribute **names**, event-listener wiring, and storage **key** names.
- **Did not give the first time:** computed styles, CSS custom properties,
  attribute **values** (so no class names or `aria-label` values), storage
  values, or source-map contents (source maps are reported as URLs and
  deliberately not fetched).
- **Screenshots** capture the visible viewport; the first pass could not
  evaluate script, so geometry was **not** measured from the screenshot — the
  PNG is retained only as temporary evidence.

**Updated 18 October 2026.** The deep pass drove the DevTools Protocol directly
(synthetic input plus `Runtime.evaluate`), which lifted both limits: computed
styles, exact rects and `aria-label` values were read, and hover-triggered
surfaces were opened and captured. All measured geometry comes from that pass
and lives in [`miro-geometry.md`](miro-geometry.md). What did **not** change:
the canvas is a WebGL surface, so board objects still never enter the DOM — only
the chrome around them does.

## The shell, as observed

Five regions, one of which is the creation rail. Region membership below is the
accessibility-tree order, not necessarily the painted order.

| Region | Observed contents | Orientation |
| --- | --- | --- |
| **Top-left** | `toolbar` "Board": `Open Sidebar`, `Home`, `Main menu` | horizontal |
| **Top bar** | `toolbar` "People": `Change thumbnail`, `Facilitation tools and reactions`, `Activity`, `Record and watch Talktracks`, avatar, `Present`, `Share`; plus a board-title button (`Click to rename`) and a board icon | horizontal |
| **Left** | `toolbar` "Creation": `Select`, `Sticky note`, `Templates`, `Text`, `Shapes and lines`, `Pen`, `Frame`, `Stickers, Emoji and GIFs`, `Comment`, `Diagramming shapes`, `Tools, Media and Integrations` | **vertical** |
| **Under the rail** | `Undo`, `Redo` (exposed as buttons; `disabled` when there is no history) | — |
| **Bottom-right** | `toolbar` "Controls": `Zoom out`, `Zoom and navigation`, `Zoom in`, `Help and resources`, `Frames`; plus the zoom-percentage readout | horizontal |

An accessibility layer is present and is part of the shell, not an add-on: a
`Skip to first object on the board` button, an `Explore board content` button
(accessible board overview), an `Accessibility help` link, and guidance text
naming the `⌘ + K` command palette and the `⌥ + O` board-overview key.

Documented, and each has a consequence for us:

1. **Tools are one-time — but not all of them.** Miro's rule is that every tool is
   one-time *except* **pen, eraser, lasso and comments**; a one-time tool reverts
   to Select after use. Firo's `CREATION_TOOLS` already encodes exactly this —
   `freedraw` (pen) and `eraser` are deliberately outside it, so they stay
   active. **No change needed.**
2. **Tools can be dragged onto the board.** The rail is a source, not only a mode
   switch.
3. **Select and Hand are a single control.** One pointer button, toggling between
   Select and Hand (hotkeys `V` and `H`), and it cannot be removed. It is
   therefore *one* rail entry, not two.
4. **Shapes and lines are one rail entry**, opening a flyout — not one entry per
   shape as Firo currently renders.
5. **Undo/Redo default to just under the creation rail** and can be moved to the
   bottom-left from the board menu (View → Undo/Redo controls toggle).
6. **Zoom lives bottom-right**, and the **minimap is a submenu of the zoom
   percentage** (with full screen, grid, object dimensions and fit-to-screen) —
   not a top-level button.

## The rail is customisable

Documented, and consistent with what the live board showed (a Radix-family
`toolbar` with roving focus, whose container handles `contextmenu` and drag
through React's delegated listeners):

- **Reorder:** click and drag a tool to change its order.
- **Remove:** right-click a tool to **Unpin** it; adding it back is the same
  menu.
- **Scope: per profile, per user.** Order and visible tools are saved to your own
  profile only — you cannot change another collaborator's rail.
- **Not supported on touchscreen devices.**
- Select/Hand cannot be unpinned.

This answers the ordering-and-persistence question the earlier revision left
open: **per user, locally, not per board.**

The deep pass saw the arrangement change between two reads on the same account
minutes apart — an entry appeared, another was absent, and a separator joined
the new entry (both reads are tabulated in
[`miro-geometry.md`](miro-geometry.md)). Nothing about the mechanism is asserted
from that: it confirms only that the rail is per-user state, not a fixed
contract.

## The keyboard, as observed

Miro's tool keys, from *Shortcuts and hotkeys*: `V`/`H` select/hand, `T` text,
`N` sticky note, `S` shapes, `R` rectangle, `O` oval, `L` connection line/arrow,
`D` card, `P` pen, `E` eraser, `C` comment, `F` frame, `M` minimap, `G` grid,
and `⌘K` for the command palette.

Two rules that matter for Firo:

1. **Numbered hotkeys are positional and not remappable.** `1`–`9` switch between
   tools *in their toolbar order*; concretely, `2` always opens the Templates
   modal. This **conflicts** with Firo's inherited Excalidraw scheme, where
   `1`–`9` (`0`) select a specific tool type.
2. **Keyboard navigation is part of the shell.** `Tab`/`Shift-Tab` move between
   toolbars and panels, arrow keys move within a toolbar (up/down inside the
   creation rail), `B` moves focus to the board, `Tab`/`Shift-Tab` then walk
   objects in reading order, `⌘`+arrows walk them spatially, `⌘ + Enter` opens an
   object's context menu, and `Escape` returns to the toolbars. Single-character
   shortcuts can be toggled off (Main menu → Accessibility) so they do not fight
   a screen reader.

The live board corroborates item 2 mechanically: the rail's `[role=toolbar]`
carries a `rovingFocusGroup.onEntryFocus` listener, which is the arrow-key roving
focus Radix toolbars provide.

## Firo mapping

How the observed structure maps onto this repository. The right column is the
tunnel that hosts it ([ADR-0022](../adr/0022-ui-package-owns-the-chrome.md)).

| Miro region | Firo component | Hosted by | Today |
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

### Where Firo and Miro differ, concretely

Recorded so the differences are decisions rather than accidents:

| Thing | Miro (observed) | Firo today | Consequence |
| --- | --- | --- | --- |
| Select / Hand | one toggling button | two rail entries (`selection`, `hand`) | rail shape; see 7.5.8 |
| Shapes / lines | one entry with a flyout | five flat entries (`rectangle`, `diamond`, `ellipse`, `arrow`, `line`) | rail shape |
| Templates, Stickers, Diagramming, "+" | rail entries | not on the rail | rail composition |
| Minimap | inside the zoom-% submenu | its own `NavToolbar` toggle | placement |
| `D` | card | diamond | divergence, not a conflict — Firo has no card tool; see 7.5.9 |
| `S`, `C` | shapes group, comment tool | no counterpart tool | no target in Firo today; see 7.5.9 |
| `M`, `G` | minimap, grid | both exist, unbound | bind in 7.5.9 |
| `A`, `X`, `Shift+X`, `B`, `K` | unbound | arrow, freedraw alt, autoshape, bucket fill, laser | Firo-only extras |
| `1`–`9` | toolbar slots (positional) | tool types | real conflict; see 7.5.9 |
| One-time tools | all but pen/eraser/lasso/comment | `CREATION_TOOLS` matches | none |

## Still unverified

Not asserted anywhere in code or ADRs until observed. Updated 18 October 2026:

- **Geometry — closed.** Measured rects, pitches, radii, shadows and colour roles
  are in [`miro-geometry.md`](miro-geometry.md). Precision and tolerances are
  stated there; motion is explicitly *not* measured.
- **The rail's painted order — largely closed.** The measured button order
  matches the DOM order (button y-positions increase monotonically with the
  order), so the two agree on this account. What was *not* re-tested is the
  documented positional-numbered-hotkey mapping.
- **Colour and motion tokens — half closed.** Colour roles were measured and
  mapped to Firo tokens (geometry doc); durations and easings remain unobserved.
- **The selection context menu — closed.** Sixteen controls were captured and are
  listed in [`miro-interactions.md`](miro-interactions.md); its placement
  (centred above the object) and metrics are in the geometry document.
- **Zoom bounds and the percentage control — narrowed, not closed.** The live
  zoom menu on 18 October carried stops 50 / 70 / 100 / 400 plus Fit (⌥1) and
  100 % (⌘0) — the 1200 % and 2000 % stops the 15 October pass recorded were
  **not** in the menu then: the stops may be conditional (state, licence) or the
  product changed. Not resolved. The readout sits inside the zoom button.
  Default zoom on an empty board at 1200 × 818 was 69 %, and it tracked available
  canvas width exactly when the sidebar opened (54 % = 69 × 940/1200), which
  describes a fit-to-view rule without pinning its formula. Above-400 % was not
  probed.

## Sources

| Source | What it establishes |
| --- | --- |
| Live board via REA + Chrome DevTools (2026-10-15) | The five regions and their accessible names, the vertical Creation rail and its members, undo/redo and the navigation toolbar, the accessibility layer, storage keys and event wiring |
| [Miro Help — Toolbars](https://help.miro.com/hc/en-us/articles/360017730553-Toolbars) | Region contents, the one-time rule and its exceptions, drag-to-board, Select/Hand being non-removable, rail customisation (drag to reorder, right-click to Unpin, per-profile), undo/redo placement |
| [Miro Help — Shortcuts and hotkeys](https://help.miro.com/hc/en-us/articles/360017731033) | The full key map, positional numbered hotkeys, toolbar navigation keys, the `F1` shortcut list |
| [Miro Help — Keyboard navigation](https://help.miro.com/hc/en-us/articles/11997028019858) | The keyboard model for the shell: Tab/arrow navigation, `B` to the board, `⌘K` palette, toggleable single-key shortcuts |
| [Miro Help — Board access rights](https://help.miro.com/hc/en-us/articles/360017572194-Board-access-rights) | The permission matrix (commenter/edit/viewer) that Firo's comments lane defers to v2 |

Contrast, licences and the API surface for Miro as a product are catalogued
separately in [`sources.md`](sources.md). The interactions and the build
mechanism behind them are in [`miro-interactions.md`](miro-interactions.md).
