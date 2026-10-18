# The Miro interaction surface, as observed

What every control on a Miro board *is*, what it *does*, and how it is *built*.

This is the companion to [`miro-ui.md`](miro-ui.md). That document covers the
**shell** — where regions sit, how they map to Firo's tunnels, why the aesthetic
is clean. This document covers the **interactions** inside those regions: the
menus, the rail and its flyouts, the toolbars, the context menus, the panels and
the keyboard, with the mechanism behind each.

Researched **13 October 2026**. Live observation **15 October 2026**. Bundle
structure mined **15 October 2026**. Deep pass over every surface (same live
board, scenario-driven DevTools Protocol) **18 October 2026**, written up in
§"The deep pass, surface by surface".

## Clean-room guardrail

The same guardrail as [`miro-ui.md`](miro-ui.md) applies, and the bundle work
made it sharper because it got closer to Miro's own code:

- **Recorded here:** which controls exist, what they do, how they are wired, the
  *shape* of the data Miro uses to describe a control, and the names of internal
  identifiers and icon slots. These are facts about behaviour and structure.
- **Never used:** Miro's source, minified or deminified, their icon files, their
  typefaces (Roobert PRO is commercial), their colour tokens, their brand marks,
  or their marketing copy.

The icons are authored in-repo (ADR-0023) and the chrome typeface is Plus Jakarta
Sans. Internal Miro identifiers below (e.g. `SHAPES_AND_LINES`, `IconStickyNote`)
are quoted only to name a control unambiguously; they are not copied into the
codebase.

## How this was obtained

Three sources, in descending order of authority:

| Source | What it settles | Depth |
| --- | --- | --- |
| **Deep pass** over the live board via Chrome DevTools, 18 Oct 2026 | The rendered grammar of the previously-unopened surfaces — rail flyouts, submenus, panels, dialogs, the palette, the shortcuts modal, both context-menu lanes — plus measured geometry ([`miro-geometry.md`](miro-geometry.md)) | Observed + measured |
| **Live Miro board** via REA + Chrome DevTools, 15 Oct 2026 | Which controls are on screen, their accessibility roles and order, the contents of the menus that could be opened | Observed |
| **Miro's own JS bundles** (`https://mirostatic.com/app/static/*.js`, 420 files, ~54 MB, **structure only**) | The command catalogue and its descriptor shape; categories; the shortcut registry; the context-menu lanes; panel contents; accessibility bindings | Structure mined |
| **Miro's help articles** | Published shortcuts and documented behaviours | Cited per claim |

Evidence bundles and the downloaded scripts were held in a temporary directory
and are **not** committed.

### What the live inspection could and could not do

The 15 October inspection **[live]**:

- **Could:** enumerate the main menu, the Zoom-and-navigation menu, the
  Facilitation-and-reactions menu, Talktracks and the Frames dialog; read the
  rail's entries in accessibility order.
- **Could not:** open hover-triggered submenus (main-menu submenus, rail flyouts,
  Help and avatar menus) — while a portal is open Miro's accessibility tree
  collapses to the trigger button. Those surfaces were recovered from the
  bundles instead, which gives their **contents and behaviour** but not their
  rendered grammar (roles, focus order, labels as painted).
- The canvas is a **WebGL surface**, so board objects never enter the DOM or the
  accessibility tree.
- **Geometry and motion** were out of reach through passive inspection; the agent
  reading this report could not measure the screenshot.

The 18 October deep pass drove the DevTools Protocol directly — synthetic
pointer and keyboard input to open surfaces, `Runtime.evaluate` to read them —
which lifted the limit that mattered most: **every surface the phase plan names
was opened, dumped and photographed**, and computed styles and rects were read
from the rendered DOM. Two limits survive: the canvas is still opaque to the DOM
(only the chrome around it renders elements), and **motion was still not
measured** — no duration or easing is claimed anywhere.

Every claim below is tagged where it comes from: **[live]**, **[bundle]**,
**[docs]** — and **[live, deep pass]** where only the 18 October pass settles it.

## How Miro models an interaction

This is the most useful thing the bundle work produced, because it is the
mechanism every surface shares. **[bundle]**

A control is a **command descriptor**. Miro registers commands into one registry;
the rail, the toolbars, the context menus and the command palette are all *views
over the same registry*. The observed shape:

```js
{
  id: <ENUM>,                       // stable identity, e.g. ERASER, MINIMAP
  actions: {
    main: {                         // the primary state
      ui: {
        title: "<i18n key>",        // label, resolved at runtime
        description: "<i18n key>",
        icon: "IconEraser",         // icon *slot*, not a file
        tooltip: { text: "<i18n key>" },
        category: <CATEGORY>,       // rail grouping, e.g. BASICS
        tag: { type: "beta" }       // optional badge
      },
      actionType: <ACTION_TYPE>,    // Toggle | MultiStep | CREATE | …
      aliases: ["eraser"],          // words the command palette matches
      keyboardShortcut: {
        defaultShortcut: { code: "KeyE", primaryKey, shiftKey, altKey },
        extraShortcuts: [ … ]
      },
      execute: <command>
    },
    active:   { execute: … },       // while the toggle is on
    inactive: { execute: … }        // while the toggle is off
  }
}
```

Consequences worth recording, because they are design decisions Firo can borrow:

1. **One registry, many surfaces.** A rail entry, its tooltip, its context-menu
   item, its command-palette row and its keyboard binding are the *same* command.
   There is no second list to drift. Firo already does the narrow version — the
   rail reads `TOOLS` + `getToolShortcut`
   ([`../plans/phase-7-5-miro-ui.md`](../plans/phase-7-5-miro-ui.md), §7.5.4) —
   and this is the argument for keeping it in 7.5.8 and 7.5.9.
2. **State is modelled, not branched.** A toggle carries `active` and `inactive`
   executors rather than an `if (isOn)` at each call site.
3. **Flyout items are sub-actions of one command.** The Pen entry is one rail
   item whose descriptor also carries `setEraser`, `setHighlighter`,
   `setPrecisionEraser` and `setLasso` — and *each sub-action carries its own
   key*. "Shapes and lines" is one entry with `setCircle`, `setRectangle`,
   `setLine`, `setShape`, each with its own key. One rail slot can hold a family
   of tools without becoming five rail slots. This is the mechanism behind Miro's
   flyouts, and the reason Firo's five flat shape entries are the visible
   divergence.
3. **Icons are slots.** The descriptor names a slot (`IconEraser`); the icon set
   is separate and swappable. Firo's parallel is
   [`@firo/ui/src/icons.tsx`](../../packages/ui/src/icons.tsx) (ADR-0023).
4. **`actionType` drives placement semantics.** `Toggle` tools latch;
   `MultiStep` commands open a dialog or a multi-click flow; `CREATE` opens a
   creation flow. Firo's `CREATION_TOOLS` / `locked` mechanism is the local
   analogue of the one-time-versus-latched distinction.

