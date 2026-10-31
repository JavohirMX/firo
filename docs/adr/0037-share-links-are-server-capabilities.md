---
status: accepted
date: 2026-10-19
deciders: maintainer
---

# Share links are server capabilities, and the app must prove who it is

## Context and Problem Statement

C9 is the home-and-share cluster: rows 51, 54, 55, 56 and 59 of
[`miro-parity-matrix.md`](../research/miro-parity-matrix.md). The cluster map
marks it as a contract change because share links need real server state. This
ADR settles that state end to end: the route, identity, roles, redemption, and
what the home remembers. Templates (rows 55 and 56) are a separate content
contract and land as ADR-0038 before that work starts.

**What the evidence says.** Miro's share dialog is `600 × 433`, x-centred, with
tabs **Invite**, **Embed**, **Publish** and **AI**, a Board access section
(owner, team, "Anyone with the link") and a footer with **Copy board link** and
**Sharing settings**
([`miro-interactions.md`](../research/miro-interactions.md) §Share). Nothing
was exercised: no invites, no link changes, no copying. Embeds and publishing
are omitted by the matrix (rows 60–61); the AI tab contradicts the no-paid-tier
non-goal. The template gallery has categories, search and previews; save as
template lives in the object menu (rows 55–56).

**What the server already has.** Phase 9 built the state this ADR needs:

- a `shares` table with a 128-bit CSPRNG token, one board, one role,
  `expires_at`, `revoked`, and `password_hash`/`salt` columns that are stored
  but never checked;
- owner-only `POST /api/boards/:id/shares`, `GET …/shares` and the revoke route;
- `resolveRole(boardId, user, shareToken)` with session precedence: admin,
  owner, board member, then the share token, with expiry and revocation
  checked;
- role enforcement on **every** update in the relay: viewers are disconnected
  on a write, commenters may only touch the `comments` root, demotions and
  revocations are re-read per frame;
- board registration on the owner's first authenticated connection
  (`relay.ts` creates the row with that user as owner);
- username/password accounts with Argon2id, rate-limited auth endpoints,
  HttpOnly `SameSite=Strict` session cookies, open registration (disableable),
  no email, password reset as an admin action.

**What the client does not have — the real gate.**

- **No account surface.** The web shell has no sign-in, registration or session
  bootstrap. The owner-only share endpoints are therefore unreachable from the
  product. AC-12 seeds users directly.
- **An unwired share dialog.** `ShareModal` mints a random token locally and
  keeps links in React state when no callbacks are supplied; `App.tsx` passes
  no callbacks. Nothing reaches the server, and the local link is a lie.
- **Redemption is broken.** `resolveShareToken` fetches `/s/:token`, but that
  path is the **SPA HTML route** (asserted by AC-12); the JSON route is
  `/api/shares/:token`. The fetch parses HTML as JSON, catches, and returns
  `null`. A share link therefore lands on the home screen.
- **The role is discarded.** The resolver returns the role, and `App.tsx`
  ignores it. There is no viewer or commenter UI; a viewer who drags an element
  is disconnected by the relay instead of being prevented.
- **Shared boards are half-joined.** `Root.tsx` creates a local board meta
  named "Shared Board" with no token, so it appears among owned boards in
  recents but reopening it from the home cannot reconnect.
- **Passwords are a bypass, not a control.** The create route stores a hash and
  the public route advertises `requiresPassword`, but `resolveRole` never
  checks it and there is no unlock endpoint. The token alone grants the role.
- **No end-to-end encryption.** Phase 9's §9.7 mentions optional per-board
  E2EE with a key in the URL fragment; no such code exists. The encrypted-file
  format in `packages/editor/data/encryption.ts` is a different feature.

The gate is therefore larger than "wire the dialog": it is identity, route,
role modes, and an honest correction of two Phase 9 claims.

Clean-room note: the share dialog's observed structure informs the mapping;
its labels, layout and interaction are Firo's, and no Miro asset is copied.

## Decision Drivers

- **The server is authoritative over access, not content**
  ([`TRD-08`](../trd/08-server-and-auth.md)). The client mode is UX; the relay
  is the boundary.
- **Capability links are explicit.** Creating a link is an act; revoking one is
  an act; there is no recipient inbox to leak or maintain.
