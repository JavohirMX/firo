---
status: accepted
date: 2026-10-19
deciders: maintainer
---

# Templates are content: one gallery for built-ins and saved fragments

## Context and Problem Statement

C9 is the home-and-share cluster. [`ADR-0037`](0037-share-links-are-server-capabilities.md)
settled its server state; rows 55 and 56 are the remaining content contract:

- **Row 55 — Template gallery.** Miro opens a full-screen modal,
  `1160 × 736` at `(20, 41)` in a `1200 × 818` viewport, centred against a
  dimmed backdrop, with categories, search and previews
  ([`miro-geometry.md`](../research/miro-geometry.md),
  [`miro-interactions.md`](../research/miro-interactions.md) §Rail flyouts,
  rendered). Firo has four curated built-ins, a `680`-wide grid, and no
  categories, search or preview art.
- **Row 56 — Save as template.** Miro puts it in the object context menu,
  between **Create frame** and the Export row. Firo has no save action and no
  store to save into. [`ADR-0033`](0033-the-two-context-menu-lanes.md) recorded
  the row as deferred to C9 and kept its measured position.

**What a Firo template is today.** `apps/web/board/templates.ts` holds four
`BoardTemplate`s built from sticky-note factories. They are code on purpose:
a curated board starter never drifts from what the document model accepts. But
that shape has no room for a person's own template. There is no persistence,
no metadata a gallery can browse, and no way to author one from a board.

**Why the obvious shortcut is wrong.** A saved template cannot reference the
board's file store. Images live in `LocalFileManager`'s separate
`files-db`, and a fresh board load calls `clearObsoleteFiles` with the
*current* board's file ids. A template that pointed at those ids would lose its
images the next time a different board opened. A saved template has to carry
its own files.

**Why insertion cannot be reused as-is.** The current modal path calls
`template.build()`, translates the result and runs `restoreElements`. That is
safe only because every build mints fresh ids. A saved fragment already has
ids, and `restoreElements` deduplicates only *within the batch* it is given;
inserting the same saved fragment twice would collide with the first
insertion's elements in the scene. A template insert needs a real identity
remap.

**The clean-room line.** The catalogues and preview art are Miro's content.
Firo ships its own templates and renders its own previews; the measured shell
and the two row decisions are functional evidence, nothing more.

## Decision Drivers

- **Templates are content, not board state.** Saving one changes no document,
  no Yjs update and no undo history. Inserting one is a single board mutation.
- **Self-contained records.** A template must still work after the source
  board is deleted, moved or opened elsewhere. Embedded files are the only
  shape that survives the file store's per-board cleanup.
- **One gallery, two sources.** Built-ins are curated board starters; saved
  templates are authored fragments. A person should not have to know which is
  which before browsing.
- **Local-first.** Templates are a personal, on-device library in this phase
  ([`ADR-0005`](0005-indexeddb-via-idb-keyval.md)). There is no team library,
  no server table and no sync.
- **Fresh identity on every insert.** No id, group, binding or frame reference
  in a stored fragment may leak into a scene. Inserting twice must be as safe
  as inserting once.
- **The preview is the content.** A card that cannot show what will be inserted
  is a label, not a gallery. Render the real fragment with the real renderer.
- **Honest scope.** A saved selection is not a whole board. The home's board
  creation stays curated until a separate contract says otherwise.

## Considered Options

### What a saved template is

- **A fragment: the current selection plus its inseparable parts** (chosen).
  It is what the object lane's **Save as template…** can honestly capture, and
  it can be inserted into any board without replacing that board's content.
- **A whole board.** Rejected: row 56 lives on an object, not on the board;
  a whole-board save already exists as duplication, and it would turn the
  object lane into a board-level command.
- **A board payload or exported board file.** Rejected: templates are not
  boards ([`ADR-0018`](0018-a-firo-is-a-directory.md)); reusing the board
  format would add a second load path and a board identity to something that
  has neither.

### Where saved templates live

- **A local IndexedDB library, embedded files included** (chosen). It reuses
  the local-first store, works offline, and survives the file store's cleanup.
- **References into the board file store.** Rejected: those files are scoped to
  the loaded board and are deleted when another board opens.