Scale observed: **295 command descriptors**, **12 categories**, **~22
single-character bindings**, plus a per-widget shortcut layer used inside editors
(emoji picker, kanban, and so on).

### The composition: the registry by category **[bundle]**

Miro's toolbars are **not hand-assembled**. Every command declares a `category`,
and the left creation rail and the *Tools, Media and Integrations* panel are
rendered from that declaration. The toolbar's composition is therefore **data,
not layout** — which is the precondition for pinning, unpinning and reordering
it per user (§Creation rail).

**295 command descriptors** were observed across these categories. Entries under
`OTHER` are largely Miro's integration catalogue; the ~120 with **no** category
are the menu and panel actions described under §The surfaces. (`FROM_MARKETPLACE`
is a declared category with no core member — marketplace apps sit outside this
registry.)

**`BASICS`** — freehand: `ERASER` `HIGHLIGHTER` `LASSO` `PEN` `PRECISION_ERASER`
`SMART_DRAWING`

**`ESSENTIALS`** — `CHART` `COMMENTS` `COUNTDOWN` `COUNTDOWN_TRIGGER` `FLIP_CARD`
`FLOW_CONNECTOR_COMMAND_PALETTE` `FRAMES` `GRID` `MIND_MAP`
`MULTI_STEP_ACTION_COMMAND_PALETTE` `NOTES` `PEOPLE` `PROTOTYPE_LIBRARY`
`SEMANTIC_POSITIONING_COMMAND_PALETTE` `STICKERS` `STICKY_STACK` `STRUCTDOC`
`TEMPLATES` `TEMPLATES_PANEL` `TEMPLATES_VISITORS` `TEXT` `USER_CARD`

**`DIAGRAMMING`** — `AWS_CC_WRAPPER_APP` `CLOUDVIEW_FILTERS`
`DIAGRAMMING_CONTAINERS` `DIAGRAMMING_TEMPLATES` `DIAGRAM_LAYOUT` `DRAW_IO`
`IMPORT_DIAGRAM_APP` `LAYERS` `LINES` `OPEN_IN_DESKTOP` `ORGCHART`
`SHAPES_AND_LINES` `SHAPE_LIBRARY` `WIREFRAMES`

**`FORMATS`** — `ACTION_BUTTON` `ACTIVITIES` `CUSTOMER_JOURNEY_MAP` `DATA_TABLE`
`DIAGRAM` `KANBAN_V2` `MATRIX` `PROTOTYPING_CONTAINER` `SLIDES_FORMAT`
`TALKTRACK_MEDIA` `TIMELINE` `TREE`

**`PLANNING`** — `ASANA_TICKETING` `CLICK_UP_TICKETING` `DEPENDENCY_MAPPER`
`ESTIMATION` `ESTIMATION_TRIGGER` `GITHUB_ISSUES_TICKETING` `KANBAN`
`LINEAR_TICKETING` `RALLY_TICKETING` `SERVICE_NOW_TICKETING` `STORY_POINTS`
`TRELLO_TICKETING` `TSHIRT_SIZING` `USM` `WRIKE_TICKETING`

**`ACTIVITIES`** — `COMPANION_QR` `MATRIX_2X2` `MULTIPLE_CHOICE` `OPEN_ENDED`
`QUIZ_SELECT_ANSWER` `RANKING` `SCALE` `WORD_CLOUD`

**`MEDIA`** — `ADOBE_EXPRESS` `IMAGE_LIBRARY` `MEDIA_LIBRARY`
`RECORDING_LIBRARY_MEDIA` `TALKTRACK_LEGACY_MEDIA` `UPLOAD` `VIDEO`

**`COLLABORATION`** — `ALIGNMENT_SCALE` `ASYNC_INSIGHTS_UI` `DOT_VOTING` `MEET`
`POLLING` `PRESENTATION_MODE` `PRIVATE_MODE` `SPINNER` `VOTING` `VOTING_TRIGGER`

**`CUSTOMIZABLE_WIDGETS`** — `ANYTHING_STACK` `CUSTOM_WIDGET` `WORKFLOW_BUTTON`

**`ASSISTIVE_TECHNOLOGY`** — `ACCESSIBILITY_COMMAND_PALETTE`

**`OTHER`** — `A11Y_CHECKER` `AGENT_MENTION_REPLY` `APP_LIBRARY`
`AUTO_LAYOUT_CONTAINER` `CANVAS_DEV_TOOLS` `CUSTOM_MCP_CONNECTOR` `CUSTOM_TRIVIA`
`CUSTOM_WIDGET_GALLERY` `D20` `DATA_TABLE_CONNECTIONS` `DEMO_1D_LAYOUT`
`DESIGN_SYSTEM_DEMO` `DIVIDER` `EVALS_WIDGET_TOOL` `EXPERIMENTAL_WIDGETS_GALLERY`
`FEEDBACK_LOOP_CARD` `FEEDBACK_LOOP_MENTION` `FLOW_TEMPLATES` `GENAI_PANEL`
`HTML_TO_FORMAT` `HTML_WIDGET_COMMENTS` `HTML_WIDGET_EXPORT` `HTML_WIDGET_PREVIEW`
`LEADERBOARD` `LOCAL_AGENTS` `MEDIA_PLAYER` `MINDMAP` `MIRO_LITE_TEMPLATES`
`OMNIBAR` `PHOTOBOOTH_CAMERA` `PORTAL` `PROTOTYPE_CONNECTORS_TOGGLE`
`PROTOTYPE_IMPORT_STYLES` `PROTOTYPING_CONNECTOR_COMMAND_PALETTE` `RED`
`SHAREABLE_PRESENTATION` `STICKERS_BULK` `STICKERS_RECOGNITION` `SURFACE`
`TEMPLATE_MANAGER` `VALIDATION_REPORT` `WORKFLOW_HTTP_REQUEST` — plus roughly
thirty-five further connectors (`ASANA_CONNECTOR`, `ATLASSIAN_CONNECTOR`,
`SLACK_CONNECTOR`, `NOTION_CONNECTOR`, `GITHUB_CONNECTOR`, `GITLAB_CONNECTOR`,
`LINEAR_CONNECTOR`, `GOOGLE_DRIVE_CONNECTOR`, `GMAIL_CONNECTOR`,
`GOOGLE_CALENDAR_CONNECTOR`, `GOOGLE_CHAT_CONNECTOR`, `AIRTABLE_CONNECTOR`,
`AMPLITUDE_CONNECTOR`, `CANVA_CONNECTOR`, `CODA_CONNECTOR`,
`DATABRICKS_GENIE_ONE_CONNECTOR`, `DATABRICKS_SQL_CONNECTOR`,
`DEEPWIKI_CONNECTOR`, `DROPBOX_CONNECTOR`, `GLEAN_CONNECTOR`, `GRANOLA_CONNECTOR`,
`INCIDENT_IO_CONNECTOR`, `LOOKER_CONNECTOR`, `LOVABLE_CONNECTOR`,
`MIXPANEL_CONNECTOR`, `PENDO_CONNECTOR`, `SALESFORCE_CONNECTOR`,
`SNOWFLAKE_CONNECTOR`, `TRELLO_CONNECTOR`, `WRIKE_CONNECTOR`, `ZOOM_CONNECTOR`
and the ticketing set).

