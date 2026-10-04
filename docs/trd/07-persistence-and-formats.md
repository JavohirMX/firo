# Persistence and file formats

## Local persistence

**Everything lives in IndexedDB via `idb-keyval`**
([`ADR-0005`](../adr/0005-indexeddb-via-idb-keyval.md)).

```ts
const store = createStore("firo", "boards")
await set(`board:${boardId}`, yDocUpdate, store)      // Yjs update
await set(`assets:${assetId}`, blob, store)           // binary, separate
```

### What this fixes

Excalidraw stores **elements in `localStorage`** and files in IndexedDB. The element
JSON is the part that matters, and `localStorage` caps at roughly 5–10 MB. A
workshop board with a few hundred images and 2,000 elements does not fit. Excalidraw
catches `QuotaExceededError` and shows a warning — correct behaviour, but it means
the product does not work for the use case we are building for.

**Everything in IndexedDB.** No size ceiling that matters, structured storage,
asynchronous, and it does not block the main thread on write.

### Save policy

| Data | Policy |
| --- | --- |
| Yjs document | Continuous via `y-indexeddb`, batched |
| Assets | Written once on import, content-addressed |
| Board list, tags, folders | On change, debounced |
| Preferences | On change, synchronous (they are tiny) |
| Camera position per board | On change, debounced |

**The save state is visible.** Users have been burned by tools that silently lose
work. A small indicator shows saving, saved, and error. An error is never silent
(AC-10).

**Do not pause saving when the tab is hidden.** Excalidraw pauses on
`document.hidden` to avoid background writes. That is defensible for a single
document in `localStorage` and wrong for us: a user switching tabs during a workshop
must not be able to lose work. The debounce handles the cost.

### Compaction

Yjs keeps tombstones for deleted content. A long-lived board grows without bound.
Compact on a schedule and on demand, writing a fresh snapshot and replacing the
update log. The disk-size budget in NFR-7 is measured **after** compaction, not
before.

## The `.firo` archive

A **directory** containing everything. **Text-based, readable, diffable,
git-friendly.** This is a real differentiator: Miro cannot re-import its own board
file, and Miro CSV export explicitly does not preserve structure or relationships.

> **Amended by [ADR-0018](../adr/0018-a-firo-is-a-directory.md).** This section used to
> say "A single file containing everything" and then draw the directory tree underneath
> it, which is the contradiction the ADR resolves. A single file cannot carry image
> bytes and stay diffable; the directory can do both. `cat board.firo` is therefore
> `cat board.firo/board.json`. A format-v1 single JSON file still loads, for ever, and
> import dispatches on shape rather than on the extension.

```
board.firo/
├── manifest.json        version, board id, created, generator, checksums
├── board.json           elements, containers, collections, columns, records
├── assets/
│   ├── <sha256>.<ext>   content-addressed, deduplicated
│   └── ...
└── history/             optional; omitted for a clean export
```

**Assets are stored as files beside the document, not inlined as base64.** Two
reasons: a 2 MB base64 string inside the JSON makes it unreadable and undiffable, and
content addressing deduplicates the same image used on 50 cards.

**Base64 is never used for binary data in the document.** Excalidraw's `"local"`
serialisation inlines files as base64 data URLs, which is why its files are
self-contained *and* why they are large. We get the same portability with a folder.

### Why text-based matters

A `.firo` file committed to git should produce a readable diff:

```diff
-  {"id":"a3f","type":"card","x":120,"y":80,"width":200,"height":140}
+  {"id":"a3f","type":"card","x":140,"y":80,"width":240,"height":160,"tags":["reviewed"]}
```

This is not vanity. It is what makes the file a durable artefact rather than an
opaque blob, and it is a large part of why Dan
([`../prd/01-personas.md`](../prd/01-personas.md)) will keep using Firo after Miro
raises its prices again.

## Versioning

`manifest.json` carries the format version. Element and record types carry their own
versions independently.

```json
{ "format": "firo", "version": 3, "generator": "firo/0.4.1",
  "created": 1759250000, "checksums": { "board.json": "sha256:..." } }
```

**Loading a file from a newer version fails loudly.** A clear error naming the
versions involved, and nothing is written. Silent partial loading is worse than a
refusal, because the user does not know what was dropped.

**Loading from an older version runs the migration chain.** Fixture tests cover
every released version
([`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) AC-6).

## Export

| Format | Scope | Notes |
| --- | --- | --- |
| PNG | Selection, frame, or whole board | Never watermarked |
| SVG | Same | Vector, text as text where possible |
| PDF | One page per frame, in frame order | Frame order is user-controlled |
| CSV | Collection or board | Structure preserved for collections, unlike Miro |
| Mermaid | Selection | For diagrams and mind maps |
| `.firo` | Whole board | The native archive |
| `.excalidraw` | Whole board | Interop (FR-36) |

**PDF page order follows frame order**, and frame order is a user-facing list —
drag to reorder. This is Miro's model and it is correct.

**Excalidraw's `png-chunk-text` technique is worth keeping** for "copy as PNG" that
retains the scene data, so an image pasted into Slack can be re-opened in Firo.

## Import

| Format | Fidelity | Phase |
| --- | --- | --- |
| `.firo` | Lossless | 7 |
| `.excalidraw` | High — elements, not flattened | 7 |
| Mermaid | Diagrams become shapes and connectors | 7 |
| CSV | Into a collection, with a column mapping step | 7 |
| PNG, PDF | As a background image | 7 |
| Miro export formats | Best effort | v2 |
| Weje | Not possible — closed source, no export format | Never |

**AC-9 is the bar for `.excalidraw` import:** every element arrives editable and
correctly positioned, not as a flattened image. This is achievable because we forked
the source and the element model is compatible.

**Import is atomic.** Validate the whole file, build the new board in memory, and
only then commit. A failure leaves the existing board untouched (AC-10).

## Losslessness

**A `.firo` export must round-trip.** Export → import → export must produce a
byte-identical document, or an explainable and tested difference.

This is testable and should be a test: the round-trip property is what turns the file
format from a feature into a promise. Test with every element type, every column
type, tags, votes, containers at multiple depths, and a board with 10,000 elements.

## What we deliberately do not do

| Not doing | Why |
| --- | --- |
| PPTX export | Miro does not do it either. A deck format is a whole product. |
| VSDX export | Paywalled on Miro even for Business. Not worth the complexity. |
| A binary format for speed | Diffability is worth more than parse speed for our users. Optimize the JSON. |
| Cloud backup | We are local-first. The user backs up their own files. |
| Automatic file watching | A desktop concern. v3 with Tauri. |
