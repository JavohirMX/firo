# Server and authentication

**Version 2.** Nothing in this document is required for version 1, and version 1
must not contain any code that depends on a server existing.

## The single-container rule

**One container. SQLite. No external database, no Redis, no message queue.**

This is a hard constraint from the primary persona
([`../prd/01-personas.md`](../prd/01-personas.md)) — Dan runs this on his own box
and does not want to operate a database cluster to run a workshop tool.

```yaml
services:
  firo:
    image: ghcr.io/firo/firo:latest
    volumes:
      - ./data:/data          # SQLite + assets
    ports:
      - "8080:8080"
    environment:
      FIRO_OPEN_REGISTRATION: "true"  # set to "false" to close sign-up
```

That is the entire install. Anything that makes this longer is a design failure.

## What the server does

| Responsibility | Implementation |
| --- | --- |
| WebSocket relay | `y-websocket` protocol, implemented against `y-protocols` |
| Document persistence | SQLite. One row per Yjs update, plus a compacted snapshot. |
| Awareness relay | In memory, per room. Never persisted. |
| Asset storage | Filesystem under `/data/assets`, content-addressed. |
| Authentication | Local accounts. Argon2id. |
| Authorisation | Board-level roles, checked on every connection. |

**We write our own relay rather than using the `y-websocket` server**, because we
need authentication and per-board authorisation inside the room, and because we need
SQLite persistence with compaction. The protocol is the same; only the server is
ours.

## Why server-authoritative is not the sync model

A tldraw-style authoritative room is simpler to authorise than a CRDT, and it is
what we rejected in [`03-crdt-and-sync.md`](03-crdt-and-sync.md). The distinction
matters here:

**The server is authoritative over *access*, not over *content*.** It decides who may
join a board and what they may do. It does not decide what the board contains — Yjs
merges that, and the server is one peer among several.

This is why a client that has been offline for a week can reconnect and merge
cleanly. If the server held canonical state, that client's week of work would need
explicit conflict resolution.

## Accounts

Local accounts on the server
([`ADR-0008`](../adr/0008-local-accounts-on-self-hosted-server.md)).

**We do not do capability links as the primary model.** Excalidraw's approach — the
key is in the URL fragment — has a real property that we like (no account at all)
and two problems we do not: a leaked link is total compromise with no revocation,
and there is no way to say "these five people can edit and that one can only
comment".

Excalidraw's E2EE is AES-GCM with a **128-bit symmetric key** in the URL fragment: no
asymmetric handshake, no forward secrecy, no rotation, no revocation. We do not
inherit that.

| Property | Implementation |
| --- | --- |
| Password hashing | Argon2id, memory-hard parameters |
| Sessions | HttpOnly, Secure, SameSite=Strict cookies. Rotating on privilege change. |
| Registration | Open by default, disableable by config. A self-hosted instance usually wants it open. |
| Rate limiting | Per-IP on auth endpoints. Mandatory. |
| Password reset | Admin-issued, not email. Self-hosted has no mail server. |
| 2FA | Not in scope. Not on the non-goals list, but not a v2 feature either. |

**There is no email.** A self-hosted server has no mail server, and adding one makes
the install worse for every user to serve a rare feature. Recovery is an admin
action.

## Roles

| Role | Read board | Edit board | Comment | Manage access | Delete board |
| --- | --- | --- | --- | --- | --- |
| **Owner** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Editor** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Commenter** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Viewer** | ✅ | ❌ | ❌ | ❌ | ❌ |

**Authorisation is checked at connect and on every update.** A role change mid-session
disconnects the client. Checking only at connect means a demoted editor keeps
writing until they reconnect.

**Comments use a separate permission lane.** A commenter can write comments without
edit rights. In Yjs terms this is a second partition of the document, persisted and
authorised separately from the element map — the pattern tldraw uses and the reason
their commenting works for viewers. Do not implement comments as elements in the
main map; then a commenter would need edit rights on the whole board.

## Share links

Capability URLs, **with revocation** — the thing Excalidraw lacks.

```
/s/<token>
```

- 128 bits of entropy, generated with a CSPRNG.
- Scoped to one board, one role.
- Revocable, individually.
- Expirable, optionally.
- **Not password-protected in the Phase 11 contract.** The columns are
  reserved, but a stored hash is not checked; see
  [`ADR-0037`](../adr/0037-share-links-are-server-capabilities.md) §4. A
  legacy password row is inert until an unlock grant exists.

**No E2EE for sync or share links in the Phase 11 contract.** The server stores
readable Yjs updates; a share link is a bearer capability. The encrypted-file
format is a separate feature. [`ADR-0037`](../adr/0037-share-links-are-server-capabilities.md) §7
makes the product say so.

**The honest limitation of any capability-link scheme: anyone who has the link
has access.** A link pasted into a chat is a leak. This is why revocation
exists and why the UI must make creating and revoking links obvious.

## Asset storage

Files on disk under `/data/assets`, content-addressed by SHA-256.

- No object storage service. No S3, no MinIO.
- Uploads are size- and type-limited **server-side**, not only in the client.
- Content addressing means a 2 MB image used on 50 cards is stored once.
- Assets are referenced by hash from the document, so replacing an asset with
  different content is a new hash and a new reference — old assets are garbage
  collected on compaction.

## Operational requirements

| Requirement | Value |
| --- | --- |
| Back up | One directory. `tar` the volume. |
| Restore | Untar it. |
| Upgrade | Replace the container. Schema migrations run on start, idempotently. |
| Health check | `/healthz` returns 200 with no auth |
| Logs | stdout, structured JSON |
| Metrics | None. We are not building observability infrastructure. |
| TLS | Terminated by a reverse proxy. Documented, not bundled — Caddy and nginx are both one line. |

**No telemetry, ever.** Not anonymised, not opt-in, not aggregate. NFR-3.

## Failure behaviour

| Failure | Behaviour |
| --- | --- |
| Server unreachable | Board opens **read-only** with a clear message. The user can fork to a local copy and keep working. |
| Sync diverges | Should not occur — Yjs converges. A "resync" action forces a full state exchange. |
| Disk full | Writes fail loudly. The client keeps a local copy and warns. Never silently drop. |
| Auth server down | Every request fails closed. Never fails open. |
| Corrupt SQLite | Restore from backup. The server keeps a daily snapshot in the same volume for this. |

## What is not in v2

SSO, OIDC, SCIM, audit logs, quota enforcement, multi-organisation tenancy,
horizontal scaling, regional data residency, eDiscovery. All of these are either on
the never-list or require a product conversation we have not had
([`../vision.md`](../vision.md)).

## Authentication rate-limit identity

Authentication attempts are counted by the TCP peer address. The server does
not trust `X-Forwarded-For`: accepting an arbitrary client-provided header lets
a caller reset its quota on every request. When deployed behind a reverse
proxy, clients share that proxy's authentication quota. Configure per-client
limits at the trusted proxy as well; forwarded-client identity support is not
implemented in Firo.