**Uncategorised (menu and panel actions, ~120)** — `ACC_SETTINGS` `ACTIVITY_LIST`
`ACTIVITY_PANEL` `ADD_LINK_TO_OBJECT` `AI_CANVAS_FORMATS_AND_FLOWS_MENU`
`AI_DIAGRAM` `AI_DIAGRAM_COMPANION` `AI_HELP_CENTER` `AI_LAYOUT_TOGGLE`
`ALIGN_OBJECTS` `BACKGROUND_MENU` `BOARD_DETAILS` `BOARD_EXPORT_BACKUP`
`BOARD_EXPORT_EMBED` `BOARD_EXPORT_IMAGE` `BOARD_EXPORT_PDF`
`BOARD_EXPORT_SPREADSHEET` `BOARD_RECORDING` `BOARD_TRANSLATOR` `BREAKOUT_ROOMS`
`CLUSTERING` `CODE_WIDGET` `COLLAB_CURSORS` `COLLABORATION_SOUNDS`
`COMMAND_PALETTE_TOGGLE` `COMMENTS_ON_BOARD` `CREATE_NEW_BOARD`
`CREATION_BAR_VISIBILITY` `CURSOR` `CURSOR_TEXT` `DARK_MODE` `DELETE`
`DO_NOT_DISTURB` `DUPLICATE` `FEED` `FIND` `FOLLOW_THREADS` `FORMAT_SHARE`
`FROM_CHROME_EXTENSION` `FRAMES_LIST` `FRAMES_NAVIGATION` `FULL_SCREEN`
`GOOGLE_DRIVE` `GRID_MENU` `HELP_CENTER` `LANGUAGE_MENU` `LEARNING_CENTER`
`LOCK_DEFAULT_VIEW` `LOGOUT` `MANAGE_ANNOTATIONS` `MINIMAP` `NAVIGATION_MENU`
`ONE_DRIVE` `OPEN_BOARD_SOURCE` `OTHER_PROJECT` `OTHER_TEAM` `PASTE_IFRAME`
`PERFORMANCE_MODE` `PERFORMANT_NAVIGATION` `PIPMATRIX` `PROTOTYPING`
`PROTOTYPING_PREVIEW` `PSEUDO_LOCALIZATION` `REACTION` `REDO` `REDUCE_MOTION`
`SAVE_BOARD_AS_TEMPLATE` `SAVE_TO_GOOGLE_DRIVE` `SCROLL_BARS` `SEND_FEEDBACK`
`SEND_TO_DISPLAY` `SET_START_VIEW` `SHARE_BOARD` `SHORTCUTS`
`SHOW_OBJECT_DIMENSIONS` `SINGLE_CHARACTER_SHORTCUTS` `STAR_BOARD`
`SWITCH_TOOL_BY_INPUT_TYPE` `TABLES_AND_CHARTS` `TITLE_BOARD` `UNDO`
`UNDO_REDO_CONTROLS` `UNSPLASH` `WHAT_IS_NEW` `WORKFLOW` `ZOOM_CONTROLS` — plus
the embed family (`BOX`, `BOX_EMBED`, `CONFLUENCE_EMBED`, `FIGMA_EMBED`,
`GOOGLEDOCS_EMBED`, `GOOGLESHEETS_EMBED`, `GOOGLESLIDES_EMBED`, `LOOKER_EMBED`,
`MSEXCEL_EMBED`, `MSPOWERPOINT_EMBED`, `MSWORD_EMBED`, `POWERBI_EMBED`) and the
ticketing family (`AHA_TICKETING`, `AZURE_CARDS`, `JIRA`, `RALLY`,
`SALESFORCE_TICKETING`, `ZENDESK_TICKETING`).

On top of the twelve categories the panel adds three **pseudo-sections**:
`pinned`, `libraries` and `plugins`.

## The command catalogue

A **selection** of descriptors, grouped by the surface that hosts them, with the
icon slot each declares. **[bundle]** The exhaustive list is the by-category
composition above — this is the subset worth naming individually, including the
icon slots (which Miro resolves from a separate icon set; the drawings were never
retrieved and would not be copied in any case).

### Tools and creation rail

| Command id | What it does | Icon slot |
| --- | --- | --- |
| `CURSOR` | the pointer — select and hand merged into one toggling control | `IconHand` |
| `STICKERS` | sticky note | `IconStickyNote` |
| `TEXT` | text | `IconTextT` |
| `SHAPES_AND_LINES` | the shape group; flyout carries rectangle / line / shape / circle | `IconShapesLines` |
| `PEN` | freehand pen (flyout: pen, highlighter, eraser, precision eraser, lasso) | `IconPenTip` |
| `HIGHLIGHTER` | highlighter | `IconHighlighter` |
| `ERASER` | eraser | `IconEraser` |
| `PRECISION_ERASER` | pixel eraser | `IconPixelEraser` |
| `LASSO` | lasso select | `IconLasso` |
| `FRAMES` | frame | `IconFrame` |
| `FRAMES_LIST` | frames panel / frame navigation | `IconFrameLinesTwo` |
| `COMMENTS` | comment tool | `IconChatLinesTwo` |
| `TEMPLATES_PANEL` | templates modal (what hotkey `2` opens) | `IconLayout` |
| `MIRO_LITE_TEMPLATES` | lightweight template sidebar | `IconLayout` |
| `DIAGRAMMING_TEMPLATES` | diagramming templates | `IconLayout` |
| `DIAGRAMMING_CONTAINERS` | container shapes | `IconRectanglePortraitDash` |
| `MINDMAP` | mind map | `IconPlaceholder` |
| `CARD_WIDGET` | card | `IconCard` |
| `PORTAL` | portal (content reused across boards) | `IconArrowsClockwiseX` |
| `MEDIA_PLAYER` | media player widget | `IconVideoPlayer` |
| `PHOTOBOOTH_CAMERA` | photobooth / camera widget | `IconCamera` |
| `CUSTOM_WIDGET_GALLERY` | custom-widget gallery | `IconGridFour` |
| `EXPERIMENTAL_WIDGETS_GALLERY` | experimental widgets | `IconSquareTriangleCirclePlus` |
| `BACKGROUND_MENU` | canvas background colour | `IconPaintBucket` |
| `AI_CANVAS_FORMATS_AND_FLOWS_MENU` | the `+` / formats-and-flows menu | `IconPlusLinesBox` |
| `REACTION` | send a reaction | `IconThumbsUp` |

### Board, view and settings

