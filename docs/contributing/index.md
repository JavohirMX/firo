# Working agreements

How we work together. Small project, few contributors, so these are about avoiding
unnecessary process rather than adding it.

## The core loop

1. **Check [`../vision.md`](../vision.md) first.** The non-goals are load-bearing.
2. **Find the phase** in [`../roadmap.md`](../roadmap.md). If the work does not belong
   to a phase, that is a conversation, not a pull request.
3. **Read the relevant ADR.** If none exists and the change constrains the system,
   write one.
4. **Build it small.** Small pull requests get real reviews; large ones get
   acknowledgement.
5. **Verify it** and show the output.

## Where things live

| Question | Answer |
| --- | --- |
| Should we build this? | [`../vision.md`](../vision.md) — the non-goals answer most of these |
| What are we building? | [`../prd/`](../prd/) |
| How does it work? | [`../trd/`](../trd/) |
| Why is it like this? | [`../adr/`](../adr/) |
| What is next? | [`../plans/`](../plans/) |
| How do I set up and contribute? | [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) |
| What must an agent know? | [`../../AGENTS.md`](../../AGENTS.md) |

## Communication

**Disagree substantively and in detail.** That is not the same as being abrasive.
"This will fail because the spatial index update is in an effect" is useful.
"You clearly have not thought about this" is not.

**Say when something is a bad idea, and say why.** The non-goals exist because
arguments were had. If you think one is wrong, argue in an issue. The maintainer
welcomes it — several of the decisions here were argued into existence by exactly
that kind of pressure.

**State what you do not know.** "I could not verify whether Miro's free tier is 10 or
25 AI credits, and the two official pages disagree" is useful. Asserting one of them
is not.

**Do not report work as done without running the verification.** If you could not run
it, say so. This is in [`../../AGENTS.md`](../../AGENTS.md) for agents and it applies
to everyone.

## The four invariants

If you are about to break one of these, stop and talk to the maintainer first. They
are the constraints the whole system is built around, and each is one refactor away
from being violated by someone who did not read the ADR.

1. Ephemeral state never enters the Yjs document
2. Every schema change ships with a migration
3. Text is ProseMirror, never a string
4. Records are not elements

## Provenance

**Firo is a fork of Excalidraw (MIT).** We keep their copyright notice and we say
where code came from.

- Do not strip attribution headers
- Do not reintroduce the Virgil font
  ([ADR-0013](../adr/0013-replace-the-virgil-font.md))
- Check the licence of every new dependency
- Name the origin of ported code in the pull request
- Do not use "Miro" or "Excalidraw" in product surfaces — names, UI copy, or the file
  extension. Comparative documentation is fine

**We do not track upstream releases**
([ADR-0001](../adr/0001-fork-excalidraw-and-refactor-aggressively.md)). Do not open
pull requests that sync with upstream or cherry-pick upstream fixes. If you think that
decision was wrong, argue in an issue — it is a legitimate thing to disagree with.

## Being decisive

**Small projects die of deliberation more than of mistakes.** When a decision is
reversible, make it, write it down, and move. The ADR is where the reasoning lives, so
a wrong decision is recoverable — an unmade one is not.

**Reversible:** UI layout, internal APIs, projection internals, library structure.

**Not reversible:** the file format, the CRDT choice, the licence, the non-goals.
Spend more time on these, and get more people involved.
