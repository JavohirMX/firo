# Bundled font licences

**Status: complete. All eight distributed fonts are cleared under SIL OFL 1.1 or MIT, and the licence text now ships with each of them. No blockers left.**

Two font roots are scanned, because two packages ship fonts: `packages/editor/fonts/` (the canvas faces and the editor's UI face) and `packages/ui/src/fonts/` (the chrome face). `packages/common/tests/fonts.test.ts` walks both.

This file is the audit trail for the `AGENTS.md` rule that no font file may be shipped whose licence we cannot state. Every "verified" below was read from a primary source — the font's own upstream repository — on **2026-10-02**, not recalled. Full working, including what each licence actually says and what could not be verified, is in [`docs/research/font-licence-verification.md`](docs/research/font-licence-verification.md).

Firo redistributes font binaries. Every one needs a licence permitting redistribution, **and** — for OFL and MIT alike — a copy of that licence shipped alongside the binary. Those are two obligations. The second was entirely unenforced until this audit and is now enforced by `packages/common/tests/fonts.test.ts`.

## Removed in Phase 0

| Font | Why it cannot ship |
| --- | --- |
| **Virgil** | A commercial font by Four Black Studios. Upstream ships the binaries with no licence file and no grant of any kind. There is nothing to point at. |
| **Excalifont** | A _modified Virgil_. Its own upstream attribution reads "Your Own Font Foundry (Virgil); Ján Filípek / DizajnDesign (Excalifont, modifications)" — a derivative of a font that cannot be redistributed, so it inherits the same problem. It was also the **default** font, so removing it changed `DEFAULT_FONT_FAMILY`. |

Both are handled in [`docs/adr/0013-replace-the-virgil-font.md`](docs/adr/0013-replace-the-virgil-font.md). Their `FONT_FAMILY` enum ids are retained so existing files still load; the text falls back to the default family.

## Distributed fonts

| Font | `FONT_FAMILY` id | Licence | Verified | Source fetched | Ship |
| --- | --- | --- | --- | --- | --- |
| **Nunito** | 6 | SIL OFL 1.1 | **yes** | [`google/fonts/ofl/nunito/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/OFL.txt) | **yes** — `Nunito/OFL.txt` committed. Default body text; the most load-bearing licence here. |
| **Plus Jakarta Sans** | — (**chrome only**; no `FONT_FAMILY` id) | SIL OFL 1.1 | **yes** | [`google/fonts/ofl/plusjakartasans/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/OFL.txt) | **yes** — `packages/ui/src/fonts/PlusJakartaSans/OFL.txt` committed, four woff2 subsets beside it. The chrome typeface ([ADR-0023](docs/adr/0023-open-icons-and-ui-typeface.md)); not selectable on the canvas. |
| Lilita One | 7 | SIL OFL 1.1 | **yes** | [`google/fonts/ofl/lilitaone/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/lilitaone/OFL.txt) | **yes** — `Lilita/OFL.txt` committed. RFN `Lilita One`; we ship unmodified. |
| Assistant | 10 | SIL OFL 1.1 | **yes** | [`google/fonts/ofl/assistant/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/assistant/OFL.txt) + [`hafontia-zz/Assistant`](https://raw.githubusercontent.com/hafontia/Assistant/master/OFL.txt) | **yes** — `Assistant/OFL.txt` committed. **The previous entry in this table was wrong**; see below. |
| Xiaolai (小赖) | fallback | SIL OFL 1.1 | **yes** | [`lxgw/kose-font/OFL.txt`](https://raw.githubusercontent.com/lxgw/kose-font/master/OFL.txt) | **yes** — `Xiaolai/OFL.txt` committed. Upstream requires the full OFL text on redistribution; it is there. |
| Cascadia Code | 3 | SIL OFL 1.1 | **yes** | [`microsoft/cascadia-code/LICENSE`](https://raw.githubusercontent.com/microsoft/cascadia-code/main/LICENSE) | **yes** — `Cascadia/LICENSE.txt` committed. RFN `Cascadia Code`; unmodified. |
| Comic Shanns | 8 | MIT | **yes** | [`shannpersand/comic-shanns/LICENSE`](https://raw.githubusercontent.com/shannpersand/comic-shanns/master/LICENSE) + the binary's own `name` table | **yes** — `ComicShanns/LICENSE.txt` committed. Provenance oddity, not a licence problem; see the research doc. |
| **Liberation Sans** | 9 | SIL OFL 1.1 | **yes** | Google Croscore / Liberation OFL release | **yes** — `Liberation/OFL.txt` committed. Resolved release blocker; see below. |
| Helvetica | 2 | — | n/a | `local: true` | Not distributed — resolves to the OS copy. No binary, nothing to clear. |
| Emoji | — | — | n/a | `local://` via `LOCAL_FONT_PROTOCOL` | Not distributed — resolves to the OS emoji font. No binary, nothing to clear. |

### Plus Jakarta Sans is a chrome face, and lives with the chrome

Verified 2026-10-14, from [google/fonts `ofl/plusjakartasans/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/OFL.txt): "Copyright 2020 The Plus Jakarta Sans Project Authors (https://github.com/tokotype/PlusJakartaSans)", SIL Open Font License 1.1. The text is committed beside the binaries.

The four `.woff2` files are Google Fonts' own subsets, fetched from the stylesheet Google serves to a browser UA (`https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400..700`), which is what the editor's faces are upstream too. SHA-256 at the time of the fetch:

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `PlusJakartaSans-cyrillic-ext.woff2` | 1716 | `a16f29d7d2a21a4f9b3249a82eb2725ed5bdb91500dfb5c4758977de27477f20` |
| `PlusJakartaSans-vietnamese.woff2` | 8292 | `5c913fc1b1f86f4b475e5df45a796aa480d1f7f0891ed6f1a5991d6d1be887c3` |
| `PlusJakartaSans-latin-ext.woff2` | 21688 | `0303e02b53b0298fb26a0193941a2e8754f0f9a9fce50d90b178d8da3424873f` |
| `PlusJakartaSans-latin.woff2` | 27272 | `cd8db90cd950e26bc8761f65d323588bd5cd112d326d6d322bc7c8ea86771215` |

Two things about this row are deliberate rather than unfinished:

- **No `FONT_FAMILY` id, and not in `FONT_METADATA`.** That table is the _canvas_ font registry: it supplies per-face vertical metrics for text laid out on the canvas, and every entry is selectable in the picker. Chrome text is neither. ADR-0023 item 4 keeps the canvas default on Nunito.
- **It lives under `packages/ui/`, not `packages/editor/fonts/`.** The editor's `fonts.css` is replaced wholesale in an `apps/web` production build by `scripts/woff2/woff2-vite-plugins.js`, which emits only the faces on screen before the scene mounts. A chrome face declared there and not in that plugin would build, test clean, and vanish from production. `@firo/ui` therefore ships its own binary and registers the faces from `packages/ui/src/fonts.ts`, against the URLs the bundler emits — Vite copies a font only when it is imported as a module, so a `url()` in a stylesheet is not enough either ([ADR-0024](docs/adr/0024-the-chrome-font-lives-with-the-chrome.md)).

## Resolved blocker: Liberation Sans is SIL OFL 1.1

Previously, this was a release blocker because the binary we shipped was the pre-OFL 2007 Ascender release (Liberation 1.x), which was GPLv2 with a font exception. Shipping a GPL binary inside an MIT project without corresponding sources created an unfulfilled GPLv2 §3 source obligation.

This is now **resolved**: the binary was updated to the OFL 1.1 Croscore/Google release (`LiberationSans-Regular.ttf` recompressed with `wawoff2`), resolving the GPLv2 §3 source obligation and unblocking the MIT release. The embedded font metadata explicitly includes: `"This Font Software is licensed under the SIL Open Font License, Version 1.1"` and copyright `"Digitized data © 2007 Ascender Corporation. All rights reserved. & Copyright 2013 Google LLC"`.

`packages/editor/fonts/Liberation/OFL.txt` is committed beside the binary, and the old GPL files (`GPL-2.0.txt`, `LICENSE.txt`) have been removed.

**On the Arial question specifically.** Liberation Sans is metric-compatible with Arial, and that is a different problem from the licence. The licence does not prohibit metric compatibility with anything, and metric compatibility is not copyright infringement — Arial's glyph _drawings_ are not copied, only its advance widths. What the licence does restrict, in clause 2, is trademark: it reserves `LIBERATION` to Red Hat, forbids distributing a modified version under Red Hat's trademarks, and requires renaming files to strip Red Hat trademark references when redistributing a modified version. We are not modifying it.

I have **not** obtained legal advice on this, and this file is not legal advice. I also could not verify from a primary source _why_ Red Hat held the permissions it did; secondary sources describe an arrangement with Ascender and a period of distribution under Ascender's licence. That provenance history is **unverified** — only the licence text itself is verified.

## Corrections to the previous audit

- **Assistant was recorded as commercial. It is not.** It is OFL 1.1, per google/fonts _and_ the foundry's own repository, and the shipped binary's own `name` table carries the same `licenseDescription`. One caveat to carry forward: Assistant derives from Source Sans Pro and inherits the Reserved Font Name `'Source'`, so a future _modification_ would have to avoid that name.
- **Liberation Sans was originally recorded as OFL 1.1, then audited as GPLv2, and is now updated to the OFL 1.1 Croscore release.**
- Four faces were "believed" with no source. All four are now fetched, and all four turned out to be shippable — the beliefs happened to be right about the grants and wrong about one artefact's licence family.

## What has to happen before a release

1. **Resolve Liberation Sans** — **RESOLVED** (updated to SIL OFL 1.1 Croscore/Google binary, `Liberation/OFL.txt` committed, GPL files removed). Nothing else on this list blocks a release.
2. **Re-run the audit** when any bundled font changes, and keep the URLs in the table current. A licence can be relicensed upstream; Liberation did exactly that between 1.x and 2.x.
3. **Re-run the measurement** if the font choice changes — [`scripts/font-lab/`](scripts/font-lab/) exists for ADR-0013 requirement 3 and is the reason the pick has to wait for evidence rather than taste.

## Why this is a release blocker and not a nit

Firo's premise is that it is free and MIT ([`docs/adr/0009-mit-licence-and-donation-funding.md`](docs/adr/0009-mit-licence-and-donation-funding.md)). Shipping a GPL font inside an MIT project with no sources is the kind of thing that ends a project rather than merely embarrassing it. The rebrand made Nunito the default, which is why that licence is the single most load-bearing one in the repository — and it is verified.

## Keeping this file honest

When you add a font:

- Record it here with the licence you actually read, and the URL you read it at.
- Add the licence text to the font's directory **in the same commit**.
- `AGENTS.md` forbids shipping an unlicensed font file, and `packages/common/tests/fonts.test.ts` fails if either half is missing.

A row saying "unverified" is a blocker, not a to-do. A row saying "believed" is worse — it is an unverified claim wearing a conclusion's clothes, which is how the Liberation Sans entry went wrong in the first place.
