# Bundled font licences

**Status: unresolved. This file records a problem, not a clearance.**

Firo redistributes font binaries. Every one of them needs a licence that permits redistribution, and — for the SIL Open Font Licence family — a copy of the licence text and the copyright notice shipped alongside the font.

Phase 0 removed the two fonts that provably cannot ship (below). It could not clear the rest, because **the repository contains no licence information for any font at all**. There is no `OFL.txt`, no `LICENSE` file, and no copyright notice in any `packages/editor/fonts/*/index.ts`. Upstream Excalidraw did not ship them either, which is why this had to be checked by hand.

## Removed in Phase 0

| Font | Why it cannot ship |
| --- | --- |
| **Virgil** | A commercial font by Four Black Studios. Upstream ships the binaries with no licence file and no grant of any kind. There is nothing to point at. |
| **Excalifont** | A _modified Virgil_. Its own upstream attribution reads "Your Own Font Foundry (Virgil); Ján Filípek / DizajnDesign (Excalifont, modifications)" — a derivative of a font that cannot be redistributed, so it inherits the same problem. It was also the **default** font, so removing it changed `DEFAULT_FONT_FAMILY`. |

Both are handled in [`docs/adr/0013-replace-the-virgil-font.md`](docs/adr/0013-replace-the-virgil-font.md). Their `FONT_FAMILY` enum ids are retained so existing files still load; the text falls back to the default family.

## Still bundled, and why each needs work

| Font | `FONT_FAMILY` id | Used for | Assessment |
| --- | --- | --- | --- |
| Nunito | 6 | **default body text** | Believed SIL OFL 1.1. Needs the OFL text and copyright added. **This is the licence the product depends on most — confirm it first.** |
| Lilita One | 7 | top-picks strip, charts | Believed SIL OFL 1.1. Needs the OFL text and copyright added. |
| Cascadia Code | 3 | top-picks strip, code blocks | Believed SIL OFL 1.1 (Microsoft). Needs the OFL text and copyright added. |
| Liberation Sans | 9 | node-side PNG/PDF export | Believed SIL OFL 1.1 (Red Hat). Marked `private`, so it is not user-selectable. Needs the OFL text and copyright added. |
| **Assistant** | 10 | **UI font only** | **Unverified.** Appears to be a commercial family. Marked `private`, so it is not user-selectable — which limits the blast radius but does not make it shippable. |
| **Comic Shanns** | 8 | user-selectable in the font picker | **Unverified.** Provenance could not be established. As a named, selectable face this is the most exposed of the uncertain fonts. |
| **Xiaolai** (小赖) | fallback | CJK fallback, 209 subset files | **Unverified.** Believed freely redistributable, but not confirmed. |
| Helvetica | 2 | fallback | **Not distributed.** `local: true` — no binary is shipped, it resolves to the operating system's copy. No action needed. |
| Emoji | — | fallback | **Not distributed.** Registered via `LOCAL_FONT_PROTOCOL` (`local://`), so it resolves to the operating system's emoji font. No binary, no action needed. |

"Believed" means _believed_. These are recollections, not verified against the upstream licence texts, and Phase 0 had no network access to fetch them. Treat every "believed" as unproven.

## What has to happen before a release

1. **Fetch the actual licence for each of the seven distributed fonts** from its upstream, and record the URL and the version fetched here.
2. **Ship the licence text with the font** for the four OFL fonts. OFL §3 requires it; distributing the binary without it is non-compliant even when the grant is valid.
3. **Delete Assistant and Comic Shanns** if their terms cannot be established. Assistant is the cheaper deletion (UI-only, `private`). Comic Shanns costs the font picker a named entry.
4. **Confirm Xiaolai**, or replace the CJK fallback with a verified OFL CJK face.
5. Re-run the audit and replace the table above with resolved facts.

## Why this is a release blocker and not a nit

Firo's entire premise is that it is free and MIT ([`docs/adr/0009-mit-licence-and-donation-funding.md`](docs/adr/0009-mit-licence-and-donation-funding.md)). Shipping a commercial font inside an MIT project, with no licence file, is the kind of thing that ends a project rather than merely embarrassing it. The rebrand made the default font Nunito, which makes that font the single most load-bearing licence in the repository.

## Keeping this file honest

When you add a font:

- Record it here with the licence you actually read, and where you read it.
- Add the licence text to the font's directory in the same commit.
- `AGENTS.md` forbids shipping an unlicensed font file. This table is the audit trail for that rule; a new row with "unverified" is a blocker, not a to-do.
