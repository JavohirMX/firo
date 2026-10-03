# Font lab — 12 px legibility

Measures candidate faces against the control at the size ADR-0013 requirement 3
names, on real rendered output, which is what requirement 4 requires and what
ADR-0013's candidate list was never measured against.

## Run it

```sh
node scripts/font-lab/run.mjs              # windowed, dpr 2, all faces
node scripts/font-lab/run.mjs --only=kalam,nunito
node scripts/font-lab/run.mjs --dpr 1      # the non-Retina case, deliberately
node scripts/font-lab/run.mjs --headless   # wrong on macOS; see below
```

Screenshots and `report.json` land in `out/`.

## Why windowed, and why `dpr 2` is not a default to be trusted

Headless Chromium on macOS rasterises in software, which changes glyph rendering
— the failure ADR-0017 already caught once at the frame-budget level. The report
prints the renderer next to the numbers, and a software run prints a warning, so
a headless run cannot be filed as a hardware one.

`deviceScaleFactor` defaults to 2 because that is what a Retina user gets. This
is stated rather than inherited: Playwright's own default is 1, and the first run
of this lab used it, which rendered 12 px text into half the pixels a real user
gets and made every face fail for the same reason. `--dpr 1` reproduces the
non-Retina case on purpose — it is a real case, and a harsher one.

## What the numbers mean

| Metric | Reads as |
| --- | --- |
| `inkRetained` | share of the face's own ink still present at 12 px; 1.00 = all of it |
| `fidelity` | match to the same face at 16×; 1.00 = same letterforms |
| `hairline` | share of ink too thin to hold; 1 = all hairlines |
| `contrast` | delivered contrast as a fraction of palette contrast |

Each is normalised against a reference rendering of the same string in the same
face at 16×, box-downsampled. The absolute amount of ink a face puts down is a
design property, not a legibility one — a script face legitimately has less of
it — so what is measured is how much of the face survives being drawn small.

`hairline` is computed from run lengths, not a distance transform. Distance to
the nearest edge is small at the edge of *every* stroke, so it scores the
boundary of a 12 px square as hairlines; see the comment on `runLengths`.

## How it renders

Text goes through `ctx.font = "12px <face>"` + `fillText` under
`ctx.scale(dpr * zoom)` — the same path `packages/element/src/renderElement.ts`
uses. Zoom does not scale a bitmap here: at 50% the rasteriser is asked for 6
effective device px per em, which is why the 50% case is the one that
discriminates.

Roughness is not applied. It jitters shape outlines; a text element is filled
rather than stroked, so it never reaches the glyph.

## Where the boundaries are

- Run lengths are exact for axis-aligned strokes and underestimate diagonals.
- Where two strokes meet at a right angle, both runs are long and the corner
  counts as thick even if the strokes are not — about 7% of the metric on a 1 px
  ring.

Both under-report hairline share. They are noted in `metrics.ts` rather than
corrected, because correcting them needs skeletonisation.

## Licensing

The binaries in `fonts/` are measurement inputs, not product fonts: none is
registered in `FONT_METADATA`, none is selectable, nothing in `packages/`
imports them. Every one is OFL 1.1 with its licence text committed beside it,
which is what `AGENTS.md` requires and what `metrics.test.ts` asserts. Verified
sources are recorded in
[`docs/research/font-licence-verification.md`](../../docs/research/font-licence-verification.md).

Licence clearance is not legibility clearance. OFL says nothing about whether a
face is readable at 12 px — which is the entire reason ADR-0013 requirement 3
exists.