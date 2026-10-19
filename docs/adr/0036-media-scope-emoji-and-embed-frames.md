---
status: accepted
date: 2026-10-19
deciders: maintainer
---

# Ship the emoji surface, and make every embed frame a hostile frame

## Context and Problem Statement

C6 is the media cluster: rows 40, 41 and 44 of
[`miro-parity-matrix.md`](../research/miro-parity-matrix.md). The cluster map
marks it as a contract change because the panel is a new left surface and
because embeds execute foreign frames.

**What the evidence says.**

- The media library is a full-height flyout at `(64, 64) 368 × 746` — beside
  the rail, not displacing it
  ([`miro-geometry.md`](../research/miro-geometry.md) §Rail flyouts and the
  shape library).
- The picker has search and categories (row 41).
- Embeds have a panel and play supported links inline (row 44, live and
  bundle).
- Stickers (42) and GIFs (43) are omitted: Miro's art is licensed, and GIF
  search needs an external content service. The label that survives is
  **Emoji**, already chosen in
  [`ADR-0031`](0031-rail-slot-kinds-and-the-phase-11-composition.md) for the
  `media` slot.
- Talktracks (46) stay deferred; calls (45) are a vision non-goal.

**What Firo has.**

- No media surface. Emoji render only through the system font; there is no
  picker, no data, and no insertion path.
- An `embeddable` element, a domain allow-list, provider parsers, a paste path
  that inserts pure embeddable URLs, and `insertEmbeddableElement` already
  exposed on the imperative API. There is no in-app affordance for adding one.
- The iframe renderer at `packages/editor/components/App.tsx` builds one
  sandbox string for every frame:
  `allow-same-origin` (per provider) + `allow-scripts allow-forms allow-popups
  allow-popups-to-escape-sandbox allow-presentation allow-downloads`.
- Three providers render as **`srcdoc` documents**: Twitter/X, Reddit and
  GitHub Gist. They inject the provider's widget script into a frame that
  inherits Firo's origin. `allowSameOrigin` for those frames is derived from
  the *link's* hostname, and Twitter/X and Reddit are on that list. So today a
  Twitter/X or Reddit embed runs **same-origin with the application**: it can
  read the DOM, `localStorage` and IndexedDB. That is the security question the
  cluster map names, and it is not hypothetical.
- `referrerPolicy` is `no-referrer-when-downgrade`; the permissions policy
  allows `autoplay` and `clipboard-write`.

The gate is therefore two contracts at once: what the emoji surface is, and
what an embed frame is allowed to be.

Clean-room note: emoji are Unicode characters, not art. The picker, its
labels, its categories' presentation and every icon are Firo's. No sticker or
GIF content ships.

## Decision Drivers

- **The measured surface.** The flyout's anchor, width and height are
  observed; the panel is not a popover.
- **Content honesty.** ADR-0031's label is "Emoji"; the surface must contain
  only classes Firo actually ships.
- **Local-first.** No network at runtime for the picker. No external search
  service. Emoji data is vendored.
- **Foreign frames are hostile by default.** A frame can be broken by its
  provider; it must never be able to reach Firo's origin, storage or DOM.
- **Reuse the model.** The embeddable element, the allow-list, the parsers and
  the insertion API already exist. C6 adds the affordance and tightens the
  frame.
- **Tokens and tolerances.** Geometry from
  [`ADR-0034`](0034-the-measured-geometry-as-tokens.md).

## Considered Options

### The emoji surface

- **A full-height left flyout at the measured rect** (chosen). It matches the
  reference, has room for search, categories and a real grid, and does not
  displace the rail.
- A small popover anchored to the rail. Rejected: not the measured surface; a
  searchable picker in a 240-wide card is worse than the reference.
- The operating system's emoji picker. Rejected: no in-app affordance, no
  parity, and it cannot insert into the board.

### What an emoji pick becomes