| Command id | What it does | Icon slot |
| --- | --- | --- |
| `CREATE_NEW_BOARD` | new board | `IconPlus` |
| `DUPLICATE` | make a copy | `IconSquaresTwoOverlap` |
| `STAR_BOARD` | star / unstar the board | `IconStar` |
| `SHARE_BOARD` | share | `IconUsers` |
| `BOARD_DETAILS` | board info | `IconInformationMarkCircle` |
| `TITLE_BOARD` | rename the board | `IconSquarePencil` |
| `SET_START_VIEW` | save the current view as the start view | `IconCornersThreeEyeOpen` |
| `MANAGE_ANNOTATIONS` | annotation categories | `IconTag` |
| `DELETE` | delete the board | `IconTrash` |
| `LOGOUT` | log out | `IconUser` |
| `ACC_SETTINGS` | profile settings | `IconUser` |
| `COMMENTS_ON_BOARD` | show / hide comment pins | `IconChatLinesCross` |
| `FULL_SCREEN` | enter / exit full screen | `IconArrowsOutSimple` |
| `SHOW_OBJECT_DIMENSIONS` | object-dimensions overlay | `IconArrowsOutLinesHorizontal` |
| `SCROLL_BARS` | show scrollbars | `IconScrollbarXy` |
| `UNDO_REDO_CONTROLS` | where undo/redo dock | `IconArrowCounterClockwiseDownLeft` |
| `GRID_MENU` | grid submenu (none / line / dot, snap-to) | `IconGrid` |
| `LANGUAGE_MENU` | language | `IconGlobe` |
| `ALIGN_OBJECTS` | alignment helpers | `IconRectanglesThreeAligned` |
| `SWITCH_TOOL_BY_INPUT_TYPE` | pen / touch behaviour | `IconPen` |
| `NAVIGATION_MENU` | mouse vs trackpad | `IconShuffle` |
| `UNDO` / `REDO` | history | `IconArrowArcLeft` / `IconArrowArcRight` |
| `FIND` | find and replace | `IconMagnifyingGlass` |
| `COMMAND_PALETTE_TOGGLE` | the `⌘K` palette | `IconMagnifyingGlassLightning` |
| `ZOOM_CONTROLS` | zoom in / out and the percentage menu | `IconPlus` |
| `MINIMAP` | the pin map / minimap | `IconMap` |
| `HELP_CENTER` / `AI_HELP_CENTER` | help | `IconBookOpenInfo` |
| `LEARNING_CENTER` | learning | `IconGraduationCap` |
| `SEND_FEEDBACK` | feedback | `IconSmileyChat` |
| `WHAT_IS_NEW` | release notes | `IconGift` |
| `SHORTCUTS` | the shortcut list (`F1`) | `IconKeycap` |
| `SINGLE_CHARACTER_SHORTCUTS` | turn single-key shortcuts off | `IconKeycapSingle` |
| `DARK_MODE` | dark mode | `IconMoon` |
| `DO_NOT_DISTURB` | pause notifications (30m / 1h / 2h / tomorrow) | `IconMoon` |
| `REDUCE_MOTION` | reduce motion | `IconCircleMotionX` |
| `FOLLOW_THREADS` | notify on thread activity | `IconBell` |
| `CREATION_BAR_VISIBILITY` | show / hide the creation toolbar | `IconEyeOpen` |
| `PERFORMANCE_MODE` | performance mode | `IconGauge` |
| `PSEUDO_LOCALIZATION` | pseudo-locale testing | `IconGlobe` |
| `COLLABORATION_SOUNDS` | join / leave sounds | `IconSpeakerHigh` |
| `OPEN_IN_DESKTOP` | open in the desktop app | `IconLaptop` |
| `LOCK_DEFAULT_VIEW` | lock the default view | `IconLockOpen` |

### Collaboration, activity and presence

| Command id | What it does | Icon slot |
| --- | --- | --- |
| `COLLAB_CURSORS` | show collaborators' cursors | `IconNavigationArrowLines` |
| `CURSOR_TEXT` | cursor text / chat | `IconChat` |
| `SEND_TO_DISPLAY` | send to an interactive display | `IconRectangleTriangleBottomCenter` |
| `ACTIVITY_LIST` | board activity / version history | `IconClockCounterClockwise` |
| `ACTIVITY_PANEL` | the activity tab | `IconActivity` |
| `FEED` | the notifications bell | `IconBell` |

### Export and sharing

| Command id | What it does | Icon slot |
| --- | --- | --- |
| `BOARD_EXPORT_IMAGE` | save as image | `IconImage` |
| `BOARD_EXPORT_PDF` | save as PDF | `IconPdf` |
| `BOARD_EXPORT_SPREADSHEET` | export to spreadsheet | `IconGridFour` |
| `BOARD_EXPORT_EMBED` | embed | `IconBracketsAngleSlash` |
| `BOARD_EXPORT_BACKUP` | download a backup | `IconDownload` |
| `HTML_WIDGET_EXPORT` | export an HTML widget | `IconDownload` |
| `HTML_WIDGET_PREVIEW` | preview an HTML widget | `IconPlay` |
| `FORMAT_SHARE` | copy a format link | `IconLink` |
| `SAVE_TO_GOOGLE_DRIVE` / `GOOGLE_DRIVE` | Google Drive | `IconGoogleDrive` |

### Prototyping, presentation and workflows

| Command id | What it does | Icon slot |
| --- | --- | --- |
| `PROTOTYPING` | generate a prototype (AI-assisted) | `IconSparksFilled` |
| `PROTOTYPING_CONTAINER` | prototype container | `IconPrototypeFormat` |
| `PROTOTYPING_CONNECTOR_COMMAND_PALETTE` | create a prototype connection to… | `IconConnectionLineElbows` |
| `MULTI_STEP_ACTION_COMMAND_PALETTE` | confirm a multi-step action | `IconNodeConnectedDot` |
| `SEMANTIC_POSITIONING_COMMAND_PALETTE` | move an object (semantic) | `IconArrowsOutCardinal` |
| `FLOW_CONNECTOR_COMMAND_PALETTE` | start a new flow from… | `IconArrowCurvesSparks` |
| `PRESENTATION_MODE` | start a presentation | `IconPlay` |
| `SHAREABLE_PRESENTATION` | a shareable presentation link | `IconPresentationLink` |
| `FRAMES_NAVIGATION` | move between frames | `IconPlay` |
| `WORKFLOW` | show flow lines | `IconArrowCurvesSparks` |
| `ASSIGN_BOARD_STATUS_MENU_ITEM` | assign a board status | `IconTickCircle` |
| `CHANGE_BOARD_STATUS_MENU_ITEM` | change the board status | `IconTickCircle` |

### AI, agents and insights