- **Local-first.** The home, the joined-board record and offline copies are
  local. The server is consulted for access, not to draw the home.
- **Honesty.** No locally minted fake links; no advertised password that is
  not checked; no E2EE claim without code; a bad link must say so, not open a
  blank board.
- **Minimal identity.** Username and password, no email, no reset UI; the
  existing server endpoints and cookie are enough.
- **One resolution path.** Root resolves the share route and records the
  board; the editor reads that record instead of resolving again.

## Considered Options

### Who can manage links

- **A minimal account surface plus owner-only management** (chosen). The
  server endpoints already require an owner session; the product needs a way
  to obtain one.
- Server links managed only by API/CLI. Rejected: row 59 would remain a dead
  dialog, and owners cannot share from the product.
- Any signed-in user can share. Rejected: the server is owner-only; widening
  it is a permissions change, not a client decision.

### Passwords

- **Remove them from the v1 contract** (chosen). The UI never offered them,
  the token bypasses them today, and Miro's captured dialog has no password
  field. The columns stay reserved for a follow-up with a real unlock grant.

  **Amended 2026-10-31 (owner decision):** passwords are now a real control.
  `POST /api/shares/:token/claim` exchanges the password for a stateless
  proof (an HMAC over the share's identity, keyed by its stored password
  hash, so changing the password invalidates every proof); `resolveRole`
  refuses a password-protected share's role without a valid proof, and the
  relay checks the proof on connect and on role re-resolution. The share
  dialog can create password links, and a gate page collects the password
  from visitors.
- Enforce them now with an unlock cookie checked by the public route and the
  WebSocket handshake. Rejected for this phase: it is a second auth flow with
  its own rate limiting, rotation and tests, and nothing in the product can
  create a password link.
- Leave them as they are. Rejected: an advertised security control that the
  token bypasses is worse than no control.

### Joined boards

- **Extend the local board meta with the share record** (chosen). The index is
  already the home's single source; a `share` field tells the home this board
  is a guest entry and gives reopening its credential.
- A second "joined" store. Rejected: it duplicates board metadata and forces
  the home to merge two lists.
- A server-side "shared with me" list. Rejected: capability links have no
  recipient identity; anonymous guests cannot be listed, and a list would turn
  a bearer link into a grant.

### Roles in the client

- **Server enforcement plus a client mode per role** (chosen): viewer and
  commenter run the editor in view mode; the commenter gets a click-capture
  comment layer; the editor is full; only the owner sees link management.
- Client-only hiding. Rejected: the server already disconnects violators, and
  a viewer who does not know why is a bug.
- Defer the commenter role. Rejected: the relay already partitions comments,
  and the host comment tool can anchor comments without editing selection.

### End-to-end encryption

- **Not in this phase; say so** (chosen). No code exists, and adding a key
  lane touches sync, sharing, recovery and the server's role in access. The
  dialog states that the server stores a readable board.
- Claim E2EE from the plan. Rejected: it is not true.

## Decision Outcome

### 1. Routes and redemption

- `/s/:token` is the **app route** and serves the SPA. `/api/shares/:token` is
  the **public JSON route**. The API stops matching `/s/:token`; the client
  resolves through `/api/shares/:token` only.
- The WebSocket stays `/ws?boardId=…&shareToken=…`. The relay's path aliases
  may remain, but they are not part of the contract.
- A `/s/:token` entry **always** resolves the token and uses the resolved
  board id. It never consults the active local board. The current double
  resolution (Root and `App.tsx`) collapses to one: **Root resolves and
  records; the editor reads the record.**
- Redemption has explicit states: resolving; **link not found, revoked or
  expired**; **password-protected link unsupported**; **server unreachable**;
  join (guest name); board. A failure never falls through to the home or to a
  blank editor. Each state offers the honest next action (retry, open home,
  ask the owner for a new link).
- The public JSON returns the **effective** role for the caller: when a
  session cookie is present, `resolveRole` runs user-first (owner/admin/member)
  and falls back to the share. That matches the relay and stops an owner who
  opens their own viewer link from being shown a read-only board.
- The response is `{ boardId, role }`; the legacy `requiresPassword` flag is
  replaced by the unsupported-link error described in §4.

### 2. Identity: a minimal account surface

