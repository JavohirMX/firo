---
status: accepted
date: 2026-10-14
deciders: maintainer
---

# Comments are their own durable lane, not elements or records

## Context and Problem Statement

Task 7.5.6 ([`../plans/phase-7-5-miro-ui.md`](../plans/phase-7-5-miro-ui.md)) adds
local-first, object-anchored comment threads to Firo. A comment thread is a
conversation about a canvas element (a sticky note, shape, image, or frame) with
messages, author attribution, timestamps, and an open/resolved state.

Before this change, Firo's persistent data model consisted of two main durable
categories:
1. **Elements** on the canvas (`packages/element`), versioned under
   `CURRENT_ELEMENT_VERSION`.
2. **Records in Collections** (`packages/records`), versioned under
   `CURRENT_RECORD_VERSION`.

We needed to decide where comments live in the data model and in the Yjs
document hierarchy.

## Decision Drivers

- **Rule 4 from `AGENTS.md` (Records are not elements).** Canvas elements are
  positioned objects on the board, subject to scene z-order, spatial indexing,
  culling, selection bounds, and rendering via the canvas pipeline. A comment is
  an annotation *about* an element, not a geometric shape.
- **Future permission boundaries (v2).** In Version 2, boards support a
  "Commenter" role ([`../trd/08-server-and-auth.md`](../trd/08-server-and-auth.md)).
  A commenter may create threads and post replies, but must not have write
  permission to canvas elements or collections. If comments shared the element
  map or collection tables, partitioning permissions would require retrofitting.
- **Element-relative tracking with zero write amplification.** When an element is
  dragged across the canvas, its comments must stay visually attached to it. If
  comments stored absolute board coordinates, moving a note would require
  updating every anchored thread on pointer-up, causing unnecessary Yjs
  transaction traffic and potential synchronization drift.
- **Conversations must survive element deletion.** Deleting a sticky note should
  not destroy the discussion team members had on it. An orphaned thread should
  remain accessible rather than being lost to cascading deletion.
- **Typed columns vs. unstructured arrays.** A comment thread contains an array
  of messages and an anchor struct. Forcing this into the record collection
  system would mean storing structured data as serialized text in column values,
  defeating the purpose of typed columns.

## Considered Options

1. **A new canvas element type (`type: "comment"` or `"commentThread"`).**
2. **A record in a reserved collection.**
3. **A separate durable lane:** an 8th Yjs root (`comments`), versioned under the
   record schema chain (`CURRENT_RECORD_VERSION = 2`), using element-relative
   anchoring and an overlay renderer.

## Decision Outcome

**Option 3.**

### 1. Document Structure & Yjs Root

Comments live in an 8th root in `packages/doc/src/structure.ts`:
```ts
ROOTS.comments = "comments";
// comments: Y.Map<Y.Map<unknown>> keyed by thread id
```

Each thread is a nested `Y.Map` allowing concurrent updates to properties (such
as replying to a thread while another user resolves it).

### 2. Relative Anchoring

A thread stores its anchor relative to the element's origin `(0, 0)` (top-left):
```ts
export type CommentAnchor = Readonly<{
  x: number;
  y: number;
}>;
```
When rendering, the overlay computes the screen position as:
`sceneCoords = element.position + thread.anchor`
Because the anchor is relative, dragging an element re-anchors every attached
thread automatically without writing to the document or CRDT.

### 3. Survival and Non-Cascading Deletion

`CommentThread.elementId` points to the target element. If the target element is
deleted, the thread remains in the document. The UI can display orphaned threads
or maintain conversation history rather than dropping conversations.

### 4. Plain Text in Version 1

Following the roadmap in [`../trd/05-rich-text.md`](../trd/05-rich-text.md), rich
text with ProseMirror is planned for comment bodies in Version 2. For Version 1,
`CommentEntry.body` is stored as a plain string, keeping the v1 implementation
lean while establishing the durable lane.

### 5. Schema Versioning & Forward Compatibility

Because comments are not elements, they are versioned under the non-element
durable chain: `CURRENT_RECORD_VERSION = 2`.
- Migrations in `@firo/schema` are forward-compatible: old boards without
  comments load without repairs and do not gain an empty `comments` field on
  re-save.
- Newer files with higher versions throw `ForwardVersionError` to prevent silent
  data loss (AC-10).

## Consequences

### Positive
- Strict adherence to `AGENTS.md` Rule 4 and Rule 2.
- Clean architectural seam for Version 2 permissions and presence.
- Moving elements generates zero document mutations for comments.
- Deleting an element preserves the audit trail of team discussions.
- Rendered via a dedicated React overlay (`CommentLayer`) in HTML/CSS, keeping
  canvas rendering and spatial indexing lightweight.

### Negative / Trade-offs
- The document has an 8th root to serialize and deserialize.
- `CommentLayer` must observe viewport scroll and zoom changes from the editor
  to keep DOM pins aligned with canvas coordinates.