- **A server-side or team library.** Rejected for this phase: it needs
  accounts, permissions, sync and a template table. It is a separate contract,
  not a detail of row 55.

### Previews

- **Rendered thumbnails from the editor's exporter** (chosen). Saved at save
  time for authored templates; generated on first open for built-ins. What the
  card shows is what the canvas draws.
- **A schematic renderer** (boxes and bars). Rejected: it is a second renderer
  that drifts from the canvas, and it cannot show text, images or real colour.
- **Screenshots of the board.** Rejected: fragile, tied to view state, and
  larger than a rendered thumbnail.
- **No preview, accent strip only** (today). Rejected: row 55 names previews,
  and an author cannot recognise a fragment from a colour.

### The taxonomy

- **Tags, shown as filter chips** (chosen). Tags already exist on built-ins and
  on the board home; a template gets the same free-form vocabulary. Search is
  the escape hatch when the tag list grows.
- **A fixed category list plus tags.** Rejected: two taxonomies to maintain,
  and the save dialog would need a category decision that adds no retrieval
  value over tags.
- **No filter.** Rejected: it fails row 55's category requirement and does not
  scale past the four built-ins.

### The surface

- **One measured gallery replacing the current modal** (chosen). The rail's
  Templates slot is already a surface ([`ADR-0031`](0031-rail-slot-kinds-and-the-phase-11-composition.md));
  both sources share it. The measured shell is `1160 × 736` with `20`/`41`
  insets, capped to the viewport.
- **Keep the `680` grid and add a second "My templates" modal.** Rejected: two
  browsing surfaces for one concept, and neither would have room for previews.
- **A right dock or a rail flyout.** Rejected: templates are a browse-and-use
  surface, not a persistent panel; the measured evidence is a centred modal.

## Decision Outcome

### 1. Two kinds, one gallery

- **`BoardTemplate` stays code.** The four curated starters remain factories
  in `apps/web/board/templates.ts`. They are the only templates the home's
  template strip and `createBoardFromTemplate` know about.
- **Saved templates are fragments.** A saved template is a snapshot of a
  selection, its bound text and its frame descendants. It is authored on a
  board, stored locally, and inserted into a board. It is not a board starter
  and does not appear on the home in this phase.
- **`TemplateModal` becomes the gallery** opened by the Templates rail slot.
  It lists **My templates** (newest first, with a save hint when empty) and
  **Built-in** (curated order), filtered by search and one tag chip at a time.
- The home's `TemplateGallery` and its board-creation path are unchanged. A
  future contract can generalise both, but it would need an async board
  creation path and is not smuggled in here.

### 2. The gallery surface

- The shell is the measured `1160 × 736` at `1200 × 818`: width
  `min(1160px, calc(100vw - 40px))`, height
  `min(736px, calc(100vh - 82px))`, centred, over the existing dimmed
  backdrop and focus trap. On a larger viewport it stays `1160 × 736`; on a
  smaller one it shrinks and the content scrolls. The internal composition is
  ours; only the shell is measured. Controls inside it use the
  [`ADR-0034`](0034-the-measured-geometry-as-tokens.md) tokens.
- **Header:** title, search field, close. Search is focused when the gallery
  opens.
- **Filters:** an **All** chip plus one chip per distinct tag across both
  sources, sorted alphabetically. Chips are single-select and combine with
  search (logical AND). Search is a case-insensitive substring over name,
  description and tags.
- **Sections:** **My templates** first, with a quiet "Saved on this device"
  note; **Built-in** second. With no saved templates and no filter, My
  templates shows the save hint rather than disappearing: "Select objects on a
  board, then choose Save as template." A section emptied by a filter
  disappears.
- **Cards:** preview, name, description, tags, and **Use template**. Saved
  cards add a menu; built-in cards do not. The preview is decorative; the
  card's name is its accessible label. Search with no matches shows a
  no-results state and a clear action.
