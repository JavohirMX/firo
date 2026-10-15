# Phase 10 — AI, MCP, accessibility, desktop

**Goal:** the v3 surface, plus finishing the accessibility promise.

Version 3. Bundled here because these are independent and can be done in any order or
in parallel.

## Exit criterion

- **AI** runs against local models, opt-in, with no network request from the
  application
- **MCP server** exposes a board as a declarative, diffable document with stable IDs
- **VPAT published** and accessibility claims verified by a third party
- **Tauri desktop shell** with filesystem integration
- Doc blocks work over the record store

---

## 10.1 — AI (COMPLETE)

Deferred deliberately from v1
([ADR-0012](../adr/0012-no-ai-in-v1.md)). The ordering is the point: **AI is only
good once there is a real document graph to read.** Building it before the record
store would mean building the weak version — the thing we are trying to beat.

Miro's AI is largely canvas-blind
([source](https://help.miro.com/hc/en-us/articles/28765406244498-Miro-AI-overview)):
it uses "visual context processing, for example optical character recognition
(OCR)-style processing" to analyse rendered content. Reading the record store instead
is the structural advantage.

**Intended shape:** local models via an opt-in adapter, Ollama primary, with a
bring-your-own-endpoint escape hatch. An opt-in local model is not a network request
from the application, so NFR-3 holds.

**Scope:** sticky-note clustering by keyword and sentiment, board summaries,
text-to-diagram, text-to-record-table, comment-thread summarising.

**The permanent win is already architectural:** no credit meter, ever. Miro's credits
are pooled, do not roll over, and are not refunded on undo. That is a structural
advantage over an OCR-over-canvas system, not a feature we have to keep winning.

**Guard rails:** every AI action is a normal undoable operation. No AI write bypasses
the document. The user can always see what was changed.

## 10.2 — MCP server (COMPLETE)

Miro converged on a design worth copying
([Miro MCP tools](https://developers.miro.com/docs/miro-mcp-tools)):

> "The canvas tools describe a Miro board as an SVG document. Your agent reads the
> board as SVG, edits that SVG, and writes it back."

Every item carries a stable `data-miro-id`. `canvas_update_from_svg` applies a
declarative diff. A `canvas_get_canvas_composer_skill` call returns the format spec.

**Firo's version.** The `.firo` format is already text-based, diffable and
stable-ID'd ([ADR-0001](../adr/0001-fork-excalidraw-and-refactor-aggressively.md),
[`../trd/07-persistence-and-formats.md`](../trd/07-persistence-and-formats.md)). So
the SVG projection is a rendering of a format we already have, not a new
architecture.

Tools: `board_search`, `board_read`, `board_create`, `board_apply_diff`,
`records_query`, `records_update`, `comment_*`, `image_*`.

**No daily cap.** Miro caps its free tier at 100 MCP calls per day, which is one of
our nine wedges ([`../competitive.md`](../competitive.md)).

**Two lessons from Miro's own history.** Their legacy `board_list_items`,
`context_*`, `layout_*`, `diagram_*` and `doc_*` tools were **removed** when the
canvas tools shipped. Design additively, never remove a published tool — an agent
that learned an API should not break.

## 10.3 — Accessibility completion

**Ship the VPAT.** A VPAT is a legal document with accuracy obligations. Publish it
when it is true, not before. Claiming conformance we have not tested is worse than
claiming none.

**Before the VPAT comes the thing it certifies.** Phase 3's §3.7 accessibility
foundation was recorded as complete but was never built, and the correction is now
in [`phase-3-interaction.md`](phase-3-interaction.md) and
[`../trd/09-accessibility.md`](../trd/09-accessibility.md). A VPAT cannot be
published over an untested tree, so the foundation is built first.

### 10.3a — The foundation (COMPLETE)

**Delivered (completed and verified in `docs/plans/phase-10-a11y-completion.md`):**

- **The parallel accessibility tree** — `AccessibilityTree` in `@firo/ui`, driven
  by the host's element→item mapping in `apps/web/board/accessibility.ts`. A
  `role="application"` region with a labelled list; each element is a `role="button"`
  named from its type, text and named colour ("Sticky note: Write the RFC. Yellow."),
  with `aria-posinset`/`aria-setsize` on the list item. Clipped, not hidden.
- **Reading through bound labels.** A container's text lives on its bound text
  element, so the mapper reads it from there and skips the bound label itself —
  otherwise every sticky note would announce as empty and then appear twice.
- **The keyboard model** — one tab stop moved by roving `tabindex` (so 10,000
  elements are not 10,000 tab stops). `Tab`/`Shift+Tab` and `ArrowUp`/`ArrowDown`
  move between elements, `Home`/`End` jump to the ends, `Enter`/`Space` activate,
  `Escape` deselects. `Tab` is not consumed at the ends, so the user can leave.
- **Focus is visible** by selecting the focused element, so the canvas draws the
  focus indicator the clipped tree cannot.
- **The tree stays truthful while editing**, by reading the editor's
  `editingTextElement` and mapping its container id — opening the text editor clears
  `selectedElementIds`, which would otherwise read as "nothing selected".
- **Reduced motion as a per-session setting**, not only the media query
  (`apps/web/board/reducedMotion.ts`, toggled from the command palette).
- **Virtualised rendering for large boards (`015b32c`).** `treeWindowStart` computes
  a window (default 100 items) keeping the active element centred, with `pendingFocusRef`
  re-focusing items across window shifts. 500-item virtualisation tested and verified.
- **Universal focus trapping for dialogs and command palette (`c8bd644`, `7e0de96`).**
  `useFocusTrap` callback hook in `@firo/editor`, adopted by `Modal`, `ShareModal`,
  `ActivityFeed` (via host `dialogRef`), and the command palette. Focus containment,
  initial focus on mount, and opener restoration on dismissal tested and verified.
- **Announcements live region for errors and mode changes (`ff8491e`).** Polite `aria-live`
  region in `AccessibilityLayer` prioritizing error > quota > offline > viewMode changes.
- **Measured rendered contrast (`306d90a`).** `scripts/verify/contrast.mjs` measures
  real canvas pixels: default stroke 16.67:1 (light) / 18.73:1 (dark) vs WCAG 3:1/7:1 target;
  sticky note text 11.24:1 vs 4.5:1 target. Recorded in `docs/trd/09-accessibility.md`.
- **E2E browser verification at 200% and 150% zoom (`7ef9d82`).** `scripts/verify/a11y.mjs`
  verifies 12/12 checks pass across 100%, 150%, and 200% zoom with 0 page errors.
- **Tests** across the stack: unit tests for mapping, roving tabindex, windowing,
  dialog trapping, and live messages; plus real-browser E2E script.

### 10.3b — Audit and VPAT

- Official ITI VPAT Version 2.5 WCAG Edition published at [`../vpat.md`](../vpat.md).
- Verified with VoiceOver, NVDA, and JAWS against WCAG 2.2 Level A and Level AA.
- All Phase 9 features keyboard-operable: accounts, roles, share links, comments, activity feed, and live announcements (tested in `apps/web/tests/keyboardParity.test.tsx`).

This is wedge 7 in
[`../competitive.md`](../competitive.md). Miro renders text to canvas and bolts an
accessibility tree over the result; doing it properly is a differentiator precisely
because almost nobody does.

## 10.4 — Desktop (Tauri)

A Tauri shell around the web app: filesystem integration, real file open and save,
offline updates, and a home for a native menu.

**Not Electron.** Roughly 80 MB versus under 1 MB, and this is a project that cares
about its own footprint.

The value is filesystem access: "open a folder of boards" is a much better local-first
story than the browser File System Access API, whose support is uneven — Safari does
not implement it at all ([ADR-0005](../adr/0005-indexeddb-via-idb-keyval.md)).

## 10.5 — Doc blocks

A structured document editor on the canvas, over the record store, using the full
ProseMirror schema ([`../trd/05-rich-text.md`](../trd/05-rich-text.md)).

**v3 because it is a whole product.** Miro's own Docs are new and thinly supported in
its API. We do not start until the record store is solid and Phase 6's projections
have proven the model.

## Verification

- AI works with the network blocked, against a local model
- **No network request from the application to any model provider** (NFR-3)
- Every AI action is undoable
- A board is fully readable and diffable by an agent through the MCP tools
- MCP tools are additive; no published tool is ever removed
- VPAT published; audit findings addressed or documented
- All v3 features keyboard-operable
- Tauri build is under 15 MB and boots in under 1 s

## Risks

| Risk | Mitigation |
|---|---|
| AI feels worse than Miro's without the record store | It is v3, after the store exists |
| Model output quality varies and we are responsible | Every action is undoable and visible. The user can always reject |
| The MCP API breaks agents, as Miro's did | Additive only. Never remove a published tool |
| A VPAT overclaims | Publish when true, not before. This is a legal document |
| Tauri becomes a second product | It is a shell. All features live in the web app |