| Command id | What it does | Icon slot |
| --- | --- | --- |
| `AI_DIAGRAM` | diagram from text | `IconDiagramming` |
| `AI_DIAGRAM_COMPANION` | AI diagram companion | `IconDiagramming` |
| `AI_LAYOUT_TOGGLE` | AI layout suggestions | `IconSingleSparksFilled` |
| `ASYNC_INSIGHTS_UI` | async insights | `IconSparks` |
| `LOCAL_AGENTS` / `LOCAL_AGENTS_PANEL` | local agents | `IconAiText` |
| `AGENT_MENTION_REPLY` | reply to an agent mention | `IconPlaceholder` |

**Also present:** `ACCESSIBILITY_COMMAND_PALETTE` (the accessible board overview),
`CANVAS_DEV_TOOLS`, `CUSTOM_WIDGET_GALLERY`, `EXPERIMENTAL_WIDGETS_GALLERY`,
`SAVE_BOARD_AS_TEMPLATE`, `TEMPLATE_MANAGER`, `CLOUDVIEW_FILTERS`,
`OPEN_BOARD_SOURCE`, `EXBED_VIEW_ONLY_FRAME_NAVIGATION`, `EXBED_LEARN_MORE`,
`MINDMAP`, `STRUCTDOC`, `DATA_TABLE` (format commands) and the **Miro
Assist/plugin** family.

## The surfaces

### Board menu and the main menu **[live + bundle]**

The top-left `toolbar "Board"` holds **Open Sidebar**, **Home** and **Main
menu**. **[live]** The main-menu items, enumerated live, are **Board**, **Edit**,
**View**, **Preferences**, **Accessibility** and **Send to interactive display**.

The submenu contents come from `board.header.components.*` **[bundle]**:

| Menu | Items |
| --- | --- |
| **Board** (`boardSettingsPanel.*`) | New board · Profile settings · Share board · Star/Unstar this board · Make a copy · Board details · Manage annotations · Start view · Switch tool by input type · Grid submenu · Snap to grid · Dot grid · Line grid · Align objects · Mouse/trackpad · Language · Other project / Other team · Delete · Log out |
| **Edit** (`edit.*`) | Undo · Redo · Find · **Commands** (the `⌘K` palette) |
| **View** (`view.*`) | Comments on board · Full screen (enter/exit) · Object dimensions · Scrollbars · Undo/Redo controls |
| **Preferences** (`settingsPanel.*`) | Follow threads · Reduce motion · Help centre · Learning centre · Send feedback · Keyboard shortcuts · What's new · Mouse or trackpad · Log out |
| **Accessibility** | the accessible-overview entry and the single-character-shortcut toggle |

The board title is a button that renames on click (`boardTitle.changeTitle`,
`boardTitle.changeThumbnail`), with a saving/saved indicator and a
`boardTitle.saveFailed` state **[live + bundle]**.

**"Send to interactive display"** appears twice in the DOM **[live]** — which is
how it was confirmed as a main-menu item rather than a top-bar button.

### Creation rail **[live]**

The left `toolbar "Creation"`, in observed accessibility order:

`Select` · `Sticky note` · `Templates` · `Text` · `Shapes and lines` · `Pen` ·
`Frame` · `Stickers, Emoji and GIFs` · `Comment` · `Diagramming shapes` ·
`Tools, Media and Integrations`

Undo and Redo sit directly under it, and each entry is a drag source onto the
canvas.

**Customisation** (the mechanism behind 7.5.8) **[bundle + docs]**:

- the rail's context menu offers exactly two commands,
  `creationBar.contextMenu.pinApp` and `creationBar.contextMenu.unpinApp` —
  "Pin" and "Unpin";
- the tools/media panel is grouped by category with a **`pinned`** section first,
  plus `helpers.getEmptyMessage.allPinned` and `viewList.noAdditionalApps` for the
  empty cases;
- the arrangement is saved **per profile** and is **not available on touch
  devices** **[docs]**;
- Select/Hand cannot be unpinned **[docs]**.

### Rail flyouts **[bundle]**

- **Pen** — one slot, five tools: pen (`P`), highlighter, eraser (`E`),
  precision eraser, lasso.
- **Shapes and lines** — one slot, four tools: circle (`O`), rectangle (`R`),
  line (`L`), shape (`S`).

Each sub-action carries its own keyboard binding, which is why one rail entry can
own a family of tools.

**Rendered on 18 October [live, deep pass]:** the flyouts were opened and
captured — the sticky-note flyout (a 16-swatch colour grid, then Stack /
Templates / Bulk mode), the pen flyout (five modes with the active one
highlighted, then presets), the shapes quick strip, the frames presets, the
full-height media library, the tools catalog and the templates modal. Contents
in §"The deep pass, surface by surface"; measurements in
[`miro-geometry.md`](miro-geometry.md).

### Canvas controls and the navigation menu **[live]**

The bottom-right `toolbar "Controls"`: `Zoom out` · `Zoom and navigation` ·
`Zoom in` · `Help and resources` · `Frames`, plus the zoom-percentage readout.

The **Zoom and navigation** menu, enumerated live on 15 October, contained:
*Enter full screen*; *Show minimap* `(M)`; *Grid*; *Object dimensions* (a
checkbox item); *Fit to screen* `(⌥1)`; and the zoom stops 50 %, 70 %, 100 %
`(⌘0)`, 400 %, 1200 %, 2000 % `(⌥3)`. **On 18 October the same menu carried the
same items down to 400 % but no 1200 % / 2000 % stops** — the stops may be
conditional on state or licence, or the product changed; not resolved (see
[`miro-ui.md`](miro-ui.md) §"Still unverified").

The **minimap is not a top-level button** — it lives inside this menu, which is
why Firo's minimap is a `NavToolbar` concern.

### The two context-menu lanes **[bundle]**

Miro keeps **two** menus, and the naming is the tell:

- **`board.contextMenu.cmItems.horizontal.*`** — the floating toolbar beside a
  selection, with groups named
  `horizontal.groups.{arrangement.tools, organization, colors, typography,
  formatting.tools, advanced.tools, content.tools, frame.options, menu.options,
  card.properties, additional.options}`.
- **`board.canvas.commons.services.contextmenu.horizontal.*`** — the *property*
  controls inside that toolbar: `fillColor`, `borderItem` (thickness, corners),
  `textColor`, `textHighlight`, `textposition`, `fontSizeItem.auto`, `addList`
  (bulleted / ordered, indent increase / decrease), `lineStart` / `lineEnd`,
  `linkLineType.lineJumps`, `stickerSize`, `ratio`, `insertShape`, `switchType`
  (`checkbox` / `radio` / `switch`), `dividerStyle`, `increaseSpace`,
  `showFrame` / `hideFrame`, and an `erd` sub-menu (add row above / below, delete
  row).
- **`board.contextMenu.cmItems.vertical.*`** — the right-click menu proper:
  `infoItem` (content, copy, created, last modified, requested by, word count,
  "and Miro AI"), `pasteItem`, `widgetTypePickerItem`.

