# Phase 9 — Sync server
> **Status: 100% COMPLETE & VERIFIED (Version 2 Complete)**
> Exit criterion **AC-12** verified in `apps/server/tests/ac12.test.ts`.

**Goal:** multiplayer, in one container.

Version 2, and the smallest change relative to the ambition
([ADR-0002](../adr/0002-yjs-as-concurrency-engine.md)). If the data model was built
right, this phase is a server and a provider.

## Exit criterion — **AC-12**

> On a clean Linux box, a tester runs the documented install command. Within five
> minutes, two browsers on the same network are editing the same board, seeing each
> other's cursors, and a third with commenter rights can add comments but cannot move
> anything. The tester restarts the server and no work is lost.

**Single container. No external database. No Redis. No message queue.**

## Tasks

### 9.1 — The relay

A WebSocket server implementing the `y-websocket` protocol against `y-protocols`.

**We write our own rather than using the `y-websocket` server** because we need
authentication and per-board authorisation inside the room, and SQLite persistence
with compaction.

Learn from tldraw's `TLSocketRoom` design, which is well documented: authoritative
document state in memory, a storage adapter underneath, and session snapshots for
hibernating platforms.

**The server is authoritative over access, not over content.** It decides who may join
and what they may do. It does not decide what the board contains. This is what lets an
offline client reconnect and merge.

### 9.2 — Persistence

SQLite. One row per Yjs update, plus a compacted snapshot. Assets on the
content-addressed filesystem.

**Schema migrations run on start, idempotently.** Upgrading is replacing the
container.

### 9.3 — Accounts

Local accounts ([ADR-0008](../adr/0008-local-accounts-on-self-hosted-server.md)).

Argon2id. HttpOnly, Secure, SameSite=Strict cookies, rotating on privilege change.
Rate-limited auth endpoints. Registration open by default, disableable.

**No email.** Password reset is an admin action. A self-hosted instance has no mail
server and adding one makes the install worse for every user to serve a rare feature.

### 9.4 — Roles

Owner, editor, commenter, viewer. **Authorisation is checked at connect and on every
update.** A role change mid-session disconnects the client — checking only at connect
means a demoted editor keeps writing.

### 9.5 — Comments

Threaded, object-anchored, resolvable, mentionable. A comment survives its anchor
being deleted, as a tombstone.

**In a separate permission lane.** A commenter can write comments without edit
rights. In Yjs terms this is a second partition of the document, persisted and
authorised separately from the element map — the pattern tldraw uses.

**Do not implement comments as elements in the main map.** Then a commenter would need
edit rights on the whole board, and the commenter role would be meaningless.

### 9.6 — Presence

Live cursors, laser pointer, user list, follow-me, idle state. All through Yjs
awareness — never the document.

This is where the v1 ephemeral/durable design pays off. There is no new
architecture here, only a provider.

### 9.7 — Share links

Capability URLs, 128 bits from a CSPRNG, scoped to one board and one role,
**individually revocable**, optionally password-protected, optionally expirable.

Optional per-board E2EE, key generated in the browser, never sent to the server,
carried in the URL fragment.

**The honest limitation, which the UI must make obvious:** anyone with the link has
the key. Revocation exists and creating links must be an explicit action.

### 9.8 — Version history

Board snapshots with restore. Excalidraw retains deleted elements for 24 hours; we
retain them until the board is compacted.

## Verification

- **AC-12** in full
- A commenter can add comments and cannot move anything — asserted at the protocol
  level, not just in the UI
- A demoted editor is disconnected within one update
- Server restart loses nothing
- Disk full fails loudly and the client keeps a local copy
- Auth server down fails **closed**, never open
- Two users editing the same card both keep their text (the
  [ADR-0002](../adr/0002-yjs-as-concurrency-engine.md) test, now against a real
  server)
- A client offline for a week reconnects and merges with no manual conflict resolution
- Auth endpoints are rate-limited and the limit is tested
- Path traversal on asset upload is tested
- **No telemetry, ever.** Not anonymised, not opt-in

## Risks

| Risk | Mitigation |
|---|---|
| We get password security wrong | Security review before shipping. This is the largest security surface we create |
| The server becomes authoritative by accident | The rule is explicit in [`../trd/08-server-and-auth.md`](../trd/08-server-and-auth.md): authoritative over *access*, not *content* |
| Comments implemented as elements break the commenter role | Separate lane, from the first commit |
| Scope expands to SSO and multi-tenancy | Both on the never-list |
| SQLite becomes the bottleneck | It will not at this scale. If it does, the format is already portable |
