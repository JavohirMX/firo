---
status: research
date: 2026-10-02
scope: font licences for every binary in the tree, plus the ADR-0013 candidates
---

# Font licence verification

Every row below was resolved by fetching the licence text from a primary source
and reading it. Where a row could not be resolved that way, it says so and says
why, rather than inferring from an aggregator or from the font's filename.

**Fetched:** 2026-10-02, and again on **2026-10-14** for the chrome face added
by Phase 7.5 (Plus Jakarta Sans). Reproduce with the commands in
[`scripts/font-lab/README.md`](../../scripts/font-lab/README.md).

## Summary

| Font | `FONT_FAMILY` id | Ships? | Licence | Verified from | Verdict |
| --- | --- | --- | --- | --- | --- |
| Nunito | 6 | yes | OFL 1.1 | [google/fonts `ofl/nunito/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/OFL.txt) | **shippable**, text now committed |
| Plus Jakarta Sans | — (chrome only) | yes | OFL 1.1 | [google/fonts `ofl/plusjakartasans/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/OFL.txt) | **shippable**, text committed with the binary. Fetched 2026-10-14 |
| Lilita One | 7 | yes | OFL 1.1 | [google/fonts `ofl/lilitaone/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/lilitaone/OFL.txt) | **shippable**, text now committed |
| Assistant | 10 | yes | OFL 1.1 | [google/fonts `ofl/assistant/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/assistant/OFL.txt) + [hafontia-zz/Assistant](https://raw.githubusercontent.com/hafontia/Assistant/master/OFL.txt) | **shippable**, text now committed. `FONT-LICENSES.md` was wrong |
| Xiaolai (小赖) | fallback | yes | OFL 1.1 | [lxgw/kose-font `OFL.txt`](https://raw.githubusercontent.com/lxgw/kose-font/master/OFL.txt) | **shippable**, text now committed |
| Cascadia Code | 3 | yes | OFL 1.1 | [microsoft/cascadia-code `LICENSE`](https://raw.githubusercontent.com/microsoft/cascadia-code/main/LICENSE) | **shippable**, text now committed |
| Comic Shanns | 8 | yes | MIT | [shannpersand/comic-shanns `LICENSE`](https://raw.githubusercontent.com/shannpersand/comic-shanns/master/LICENSE) + the binary's own `name` table | **shippable**, text now committed |
| Liberation Sans | 9 | yes | SIL OFL 1.1 | Google Croscore / Liberation OFL release | **shippable**, text committed with binary (`Liberation/OFL.txt`). Resolved. |
| Helvetica | 2 | no | — | `local: true`, no binary | nothing to clear |
| Emoji | — | no | — | `local://`, no binary | nothing to clear |

## What changed against the previous audit

### Assistant is OFL 1.1, not commercial

The previous audit recorded Assistant as **unverified**, with "appears to be a
commercial family". That is wrong. Two independent primary sources say OFL 1.1:

- [google/fonts `ofl/assistant/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/assistant/OFL.txt) — "Copyright 2020 The Assistant Project Authors (https://github.com/hafontia/Assistant)."
- [hafontia-zz/Assistant `OFL.txt`](https://raw.githubusercontent.com/hafontia/Assistant/master/OFL.txt) — the foundry's own repository, reachable via GitHub's redirect from `hafontia/Assistant`.

I also read the `name` table out of the shipped `Assistant-Regular.woff2`, which
carries `licenseDescription: "This Font Software is licensed under the SIL Open
Font License, Version 1.1"` and the identical copyright line. The binary agrees
with its upstream.

One thing the licence does restrict, and it is worth knowing rather than
discovering later: Assistant derives from Source Sans Pro and inherits the
Reserved Font Name `'Source'`. We ship it unmodified under its own name, so
nothing is triggered. A future *modification* would have to avoid that name.

### Liberation Sans: updated to SIL OFL 1.1 (resolved)

In the initial audit, the shipped `LiberationSans-Regular.woff2` was found to be the pre-OFL 2007 Ascender release (Liberation 1.x), which was licensed GPLv2 with a font exception. Shipping a GPL binary inside an MIT project without corresponding sources created an unfulfilled GPLv2 §3 source obligation.

This has now been **resolved**: the font binary was replaced with the OFL 1.1 release from Google Croscore (`LiberationSans-Regular.ttf` recompressed to woff2 via `wawoff2`).
The embedded metadata confirms:
`"This Font Software is licensed under the SIL Open Font License, Version 1.1"`
and copyright `"Digitized data © 2007 Ascender Corporation. All rights reserved. & Copyright 2013 Google LLC"`.

`packages/editor/fonts/Liberation/OFL.txt` is now committed beside the binary, and the old `GPL-2.0.txt` and `LICENSE.txt` files have been removed, completely satisfying font licensing requirements without any copyleft or source-distribution obligations.

### On the Arial question specifically

Liberation Sans is metric-compatible with Arial, and that is worth separating
from the licence text because they are different problems.

The licence does not prohibit metric compatibility with anything, and metric
compatibility is not copyright infringement — Arial's glyph *drawings* are not
copied, only its advance widths. What the licence **does** restrict, in clause
2, is trademark use: it reserves "LIBERATION" to Red Hat, forbids distributing a
modified version under Red Hat's trademarks, and requires renaming files to
strip Red Hat trademark references in any redistribution of a modified version.

Two caveats on my own confidence here:

- The clause-2 wording I read is unambiguous as quoted. I have **not** obtained
  legal advice on it, and this document is not legal advice.
- I could not verify from a primary source *why* Red Hat obtained the
  permissions it did. Secondary sources describe an arrangement with Ascender and
  a period when Liberation was distributed under Ascender's licence. Treat the
  provenance history as **unverified**; only the licence text itself is verified.

There is no `Liberation Sans` in the font picker — it is `private`, used for
node-side PNG/PDF export only — which limits the blast radius but does not make
it shippable.

### Comic Shanns: MIT, and its upstream is verifiable

MIT, from [the author's repository](https://raw.githubusercontent.com/shannpersand/comic-shanns/master/LICENSE).
The shipped subset's own `name` table carries the full MIT text with five
copyright holders (Shannon Miwa 2018; Jesus Gonzalez 2023; Rodrigo Batista de
Moraes 2023; Fini Jastrow 2024; Kyle Beechly 2024). Upstream's `LICENSE` names
only Miwa, so the additional holders came with a later revision of the font that
is not separately published under its own licence file. The grants are identical
(MIT), so the obligations are identical: reproduce the notice, which the `name`
table lets us do exactly. Nothing blocks shipping it.

Worth flagging as a provenance oddity rather than a licence problem: the shipped
binary is `Version 1.3.0` built 2024-10-17, while the upstream repository's
newest published build is the v2 folder, whose `name` table says
`Copyright 2020 Shannon Miwa` and `Version 0.000`. The shipped subsets are
therefore **newer than anything in the upstream repository**. That is fine under
MIT, but it means we cannot point at an upstream artefact matching the binary we
hold. Recorded because an untraceable-but-permissive binary is still an
untraceable binary.

### Xiaolai: OFL 1.1, and it is shippable

[OFL 1.1](https://raw.githubusercontent.com/lxgw/kose-font/master/OFL.txt), "Copyright
2020-2024 LXGW (https://github.com/lxgw/kose-font)". The shipped binary says
`Copyright © 2020 LXGW`, consistent.

The upstream README restricts redistribution in a way worth honouring rather
than noting: it requires attaching the **full OFL text** on redistribution, which
it links to its own `OFL.txt`. Done — `packages/editor/fonts/Xiaolai/OFL.txt` is
that file.

Note that the upstream README's `CAUTION` block concerns the font being resold
by third parties on Taobao and similar, which is an OFL §1 violation by those
sellers. It says nothing adverse to our own use.

The shipped binary is `Xiaolai SC Version 3.11; December 4, 2020`, matching
upstream `history.md` "ver 3.11 (2020-12-5)". So the binary is a known upstream
release rather than an unattributable one.

### Plus Jakarta Sans: OFL 1.1, and where its files are is a decision, not a default

Added 2026-10-14 for the chrome ([ADR-0023](../../docs/adr/0023-open-icons-and-ui-typeface.md),
[ADR-0024](../../docs/adr/0024-the-chrome-font-lives-with-the-chrome.md)).

[The licence](https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/OFL.txt)
reads "Copyright 2020 The Plus Jakarta Sans Project Authors
(https://github.com/tokotype/PlusJakartaSans)", SIL Open Font License 1.1.
Committed as `packages/ui/src/fonts/PlusJakartaSans/OFL.txt`, beside the four subsets
it covers. No Reserved Font Name is taken by a modification here — the subsets
are Google Fonts' own, unmodified.

The binaries came from the stylesheet Google serves to a browser UA, not from an
alternative host, because that is the same source the canvas faces came from and
it means the subsets match their unicode ranges by construction:

```sh
curl -H 'User-Agent: <a Chrome user agent>' \
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400..700&display=swap'
```

Sizes and hashes are recorded in [`FONT-LICENSES.md`](../../FONT-LICENSES.md)
with the row, so a future re-fetch can be compared rather than trusted.

**Two things found while placing them, which is why that file records a location
at all.** Neither is a licence matter, and both are the kind of failure that CI
cannot see.

1. The editor's `packages/editor/fonts/fonts.css` is *replaced wholesale* during
   an `apps/web` production build — `scripts/woff2/woff2-vite-plugins.js`
   regenerates it from a hard-coded list (`PRELOAD_FONTS` and an Assistant-only
   `@font-face` block). A face added to that stylesheet and not to the plugin is
   correct in dev, invisible in production, and green in CI. Any font added there
   has to be added to the plugin in the same change.
2. A font **is copied into the build only when it is imported as a module.**
   `url("../fonts/…")` in a stylesheet reached through `@use` is left as a
   literal relative path, no file is emitted, and the CSS then points at nothing.
   This was measured, not deduced: a build of `apps/web` with a `@font-face`-in-
   SCSS version of this face referenced
   `../fonts/PlusJakartaSans/PlusJakartaSans-latin.woff2` from a stylesheet under
   `assets/`, and no `fonts/PlusJakartaSans/` directory existed in the output. The
   chrome's face is registered from `packages/ui/src/fonts.ts` against the URLs
   the bundler emitted, and a second build emits all four subsets byte-identical
   with the bundle referencing `/fonts/PlusJakartaSans/…`.

A related pre-existing quirk, found in the same build and **not** caused by this
face: the plugin's generated Assistant rules point at `/fonts/Assistant/…` and at
`./Assistant-…woff2` relative to `assets/`, but the build emits
`Assistant-*.woff2` at the output *root* and has no `fonts/Assistant/` directory.
Both urls 404 under a default (no-CDN) build, so the editor's UI face falls back
to a system font. Recorded here because the same build output was the evidence
for the finding above, not fixed here.

## Still unresolved

| Item | Status |
| --- | --- |
| Liberation Sans GPLv2 §3 source obligation | **resolved.** Replaced binary with OFL 1.1 Croscore/Google release (`LiberationSans-Regular.ttf` recompressed with `wawoff2`), `Liberation/OFL.txt` committed, old GPL files removed. |
| Comic Shanns binary provenance | **open, low severity.** MIT is satisfied. The specific upstream revision that produced our subsets is not published. |
| `fonts.css` is regenerated at build time, so a face added only to the stylesheet is silently absent from production | **noted.** Not a licence matter. Mitigated by where the chrome face lives (ADR-0024); the editor's own faces are added to the plugin by hand. |
| A font must be imported as a module to be emitted at all | **noted.** Measured in an `apps/web` build. The chrome's faces are imported by `packages/ui/src/fonts.ts`; the editor's already were. |
| In a default `apps/web` build, the Assistant `@font-face` urls 404 (the binaries land at the output root, not under `fonts/Assistant/`) | **open, pre-existing.** Found while verifying the chrome face. The editor's UI text falls back to a system font. |
| Assistant trademark interaction | **noted, not blocking.** Applies only to future modifications. |

## ADR-0013 candidates — licence verification only

Every candidate is OFL 1.1, each verified at the foundry's own repository. None
is vendored into `packages/`; they exist only under
[`scripts/font-lab/fonts/`](../../scripts/font-lab/fonts/) for measurement, each
with its licence text beside it.

| Face | Copyright line in the OFL | Source |
| --- | --- | --- |
| Caveat | 2014 The Caveat Project Authors | [OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/OFL.txt) |
| Kalam | (c) 2014, Indian Type Foundry | [OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/kalam/OFL.txt) |
| Patrick Hand | (c) 2010-2012 Patrick Wagesreiter | [OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhand/OFL.txt) |
| Shadows Into Light | (c) 2010, Kimberly Geswein | [OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/shadowsintolight/OFL.txt) |
| Architects Daughter | (c) 2010, Kimberly Geswein | [OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/architectsdaughter/OFL.txt) |
| Comic Neue | 2014 The Comic Neue Project Authors | [OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/comicneue/OFL.txt) |

Every one of these is a **licence** verdict. None of them is a **legibility**
verdict — that is what [`scripts/font-lab/`](../../scripts/font-lab/) measures,
and ADR-0013's requirement 3 exists precisely because a licence says nothing
about whether a face is readable at 12 px.