- **Keyboard and dismissal:** `Escape` closes an open card menu first, then
  the gallery ([`ADR-0033`](0033-the-two-context-menu-lanes.md)'s menu rung).
  Backdrop click closes the gallery. Card menu items use `role="menu"` and
  roving focus; chips are toggle buttons with `aria-pressed`.
- **Edit modes only.** The Templates rail slot and the save action are absent
  for viewer and commenter roles; insertion is a write.

### 3. The saved-template record

Two key prefixes in one IndexedDB database and object store, because the
gallery must draw cards without loading element payloads:

```
database templates-db, object store templates

meta:<id>     { version, id, name, description, tags, thumbnail,
                createdAt, updatedAt }
payload:<id>  { version, elements, files }
```

- `version` is `1` in both records. A structural change to the wrapper needs a
  migration and a fixture written by the previous version. Element fields are
  migrated on read through the existing `restoreElements` path.
- `elements` is the captured fragment. Its ids are internal references only;
  insertion never reuses them.
- `files` is keyed by file id and carries the binary needed to re-render:
  `{ dataURL, mimeType, created }`. Only files referenced by image elements in
  the fragment are stored. A selected image whose binary is missing from the
  editor's runtime files fails the save; a template is never written with a
  broken image.
- `thumbnail` is a PNG data URL, at most `320` px on its long edge. It is
  optional; a failed render does not block the save.
- The gallery enumerates `meta:` keys and loads only those values. The payload
  is loaded on insert.
- **Local and outside the document.** Templates never enter `@firo/doc`, Yjs,
  the activity feed or undo history. They do not sync between devices. The
  gallery's My templates section says so.
- **Metadata edits preserve unknown fields** by spreading the stored record
  before overwriting name, description, tags and `updatedAt`.
- **Validation and failure.** A metadata record that cannot be read is shown
  as **Unreadable template** with a delete action; a payload with no metadata
  is an orphan and is ignored. A valid card whose payload is missing,
  unreadable or the wrong version is also **Unreadable template**, never
  inserted. Quota and write failures surface in the save dialog with the
  dialog open and the selection intact.
- **Write order.** The payload is written first and the metadata second, so a
  failed metadata write leaves an orphan payload, not a listed template
  without content. Delete removes the metadata and then the payload.

### 4. Saving from the object lane

- **The deferred row lands in place.** In the object lane, **Save as
  template…** appears after **Create frame** and its separator, before
  **Info** (the Export row is omitted in Firo), exactly where
  [`ADR-0033`](0033-the-two-context-menu-lanes.md) recorded it. It is present
  only in edit mode with a non-empty selection.
- **What is captured.** Every non-deleted selected element; every descendant
  of a selected frame, recursively; and the bound text of every included
  container. Groups are already fully selected by the selection model.
  Comments, threads, records, board settings, theme, grid and view state are
  not captured.
- **Frames and bindings outside the fragment.** An element whose containing
  frame is not part of the snapshot is captured without frame membership; an
  arrow bound to an element outside the snapshot loses that binding on insert.
  The snapshot is self-contained, not a promise to recreate the whole board.
- **Snapshot timing.** The fragment is captured when the dialog opens. Remote
  edits while the dialog is open do not change what will be saved.
- **The dialog.** A small modal with the rendered preview, a required name
  (trimmed, 1–80 characters), an optional description (at most 240
  characters) and optional tags (comma-separated, at most 8, each at most 24
  characters, trimmed and deduplicated case-insensitively). Save is disabled
  until the name is valid. Cancel, `Escape` and the close control dismiss it
  without writing.
- **On save.** Generate the thumbnail from the captured fragment, write the
  payload and metadata, show a "Saved to My templates" confirmation and close
  the dialog. The gallery is not opened automatically. Saving changes no board
  state and creates no undo step.
- **Re-saving is a new record.** There is no overwrite-by-name and no implicit
  edit of an existing template. Editing the content means saving a new one.

### 5. Insertion

- **One path for both sources.** Built-ins produce a fragment through
  `build()`; saved templates load their payload. Both are restored and then
  inserted with fresh identities.
- **Fresh identity.** Saved fragments go through the existing
  `duplicateElements` path, which mints new element ids, new group ids and
  new seeds, and remaps containers, arrow bindings and frame membership inside
  the fragment. References to elements outside the fragment are dropped.
  Built-ins already mint ids in their factories. A stored id is never inserted
  into a scene.
- **Files first.** Embedded files are added through the editor's `addFiles`
  before the elements are inserted, so the first paint has its images. The
  ordinary local file save persists them with the scene.
- **Placement.** The fragment's bounding-box centre is placed at the viewport
  centre (the existing placement rule). No board settings are copied.
- **One undo step.** The elements are added in one `updateScene` with
  `CaptureUpdateAction.IMMEDIATELY`.
- **Selection.** The inserted top-level elements are selected: not bound text,
  not frame children, not every descendant. A single inserted frame selects
  the frame.
- **Failure and dismissal.** The gallery closes only after a successful
  insertion. A payload, version or file error keeps the gallery open with a
  message and inserts nothing.
- **Inserting twice** produces disjoint element and group ids, even though both
  copies came from one stored payload.

### 6. Previews

- **Saved templates** get their thumbnail when they are saved: the fragment is
  rendered through the existing `exportToCanvas`, with its files, at most
  `320` px on the long edge, against the current board's view background. The
  data URL is stored in the metadata record.
- **Built-ins** get theirs from the same exporter, built through their
  factories when the gallery opens. They are cached in memory for the session;
  until a render resolves, and if it fails, the card shows the template's
  accent colour.
- **No schematic renderer and no Miro art.** The preview is our renderer
  drawing our content.
- Editing a template's name, description or tags does not regenerate its
  thumbnail; the content has not changed.

### 7. Managing saved templates

- **My templates** is ordered by `updatedAt`, newest first. Built-ins keep
  their curated order.
- A saved card's menu has **Edit details…** and **Delete…**. Edit details
  reopens the same name, description and tag fields with the same validation;
  the elements, files, thumbnail, id and `createdAt` are untouched, and
  `updatedAt` changes. Delete asks for confirmation, then removes both keys.
- Built-in cards have no menu and cannot be edited or deleted.
- No folders, favourites, duplication, version history or drag reordering in
  this phase. Search, tags and recency are the whole retrieval model.
- A card whose metadata survives but whose payload does not is the unreadable
  state described in §3, with delete as its only action.

### 8. What this does not decide

- A server-side or team template library, sharing templates, or cross-device
  sync.
- Starting a new board from a saved fragment on the home; the home keeps the
  curated starters.
- Template folders, favourites, duplication, versioning, or editing a
  template's content in place.
- Whole-board templates or "save this board as a template".
- Template import/export as a file format.
- The Miro template catalogue, its categories, its art, or any copied preview.
- AI-generated templates.

## Consequences

- `apps/web/board/templates.ts` keeps `BoardTemplate` but its docblock changes:
  the set is still curated code, while authored fragments are a separate data
  type. The old "not a schema / not a browse" claim no longer describes the
  whole gallery.
- A new `apps/web/board/templateStore.ts` owns the `templates-db` records,
  version checks, metadata enumeration, write ordering and deletion.
- `apps/web/components/TemplateModal.tsx` becomes the two-source gallery with
  search, chips and previews; `TemplateModal.scss` grows the measured shell.
  A new save dialog handles the name, description, tags and preview.
- `apps/web/App.tsx` gains the save callback and the two-source insertion path,
  including the file add and the id-remap step. The current single-source
  `template.build()` block is replaced.
- The object lane gains the row [`ADR-0033`](0033-the-two-context-menu-lanes.md)
  deferred; the lane's measured order is unchanged.
- No server, board schema or Yjs change. No migration for existing boards.
  The only new store is `templates-db`; the template wrapper is a new format
  with its own version and tests.
- The gallery is local-only and says so. Clearing site data removes templates;
  the board's own file cleanup cannot break a saved template because the
  template embeds its files.
- Tests: store round-trip and version rejection; capture of bound text and
  frame descendants; save-dialog validation; insertion twice with disjoint
  ids; internal bindings and frame membership preserved; outside bindings
  dropped; files render; search and tag filters; unreadable-card deletion;
  viewer mode has no slot.
- The C9 checklist item can be ticked once this ADR and
  [`ADR-0037`](0037-share-links-are-server-capabilities.md) are accepted and
  implemented.

## Confirmation

- **Shell.** At `1200 × 818` the gallery measures `1160 × 736` at `(20, 41)`
  over a dimmed backdrop; at a smaller viewport it shrinks to the insets and
  the content scrolls. The Templates slot opens it; `Escape` closes a card
  menu before the gallery.
- **Browsing.** Search matches name, description and tags; a tag chip filters
  both sections; search and a chip combine; the no-results and empty-My-
  templates states render; built-in previews resolve or fall back to the
  accent card.
- **Saving.** With no selection the row is absent. With a selection, the
  dialog previews the fragment; an empty name cannot save; limits hold; the
  record's elements include bound text and frame descendants and exclude
  comments and records; saving adds no undo step and no Yjs update.
- **Inserting.** Use template inserts at the viewport centre in one undo step;
  using the same saved template twice yields disjoint ids; internal bound text,
  groups, arrows and frame membership survive; external bindings are dropped;
  images render immediately; a corrupt payload inserts nothing and keeps the
  gallery open.
- **Local-only.** Saving and inserting make no network request. Clearing the
  `templates-db` database empties My templates; the built-ins remain. The home
  still creates boards only from the curated starters.
- **Suites.** `yarn test:typecheck`, `yarn test`, `yarn test:code`,
  `yarn test:other`; plus a template fixture test for the version-1 wrapper.

## Pros and Cons of the Options

**Saved templates as self-contained fragments**

- (+) Captures exactly what the object lane offers and inserts anywhere.
- (+) Embedded files survive the board file store's cleanup and offline use.
- (−) A saved fragment is not a board starter; the home cannot use it yet.
- (−) Copies of image bytes are stored per template.

**A local IndexedDB library**

- (+) Local-first, offline, no accounts, no server table.
- (+) Metadata and payload keys keep the gallery cheap to open.
- (−) No cross-device sync and no team library.
- (−) Quota is the user's device quota, with no server fallback.

**Rendered thumbnails**

- (+) Uses the real renderer, so the card matches the inserted content.
- (+) One exporter to maintain; no second drawing system.
- (−) Rendering is async and can fail; the accent fallback remains.
- (−) A stored PNG costs space per template.

**Tags as the filter taxonomy**

- (+) One vocabulary shared with built-ins and the home.
- (+) Search covers what tags miss.
- (−) Free-form tags can sprawl; there is no curated category list.
- (−) Chips show the union, not a designed hierarchy.

**One measured gallery for both sources**

- (+) One place to browse, one insertion path, one empty state.
- (+) Matches the observed full-screen browse surface and gives previews room.
- (−) The gallery is much larger than the current modal and must stay
  responsive at small viewports.
- (−) Built-in and authored templates have different lifetimes in one list,
  so the source has to be explicit on each card.

## More Information

- Evidence: [`miro-parity-matrix.md`](../research/miro-parity-matrix.md) rows
  55–56; [`miro-geometry.md`](../research/miro-geometry.md) (templates modal
  `1160 × 736` at `(20, 41)`); [`miro-interactions.md`](../research/miro-interactions.md)
  §Rail flyouts, rendered, and §The two context-menu lanes, rendered.
- Current code: `apps/web/board/templates.ts` (built-ins and factories),
  `apps/web/components/TemplateModal.tsx` and `.scss` (the `680` grid),
  `apps/web/App.tsx` (the insertion block and `exportToCanvas` import),
  `apps/web/board/library.ts` (`createBoardFromTemplate`),
  `packages/ui/src/components/BoardHome.tsx` (the home's template strip),
  `packages/element/src/duplicate.ts` (identity and binding remap),
  `apps/web/data/LocalData.ts` (per-board file storage and cleanup).
- Related ADRs: [`ADR-0005`](0005-indexeddb-via-idb-keyval.md) (local store),
  [`ADR-0018`](0018-a-firo-is-a-directory.md) (the Firo directory format),
  [`ADR-0031`](0031-rail-slot-kinds-and-the-phase-11-composition.md) (the
  Templates slot), [`ADR-0033`](0033-the-two-context-menu-lanes.md) (the
  deferred row and the menu rung),
  [`ADR-0034`](0034-the-measured-geometry-as-tokens.md) (controls inside the
  shell), [`ADR-0037`](0037-share-links-are-server-capabilities.md) (the other
  half of C9).
- Recon: Miro Business build `1.104717.0`, 19 October 2026, `1200 × 818` CSS.
  The gallery was opened and measured; no Miro template content was copied.
  Raw captures stay out of the repository.