Grouped actions in the horizontal lane include alignment and distribution,
background-with-opacity, border and corner styling, card colour, **convert to**
(diagram, kanban, table, timeline, prototype, Jira, Azure, business process map,
more integrations), font size, line and connection types, matrix layout,
multi-colour randomise, org-chart CSV import, pinning a page, refreshing
metadata, image replacement (upload / URL / library), scale-to-size
(original / half / match width / match height), split-into-page, and a large
**Miro Assist** group (adjust / create category, cluster by keywords or
sentiment, explore sidekicks).

**Rendered on 18 October [live, deep pass]:** both lanes were captured in full —
the right-click menu on empty canvas and on an object, and the selection
toolbar with its 16 controls. §"The deep pass, surface by surface" lists the
items; metrics are in [`miro-geometry.md`](miro-geometry.md).

### Activity and version history **[bundle]**

`ACTIVITY_LIST` opens a panel with two tabs, `activityTab` and `versionsTab`. The
activity tab records `added` / `deleted` / `edited` per item. The versions tab is
version history: `boardHistory.new`, `restoreButton`, `saveAsCopyModal.*`
(restore into a new board named by the user), `someObjectsWereNotRestored`, and a
paywall string. Both tabs have empty and error states.

**18 October [live, deep pass]:** the Activity control opens the **comments side
panel** (tabs *Board* / *Team*) — the Team tab is the activity feed. The versions
tab was not reached in the deep pass; the bundle description above still stands.

### Comments **[bundle]**

`board.comments.*` covers the full lifecycle: add a comment or reply, mentions,
emoji reactions, edit, delete, **resolve / unresolve**, follow / unfollow a
thread, mark unread, previous / next comment, save a draft, and per-thread menu
items (`copyLink`, `pin`, `resolve`, `unresolve`, `delete`, `deletethread`).
There is also an **annotations** sub-feature with named categories and positions.

**18 October [live, deep pass]:** clicking the comment tool and then the canvas
opens the composer pinned at the click point (placeholder "Add a comment. Use @
to mention."); Escape discards it. The comments panel carries the *Board* /
*Team* tabs and an "All comments" filter, with resolved comments hidden by
default.

### Command palette **[docs + bundle]**

`⌘K` (`COMMAND_PALETTE_TOGGLE`) searches the same registry; `aliases` supply the
match words. Multi-step commands have a variant
(`multiStepActionCommandPalette`, `semanticPositioningCommandPalette`,
`flowConnectorCommandPalette`) where the palette then asks for a target — e.g.
"create prototype connection to…".

**18 October [live, deep pass]:** `⌘K` opened the palette as a ~546 px x-centred
panel with the hint "Search for apps and actions…" and a single list mixing
**apps** (Stickers, Diagramming shapes, Templates…) and **actions** (Timer, Save
as PDF, Sticky note `N`, Frame `F`, Grid, Mind map…), each with its key chip
where one exists. Escape closes. This matches the bundle's registry model
exactly.

### Accessibility layer **[live + bundle]**

The shell ships an accessibility layer as a first-class feature: a **Skip to
first object on the board** button, an **Explore board content** button, an
**Accessibility help** link, and on-screen guidance naming `⌘ + K` and a
board-overview key. **[live]**

The bundles name the accessible overview `ACCESSIBILITY_COMMAND_PALETTE`
(`accessibilityCommandPalette.boardsummary.title`) with sub-views that carry
their own keys — `objectdetails` `(I)`, `objectcontent` `(R)`,
`objectconnectors` `(.)`. **[bundle]**

> **Discrepancy, recorded rather than smoothed over.** The live on-screen
> guidance names `⌥ + O` for the board overview; the bundle binds
> `ACCESSIBILITY_COMMAND_PALETTE` to `⌥ + S`. Both were observed; they may be
> different entry points, or the guidance may be stale. Not reconciled.
>
> **18 October:** the deep pass synthesised `⌥O` (as both `o` and `ø`, with
> Alt) and the overview did not surface; nothing else was tried. Restated,
> unresolved.

## The deep pass, surface by surface (18 October 2026)

Every surface the 15 October pass had to recover from bundles was opened on the
live board through synthetic input and read from the rendered DOM. Measurements
are in [`miro-geometry.md`](miro-geometry.md). **[live, deep pass]**

### Board bar and people bar

The board bar is sidebar toggle · Home · board thumbnail · board title ·
**main menu**. The people bar, left to right: **facilitation** · **Activity** ·
**Talktracks** · **avatar** · **Present** · **Share**. Menus open on a common
line just under the bars.

### Facilitation: reactions, Timer, Voting

- The facilitation menu is a row of six reactions (thumbs-up, love, fire, wow,
  celebration, wave) above the items **Timer**, **Voting**, **Private mode**,
  **Notes**.
- **Timer** opens a small setup popover: a minute stepper, a "Pick music"
  combobox, a prominent **Start** and a close control. No timer was started.
- **Voting** opens the 380 px side panel: tabs *New session* / *Results*;
  steppers for *votes* (observed 3) and *minutes* (observed 2); toggles *One
  vote per object* (off) and *Show results on the board* (on); a **Filter** box
  listing eligible types with counts (sticky notes, shapes, images, text,
  cards); and a footer **Start** + **Add to board**. Opening it puts a transient
  **"Voting area" frame** on the canvas; closing removes it — board verified
  clean afterwards.
- **Notes** and **Private mode** were listed but not activated.

### The rail, again

Two reads of the rail minutes apart on the same account returned different
compositions ([`miro-geometry.md`](miro-geometry.md) tabulates both) — the rail
is per-user state. The later read also shows a **separator** between the comment
tool and a newly present entry: the rail is a list of *groups*, not one column.
The AI entry carried an admin-gating tooltip on this account.

### Rail flyouts, rendered

- **Sticky notes** — a 2 × 8 colour grid (16 swatches, 50 px cells), then
  **Stack**, **Templates**, **Bulk mode**.
- **Pen** — five modes (pen, highlighter, smart pen, eraser, precision eraser),
  the active mode highlighted, then a divider and preset slots.
- **Shapes** — a quick strip of basic shapes, 240 px wide.
- **Frames** — a small presets panel, 256 × 357.
- **Media** — a full-height library panel, 368 × 746.
- **Tools (`+`)** — the catalog of apps and tools, 450 × 746.
- **Templates** — the full-screen modal, 1 160 × 736, centred, dimmed backdrop.

### Side panels

Comments and Frames dock at the right inset (340 × 746); Voting is 380 wide.
**A docked right panel pushes the bottom-right control strip left** by the panel
width + 8, keeping its usual 12 px gap to it. Escape does **not** close side
panels; each carries its own close control. On the canvas, Escape closes menus
and popovers.

### Share

A 600 × 433 dialog, x-centred, with tabs **Invite** (an emails / user-groups
field), **Embed**, **Publish**, **AI**. The body carries a **Board access**
section: the owner row ("You're the board owner" with *Manage access*), a team
row with an access selector ("No access"), and an "Anyone with the link" row
with a second access selector ("No access"). The footer offers **Copy board
link** and **Sharing settings**. Nothing was exercised — no invites, no link
changes, no copying.

### Command palette and the shortcuts modal

- `⌘K` opens the palette (~546 px, x-centred) with the hint "Search for apps and
  actions…" and one list mixing apps and actions (Timer, Frame, Mind map, Grid,
  Diagramming shapes, Stickers, Emoji and GIFs, Templates, Save as PDF, Sticky
  note…) with key chips where a binding exists. Escape closes.