- The web shell gains an **account surface** built on the existing endpoints:
  `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/logout`,
  `GET /api/auth/me`. Fields are **username and password**; registration is
  open when the server allows it; the first account is the owner/admin as the
  server already decides.
- `AccountDialog` lives in `@firo/ui`; the host opens it from the board home
  header and from the share dialog's signed-out state. When signed in, the
  header shows the username and a sign-out action.
- A session bootstrap on load calls `/api/auth/me`. `401` means signed out;
  a network failure or a missing endpoint means **no server**: the account
  controls are hidden and the share dialog explains that sharing needs a
  self-hosted server. The board stays local-first.
- **Same-origin is the supported shape.** The app is served by the server, so
  the HttpOnly session cookie reaches both `/api/*` and the WebSocket upgrade.
  A cross-origin `VITE_FIRO_WS_URL` remains useful for development but is
  guest/local-only; authenticated sharing is not promised there.
- The session cookie is the server's existing one. When the server is
  configured for HTTPS, the cookie is `Secure`; local HTTP keeps the flag off.
  This is a config-derived flag, not a second cookie.
- Signing in or out **re-establishes the collaborator provider** so the
  session (or its loss) applies immediately. Signing in on an open board is
  also what registers that board on the server as the owner's, which is the
  precondition for creating links.
- Display identity: a signed-in user's username feeds awareness. A share-link
  guest gets a **join step** with a display name (default "Guest", stored in
  `sessionStorage` for that board); it feeds awareness only and creates no
  account.
- No email invitations, no team/member management UI, no password reset UI
  (admin action per Phase 9), no profile editing.

### 3. The share dialog

`ShareModal` becomes real, owner-only, and server-backed.

- **Read:** on open, `GET /api/boards/:id/shares` with the session cookie.
  States: signed out (offer sign-in), forbidden (only the owner can manage
  links), server unavailable, empty list, list.
- **Create:** role `viewer | commenter | editor` and an expiry of **Never**
  (default), **7 days** or **30 days**. The server mints the token; the client
  builds `${origin}/s/${token}`. No local token generation remains.
- **Revoke:** per-link revoke with confirmation. The row disappears; the
  server keeps the audit row.
- **List:** role, creation date, expiry/state, copy and revoke. Expired links
  are labelled; revoked links are not listed. The list is the only
  "anyone with the link" surface — each link is its own capability, so there is
  no single access selector.
- **Shape:** width 600 (measured), height content-driven up to the viewport;
  the observed 433 is the reference's empty state, not a fixed height. One
  panel, no tabs. The Invite, Embed, Publish and AI tabs are omitted with their
  rows; the dialog says the server stores a readable board (§7).
- The dialog is available from the existing Share button. Non-owners get the
  explanation, not a dead form. Copy uses the clipboard with a visible
  confirmation; revoke and create surface server errors verbatim.

### 4. Passwords: removed from the v1 contract

- `POST /api/boards/:id/shares` rejects a `password` field with `400`
  ("Password-protected links are not supported").
- A legacy row with a `password_hash` is **inert**: `resolveRole` returns
  `null`, the public JSON returns `403` with
  `code: "PASSWORD_UNSUPPORTED"`, and the WebSocket refuses the handshake. The
  token alone must never grant access.
- Owners may revoke such a row and recreate a normal link; the dialog shows
  that action.
- The `password_hash` and `salt` columns stay (nullable) with no migration,
  reserved for a future ADR that adds an unlock grant checked by both the JSON
  route and the WebSocket handshake. That ADR must land before the columns are
  used again.
- Phase 9's §9.7 claim of optional password protection is corrected here; the
  matching paragraph in [`TRD-08`](../trd/08-server-and-auth.md) is updated to
  point at this ADR when it is accepted.

### 5. Roles and the client modes

The role is resolved server-side and enforced on every update. The client
mirrors it so people are not disconnected for a click they could not know was
forbidden.

| Role | Editor mode | Comments | Share dialog |
| --- | --- | --- | --- |
| owner | full | yes | yes |
| editor | full | yes | no (explanation) |
| commenter | `viewModeEnabled`; no selection, move or edit | yes, through the comment tool | no |
| viewer | `viewModeEnabled` | no | no |

