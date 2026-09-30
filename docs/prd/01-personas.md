# Personas

## Persona 1 — Priya, the workshop facilitator (primary)

**Role.** Runs 2–6 hour sessions for a product or engineering team: retrospectives,
brainstorms, design sprints, planning. Not a designer, not an engineer.

**Team.** 5–30 people. Currently on a free Miro plan that ran out, or on a paid plan
she funds personally and resents.

**What she does today.** Opens Miro, pastes a retro template, drags stickies for two
hours, uses the timer and dot voting, frames the outcome, exports a PNG, and then
loses the board because it lived on someone else's cloud.

**Needs.**

1. Run a full session without creating an account for anyone.
2. Unlimited stickies and boards. Miro's free tier gives her three.
3. Voting, a timer, and private mode. All three are paid on Miro.
4. Frame the outcome so it exports as a legible document.
5. Walk away with a file she owns, not a link that expires.
6. Export without a watermark.

**Pain we remove.** The three-board wall, the $8/seat wall, the watermark, and the
dependence on a vendor that can change prices or disappear.

**Success for her.** She runs a retrospective on a laptop with no internet and a
facilitator who has never used the tool. Everyone contributes. The board exports to
a file on her Desktop. Nobody was asked to sign up.

**What she does not care about.** Vector fidelity, animations, integration
ecosystems, compliance. She cares that the tool is fast, obvious, and free.

---

## Persona 2 — Dan, the self-hosting engineer

**Role.** Runs infrastructure for a 40-person company. Deploys things with Docker.
Cares about data residency and licence risk.

**Needs.**

1. A board he can host on hardware he controls, in an air-gapped environment if
   necessary.
2. Boards on disk as files he can back up, diff, and put in git.
3. No per-seat cost that scales with his headcount.
4. An MIT licence he can point at without a legal review.
5. An import path off Miro and off Excalidraw without losing the work.

**Pain we remove.** The impossibility of self-hosting Miro, and the licence risk of
tools like tldraw and AFFiNE.

**Success for him.** `docker compose up` on his own box. His team's boards are in a
volume he snapshots. He can read a board file in a text editor. He can point at
`LICENSE` and it is MIT.

**What he does not care about.** Beautiful onboarding. He will read the docs.

---

## Persona 3 — Mira, the engineer who thinks in diagrams

**Role.** Software engineer. Uses Excalidraw today for architecture sketches and
personal notes. Keeps them in a folder. Occasionally needs a second person in the
document.

**Needs.**

1. The Excalidraw feel and speed. Non-negotiable.
2. Files on disk. His notes are text files in git, and they stay that way.
3. Works with the network off.
4. No account, ever.
5. Enough structure to hold a design doc, not just a sketch.

**Pain we remove.** That Excalidraw has no backend, one page per file, and no
notion of a project.

**Success for him.** He opens his notes folder, sees `.firo` files he can read and
`git diff`, and can put a second engineer in the same document when he needs to.

**What he does not care about.** Facilitation features. He will never run a
workshop.

---

## Persona 4 — Sam, the educator (secondary, informs scope discipline)

**Role.** Teacher. Runs group work with students. Needs boards to be simple enough
that a student who has never seen the tool can contribute in thirty seconds.

**Needs.**

1. Very low object density. A board with forty things on it is useless to a
   fourteen-year-old.
2. Free, with no account for students. Consent forms and school IT departments
   make signups a blocker.
3. Works on a shared classroom laptop.
4. Simple structure: cards, lists, connections.

**Pain we remove.** Every tool that would work for this is either expensive or
requires accounts.

**Success for her.** A class of thirty uses Firo on a shared machine and the board
is legible at a glance.

**Why we care despite being secondary.** Sam is the reason
[`ADR-0007`](../adr/0007-arbitrary-container-nesting.md) matters and the reason
"green information" is a constraint. It also tells us what *not* to build: no
complexity that a first-time user cannot skip past. This persona is the test for
every UI decision.

---

## What all four have in common

They all want the same three things, and they are what the product is for:

1. **No account.** Not "an account is optional" — no account exists in the
   single-player path at all.
2. **Their data, on their machine.** Not "exportable". Actually local.
3. **No per-seat economics.** Not a cheaper tier. None.