- **A text element at the viewport centre** (chosen). It uses the existing
  text model, needs no schema change, and stays editable.
- A new `emoji` element type. Rejected: a character is not a new element, and
  the type would need a migration and a renderer for no capability.
- Insertion into the active text editor only. Rejected: there is no caret
  seam from host chrome into the editor's text editing, and it does nothing
  when no text is being edited.

### Emoji data

- **Vendored Unicode data** (chosen): a pinned Unicode release, generated into
  a committed module, with the Unicode licence and provenance.
- A runtime package dependency. Rejected: local-first and a licence review for
  data that is already public.
- A hand-curated toy set. Rejected: search and categories would be a promise
  the content cannot keep.

### Embeds

- **A dialog fed by the existing allow-list and parser, plus the existing paste
  path** (chosen). Reuses the element and the API; adds the missing in-app
  affordance.
- Keep paste as the only path. Rejected: row 44's gap is exactly the absent
  affordance.
- An embed directory or provider browser. Rejected: no evidence for it, and
  every entry would be a content-service decision.

### The frame policy

- **URL-only creation, an origin-aware sandbox, and no same-origin for
  `srcdoc`** (chosen). Keeps inline playback and closes the hole.
- Leave the sandbox as it is. Rejected: the `srcdoc` same-origin path is a
  direct route from a third-party widget into Firo's storage.
- Remove all document-type embeds. Rejected: it loses three supported
  providers when an opaque origin is sufficient for their widgets.

## Decision Outcome

### 1. The emoji surface

`@firo/ui` gains `EmojiPanel`, a **left flyout** opened by the rail's `media`
slot and by the command palette.

- **Geometry.** `(64, 64) 368 × 746`: inline-start = the rail's right edge
  (56) + 8, block-start = the menu line, block-end = the 8 px inset. It does
  **not** displace the rail. One rail-slot surface at a time: opening the
  media surface closes the diagramming dock and vice versa; the catalog's
  stacking is C1's rule and is not generalised here. The right dock
  ([`ADR-0035`](0035-the-right-dock-and-its-panels.md)) is independent and may
  be open at the same time.
- **Chrome.** Header with the title "Emoji" and a close control; search field;
  category strip; scrolling grid. Tokens for radii, elevation and control
  sizes; the internal grid metrics are visual, not a measured contract.
- **Behaviour.** Non-modal; the canvas stays interactive. The slot toggles it;
  the close control closes it; **Escape closes it** — this is a transient
  flyout, not the right dock, whose no-Escape rule is evidence-bound to side
  panels. An outside pointerdown does **not** close it, so a pick is never
  lost to the click that consumes it. Focus moves to the search field on open
  and returns to the rail slot on close.
- **Keyboard.** The category strip is a roving tab list; the grid is a roving
  grid (arrow keys, Enter to pick); the search field is first. Escape from
  anywhere in the flyout closes it.
- **Empty state.** "No emoji match" carries the search term; categories are
  never empty because the data is generated per category.

### 2. Emoji content and insertion

- **Data.** A pinned Unicode release's fully-qualified emoji, grouped by the
  Unicode categories, with English names and keywords from CLDR annotations.
  Skin-tone modifier sequences are excluded: the grid stays navigable and the
  base form is the character most picks want; users can still type a variant.
  The data is generated by a committed script into a committed module; the
  build never fetches. The Unicode licence text and a provenance record
  (release, source files, hashes) ship beside it. No new dependency.
- **Rendering.** System emoji font. No emoji font is bundled, so no font
  licence enters the tree.
- **Insertion.** Picking an emoji creates a **text element** containing it at
  the visible canvas centre, at 48 px (a local constant, not a token), selects
  it, and returns the tool to selection. Consecutive picks cascade by 20 px so
  they do not stack invisibly. The flyout stays open for the next pick.