- **Commenter mode** keeps the host comment tool active while the editor is in
  view mode. A transparent host layer captures the click, converts it to scene
  coordinates, hit-tests the scene for an anchor, and opens the existing
  composer. The server already accepts commenter updates only on the comments
  root, so this mode matches the enforcement exactly.
- Viewer and commenter modes hide the editing rail, creation menus, inspector
  and selection toolbar; they keep pan, zoom, presentation, export of the
  local copy, and the collaborator bar. The board menu is read-only.
- The role comes from the share record. A signed-in owner of a normal board is
  full. Board-member roles are not surfaced by any UI yet; the relay still
  enforces them if they are created server-side.
- The client mode is **not** the security boundary. The relay's per-frame check
  remains the rule, and its existing tests are the proof.

### 6. Joined boards and the home

- `BoardMeta` gains an optional `share` record:
  `{ token, role, joinedAt }`. Root writes it when a share route resolves
  successfully; the board payload is keyed by the resolved board id, as it is
  today.
- Opening a joined board from the home **reconnects with the stored token**;
  the editor's collaborator provider reads the active board's `share` record,
  not only the URL.
- The home gains a **Shared with me** section, rendered only when at least one
  board has a `share` record. Cards show the local name ("Shared Board" until
  board-name sync exists, which is out of scope), the role and the last-opened
  time. Opening is a normal board open; the section is a convenience, not an
  ACL.
- **Remove from this device** clears the `share` record and deletes the local
  board payload. The server copy is untouched; re-opening the link restores it.
- A failed re-open (404/410/403, or a relay `4403`) marks the card **Link
  unavailable** with the reason and offers remove; the entry is not silently
  deleted and never opens an empty editable board.
- No server "shared with me" list is created (see the option rejected above).
  This is the adaptation of row 54.

### 7. Board registration, roles and the rest of the contract

- A board is shareable only after its owner has opened it while signed in and
  connected; the relay creates the server row then. The dialog's create path
  explains the precondition when the board is not registered (the preflight
  `GET …/shares` returns forbidden).
- **No end-to-end encryption this phase.** Share links are bearer
  capabilities; the server stores readable Yjs updates and can read the board.
  The dialog states this in one line, and the docs stop implying otherwise.
  The encrypted-file format is unrelated.
- Share roles never include `owner`: creation accepts only
  `viewer | commenter | editor`, and any legacy `owner` share resolves as
  `editor` defensively.
- Expiry must be in the future at creation; the list shows the date; expired
  rows are inert and revocable.
- Row 51 (spaces) needs no code: folders and starred are the Firo shape; the
  naming divergence is recorded and stays.
- Rows 55–56 (templates) are **ADR-0038's** content contract: storage, the
  gallery's categories/search/previews, and the object-lane save action. This
  ADR does not decide them.

### 8. What this does not decide

- Email invitations, team membership UI, ownership transfer, and per-board
  member management.
- Password-protected links (follow-up ADR with an unlock grant).
- End-to-end encryption, key rotation, or a key-bearing URL fragment.
- Public embed and publish (rows 60–61), the AI tab, and share analytics.
- Board-name sync, so a joined board's title remains local.
- Template storage and previews (ADR-0038).

## Consequences

- The web shell gains `AccountDialog`, a session bootstrap, and an account
  entry in the home header; `share` joins `BoardMeta`; the home gains a
  section; `ShareModal` is rewritten to the server contract; `Root` and the
  collaborator provider share one resolution record.
- The server loses the password parameter and the `/s/` JSON match; gains
  effective-role resolution, owner-share rejection and expiry validation, and
  inert handling for legacy password rows. No schema migration.
- Viewer and commenter modes become first-class host states, with UI hiding and
  the comment click-capture layer.
- The share flow now depends on same-origin deployment for authenticated
  sharing; this is documented, not discovered.
- Phase 9's password and E2EE claims are corrected. The capability model is
  stated plainly in the dialog: a bearer link, revocable, readable by the
  server, with no recipient inbox.
- The C9 checklist item needs both this ADR and ADR-0038 (templates) before it
  is ticked.

## Confirmation

- **Routes.** `/s/:token` returns the SPA; `/api/shares/:token` returns JSON;
  the client resolves through the JSON route. A bad token shows the error
  state, not the home or a blank editor. A share route with a different active
  local board resolves the shared board, never the active one.
