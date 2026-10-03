---
status: research
date: 2026-10-02
scope: font licences for every binary in the tree, plus the ADR-0013 candidates
---

# Font licence verification

Every row below was resolved by fetching the licence text from a primary source
and reading it. Where a row could not be resolved that way, it says so and says
why, rather than inferring from an aggregator or from the font's filename.

**Fetched:** 2026-10-02. Reproduce with the commands in
[`scripts/font-lab/README.md`](../../scripts/font-lab/README.md).

## Summary

| Font | `FONT_FAMILY` id | Ships? | Licence | Verified from | Verdict |
| --- | --- | --- | --- | --- | --- |
| Nunito | 6 | yes | OFL 1.1 | [google/fonts `ofl/nunito/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/OFL.txt) | **shippable**, text now committed |
| Lilita One | 7 | yes | OFL 1.1 | [google/fonts `ofl/lilitaone/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/lilitaone/OFL.txt) | **shippable**, text now committed |
| Assistant | 10 | yes | OFL 1.1 | [google/fonts `ofl/assistant/OFL.txt`](https://raw.githubusercontent.com/google/fonts/main/ofl/assistant/OFL.txt) + [hafontia-zz/Assistant](https://raw.githubusercontent.com/hafontia/Assistant/master/OFL.txt) | **shippable**, text now committed. `FONT-LICENSES.md` was wrong |
| Xiaolai (小赖) | fallback | yes | OFL 1.1 | [lxgw/kose-font `OFL.txt`](https://raw.githubusercontent.com/lxgw/kose-font/master/OFL.txt) | **shippable**, text now committed |
| Cascadia Code | 3 | yes | OFL 1.1 | [microsoft/cascadia-code `LICENSE`](https://raw.githubusercontent.com/microsoft/cascadia-code/main/LICENSE) | **shippable**, text now committed |
| Comic Shanns | 8 | yes | MIT | [shannpersand/comic-shanns `LICENSE`](https://raw.githubusercontent.com/shannpersand/comic-shanns/master/LICENSE) + the binary's own `name` table | **shippable**, text now committed |
| Liberation Sans | 9 | yes | **GPLv2 + font exception** | [upstream `License.txt`](https://web.archive.org/web/2019/https://pagure.io/liberation-fonts/raw/cf3040c146097d6b7361e2823d5c6b5c309a456a/f/master/License.txt) (retrieved via Wayback; the live pagure URL 404s) | **not shippable as-is** — see below |
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

### Liberation Sans is GPL, and the shipped binary is the pre-OFL version

This is the one real blocker left, and it is a bigger deal than "needs the OFL
text".

The shipped `LiberationSans-Regular.woff2` has `name` records reading
`Version 1.05`, `Digitized data © 2007 Ascender Corporation`, `designer: Steve
Matteson`, and — decisively — `licenseDescription: "Use of this Liberation font
software is subject to the license agreement under which you accepted the
Liberation font software."` with `licenseInfoURL: ascendercorp.com/liberation.html`.
That is the 2007 Ascendorelease, not the 2012 Red Hat release.

Liberation **1.x** is licensed GPLv2 with a font exception. The upstream
`License.txt` says so in its first paragraph: Red Hat "grants to the user a
license to this work pursuant to the GNU General Public License v.2 with the
exceptions set forth below". Liberation **2.x** is the OFL release — that is what
[the current upstream `LICENSE`](https://raw.githubusercontent.com/liberationfonts/liberation-fonts/main/LICENSE)
is, with "Copyright (c) 2012 Red Hat, Inc." and Reserved Font Name `Liberation`.

So the previous audit's "Believed SIL OFL 1.1 (Red Hat)" was wrong about *this
binary*. We are shipping a GPL binary inside an MIT project.

I have committed `LICENSE.txt` (the GPLv2+exception agreement) and `GPL-2.0.txt`
alongside the binary so the terms are at least stated now. That is necessary and
not sufficient: GPLv2 §3 requires conveying the licence **and** the corresponding
source, and we ship neither the `.sfd` sources nor an offer of them.

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

## Still unresolved

| Item | Status |
| --- | --- |
| Liberation Sans GPLv2 §3 source obligation | **open.** Needs the `.sfd` sources committed, a written offer, or replacement with Liberation 2.x. Not a licensing question any more — an obligation question. |
| Comic Shanns binary provenance | **open, low severity.** MIT is satisfied. The specific upstream revision that produced our subsets is not published. |
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