- **The one editor addition.** The imperative API gains
  `insertTextElement`, mirroring `insertEmbeddableElement`: it builds the
  element through the same text constructor the text tool uses (so the text
  pipeline sees it), selects it and returns it. This ADR is the clause-6
  authorisation for that addition. Nothing else in the editor changes.
- **Not adopted.** Typing an emoji into an active text element from the picker
  (no caret seam), drag-from-panel, recents, and localised emoji names. The
  operating system's picker remains the way to put emoji inside text.

### 3. The embed path

`@firo/ui` gains `EmbedDialog`; the host wires it to a new palette command
**"Add embed…"**. Paste remains a creation path. No rail slot, canvas-lane row
or object-lane row is added; ADR-0031 and
[`ADR-0033`](0033-the-two-context-menu-lanes.md) keep their compositions.

- The dialog takes a URL, validates it with `embeddableURLValidator` and
  `getEmbedLink`, names the provider, and enables **Add** only for an `https`
  URL whose hostname is on the allow-list.
- It inserts through `insertEmbeddableElement` at the viewport centre. The
  element stores only the URL; the provider and embed URL are derived at
  render, as today.
- Raw HTML is never accepted as input and never stored. Pasting a provider's
  iframe or blockquote snippet still extracts its `src` first and then
  validates the hostname — the existing behaviour, now stated as the rule.
- An unsupported URL gets the reason and an "Open link" action; it does not
  create an element.
- The allow-list stays as it is. Adding or removing a provider is a reviewed
  change to the one list, not a code path per provider.

### 4. The foreign-frame policy

The renderer's sandbox is computed by one pure, exported helper and applied in
one place. The rule is **origin-aware**:

- **Document (`srcdoc`) frames never receive `allow-same-origin`.** They run
  in an opaque origin with `allow-scripts` only. This closes the Twitter/X,
  Reddit and Gist hole; if a provider's widget cannot render in an opaque
  origin, it falls back to its URL embed form or is removed. No provider keeps
  a same-origin `srcdoc`.
- **URL frames** keep `allow-scripts`, `allow-forms` and `allow-popups`;
  `allow-same-origin` follows the existing per-provider list, now keyed to the
  frame's own URL (which is cross-origin to Firo regardless). `allow-presentation`
  stays.
- `allow-downloads` and `allow-popups-to-escape-sandbox` are removed
  everywhere.
- `referrerPolicy` becomes `no-referrer`.
- The `allow` permissions policy drops `autoplay`, `clipboard-write`,
  `accelerometer` and `gyroscope`; it keeps `encrypted-media`,
  `picture-in-picture` and fullscreen.
- The iframe title names the provider (`Embedded content from YouTube`), not
  a generic vendor string.
- A visible fallback (provider name and the original URL, opening externally)
  replaces a frame that fails to load.

No CSP claim is made here: the host's headers are a deployment concern. The
contract is the frame the renderer emits.

### 5. What this does not decide

- Stickers and GIFs (omitted by the matrix), stock images, and any external
  content service.
- Talktracks (deferred) and calls (vision non-goal).
- Provider expansion, a provider directory, or provider-specific UI beyond
  the dialog's provider name.
- Localised emoji names and keywords.
- Typing emoji into active text, or dragging from the flyout.
- The catalog's stacking rule with left surfaces; that is C1's.
- CSP headers, iframe `Permissions-Policy` at the document level, and
  server-side link unfurling.

## Consequences

- `@firo/ui` gains `EmojiPanel`, `EmbedDialog`, and the generated emoji module
  with its licence and provenance.
- The editor's imperative API gains `insertTextElement`; the host gains the
  media surface state and the insertion handlers.
- The iframe sandbox helper moves the security rule out of JSX into a tested
  function. Existing documents with Twitter/X, Reddit or Gist embeds re-render
  under an opaque origin; each allow-listed provider must be re-verified
  manually, and any break is resolved by the URL-form fallback or removal.
- Removing `allow-downloads` and `allow-popups-to-escape-sandbox` may change
  behaviour inside third-party frames; that is intended.
