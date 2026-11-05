/**
 * Reactions: six quick emoji over awareness (ADR-0039 section 7).
 *
 * A reaction is live-meeting state, not content: it never enters the
 * document, the undo stack, the activity feed, or an export. Everything here
 * is a pure function over plain data for the same reason as the rest of the
 * package -- the expiry boundary and the anchor rule are exactly the parts
 * two clients could otherwise disagree about.
 */

/** The six kinds, in the order the menu shows them (matrix row 33). */
export const REACTION_KINDS = Object.freeze([
  Object.freeze({ kind: "thumbsUp", emoji: "👍", label: "Thumbs up" }),
  Object.freeze({ kind: "love", emoji: "❤️", label: "Love" }),
  Object.freeze({ kind: "fire", emoji: "🔥", label: "Fire" }),
  Object.freeze({ kind: "wow", emoji: "😮", label: "Wow" }),
  Object.freeze({ kind: "celebration", emoji: "🎉", label: "Celebration" }),
  Object.freeze({ kind: "wave", emoji: "👋", label: "Wave" }),
] as const);

export type ReactionKind = typeof REACTION_KINDS[number]["kind"];

export const reactionEmoji = (kind: string): string | null =>
  REACTION_KINDS.find((entry) => entry.kind === kind)?.emoji ?? null;

/** How long peers render a new reaction (ADR-0039 section 7). */
export const REACTION_TTL_MS = 4000;

/** Where a reaction shows. `targetId` anchors it to an element. */
export type ReactionAnchor = Readonly<{
  targetId: string | null;
  x: number;
  y: number;
}>;

/** The awareness value. The newest reaction replaces the previous one. */
export type Reaction = Readonly<{
  id: string;
  kind: ReactionKind;
  targetId: string | null;
  x: number;
  y: number;
  at: number;
}>;

/**
 * Whether peers should still render this reaction at `now`.
 *
 * A reaction from the future (a skewed sender clock) counts as live: hiding
 * it would punish the receiver for the sender's clock, and it expires on the
 * same four-second schedule anyway.
 */
export const isReactionLive = (
  reaction: Reaction | null | undefined,
  now: number,
): reaction is Reaction =>
  reaction != null && now - reaction.at < REACTION_TTL_MS;

/**
 * Where a new reaction goes (ADR-0039 section 7): exactly one selected
 * element anchors it; otherwise it floats from the sender's cursor, or the
 * viewport centre when no cursor was ever published.
 *
 * The anchor also carries sender-computed coordinates so a peer that cannot
 * resolve `targetId` -- an element deleted mid-flight, or one its document
 * does not have -- still shows the reaction where the sender saw it.
 */
export const resolveReactionAnchor = (args: {
  selectedIds: readonly string[];
  elementCenter: (id: string) => { x: number; y: number } | null;
  cursor: { x: number; y: number } | null;
  viewportCenter: { x: number; y: number };
}): ReactionAnchor => {
  if (args.selectedIds.length === 1) {
    const targetId = args.selectedIds[0];
    const center = args.elementCenter(targetId);
    if (center) {
      return { targetId, x: center.x, y: center.y };
    }
    if (args.cursor) {
      return { targetId, x: args.cursor.x, y: args.cursor.y };
    }
    return {
      targetId,
      x: args.viewportCenter.x,
      y: args.viewportCenter.y,
    };
  }
  if (args.cursor) {
    return { targetId: null, x: args.cursor.x, y: args.cursor.y };
  }
  return {
    targetId: null,
    x: args.viewportCenter.x,
    y: args.viewportCenter.y,
  };
};

/** Build the frozen awareness value. */
export const makeReaction = (args: {
  id: string;
  kind: ReactionKind;
  anchor: ReactionAnchor;
  at: number;
}): Reaction =>
  Object.freeze({
    id: args.id,
    kind: args.kind,
    targetId: args.anchor.targetId,
    x: args.anchor.x,
    y: args.anchor.y,
    at: args.at,
  });