- Help → **Keyboard shortcuts** opens a rendered cheat-sheet (78 captured rows)
  corroborating the published map, including the blocks section (`⌘⌥0…6`, `⌘/`,
  `⌘E`, `⌘⇧U`, `⌘⇧X`, `⌘⌥M`, `⌘,`) and `⌥⌘K`, `⌘⇧L`, `⌘⇧F`. It is read-only, not
  a settings surface.
- The accessible board overview (on-screen guidance names `⌥O`) did **not** open
  under synthesised `⌥O`; see the discrepancy note above.

### The two context-menu lanes, rendered

- **Empty canvas, right-click:** Paste · Unlock all · Add text · Add sticky
  note · Add comment · Set start view · Set current view as start · a checkable
  group (Show grid ✓, Show comments on board ✓, Snap to grid ☐, Snap objects ✓,
  Show object size ☐, Suggest object size ✓) · Mouse or trackpad · Show all
  (⌥1). Near the bottom edge the menu flips **above** the cursor.
- **Object, right-click** (observed on a sticky): Copy · Copy link · Copy as
  image · Duplicate · Delete · Add comment · Copy style · Paste style · Clear
  content · Arrange ▸ · Link to · Lock · Create frame · Save as template ·
  Export to CSV (Excel) · Info ▸ — with separators after Delete, Clear content,
  Arrange, Create frame and Export to CSV, and painted shortcuts per item.
- **Selection toolbar** (the floating lane): appears on selection, centred above
  the object — Switch type · Convert to · Font style (family) · font size ± ·
  Font style · Alignment · Insert link · Sticky note size · Fill color · Show
  author · Add tag · Add emoji · Comment · Lock · Miro AI · More.

### Creating an object

- Double-click on empty canvas did **not** quick-add anything under synthetic
  events (two attempts); creation was verified the documented way — arm the
  rail's sticky tool, then click the canvas. The sticky lands in **edit mode**.
- The in-canvas text editor for a sticky is a rich-text editor (Quill-family),
  not a plain textarea.
- Escape leaves edit mode with the object **selected**; Delete removes it;
  undo/redo stayed disabled until a change existed.
- The comment tool arms a pointer: clicking the canvas opens the composer
  pinned at the click point (see § Comments).

### Menus carry three metric systems

App menus: 40 px items at 44 px pitch. The sidebar's create dropdown: 48 px
pitch. Canvas context menus: 32 px items at 36 px pitch. It reads as a defect
until measured; tabulated with widths in
[`miro-geometry.md`](miro-geometry.md).

## The keyboard

Two sources that agree almost everywhere: the bundle registry **[bundle]** and
Miro's published *Shortcuts and hotkeys* **[docs]**. Where they differ, both are
shown.

### Tool and command keys

| Key | Miro | Source |
| --- | --- | --- |
| `V` | cursor / select (the merged Select-Hand control) | bundle + docs |
| `H` | hand | docs |
| `T` | text | bundle + docs |
| `N` | sticky note | bundle + docs |
| `O` | shapes group → circle / oval | bundle |
| `R` | shapes group → rectangle | bundle + docs |
| `L` | shapes group → line / connector | bundle + docs |
| `S` | shapes group → shape | bundle |
| `P` | pen | bundle + docs |
| `E` | eraser | bundle + docs |
| `C` | comment | bundle + docs |
| `F` | frame (`⌘F` is find) | bundle + docs |
| `M` | minimap / pin map | bundle + docs |
| `G` | grid | docs only — see below |
| `D` | card | docs |
| `Y` | data table (`⌘Y` is redo) | bundle |
| `X` | structured document | bundle |
| `I` | accessible overview → object details | bundle |
| `R` | accessible overview → object content | bundle |
| `.` | accessible overview → object connectors | bundle |
| `⌘K` | command palette | bundle + docs |
| `⇧C` | show / hide comments on the board | docs |

**What Firo bound.** Two rows in this table describe a Miro key whose Firo
feature already existed with no shortcut: `M` and `G`. Both are now bound —
`G` to the grid toggle and `M` to the minimap toggle
([ADR-0030](../adr/0030-keyboard-parity-with-miro.md)) — while the rows with no
Firo counterpart (`S`, `C`) stayed unbound on purpose, and the Firo-only extras
were kept.

**On `G`.** The live *Zoom and navigation* menu renders `(M)` against *Show
minimap* but shows **no key against Grid**, and the bundle scan found no `KeyG`
binding either. `G` for grid therefore rests on Miro's **published hotkey list**
alone — the weaker of the two sources this document uses, and the only binding
here that a single source carries. It was bound anyway
([ADR-0030](../adr/0030-keyboard-parity-with-miro.md)), for a reason worth stating
rather than glossing over: the evidence is thin, but the *cost* of following it is
near-zero, because plain `G` was unbound in Firo and the comment above the binding
in `actionToggleGridMode` records that `Ctrl`/`⌘`+`G` still groups. If the
published list is ever corrected, the binding is a one-line change and nothing
else depends on it. This is a deliberate exception to the rule that a
`[docs]`-only row is not enough to bind, and it is recorded here so that it is not
later mistaken for a `[bundle]`-grade finding.

### Editing, navigation and modifiers

Copy / cut / paste, `⌘A` select all, `⌘Z` undo, `⌘Y` (and `⌘⇧Z`) redo, `⌘F`
find, `⌘D` duplicate, `⌥`+drag duplicate, `⌘G` / `⌘⇧G` group / ungroup, `⌘⇧L`
lock, `⌘⇧P` protected lock, `PgUp` / `⌘↑` bring to front, `PgDn` / `⌘↓` send to
back, `⌥⌘K` add / edit a link to an object, `⌘0` zoom to 100 %, `⌥1` zoom to fit,
`⌥2` zoom to selection, `⌘+` / `⌘-` zoom, `Space`+drag to pan **[docs]**.

Board navigation **[docs]**: `Tab` / `⇧Tab` walk objects top-left to bottom-right;
`⌘`+arrows walk them spatially; `⌘⇧`+arrows move in and out of a container; `B`
focuses the board; `Enter` edits; `Esc` stops editing, quits, and returns to the
toolbars; `Tab` / `⇧Tab` move between toolbars and arrows move within one. The
single-character shortcuts can be switched off from **Accessibility** so they do
not fight a screen reader.

The live board corroborates the toolbar mechanics: the rail's `[role=toolbar]`
carries a `rovingFocusGroup.onEntryFocus` listener, which is the arrow-key roving
focus a Radix-family toolbar provides.

