---
status: accepted
date: 2026-10-18
deciders: maintainer
---

# A rail slot carries a tool, a family, an option set or a surface, and Phase 11 completes the composition

## Context and Problem Statement

Phase 11's deep pass measured Firo's creation rail against Miro's. The research
is [`miro-ui.md`](../research/miro-ui.md) §The creation rail, the descriptor
mechanics are in [`miro-interactions.md`](../research/miro-interactions.md)
§Tools and creation rail and §Rail flyouts, rendered, and the metrics are
[`miro-geometry.md`](../research/miro-geometry.md) §The creation rail. The
deltas are rows 3, 4, 6, 19, 23 and 24 of
[`miro-parity-matrix.md`](../research/miro-parity-matrix.md):

- **Entries.** The observed rail carries AI, the pointer, sticky note,
  templates, text, shapes and lines, pen, frame, media ("Stickers, Emoji and
  GIFs"), comment, diagramming shapes and the tools catalog, with undo and redo
  below. Firo carries ten arrangement tools plus the pinned pointer, and
  undo/redo; the media, diagramming and catalog entries are missing.
- **Flyouts.** The observed model is one slot per family, and a family is one
  command's sub-actions, each with its own key — shapes and lines (`O R L S`),
  the pen family (`P E` and three more), the sticky-note colours, the frame
  presets. Firo grew its first families (shapes, connectors, pen) in the
  Phase 7.5 work, but has no *option* flyouts — colours, presets — and no
  entries that open a surface.
- **The catalog.** The observed `+` opens the tools catalog (450 × 746). In
  Firo, `+` opens the unpinned-tools popover — the restore affordance
  [ADR-0029](0029-the-rail-is-a-per-user-arrangement.md) introduced — and
  there is no catalog.
- **The shape library.** Firo has none. The observed diagramming entry opens a
  left-docked library (340 × 746, displacing the rail); the matrix adopts the
  surface with our own drawings and no Miro assets (row 23).

Firo's rail model is close. `RailToolItem` in `@firo/ui` already carries
optional `flyoutItems`, and the host (`apps/web/App.tsx`) tracks each family's
active member and lights the slot through `activeOn`. What is missing is a
vocabulary for the slots that do not fit a tool — the colours, the presets,
the surfaces — and the composition itself.

Two properties of the rail constrain every option below. It is *per-user
state*, stored locally ([ADR-0029](0029-the-rail-is-a-per-user-arrangement.md)),
so a composition change edits a default, never an arrangement. And every
glyph, label, shape and colour value is ours to author — the clean-room
guardrail in [`miro-ui.md`](../research/miro-ui.md) §Clean-room guardrail.

## Decision Drivers

- **Parity of structure.** Someone who knows Miro should find the same slots
  doing the same kinds of things, in the same order in a fresh profile.
- **One registry.** A rail entry, its flyout item, its tooltip and its key are
  the same command ([ADR-0030](0030-keyboard-parity-with-miro.md); the
  research records it as a consequence of the recovered registry). No second
  tool list may appear.
- **The seam holds.** `@firo/ui` renders; the host decides and persists
  ([ADR-0022](0022-ui-package-owns-the-chrome.md),
  [ADR-0029](0029-the-rail-is-a-per-user-arrangement.md)). The new kinds and
  the catalog are the same seam, not a new one.
- **No dead affordances.** A slot may ship only when its target exists.
- **The arrangement stays safe.** New slots default to visible (ADR-0029's
  forward-compatibility rule); a retired id normalises through an alias;
  nothing requires a stored layout to be edited by hand.

## Considered Options

### What a slot can be

1. **Keep "a tool with an optional tool flyout".** Rejected: the sticky
   colours and frame presets are not tools, and the media surface and the
   catalog are not tools; expressing them as tools would invent fake ids —
   the second list ADR-0030 exists to prevent.
2. **A discriminated kind per slot: tool, family, options, surface.**
   **Chosen.** One vocabulary covers the observed rail; the existing
   `flyoutItems` becomes the `family` member and nothing else changes shape.

### Shapes and lines

1. **Keep `shapes` and `connectors` as two slots.** Rejected: the observed
   model is one slot whose family includes the line tools, and two slots is a
   visible divergence with no compensating gain.
2. **One `shapes` family: rectangle, diamond, ellipse, arrow, line.**
   **Chosen.** `connectors` retires; `LEGACY_TOOL_MAP` gains one alias row and
   the existing duplicate-drop resolves stored layouts.

### The `+` target and the restore path

1. **Keep the unpinned-tools popover; ship no catalog.** Rejected: row 6
   records the popover as the placeholder for a catalog that does not exist.
2. **The catalog is `+`'s target and the restore home.** **Chosen.** One
   surface answers "what can I pin?", "where did that tool go?" and "what does
   this tool do?" — the questions the popover answered once. ADR-0029's
   guarantee — unpinning is not a one-way door — stands, with the catalog as
   its surface.
3. **Keep both surfaces.** Rejected: two restore paths drift, and the second
   exists only because the first predates the catalog.

### The media slot's name and content

1. **Label it "Media".** Rejected: the matrix omits stickers and GIFs (rows
   42–43), so the label would promise classes the surface does not contain.
2. **Id `media`, label "Emoji", content the picker (C6).** **Chosen.** The
   label follows the content classes; if a later wave adds one, the label
   widens in the same change. Nothing licensed ships: picking is unicode
   (row 41).

### What the diagramming surface ships

1. **Enumerate the stencils now and pick the element mechanics in this
   record.** Rejected: the library's contents were mined at bundle level and
   never opened live, and a new element kind is a schema decision that owes a
   migration and a fixture test (`AGENTS.md` rule 2). Deciding it from thin
   evidence would be inventing.
2. **Decide the surface now; enumerate stencils — and any element-kind work —
   in C1, against live evidence, under the schema rule.** **Chosen.**

## Decision Outcome

The rail keeps its architecture — the arrangement (`{ order, unpinned }`),
the host's ownership, `@firo/ui` rendering ([ADR-0029](0029-the-rail-is-a-per-user-arrangement.md)) —
and each slot gains a **kind**:

- **`tool`** — activation selects a tool. The default kind; every single-tool
  entry stays this, and `comment` stays a tool because arming a mode is a
  tool's business.
- **`family`** — today's flyout: sub-tools that are registry tools, each with
  its own key, and the slot shows the active member's glyph. `shapes` and
  `pen`.
- **`options`** — new. The slot selects its tool as always, and its flyout
  carries *settings and actions*, not tools: swatch grids and preset grids.
  The sticky-note colours (row 19) and the frame presets (row 4) are this
  kind; the sticky flyout's size presets, stack and bulk mode (row 20) join
  the same flyout when C5 builds them.
- **`surface`** — new. Activation opens a host surface rather than selecting
  a tool: a dialog today (`templates`, `ai`), a dock or panel tomorrow
  (`diagramming`, `media`, the catalog).

**The composition.** The default arrangement becomes:

| # | Slot | Kind | Opens |
| --- | --- | --- | --- |
| 1 | `ai` | surface | the assistant |
| 2 | `stickynote` | options | the sticky palette |
| 3 | `templates` | surface | the template dialog |
| 4 | `text` | tool | |
| 5 | `shapes` | family | rectangle, diamond, ellipse, arrow, line |
| 6 | `pen` | family | freedraw, eraser, laser; C1 adds (row 24) |
| 7 | `frame` | options | the size presets |
| 8 | `media` | surface | the emoji picker (C6) |
| 9 | `comment` | tool | |
| 10 | `docblock` | tool | |
| 11 | `diagramming` | surface | the shape-library dock (C1) |

The pinned pointer renders at the head and is not an arrangement entry; `+`
(the catalog), undo and redo render below the arrangement as the fixed utility
tail. The observed rail puts its AI entry above the pointer; ours cannot,
because the pointer is pinned at the head ([ADR-0029](0029-the-rail-is-a-per-user-arrangement.md)) —
one recorded slot of difference, visible only in a fresh profile.

**The catalog.** `+` opens the tools catalog: a `@firo/ui` panel that lists
the arrangement's tools with their pin state, pinned section first, and
reports pin, unpin and restore upward through the callbacks the rail already
uses. The pointer entry appears as pinned and offers no unpin (ADR-0029's rail
rule). This supersedes the restore-list clause of ADR-0029: unpinned tools are
still offered back, through the catalog.

**Content rules.**

- Every glyph, label, stencil and colour value is ours; where the reference
  shows a control, we re-express it in our tokens and our icon set
  ([ADR-0023](0023-open-icons-and-ui-typeface.md)).
- A slot or flyout member ships only when its target exists. The media slot
  lands with C6's picker; the diagramming slot lands with the dock; the
  catalog lands with the panel; a pen mode lands with its tool.
- The pen family grows toward the observed depth in C1. A mode is a real tool
  or a preset of one, with its own key — bound in C2 — or it is recorded as a
  divergence with its reason; it never ships as a button without a tool.
- The diagramming surface is a left-docked shape library whose stencils are
  Firo-authored, enumerated in C1 under the schema rule. Categories may be
  functional (flow chart, UML); the art is ours.

**What this record does not decide.** A separator observed between rail groups
stays unmodelled until the evidence explains the mechanism. Sub-tool key
bindings are C2's. The catalog's out-of-scope categories — apps, integrations —
stay omitted by the matrix.

## Consequences

- `@firo/ui` gains option-flyout rendering and the catalog panel;
  `CreationRail` keeps rendering `RailToolItem`s, and the host keeps deciding
  and persisting. No storage changes: the arrangement's shape is untouched.
- The default arrangement grows by one net slot — `media` and `diagramming`
  join, `connectors` retires into `shapes` — landing at eleven. The whole
  change is one alias row plus two default entries; stored layouts normalise
  through the existing path, where the first occurrence of the pair keeps the
  slot and unpinned wins over visible.
- The restore surface moves; the guarantee does not. The index records
  ADR-0029 as *restore clause superseded by 0031*.
- Three dependencies are stated rather than resolved: the media slot waits
  for C6, new keys wait for C2, and the stencil set is C1's worklist with
  live evidence.
- Fresh profiles only: arrangements override the default, and no stored
  layout is edited by this change.

## Confirmation

- `packages/ui` tests: each kind renders; a family lights on its member; an
  options flyout reports a selection without changing the active tool; a
  surface calls its handler; the catalog lists pinned first and reports
  pin/unpin.
- `apps/web` tests: `normaliseRailLayout` aliases `connectors` once, never
  emits duplicates, and round-trips a pre-change layout without loss; the
  default order matches the composition table; `unpinRailTool` still refuses
  the pointer.
- Side by side: the C1 verification pass checks order, flyout geometry and
  the dock displacement against
  [`miro-geometry.md`](../research/miro-geometry.md) at the reference
  viewport, per the plan's §Verification
  ([`phase-11-miro-parity.md`](../plans/phase-11-miro-parity.md)).

## Pros and Cons of the Options

- **Four slot kinds.** Pro: one vocabulary covers the observed rail and every
  later cluster's entry. Con: the rail's rendering grows a small amount of
  branchy UI — bounded, and tested per kind.
- **Shapes as one family.** Pro: matches the reference model and gives the
  line tools a key-carrying family. Con: one fewer slot to arrange, and a
  stored `connectors` slot resolves into `shapes` — handled by the alias.
- **Catalog as the single restore path.** Pro: one surface for discovery,
  restore and pin state. Con: one more panel to build and keep honest.
- **"Emoji" as the label.** Pro: the label cannot lie about content. Con: a
  rename is owed when content classes widen.
- **Surface now, stencils later.** Pro: no invented schema on thin evidence.
  Con: row 23 stays open until C1 enumerates it.

## More Information

- Matrix rows 3, 4, 6, 19, 23 and 24 (shell and objects tables), 40–41
  (media), and the omissions table's sticker and GIF rows
  ([`miro-parity-matrix.md`](../research/miro-parity-matrix.md)).
- Research: [`miro-ui.md`](../research/miro-ui.md) §The creation rail and §"Where
  Firo and Miro differ"; [`miro-interactions.md`](../research/miro-interactions.md)
  §Tools and creation rail, §Rail flyouts and §Rail flyouts, rendered;
  [`miro-geometry.md`](../research/miro-geometry.md) §The creation rail and
  §Rail flyouts and the shape library.
- Plan: [`phase-11-miro-parity.md`](../plans/phase-11-miro-parity.md) §11.2.
- The guardrail that binds every line: [`miro-ui.md`](../research/miro-ui.md)
  §Clean-room guardrail. Firo's glyphs are ours, by
  [ADR-0023](0023-open-icons-and-ui-typeface.md).
- This record extends [ADR-0029](0029-the-rail-is-a-per-user-arrangement.md)
  and supersedes its restore clause; the index notes it.
