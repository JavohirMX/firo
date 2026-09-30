---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# Local accounts on the self-hosted server

## Context and Problem Statement

Version 2 adds an optional self-hosted sync server. That raises the question of who
is on a board and how access is controlled.

Excalidraw's answer is **capability links**: a room id and a key in the URL fragment,
with no accounts at all. This has a real property we like and two problems we do not.

The problems, from Excalidraw's own `data/encryption.ts`:

- The key is **AES-GCM with a 128-bit symmetric key**, exported as a raw string and
  carried in the URL fragment. No asymmetric handshake, no identity, no forward
  secrecy, no key rotation, no revocation.
- **Anyone with the link has the key.** That is the intended model, but it means a
  link pasted into a chat is a total compromise with no way to undo it.

It also cannot express the permission model we need: "these five people can edit, that
one can only comment."

Miro uses cloud accounts with a role matrix
([view/comment/edit](https://help.miro.com/hc/en-us/articles/360017572194-Board-access-rights)
× member/guest/visitor), but it has no self-hosted edition at any tier, ever.

## Decision Drivers

- Boards must support four distinct roles, not just "has the link".
- Access must be **revocable** without rotating keys or re-sharing every link.
- Password storage, sessions, and recovery are security-critical and we would be
  building them from scratch.
- The single-container install must not grow
  ([`../trd/08-server-and-auth.md`](../trd/08-server-and-auth.md)).
- There is no mail server on a self-hosted instance, so recovery cannot depend on
  email.

## Considered Options

1. Local accounts on the server, four board roles
2. Capability links only, as Excalidraw
3. Capability links first, accounts in v3
4. Capability links plus optional OIDC
5. Cloud accounts with a hosted service

## Decision Outcome

Chosen option: **1 — local accounts on the self-hosted server**, with roles of owner,
editor, commenter, and viewer.

**Plus capability share links, with revocation**, as a secondary mechanism. Share
links are scoped to one board and one role, individually revocable, optionally
expirable, optionally password-protected, and optionally E2EE with the key in the
fragment.

**The server is authoritative over access, not over content.** It decides who may
join and what they may do. It does not decide what the board contains — Yjs merges
that, and the server is one peer among several. This is why a client that has been
offline for a week reconnects and merges cleanly.

**There is no email.** Password reset is an admin action.

## Consequences

- (+) Four real roles, expressible without inventing a permission model.
- (+) Revocable access, which Excalidraw does not have.
- (+) Self-contained. An air-gapped instance works with no external dependency.
- (-) **We own password security.** Argon2id, session rotation, rate limiting, and
  CSRF protection are all ours to get right. This is the largest security surface we
  create.
- (-) User management UI is a whole product surface: registration, login, session
  management, password reset by admin, account deletion, and the privacy questions
  that come with storing user records.
- (-) **No SSO.** A team that needs it must use reverse-proxy authentication, which we
  would document but not build. This is consistent with
  [`../vision.md`](../vision.md), which puts SSO on the never-list.
- (-) No email means no self-service recovery and no notification of anything.
  Account management is entirely admin-driven.
- (-) A capability link is still a capability link: a leaked link is a leak.
  Revocation exists and the UI must make creating and revoking links obvious.

## Confirmation

- AC-12 in [`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md):
  a commenter can add comments but cannot move anything.
- A test asserts that a role change mid-session disconnects the client. Checking
  authorisation only at connect means a demoted editor keeps writing.
- Security review before v2 ships: password storage, session handling, rate limiting,
  CSRF, and path traversal on asset upload.

## Pros and Cons of the Options

### 2. Capability links only

- (+) No user management at all. No password security surface. Zero accounts.
- (+) Genuinely elegant, and the model Excalidraw ships.
- (-) **No roles.** Everyone with a link can edit. A workshop where the facilitator
  wants a viewer is not possible.
- (-) **No revocation.** A leaked link is permanent.
- (-) A 128-bit key in a URL fragment with no forward secrecy. We would be shipping
  known-weak E2EE under our own name.

### 3. Capability links first, accounts in v3

- (+) A stateless server in v2, which is genuinely simpler to build and to operate.
- (+) Validates the sync protocol before we build auth on top of it.
- (-) **The permission model is the hard part and it is deferred rather than
  simplified.** A commenter lane needs to exist regardless
  ([`../trd/08-server-and-auth.md`](../trd/08-server-and-auth.md)), which means
  designing the permission model anyway.
- (-) A board shared over capability links is not really shareable with a team, which
  is the v2 use case.

### 4. Capability links plus optional OIDC

- (+) No password handling of our own for organisations that already run an identity
  provider.
- (-) **Breaks the single-container, no-external-dependency promise.** OIDC needs a
  provider.
- (-) An OIDC integration is a significant amount of work for a small slice of
  users, and every organisation's provider is subtly different.
- (-) Deferrable to v3 if it is ever wanted; it composes with local accounts rather
  than replacing them.

### 5. Cloud accounts with a hosted service

- (+) Solves account management entirely.
- (-) **Contradicts the entire product thesis.** A cloud account system is a hosted
  service, and Firo's pitch is that there is none.

## More Information

- [Miro board access rights — the permission matrix](https://help.miro.com/hc/en-us/articles/360017572194-Board-access-rights)
- [Excalidraw `data/encryption.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/data/encryption.ts)
- [`../trd/08-server-and-auth.md`](../trd/08-server-and-auth.md) — the full server design
