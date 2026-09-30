---
status: accepted
date: 2026-09-30
deciders: maintainer
---

# No AI in version 1

## Context and Problem Statement

Miro's AI is a significant product surface and a significant part of their
competitive positioning. It can generate diagrams, docs, kanbans, prototypes,
stickies, tables and timelines; cluster stickies by keyword and sentiment; summarise
comment threads; translate into 17 languages; generate alt text; remove image
backgrounds; and run visual multi-step workflows on the board.

It is metered. Sticky note 1 credit, image 3, **board layout 5, diagrams 5, tables
5**, prototype 5 per screen, slide 5 per slide
([source](https://help.miro.com/hc/en-us/articles/19756209116178-Miro-AI-credits)).
Credits are pooled org-wide, reset monthly, do not roll over, and are not refunded
on undo.

There is also a **structural weakness** in how Miro's AI reads a board
([source](https://help.miro.com/hc/en-us/articles/28765406244498-Miro-AI-overview)):

> "Miro AI works only with content that is actually visible on the Miro canvas… uses
> **visual context processing, for example optical character recognition (OCR)-style
> processing**, to analyze content rendered on the canvas, and uses that limited view
> for processing."

Miro's AI is largely canvas-blind. It OCRs rendered pixels.

## Decision Drivers

- AI is only genuinely useful once there is a **real document graph** to read, rather
  than a rendered image.
- Version 1 is a large amount of work already
  ([`../roadmap.md`](../roadmap.md), Phases 0–7).
- Bundling a model would break the zero-network requirement
  ([`../prd/05-non-functional-requirements.md`](../prd/05-non-functional-requirements.md)
  NFR-3) and the bundle budget (NFR-6).
- "Local models" is ambiguous: browser-side WebLLM is a multi-gigabyte download;
  Ollama requires a separate install.

## Considered Options

1. No AI in version 1
2. Local models via Ollama, opt-in
3. Bring-your-own-API-key
4. Models in the browser via WebLLM
5. Ship AI in version 1

## Decision Outcome

Chosen option: **1 — no AI in version 1.** Deferred to v3
([`../roadmap.md`](../roadmap.md), Phase 10).

The strong argument for this is not "AI is hard" but **"AI is premature against this
data model"**. A local-first product with a real document graph, a real search index,
and typed record collections can beat an OCR-over-the-canvas system structurally.
Building that first, and only then adding AI, is the order that makes the AI good.

When it arrives, the intended shape is **local models via an opt-in adapter**, with
Ollama as the primary target and a bring-your-own-endpoint escape hatch. That keeps
NFR-3 intact: an opt-in local model is not a network request from the application.

## Consequences

- (+) **No AI credit meter, ever.** This is a permanent structural advantage over
  Miro rather than a competitive feature we would have to keep winning — one of the
  nine wedges in [`../competitive.md`](../competitive.md).
- (+) Version 1 ships with no model dependency, no inference cost, and no privacy
  question.
- (+) The data model is correct before anything tries to read it, which means the AI
  built in v3 is AI over a real graph.
- (-) We are behind Miro on a feature users visibly expect in 2026. A competitor
  comparison will list this as a gap, and it will be a real one.
- (-) **The counterfactual matters:** a user choosing between Firo and Miro today
  might pick Miro for the AI, and the local-first and free arguments would not be
  enough. This is the strongest argument against the decision and it is why the
  deferral is bounded to v3 rather than open-ended.
- (-) Sticky-note clustering by keyword and sentiment is genuinely useful for
  research and affinity mapping, and we will not have it for a long time.
- (-) The "no AI credit meter" advantage is unrealised until v3, which means it
  cannot be used as a v1 selling point even though it is architecturally true.

## Confirmation

- No AI dependency appears in the v1 dependency tree.
- No network request to a model provider exists in any code path (NFR-3).
- The roadmap carries Phase 10 with AI as a defined scope, so the deferral is
  bounded and visible rather than quietly forgotten.

## Pros and Cons of the Options

### 2. Local models via Ollama

- (+) Fully offline, no credit meter, no privacy question. Structurally superior to
  Miro's approach.
- (+) Sticky-note clustering and summarisation over a real document graph would be
  genuinely good.
- (-) Requires the user to install and run a separate application. Not a one-click
  experience.
- (-) Model quality varies enormously and we would be responsible for the output.
- (-) Pulls Phase 10 work into the middle of the project, before the record store
  exists, which is the data AI needs.

### 3. Bring-your-own-API-key

- (+) Zero infrastructure, no bundled model.
- (+) Works today with any provider.
- (-) **Not local-first.** It sends board content to a third party, which is exactly
  what the primary persona is trying to avoid.
- (-) Not free, which contradicts the product promise.
- (-) No offline capability at all.

### 4. Models in the browser via WebLLM

- (+) Truly zero-setup and fully offline.
- (-) Multi-gigabyte model download. Catastrophic for a user on hotel wifi and
  inconsistent with NFR-6.
- (-) Limited model sizes and poor WebGPU support outside Chrome.
- (-) Every user pays the download cost whether or not they use the feature.

### 5. Ship AI in version 1

- (+) Competitive parity on a visible feature.
- (+) The "no credit meter" wedge becomes real immediately.
- (-) **Builds AI against a data model that does not exist yet.** The record store is
  Phase 6; the renderer is Phase 2. AI over OCR-scraped canvas is the thing we are
  trying to beat — building it before the graph means building the weak version.
- (-) Significant scope in the riskiest project.
- (-) Introduces a network dependency, contradicting NFR-3.

## More Information

- [Miro AI credits](https://help.miro.com/hc/en-us/articles/19756209116178-Miro-AI-credits)
- [Miro AI overview — visual context processing](https://help.miro.com/hc/en-us/articles/28765406244498-Miro-AI-overview)
- [`../roadmap.md`](../roadmap.md) — Phase 10