### The shortcut machinery **[bundle]**

- Each action carries `keyboardShortcut: { defaultShortcut, extraShortcuts }`,
  where a shortcut is `{ code, primaryKey, shiftKey, altKey, secondaryKey }`.
- An action group can carry **`activationShortcuts`** — the single-character keys
  that activate a tool.
- A fixed **set of "single character" codes** (letters and digits) is the set
  governed by the **single-key shortcut toggle**
  (`SINGLE_CHARACTER_SHORTCUTS`), so a screen-reader user can disable them
  without losing `⌘`-based shortcuts.
- Bindings declare **`supportedModes`** (board vs modal), so the same key can
  mean different things inside a dialog and on the canvas.
- A guard (`shouldIgnoreShortcut`) suppresses single-character activation while a
  text input has focus.

This is the layer Firo's `TOOLS` + `getToolShortcut` should grow into if
per-widget shortcuts ever arrive; it is noted here, not built (7.5.9 keeps the
single registry).

## What Firo adopts, and what it does not

[`miro-ui.md`](miro-ui.md) already tabulates geometry and placement. This is the
interaction-level reconciliation, and it is what 7.5.8 and 7.5.9 acted on. The
"Firo today" column records the state **after** both, so the table is a record of
what was decided rather than a worklist. Phase 11's
[`miro-parity-matrix.md`](miro-parity-matrix.md) re-derives the comparison
against HEAD and is the living record; this table stays as the 7.5 decision
record.

| Interaction | Miro | Firo today | Decision |
| --- | --- | --- | --- |
| Select / Hand | one toggling command, `V` / `H`, unremovable | one pinned toggling entry ([ADR-0029](../adr/0029-the-rail-is-a-per-user-arrangement.md)) | **adopted** — 7.5.8 |
| Rail reorder / unpin | drag to reorder; context menu Pin / Unpin; per user | drag to reorder, right-click to Unpin, restore from the unpinned list; per user, in `localStorage` ([ADR-0029](../adr/0029-the-rail-is-a-per-user-arrangement.md)) | **adopted** — 7.5.8 |
| Flyout groups | Shapes and lines is one entry with sub-actions; Pen likewise | five flat shape entries | **deferred** — composition, not customisability (recorded in 7.5.8) |
| `M` minimap | inside the zoom menu, key `M` | **bound** to the minimap toggle ([ADR-0030](../adr/0030-keyboard-parity-with-miro.md)) | **adopted** — 7.5.9 |
| `G` grid | documented hotkey | **bound** to the grid toggle, which cycles Firo's four grid types ([ADR-0030](../adr/0030-keyboard-parity-with-miro.md)) | **adopted** — 7.5.9 |
| `S` shapes group | opens a group | no group tool | **document** — no target |
| `C` comment tool | a tool mode | comments are threads, not a mode | **document** — no target |
| `D` card | card | diamond | **document** — not a conflict |
| `1`–`9` | toolbar slots, positional, not remappable | type-based tool selection | **document** — deliberate divergence, stated in [ADR-0030](../adr/0030-keyboard-parity-with-miro.md) |
| One-time tools | all but pen / eraser / lasso / comment | `CREATION_TOOLS` matches | **none** |
| Command palette | `⌘K` over one registry | none | **deferred** — recorded in 7.5.9 |
| Toolbar keyboard navigation | Tab between toolbars, arrows within, `B` to board | none | **deferred** — recorded in 7.5.9 |
| Two context-menu lanes | floating selection toolbar + right-click menu | selection toolbar exists; context menu is Excalidraw-styled | **partial** |
| Single-key shortcut toggle | Accessibility setting | none | **document** — accessibility lane |

## Gaps

Updated 18 October 2026 — closed items say so; the rest are restated with what
would close them.

- **The rail's *default* composition** — still open, for the same reason: the
  live board was someone's arrangement. The deep pass strengthened the picture
  (two reads, different compositions — both tabulated) and confirms the rail is
  per-user state, but the *default* remains documented, not observed.
- **Geometry — closed.** Measured in [`miro-geometry.md`](miro-geometry.md)
  (rects, pitches, radii, shadows, colour roles; tolerances stated there).
- **Motion — open.** Durations and easings for tool switches and panel
  transitions were not measured; no value is claimed anywhere.
- **The rendered grammar of the unopened surfaces — closed for everything the
  phase plan names.** Rail flyouts, app submenus, the help and avatar menus, the
  panels, the share dialog, the palette, the shortcuts modal, both context-menu
  lanes: opened, dumped and captured on 18 October (§ above). What the deep pass
  did *not* reach: the standalone board **home** (dashboard) page, the *output*
  of the export actions, the Talktrack **recording** flow, and the AI panels
  (metered; deliberately untouched).
- **Icon visuals** — unchanged: slot names only, and the drawings would not be
  copied in any case.
- **Numbered-hotkey order — narrowed.** The rail's painted order matches its DOM
  order in both reads (button positions increase monotonically). The positional
  mapping of the number keys was not re-tested. Firo deliberately does not adopt
  it, so this is harmless.
- **The `⌥O` vs `⌥S` board-overview discrepancy — restated, unresolved.** The
  deep pass synthesised `⌥O` (both `o` and `ø` after Alt) and the overview did
  not surface; no other key was tried. The on-screen guidance still names `⌥O`.

## Sources

| Source | What it settles |
| --- | --- |
| Deep pass over the live board via Chrome DevTools, 18 Oct 2026 | The rendered grammar of every surface the 15 October pass could not open, with computed-style and rect measurements (§"The deep pass, surface by surface") |
| Live Miro board via REA + Chrome DevTools, 15 Oct 2026 | The main menu and canvas-controls menus; the rail and its order; the top bar; the accessibility layer; Talktracks and Frames; that the minimap is a submenu |
| Miro's own JS bundles (`https://mirostatic.com/app/static/*.js`, 420 files, structure only) | The command catalogue and its descriptor shape; categories; the shortcut registry; the two context-menu lanes; panel and menu contents; accessibility bindings |
| [Shortcuts and hotkeys](https://help.miro.com/hc/en-us/articles/360017731033) | The published key map, including `G` for grid and the numbered-hotkey rule |
| [Command palette](https://help.miro.com/hc/en-us/articles/10389262146706-Command-palette) | The `⌘K` palette over the same registry |
| [Keyboard navigation](https://help.miro.com/hc/en-us/articles/11997028019858) | Tab/arrow toolbar navigation, `B` to the board, the single-character toggle |
| [Toolbars](https://help.miro.com/hc/en-us/articles/360017730553-Toolbars) | Rail reordering, Unpin, per-profile persistence, the touch-device limitation |

Evidence bundles and the downloaded scripts were held in a temporary directory
and are **not** committed. Contrast, licences and the API surface for Miro as a
product are catalogued in [`sources.md`](sources.md).