- **Identity.** Register, sign in, sign out and session bootstrap work against
  the real endpoints; the share endpoints return 401 signed out and 403 for a
  non-owner; signing in on a board registers it and reconnects the provider;
  signing out reconnects as a guest. With no server, the account UI is hidden
  and the dialog explains the requirement.
- **Dialog.** Create (three roles; expiry never/7/30), list with state, copy
  and revoke all hit the server; no locally minted token exists; errors are
  visible; the confirmation flow for revoke works; the dialog is 600 wide at
  1200 × 818.
- **Passwords.** Creating with a password returns 400. A seeded legacy
  password row returns 403 `PASSWORD_UNSUPPORTED` from the public route and
  refuses the WebSocket; the token alone does not connect.
- **Roles.** A viewer cannot edit (UI and relay); a commenter can add a
  comment and cannot move an element (UI and relay); an editor can edit and
  cannot manage links; an owner can do both. A demoted or revoked session is
  disconnected within one update (existing test).
- **Joined boards.** A successful share entry writes the record; the home
  section lists it; reopening from the home reconnects with the token; remove
  deletes the record and payload; a revoked link shows "Link unavailable" and
  cannot open a blank board.
- **Corrections.** No E2EE is claimed anywhere in the share UI or docs; TRD-08
  points at this ADR; no `owner` share can be created; expiry is validated.
- **Suites.** `yarn test:typecheck`, `yarn test`, `yarn test:code`,
  `yarn test:other`; plus the existing AC-12 relay suite unchanged.

## Pros and Cons of the Options

**Minimal account surface now**

- (+) Makes owner-only link management reachable and gives presence a name.
- (+) Reuses the Phase 9 endpoints and cookie; no new identity model.
- (−) A visible surface that Miro parity does not cover.
- (−) Same-origin deployment becomes the supported sharing shape.

**Remove passwords; leave the columns**

- (+) Closes the bypass with a small, testable change.
- (+) Matches the observed dialog, which has no password field.
- (−) Corrects a claim the phase plan marked complete.
- (−) Password-protected links wait for a dedicated unlock design.

**Joined boards on the existing index**

- (+) Reuses the home's single index and its folders/search.
- (+) Reopening keeps the capability without a recipient account.
- (−) The index now has both owned and guest entries; a `share` flag must be
  respected everywhere it is read.

**No E2EE claim**

- (+) Honest; the server's role is clear.
- (−) Content is readable by the server until a later key lane exists.

## More Information

- Evidence: [`miro-interactions.md`](../research/miro-interactions.md) §Share;
  [`miro-geometry.md`](../research/miro-geometry.md) (dialog metrics);
  [`miro-parity-matrix.md`](../research/miro-parity-matrix.md) rows 51, 54,
  55, 56, 59.
- Current code: `apps/server/src/http/routes.ts` (shares, auth),
  `apps/server/src/db/storage.ts` (`resolveRole`, shares),
  `apps/server/src/ws/relay.ts` and `room.ts` (registration, per-update
  enforcement, commenter partition), `apps/web/Root.tsx` (share route),
  `apps/web/App.tsx` (share boot, role discarded),
  `apps/web/board/collabProvider.ts` (token resolution and WS URL),
  `apps/web/components/ShareModal.tsx` (unwired, local tokens),
  `apps/web/board/library.ts` (`BoardMeta`), `packages/ui/src/components/`
  (`BoardHome`, chrome).
- Related ADRs: [`ADR-0002`](0002-yjs-as-concurrency-engine.md) (sync),
  [`ADR-0008`](0008-local-accounts-on-self-hosted-server.md) (accounts),
  [`ADR-0027`](0027-comments-are-their-own-lane.md) (the comments partition),
  [`ADR-0035`](0035-the-right-dock-and-its-panels.md) (the home's dock is not
  involved), [`ADR-0036`](0036-media-scope-emoji-and-embed-frames.md)
  (`no-referrer` frames).
- Recon: Miro Business build `1.104717.0`, 19 October 2026, 1200 × 818 CSS.
  The share dialog was captured; nothing was exercised. Raw captures stay out
  of the repository.
