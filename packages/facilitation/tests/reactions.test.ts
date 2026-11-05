import { describe, expect, it } from "vitest";

import {
  isReactionLive,
  makeReaction,
  REACTION_KINDS,
  REACTION_TTL_MS,
  reactionEmoji,
  resolveReactionAnchor,
} from "@firo/facilitation";

describe("reaction kinds (ADR-0039 section 7)", () => {
  it("offers the six observed kinds in menu order", () => {
    expect(REACTION_KINDS.map((entry) => entry.kind)).toEqual([
      "thumbsUp",
      "love",
      "fire",
      "wow",
      "celebration",
      "wave",
    ]);
    for (const entry of REACTION_KINDS) {
      expect(entry.emoji.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("resolves an emoji per kind and null for an unknown one", () => {
    expect(reactionEmoji("fire")).toBe("🔥");
    expect(reactionEmoji("nonsense")).toBeNull();
  });
});

describe("isReactionLive", () => {
  const reaction = makeReaction({
    id: "r1",
    kind: "thumbsUp",
    anchor: { targetId: null, x: 10, y: 20 },
    at: 1000,
  });

  it("is live inside the window and dead at its edge", () => {
    expect(isReactionLive(reaction, 1000)).toBe(true);
    expect(isReactionLive(reaction, 1000 + REACTION_TTL_MS - 1)).toBe(true);
    expect(isReactionLive(reaction, 1000 + REACTION_TTL_MS)).toBe(false);
    expect(isReactionLive(reaction, 1000 + REACTION_TTL_MS * 3)).toBe(false);
  });

  it("treats a skewed sender clock as live, not absent", () => {
    expect(isReactionLive(reaction, 500)).toBe(true);
  });

  it("reads an absent reaction as no reaction (old clients)", () => {
    expect(isReactionLive(null, 1000)).toBe(false);
    expect(isReactionLive(undefined, 1000)).toBe(false);
  });
});

describe("resolveReactionAnchor", () => {
  const cursor = { x: 5, y: 6 };
  const viewportCenter = { x: 100, y: 200 };
  const elementCenter = (id: string) =>
    id === "el1" ? { x: 50, y: 60 } : null;

  it("anchors to the element when exactly one is selected", () => {
    expect(
      resolveReactionAnchor({
        selectedIds: ["el1"],
        elementCenter,
        cursor,
        viewportCenter,
      }),
    ).toEqual({ targetId: "el1", x: 50, y: 60 });
  });

  it("carries sender coordinates when the element cannot be centred", () => {
    expect(
      resolveReactionAnchor({
        selectedIds: ["el2"],
        elementCenter,
        cursor,
        viewportCenter,
      }),
    ).toEqual({ targetId: "el2", x: 5, y: 6 });
  });

  it("floats from the cursor with zero or several selected", () => {
    for (const selectedIds of [[], ["a", "b"]] as const) {
      expect(
        resolveReactionAnchor({
          selectedIds,
          elementCenter,
          cursor,
          viewportCenter,
        }),
      ).toEqual({ targetId: null, x: 5, y: 6 });
    }
  });

  it("falls back to the viewport centre when no cursor was published", () => {
    expect(
      resolveReactionAnchor({
        selectedIds: [],
        elementCenter,
        cursor: null,
        viewportCenter,
      }),
    ).toEqual({ targetId: null, x: 100, y: 200 });
  });
});

describe("makeReaction", () => {
  it("flattens the anchor into the awareness value", () => {
    expect(
      makeReaction({
        id: "r2",
        kind: "wave",
        anchor: { targetId: "el9", x: 1, y: 2 },
        at: 42,
      }),
    ).toEqual({ id: "r2", kind: "wave", targetId: "el9", x: 1, y: 2, at: 42 });
  });
});
