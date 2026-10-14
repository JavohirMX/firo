# Firo

**A free, open-source, local-first whiteboard that is a real Miro replacement.**

Miro is an excellent tool with a business model that prices out small teams: three boards on the free plan, then $8 per person per month for the parts of the product you actually use to run a workshop. Excalidraw is free and genuinely open source, but it is a sketching tool, not a workshop tool — no sticky-note workflow, no facilitation, no structure, no backend.

Firo is the third thing: Miro's object vocabulary, facilitation loop and board layout, on a canvas that is clean by default and sketchable when you want it, stored on your own machine, under the MIT licence, forever.

> **Status: Version 1 & Phase 7.5 complete.** The local-first single-player application is built, tested, and operational. Phases 0 through 7.5 are complete — offline workshop canvas, Miro-style shell and clean aesthetic ([Phase 7.5](docs/plans/phase-7-5-miro-ui.md)), Miro object vocabulary, board home, local-first comments, facilitation tools (voting, timer, presentation, private mode), structured records with switchable projections (Table, Board, Grid), and lossless `.firo` directory format persistence. See [`docs/roadmap.md`](docs/roadmap.md) for what follows (Phases 8 & 9).

---

## What makes it different

|  | Miro | Excalidraw | Firo |
| --- | --- | --- | --- |
| Price | $0–$20/seat/mo | Free | **Free, MIT, forever** |
| Boards on free tier | **3** | Unlimited | Unlimited |
| Facilitating a workshop (vote, timer, reveal) | **Paid** | Not available | Free |
| Export watermark | Yes, on free tier | No | No |
| Data location | Miro's cloud | Your browser | **Your machine, your file** |
| Self-hostable | **Never, at any tier** | Awkward | Yes, one container (v2) |
| Seat minimum | 30 (Enterprise) | — | **None** |
| Works offline | No | Yes | **Yes, 100%** |
| Open source | No | MIT | MIT |

Four ideas do most of the work:

**1. Local-first means local.** Your boards live in IndexedDB on your device and export to a plain, readable `.firo` directory archive you own. The app is fully functional with no account, no network, and no server. Collaboration is an optional addition, never a prerequisite.

**2. One data set, many views.** A task exists once. View it as a table, a board, or a grid with zero reload. This is the single largest architectural bet in the project and the thing that most separates Firo from a pile of disconnected widgets.

**3. Anything can hold anything.** Any object can become a container, and containers nest to any depth. Sticky notes inside a card inside a list inside a frame. Boards stay legible because structure is created by arrangement, not by a fixed taxonomy.

**4. Green information.** Information that stays live on one surface, legible at a glance. We will not build a separate status table that you have to keep in sync — that is the anti-pattern we are building against.

---

## Quickstart & Development

Firo is a Yarn v1 monorepo targeting modern browsers:

```sh
# Install dependencies
yarn install --frozen-lockfile

# Start the web app dev server
yarn start

# Typecheck all packages and apps (TypeScript strict mode)
yarn test:typecheck

# Run test suite
yarn test

# Format and lint
yarn fix
```

Full details: [`docs/roadmap.md`](docs/roadmap.md) · [`docs/trd/`](docs/trd/) · [`docs/adr/`](docs/adr/)

---

## Documentation

Start here, in order:

| Document | What it covers |
| --- | --- |
| [`docs/vision.md`](docs/vision.md) | The problem, the thesis, and what we refuse to build |
| [`docs/competitive.md`](docs/competitive.md) | How we compare to Miro, Excalidraw, Weje, tldraw, AFFiNE |
| [`docs/prd/`](docs/prd/) | Product requirements: personas, scope, feature specifications, acceptance criteria |
| [`docs/trd/`](docs/trd/) | Technical requirements: data model, sync, rendering, text, storage, security |
| [`docs/adr/`](docs/adr/) | Every significant decision, with context, options, and consequences |
| [`docs/architecture/`](docs/architecture/) | How the system actually fits together |
| [`docs/plans/`](docs/plans/) | Phase-by-phase implementation plans |
| [`docs/research/`](docs/research/) | The source research the decisions are based on |
| [`docs/roadmap.md`](docs/roadmap.md) | Phases, milestones, and exit criteria |
| [`AGENTS.md`](AGENTS.md) | Operating rules for AI coding agents in this repository |

---

## Contributing

Firo is a solo project at the moment. Contributions are welcome, but please read [`docs/vision.md`](docs/vision.md) first — the most useful contribution is often "this belongs in the non-goals", not "this is a missing feature".

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to help, and the fork's provenance rules
- [`docs/contributing/`](docs/contributing/) — our working agreements

## Licence and funding

MIT. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) for provenance — including the exact Excalidraw commit this fork started from.

Firo ships font binaries, and their licences are tracked in [`FONT-LICENSES.md`](FONT-LICENSES.md), which is the audit trail — a "believed" row there is treated as worse than an unverified one. Seven of the eight distributed faces are cleared with their licence text committed beside the binary, and `packages/common/tests/fonts.test.ts` fails the build if either half goes missing. One face, **Liberation Sans**, is a genuine **release blocker**: we ship its 2007 GPLv2 binary and GPLv2 §3 wants the corresponding source, which we do not have. See [ADR-0014](docs/adr/0014-font-position-after-phase-0.md).

Firo will never charge for the software. If it becomes useful to you and you want to fund its maintenance, that will be handled through GitHub Sponsors and/or Open Collective. There is no paid tier and there will not be one.
