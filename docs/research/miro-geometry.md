# Miro board geometry — measured spec

The numbers behind the Miro-shaped shell and how they were taken.

This is the measured companion to [`miro-ui.md`](miro-ui.md) (the shell as
observed) and [`miro-interactions.md`](miro-interactions.md) (what every control
does). Where those documents describe structure and behaviour, this one records
**rects, pitches, radii, shadows and colour roles** read from the live product so
the shell can be re-implemented with the same rhythm, not approximated from
memory.

**Measured 18 October 2026** during the Phase 11 deep pass, on the same
authenticated Miro **Business** board the phase uses as reference.

The guardrail from [`miro-ui.md`](miro-ui.md) binds here in a specific way:
colour values are recorded **to understand function**, and are re-expressed in
`@firo/ui` tokens (§ "Token mapping"). No value in this document is copied into
the codebase as a literal.

## How it was measured

- **Instrument:** the Chrome DevTools Protocol against the signed-in board —
  synthetic input (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`,
  `Input.insertText`) to open surfaces, then `Runtime.evaluate` to read
  `getBoundingClientRect()` and `getComputedStyle` from the rendered DOM.
- **Environment:** Chrome 155.0.8059.80, Miro build `1.104717.0`, viewport
  **1200 × 818 CSS px** at devicePixelRatio 2.
- **Precision:** rect reads are exact; values here are rounded to whole pixels.
  Treat every rect as **±1 px**. Estimated values carry a `≈`. Shadow strings
  are quoted as computed; the ambient layer of the floating shadow was truncated
  in the capture and is marked.
- **Procedure:** surfaces were opened one at a time on a scratch board; each
  measurement is a single read of a settled surface (no transitions running).
- **Caveat that matters:** the rail is a per-user arrangement that was
  live-editable during the pass, so its composition is **data from two reads**,
  not a contract (§ "The creation rail").

## The anchor lines

Nearly everything insets to a small set of lines, which is why the chrome reads
as one surface:

| Line | Value | What uses it |
| --- | --- | --- |
| Left inset | `x = 8` | board bar, creation rail, left-docked panels |
| Right inset | `x = 1192` (`1200 − 8`) | people bar, right-docked panels |
| Top inset | `y = 8` | both top bars |
| Bottom inset | `y = 810` (rail and panels end), `y = 806` (bottom-right strip ends) | rail, side panels, control strip |
| Menu line | `y = 64` | menus and popovers open just under the bars (bar bottom is 56) |
| Control gap | 4 px inside a bar or strip; 8 px between regions | everywhere measured |

## Shell regions (viewport 1200 × 818)

| Region | Rect (x, y, w × h) | Rule as measured |
| --- | --- | --- |
| Board bar | (8, 8) 311 × 48 | left inset 8, top 8; white, radius 8 |
| People bar | (847, 8) 345 × 48 | right edge 1192 |
| Creation rail | (8, 64) 48 × 746 | top = bar bottom + 8; bottom = 810 |
| Rail flyouts | `x = 64` | rail right edge 56 + 8 |
| Right side panels | (852, 64) 340 × 746 (comments, frames); (812, 64) 380 × 746 (voting) | right edge 1192 |
| Bottom-right strip | 40-tall row at `y = 766` | right edge 1188 (inset 12), or 12 px left of a docked panel; button gaps 4 |
| Shape-library dock | (8, 64) 340 × 746 | takes the left inset; displaces the rail to `≈ x 352` |

Left-docked panels equal right-docked ones in height (746) — both run from the
menu line to `y = 810`, the same bottom inset as the rail.

## Board bar internals

| Control | Rect | Notes |
| --- | --- | --- |
| Open Sidebar | (13, 12) 40 × 40 | 5 px in from the bar's left edge |
| Home (logo) | (57, 12) 80 × 40 | |
| Board thumbnail | (141, 12) 32 × 40 | |
| Board title | (173, 12) 93 × 40 | width is content-driven (the observed name set 93) |
| Main menu | (274, 12) 40 × 40 | |

All controls 40 high at `y = 12` (4 px inset). Segment gaps measured: 4 px
between the first controls, 8 px before the main menu.

## People bar internals

| Control | Rect | Notes |
| --- | --- | --- |
| Facilitation tools and reactions | (852, 12) 60 × 40 | first control, 5 px in |
| Activity | (916, 12) 40 × 40 | |
| Record and watch Talktracks | (960, 12) 40 × 40 | |
| Avatar | (1004, 16) 59 × 32 | 32-high pill, vertically centred |
| Present | (1067, 16) 32 × 32 | square pill |
| Share | (1103, 16) 81 × 32 | primary pill; right edge 1184, 8 px short of the bar's edge |

Gaps between controls: 4 px throughout.

## The creation rail

Container (8, 64) 48 × 746. Buttons 40 × 40 at `x = 12` (4 px inset), **pitch
44** (4 px gap). Two observed compositions on the same account, same day:

| Slot | First observed read (`y`) | Later read (`y`) |
| --- | --- | --- |
| AI entry | 118 | 113 |
| Select | 175 | 170 |
| Sticky note | 219 | 214 |
| Templates | 263 | 258 |
| Text | 307 | 302 |
| Shapes and lines | 351 | 346 |
| Pen | 395 | 390 |
| Frame | 439 | 434 |
| Stickers, Emoji and GIFs | 483 | 478 |
| Comment | 527 | 522 |
| Diagramming shapes | 571 | — (absent) |
| separator | — | (14, 569) 36 × 1 |
| Voting | — | 577 |
| Tools (`+`) | 615 | 621 |
| Undo | 672 | 678 |
| Redo | 716 | 722 |

The later read sits 5 px higher through the tool block and gains a separator
above the new entry — one inserted row re-centres the column. The composition
difference (a Voting entry present in the later read, the Diagramming-shapes
entry absent) is **recorded, not explained**: the rail is user-editable and the
account was in use. Treat order as observed data, not a fixed contract.

Sub-containers in the first read: top buttons (8, 114) 48 × 49; plugins (8, 171)
48 × 489; the draggable group (10, 217) 44 × 440 — Select sits outside the
draggable group, consistent with it being unremovable. Undo sits 17 px below the
Tools button in both reads.

The AI entry carried an admin-gating tooltip on the observed account ("Sidekicks
need to be turned on by your admin") — a plan-gated control, recorded so its
state is not mistaken for a defect.

## Rail flyouts and the shape library

| Surface | Rect (x, y, w × h) | Notes |
| --- | --- | --- |
| Sticky colour panel | (64, ≈129) ≈136 × ≈616 | opens beside the rail, tracking the button loosely |
| Shapes strip | (64, 172) 240 × 530 | |
| Frames presets | (64, 259) 256 × 357 | |
| Pen strip | (64, ≈231) ≈48 wide | a narrow column |
| Media library | (64, 64) 368 × 746 | full height (menu line to bottom inset) |
| Shape library | (8, 64) 340 × 746 | left-docked; displaces the rail to `≈ x 352` |
| Tools (catalog) | (412, 64) 450 × 746 | observed beside the displaced rail (`352 + 48 + 12`) |
| Templates | modal 1160 × 736 at (20, 41) | centred both axes; dimmed backdrop |

All flyouts are white cards, radius 8, floating shadow (§ shadows). Vertical
placement varies by surface — recorded as measured, not modelled.

## Menus — three metric systems

The product shows **three** menu metrics, and they are consistent within
themselves. Getting this wrong is visible immediately, so it is worth the table:

| System | Where | Item height | Pitch | Separator cost | Observed widths |
| --- | --- | --- | --- | --- | --- |
| App menus | main menu and its submenus, facilitation, zoom, help | 40 | **44** (gap 4) | ≈ +9 px between item starts | 325 (main), 293 (facil), 235 (zoom), 197 (help) |
| Create dropdown | the sidebar's "create" menu | 40 | **48** (gap 8) | — | 264 × 688 |
| Canvas context menus | right-click on canvas and on an object | 32 | **36** (gap 4) | ≈ +5 px between item starts | 293 (empty canvas), 295 (object) |

Measured positions for two representative menus:

- **Zoom menu** (956, 336) 235 × 422 — bottom edge sits 8 px above the control
  strip's top, right edge flush with the strip.
- **Help menu** (995, 517) 197 × 241 — same bottom line, right edge flush with
  the help button.
- **Facilitation menu** (735, 64) — opens on the menu line.
- **Object context menu** (624, 200) 295 × 618, items 274 × 32 starting at
  `x = 635` (11 px inset), pitch 36.
- **Empty-canvas menu** 293 × 544 — the same menu flipped above the cursor when
  the click was near the bottom edge (measured at (201, 131) for a click at
  (200, 680)) — pointer-aware placement.

## The selection toolbar ("horizontal context menu")

| Property | Measured |
| --- | --- |
| Bar | 874 × 48 at (183, 183) with 16 controls; radius 8 |
| Placement | centred on the object's centre-x; measured 105 px above the object's top edge (at 70 % zoom, one sample) |
| Cells | 40 × 40, vertically inset 4 (`y = 187` in a 48 bar); a stacked pair 30 × 24; "Convert to" 127 × 48 slot; the AI cell 46 × 40 |
| Group gaps | within groups ≈ 2–5 px, between groups ≈ 10–15 px — model **groups**, not a uniform pitch |

Cell order, left to right (measured `x`): Switch type `188` · Convert to `238` ·
Font style (family) `375` · font size +/− `457` (stacked) · Font style `492` ·
Alignment `534` · Insert link `576` · Sticky note size `621` · Fill color `663` ·
Show author `708` · Add tag `750` · Add emoji `792` · Comment `842` · Lock `897` ·
Miro AI `952` · More `1013`.

## Panels, dialogs and popovers

| Surface | Rect | Notes |
| --- | --- | --- |
| Comments panel | (852, 64) 340 × 746 | tabs Board / Team |
| Frames panel | (852, 64) 340 × 746 | |
| Voting panel | (812, 64) 380 × 746 | the wider side panel |
| Share dialog | (300, 118) 600 × 433 | x-centred exactly; top at 118 |
| Templates modal | (20, 41) 1160 × 736 | centred both axes |
| Command palette | ≈ (325, 123), 546 wide | x-centred (≈ 327 expected); input 534 wide |
| Timer popover | (912, 64) 280 × 102 | right edge 1192, on the menu line |
| Comment composer | 340 × 48 beside the pin | |
| Board-row menu (sidebar) | (239, 193) 239 × 565 | app-menu metrics (system A) |

## Shadows and radii (as computed)

| Role | Measured | Token |
| --- | --- | --- |
| Bar shadow | `0 2px 4px rgba(34, 36, 40, 0.08)` | `ELEVATION.panel` by role — ours is composed differently and stays ours |
| Menu / floating shadow | `0 2px 8px rgba(34, 36, 40, 0.12)` plus an ambient layer at `rgba(34, 36, 40, 0.04)` (blur truncated in capture) | `ELEVATION.floating` by role |
| Card radius | 8 px | `RADIUS.md` |
| Small control radius | 4 px (bar buttons) | `RADIUS.sm` |

## Colour roles observed (function first)

Recorded so the roles are understood; the values are **not** carried into code.
Firo asserts its own palette ([ADR-0023](../adr/0023-open-icons-and-ui-typeface.md)).

| Role | Measured value (observed) | Firo mapping |
| --- | --- | --- |
| Panel surface | `#ffffff` | `COLOR.panel` / `panelRaised` |
| Primary action (Share, active tab indicator) | `rgb(56, 89, 255)` | `COLOR.accent` (ours: `#5b4bff`, deliberately ours) |
| Active tool background | `rgb(232, 236, 252)` | **no token** — Firo expresses active tools with its own accent treatment |
| Selected swatch ring | `rgb(56, 89, 255)` | `COLOR.selection` by role |
| Secondary button background | `rgb(233, 234, 239)` | **no token** |
| Menu/panel text | near-black on white | `COLOR.text` by role |

## Type

One measurement: menu item text renders at ≈ 14 px. Nothing finer was measured,
and no typeface claim is made here — the face is Miro's and is not ours to use
([ADR-0023](../adr/0023-open-icons-and-ui-typeface.md)).

## Motion

**Not measured.** No duration or easing is claimed. Menus, flyouts and panels
appeared between captures without a captured transition frame, which is an
absence of evidence, not a measurement. Firo's `MOTION` tokens are ours.

## Token mapping

Mapped today:

- 4 / 8 / 12 px spacing → `SPACE.xs` / `SPACE.sm` / `SPACE.md`.
- Radius 8 / 4 → `RADIUS.md` / `RADIUS.sm`.
- Panel white → `COLOR.panel` / `COLOR.panelRaised`.
- Shadow **roles** → `ELEVATION.panel` / `ELEVATION.floating`.
- Primary and selection roles → `COLOR.accent` / `COLOR.selection`.

Measured values with **no token yet** (candidates for the geometry-token
decision in Phase 11; listed so they are added deliberately, not sprinkled):

| Group | Values |
| --- | --- |
| Rail | width 48; button 40 × 40; pitch 44; separator 36 × 1 |
| Bars | 311 × 48 and 345 × 48; internal gaps 4–8; control heights 40 and 32 |
| Menus | the three systems above: item heights 40 / 40 / 32, pitches 44 / 48 / 36, separator costs ≈ 9 / — / ≈ 5 |
| Panels | widths 340 and 380; height 746 |
| Flyouts | widths ≈ 136 / 240 / 256 / 48 / 368 / 340 / 450 |
| Modals | 600 × 433; 1160 × 736; palette 546 |
| Selection toolbar | cell sizes 40 / 46 / 127 / 30 × 24 and group gaps ≈ 10–15 |
| Control strip | 40-tall at bottom inset 12 |
| Colour roles | active-tool background; secondary button background |

## What remains unmeasured

- Motion durations and easings (above).
- Icon stroke weights and the icon grid.
- Hover / pressed / disabled colour states beyond the disabled visual.
- Font sizes beyond the single menu measurement.
- The board **home** (dashboard) surface — out of this pass; its menus were
  observed through the sidebar and are covered in the interaction document.
