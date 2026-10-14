---
status: accepted
date: 2026-10-14
deciders: core team
---

# Folders, Starring, and Content Search in the Project Layer

## Context and Problem Statement

Phase 8 begins the Project Layer ([`docs/plans/phase-8-pm-layer.md`](../plans/phase-8-pm-layer.md)). Users need to organize boards into folders/projects, star favourite boards, duplicate existing boards, and search content across boards (reaching sticky notes, cards, text elements, and comments).

At the same time, [`docs/vision.md`](../vision.md) imposes the **Green Information** constraint:
> We do not build a second place for information to live. No status table to keep in sync with the board. No dashboard that summarises something already visible.

How do we structure folder organization, starring, and cross-board content search without introducing a second place for data or an out-of-sync secondary index?

## Decision Drivers

- **Green Information:** Folders and search must organize and locate boards without creating duplicate status trackers, rigid taxonomies, or secondary summary databases.
- **Architectural Seams (ADR-0022 & ADR-0026):** Presentational chrome lives in `@firo/ui` with zero knowledge of storage; `apps/web` owns IndexedDB storage, folder CRUD, and navigation.
- **Yjs Document Durability:** Canvas minimap panning and tool switching are local ephemeral states; they must never mutate the Yjs CRDT update stream.
- **Performance at local scale:** Content search operates directly over board storage snapshots in IndexedDB without requiring external server-side indexing.

## Considered Options

1. **Option A: Full SQL/RDBMS-style schema with secondary index tables.** Index every word into a global full-text index database on every save.
2. **Option B: Lightweight folder metadata beside the board index, with on-demand content search.** Folders exist as simple descriptors in the local store (`board-folders`), boards carry an optional `folderId` and `starred` flag, and content search inspects stored document snapshots in memory.
3. **Option C: Move folders into the board documents themselves.** Each board embeds its hierarchy, requiring opening and syncing every board to know what folders exist.

## Decision Outcome

Adopt **Option B**:

1. **Folder and Board Metadata:**
   - `BoardFolder` (`id`, `name`, `color?`, `created`) is stored in IndexedDB under `boardStore` key `"board-folders"`.
   - `BoardMeta` carries optional `folderId?: string` and `starred?: boolean`.
   - Deleting a folder un-assigns boards from that folder without deleting the boards or losing work.
2. **Cross-Board Content Search (`apps/web/board/search.ts`):**
   - Reads non-trashed board payloads, parses elements, records, and comments, and matches substrings against titles, sticky notes, card bodies, and comment messages.
   - Returns snippets with contextual match types (`"title" | "stickynote" | "card" | "text" | "comment"`).
3. **Miro Canvas Experience:**
   - **One-time tools:** Selection tools revert to selection upon placement via `locked: false` in `setActiveTool`, while double-click or shift-click locks the tool for continuous placement.
   - **Minimap:** Interactive viewport minimap computes scene bounding boxes, renders on `<canvas>`, and translates local viewports on drag without touching the Yjs CRDT.

## Consequences

- Folders are lightweight and flexible without enforcing strict bureaucratic taxonomies.
- Searching remains zero-maintenance and self-healing: if an element is edited or deleted, the next search directly reflects the updated board document.
- Local-first guarantees are preserved; zero network roundtrips required for search or folder management.
- Revisit trigger: If local boards exceed several hundred, SQLite-in-the-browser (via WASM) can be introduced without breaking this interface.