- Row 40 adopted (the panel with emoji content); 41 adopted; 42 and 43 remain
  omitted; 44 adapted (dialog plus policy). The rail's media slot can land.
- The picker inserts text elements; the document model is unchanged.

## Confirmation

- **Geometry.** At 1200 × 818 the flyout rect is `(64, 64, 368, 746)` within
  ±1 px; the rail stays at `(8, 64)`; the right dock can be open at the same
  time.
- **Emoji behaviour.** The slot toggles; Escape closes; outside clicks do not;
  focus returns to the slot; search filters by name and keyword; categories
  rove; Enter inserts; the inserted text element holds the character, is
  selected, and creates a cascaded element on the next pick.
- **Data.** Regeneration is reproducible from the pinned release; the licence
  and provenance files exist; no skin-tone sequences; no duplicate characters;
  every category non-empty; the build performs no network access.
- **Embeds.** The dialog accepts an allow-listed `https` URL and inserts; it
  rejects `http`, unknown hosts, `javascript:` and raw markup; the palette
  command opens it; paste of a supported URL still inserts; paste of a
  disallowed iframe `src` does not.
- **Frame policy.** Unit tests on the helper: document frames never include
  `allow-same-origin`; no frame includes `allow-downloads` or
  `allow-popups-to-escape-sandbox`; `referrerPolicy` is `no-referrer`; the
  permissions list is the minimal one. A manual matrix records each
  allow-listed provider loading under the new sandbox, or its fallback.
- **Side-by-side.** Open Miro's media library and Firo's emoji surface at the
  same viewport; compare anchor, width and height. Content differences (no
  stickers or GIFs) and the embed dialog (not opened live) are stated per
  capture.
- **Suites.** `yarn test:typecheck`, `yarn test`, `yarn test:code`,
  `yarn test:other`.

## Pros and Cons of the Options

**Full-height flyout, text-element insertion**

- (+) Matches the measured surface and gives search and categories room.
- (+) Reuses the text model; no schema or migration.
- (+) One rail-slot surface at a time keeps the left edge predictable.
- (−) A 368-wide panel for emoji alone is more chrome than the content needs.
- (−) Text elements are editable; an accidental edit can turn an emoji into
  other text, which is acceptable for a text-first model.

**Keep paste-only embeds**

- (+) Zero new UI and zero new API.
- (−) Row 44 stays partial; the feature is undiscoverable.

**Same-origin srcdoc, left as-is**

- (+) Twitter and Reddit widgets render with the least friction.
- (−) A third-party script runs with Firo's origin and can read the board and
  the local store. That is a breach, not a trade-off.

## More Information

- Evidence: [`miro-geometry.md`](../research/miro-geometry.md) §Rail flyouts
  and the shape library;
  [`miro-interactions.md`](../research/miro-interactions.md) §Creation rail and
  §Media (rows 40–44 of the matrix).
- Current code: `packages/element/src/embeddable.ts` (allow-list, parsers,
  `srcdoc` providers), `packages/editor/components/App.tsx` (iframe sandbox),
  `packages/editor/types.ts` (`insertEmbeddableElement`),
  `packages/editor/components/App.clipboard.ts` (paste path),
  `packages/ui/src/components` (chrome components).
- Related ADRs: [`ADR-0023`](0023-open-icons-and-ui-typeface.md) (icons),
  [`ADR-0031`](0031-rail-slot-kinds-and-the-phase-11-composition.md) (the
  media slot), [`ADR-0034`](0034-the-measured-geometry-as-tokens.md),
  [`ADR-0035`](0035-the-right-dock-and-its-panels.md).
- Recon: Miro Business build `1.104717.0`, 19 October 2026, 1200 × 818 CSS.
  The media library was opened live; the embed panel's contents were not, so
  the dialog is Firo's composition. Raw captures stay out of the repository.
