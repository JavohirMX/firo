# Non-functional requirements

Budgets, not aspirations. Each is testable and each has a measurement method, so
that a regression is a failing test rather than an opinion.

---

## NFR-1 — Performance

Tested on the **lowest reasonable bar**: a five-year-old laptop with 8 GB of RAM and
integrated graphics. That is the honest baseline for a self-hosted audience, and
optimising for a developer machine would be optimising for the wrong user.

| Scenario | Budget | Measurement |
| --- | --- | --- |
| Pan / zoom, 10,000 elements | 60 fps sustained | `requestAnimationFrame` deltas |
| Worst frame during a pan | < 33 ms | Frame timing instrumentation |
| Single-element move, 10,000 elements | < 16 ms | `performance.now()` around the mutation |
| Zoom transition | No frame > 100 ms | Frame timing |
| Board open, 5,000 elements | < 2 s to interactive | Navigation Timing |
| Text keystroke in a table cell | < 50 ms | Input-to-paint |
| Save, 10,000 elements + 50 images | < 1 s, no UI freeze | Main-thread block time |
| Cold start (PWA launch) | < 1.5 s to interactive | Lighthouse |
| Idle memory, 10,000 elements | < 500 MB | Browser memory profiler |

**Rules:**

- No main-thread block over 50 ms during interaction. Longer work is chunked or
  moved to a worker.
- The spatial index is updated in the same frame as the mutation that invalidates
  it. A stale index shows as elements vanishing during fast drags, which is the
  single most visible bug class in a canvas application.
- Rendering work is bounded by the viewport, never by document size
  (FR-2). A document-size-dependent render loop will eventually make the app
  unusable for a real user, and it will do so after the performance test passed.

---

## NFR-2 — Reliability and durability

| Guarantee | Requirement |
| --- | --- |
| No silent data loss | Every write path reports failure explicitly |
| Atomic saves | A save interrupted by a crash leaves the previous good state |
| Crash recovery | A corrupt store recovers to the last good snapshot |
| Import is atomic | A failed import writes nothing |
| Forward-version files | Loading a file from a newer version fails **loudly** |
| Backward-version files | Every released version loads in every later version |

The last two are the hardest and the most important. A file format is a promise to
the user that their work will open in ten years. See
[`trd/02-data-model.md`](../trd/02-data-model.md).

---

## NFR-3 — Security and privacy

| Property | Requirement |
| --- | --- |
| Network activity | **Zero** in the single-player path. No telemetry, no analytics, no error reporting, no CDN. Testable in DevTools. |
| Accounts | None exist in the single-player path |
| Data at rest | The user's own filesystem or their own server. We never hold it. |
| E2EE (v2, optional) | Board content encrypted before it leaves the browser. Keys never reach the server. |
| Server auth (v2) | Argon2id or bcrypt password hashing. HttpOnly, Secure, SameSite cookies. Rate-limited auth endpoints. |
| Share links (v2) | Capability-based, cryptographically random, revocable. **Unlike Excalidraw, which has no revocation.** |
| File uploads (v2) | Size and type limits enforced server-side, not only client-side |
| Dependencies | Permissive licences only. No copyleft, no source-available. See [`ADR-0009`](../adr/0009-mit-licence-and-donation-funding.md) for why tldraw is excluded. |
| Content security | Strict CSP. No inline script. No third-party origins. |

**Standing rule:** if a feature requires a network request, it does not belong in
version 1. If a feature requires a third party, it does not belong in the product at
all.

---

## NFR-4 — Accessibility

**Target: WCAG 2.2 AA**, with a published VPAT as a deliverable. This is a
differentiator: Miro renders text to a canvas and bolts an accessibility tree over
the result, and Miro's own accessibility checker reports issues on ordinary boards.

| Area | Requirement |
| --- | --- |
| Keyboard operation | **Every** function reachable by keyboard alone (AC-8) |
| Command palette | Full-function access, `Ctrl/Cmd+K` |
| Focus management | Visible focus indicator on every control; focus never lost or trapped |
| Screen reader | Element type, content, position in group, and available actions announced |
| Live regions | Announcements for save state, errors, and mode changes — polite, not assertive, and not on every keystroke |
| Text contrast | 4.5:1 minimum, in both themes |
| Non-colour encoding | Never encode state in colour alone — Miro's named colours in the picker are a good pattern |
| Reduced motion | A setting that removes animation and transitions. Not just an `prefers-reduced-motion` media query. |
| Zoom | Usable at 200% browser zoom without loss of function |
| Touch targets | 24×24 CSS px minimum |

Full canvas-specific requirements — the accessibility tree, focus order, and how
ProseMirror overlays coexist with a screen reader — are in
[`trd/09-accessibility.md`](../trd/09-accessibility.md).

---

## NFR-5 — Compatibility

| Target | Support |
| --- | --- |
| Browsers | Current and previous major Chrome, Firefox, Safari, Edge. Anything older is not supported. |
| Mobile | Read-only viewer. Not a target for authoring. |
| Tablet | Supported for authoring, including Apple Pencil and Wacom pressure. |
| Server (v2) | Linux, macOS. Single container, x86-64 and arm64. |
| Minimum Node (build) | As upstream Excalidraw requires |
| Offline | Full functionality. A PWA that installs and works with no network. |

---

## NFR-6 — Bundle and load

| Budget | Target |
| --- | --- |
| Initial JS (gzipped) | < 400 KB |
| Initial load to interactive on a cold cache | < 1.5 s on a mid-tier connection |
| Font payload | Zero unless the user opts into a custom font |
| No network dependencies at runtime | Fonts, icon sets, and assets are all local. This is also a licensing requirement — see [`ADR-0013`](../adr/0013-replace-the-virgil-font.md) |

The font budget is a licensing requirement as much as a performance one. Excalidraw
ships Virgil with no licence file; we do not ship it, and we do not substitute
another font from a CDN.

---

## NFR-7 — Maintainability

This is a fork with an explicit policy of not tracking upstream
([`ADR-0001`](../adr/0001-fork-excalidraw-and-refactor-aggressively.md)), so the
cost of our own architecture is ours to pay.

| Property | Requirement |
| --- | --- |
| Test coverage on the renderer | The thinnest area and the riskiest. Target 80% on `@firo/render` and `@firo/interact`. |
| Schema migration tests | One fixture per released format version |
| Invariants | The four rules in [`AGENTS.md`](../../AGENTS.md) are enforced by tests, not by convention |
| Package boundaries | Enforced by the build. A circular import fails CI. |
| Documentation | Any feature without a document in `docs/` is not finished |
| ADRs | Accepted ADRs immutable; changes are new superseding ADRs |

The last invariant is the one most likely to rot: the four architectural rules
(ephemeral state, migrations, ProseMirror text, records-are-not-elements) are each
one refactor away from being violated by someone who did not read the ADR. Each
needs a test that fails when the rule is broken.
