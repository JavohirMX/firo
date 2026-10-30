/**
 * Voting sessions: the live round that organises durable dots.
 *
 * The split this file keeps is the one ADR-0039 draws: **votes are records**
 * (durable, exported, undoable) and **the round is live** (awareness only,
 * never in the file, gone when the driver leaves). `voting.ts` owns the
 * records; this module owns the rules a round puts around placing them.
 *
 * Everything here is a pure function over plain data, for the same reason the
 * rest of the package is: the allowance arithmetic, the deadline check, and
 * the driver tie-break are exactly the parts that would otherwise be verified
 * by clicking, and they are the parts two clients can disagree about.
 */

import type { Mutation } from "@firo/doc";

import { placeVote, type Vote } from "./voting.js";

/**
 * The settings a round is started with.
 *
 * Fixed at Start (ADR-0039 §2): changing a rule that affects ballots means
 * ending the round and starting another. The one exception is `showResults`,
 * a display switch that cannot invalidate a vote, so it stays live.
 */
export type VotingSettings = Readonly<{
  /** Dots one ballot may hold at once. 1-9, default 3. */
  votesPerPerson: number;
  /** Round length. 1-60, default 2. */
  minutes: number;
  /** At most one dot from a ballot on a target. Default off. */
  oneVotePerObject: boolean;
  /** Count badges on the canvas. Default on. */
  showResults: boolean;
  /**
   * Element types that may receive dots this round, or null for every type.
   * A rule for *new* votes only: results still count every live unarchived
   * vote, because hiding one would make the tally disagree with the dots.
   */
  eligibleTypes: readonly string[] | null;
}>;

export const DEFAULT_VOTING_SETTINGS: VotingSettings = Object.freeze({
  votesPerPerson: 3,
  minutes: 2,
  oneVotePerObject: false,
  showResults: true,
  eligibleTypes: null,
});

export const VOTES_PER_PERSON_MIN = 1;
export const VOTES_PER_PERSON_MAX = 9;
export const MINUTES_MIN = 1;
export const MINUTES_MAX = 60;

export const clampSettings = (settings: VotingSettings): VotingSettings => ({
  ...settings,
  votesPerPerson: Math.min(
    VOTES_PER_PERSON_MAX,
    Math.max(VOTES_PER_PERSON_MIN, Math.round(settings.votesPerPerson)),
  ),
  minutes: Math.min(
    MINUTES_MAX,
    Math.max(MINUTES_MIN, Math.round(settings.minutes)),
  ),
});

/**
 * One live round. `endsAt` is stored rather than a remaining countdown, for
 * the same reason the timer is an anchor: the room derives the remainder from
 * its own clock, and no per-second value is ever written anywhere.
 */
export type VotingRound = Readonly<{
  settings: VotingSettings;
  startsAt: number;
  endsAt: number;
  /** The driver ended the round before its deadline. */
  endedEarly: boolean;
}>;

export const startRound = (
  settings: VotingSettings,
  now: number,
): VotingRound => {
  const clamped = clampSettings(settings);
  return {
    settings: clamped,
    startsAt: now,
    endsAt: now + clamped.minutes * 60_000,
    endedEarly: false,
  };
};

export const endRound = (round: VotingRound): VotingRound => ({
  ...round,
  endedEarly: true,
});

/**
 * Whether new dots are accepted. Read-time, never stored: a round past its
 * deadline is inactive but remains readable, so results do not vanish at zero.
 */
export const isVotingOpen = (round: VotingRound, now: number): boolean =>
  !round.endedEarly && now < round.endsAt;

export const remainingRoundMs = (round: VotingRound, now: number): number =>
  Math.max(0, round.endsAt - now);

/**
 * The round's identity for ballot storage. A round has no durable id (the
 * session is ephemeral), so the start instant names it; two rounds in the
 * same millisecond on one driver cannot both exist.
 */
export const roundId = (round: VotingRound): string =>
  `round-${round.startsAt}`;

/**
 * One awareness entry's claim, as `resolveDriver` reads it. `live` stands in
 * for "at least one live state is present" (ADR-0039 §1): a claim with no
 * live state is ignored, so an expired round does not hold the room even if
 * its marker has not been cleared yet.
 */
export type SessionEntry = Readonly<{
  clientID: number;
  session: Readonly<{ leader: number }> | null;
  live: boolean;
}>;

/**
 * The room's driver, or null when no session exists.
 *
 * A claim is valid only when `leader` equals the publishing clientID and the
 * entry is live. When two clients claim at the same instant the lower
 * clientID wins; the other client is expected to clear its own claim. This is
 * a deterministic tie-break for a simultaneous start, not a priority order.
 */
export const resolveDriver = (
  entries: readonly SessionEntry[],
): number | null => {
  const valid = entries.filter(
    (entry) =>
      entry.live &&
      entry.session !== null &&
      entry.session.leader === entry.clientID,
  );
  if (valid.length === 0) {
    return null;
  }
  return Math.min(...valid.map((entry) => entry.clientID));
};

/**
 * A fresh ballot key. Opaque by construction (ADR-0039 §3): it is never an
 * account id, never displayed as an identity, and names only "the dots this
 * client placed this round". The caller stores it in `sessionStorage` under
 * the board and round; the random source is injected so tests are stable.
 */
export const mintBallotKey = (random: () => string): string =>
  `ballot-${random()}`;

/** The dots one ballot currently holds, wherever they point. */
export const ballotDots = (votes: readonly Vote[], ballot: string): Vote[] =>
  votes.filter((vote) => vote.voterId === ballot);

export type PlacementTarget = Readonly<{ id: string; type: string }>;

export type PlacementPlan =
  | Readonly<{ ok: true; mutations: Mutation[] }>
  | Readonly<{ ok: false; reason: string }>;

/**
 * Plan one press of "add a dot to each selected element".
 *
 * Returns the mutations to commit, or a refusal to show. A refusal writes
 * nothing: a partial multi-selection write would make the tally disagree
 * with what the facilitator saw, so the whole press is refused and nothing
 * is written (ADR-0039 §9).
 *
 * The rules, in the order they refuse:
 *
 * 1. **A closed round refuses everything.** The deadline and End session are
 *    the same boundary.
 * 2. **An ineligible type refuses the press.** The filter is a rule for new
 *    votes, so a press that names one is a mistake, not a partial success.
 * 3. **A duplicate dot refuses the press.** One dot per ballot per target
 *    applies outside a round and inside one with `oneVotePerObject` on.
 *    Stacking is allowed only inside a round with the switch off.
 * 4. **The allowance refuses the press.** Inside a round, a ballot's
 *    unarchived dots count against `votesPerPerson` wherever they point,
 *    including a dot on a deleted target: deleting one does not refund a
 *    vote, and restoring it cannot push the ballot over its limit.
 */
export const planPlacement = (args: {
  votes: readonly Vote[];
  targets: readonly PlacementTarget[];
  ballot: string;
  placedAt: number;
  ids: { record: () => string; orders: readonly string[]; board: string };
  hasCollection: boolean;
  round: VotingRound | null;
  now: number;
}): PlacementPlan => {
  const { votes, targets, ballot, placedAt, ids, hasCollection, round, now } =
    args;

  if (targets.length === 0) {
    return {
      ok: false,
      reason: "Nothing is selected, so there is nothing to give a dot.",
    };
  }

  if (round && !isVotingOpen(round, now)) {
    return {
      ok: false,
      reason: "This voting session has ended. The results are still readable.",
    };
  }

  const eligible = round?.settings.eligibleTypes ?? null;
  if (eligible !== null) {
    const rejected = targets.filter(
      (target) => !eligible.includes(target.type),
    );
    if (rejected.length > 0) {
      const types = [...new Set(rejected.map((target) => target.type))].join(
        ", ",
      );
      return {
        ok: false,
        reason:
          `This session is not taking dots on ${types}. Nothing was placed; ` +
          `adjust the selection and try again.`,
      };
    }
  }

  const onePerTarget = round ? round.settings.oneVotePerObject : true;
  const mine = ballotDots(votes, ballot);
  if (onePerTarget) {
    const taken = new Set(mine.map((vote) => vote.elementId));
    if (targets.some((target) => taken.has(target.id))) {
      return {
        ok: false,
        reason:
          "Your dot is already on one of these. Take it back first (Alt+W) " +
          "if you want to move it.",
      };
    }
  }

  if (round) {
    const allowance = round.settings.votesPerPerson;
    const after = mine.length + targets.length;
    if (after > allowance) {
      return {
        ok: false,
        reason:
          `You have ${allowance} dot${
            allowance === 1 ? "" : "s"
          } this session ` +
          `and ${mine.length} ${mine.length === 1 ? "is" : "are"} placed. ` +
          `Take one back before placing more.`,
      };
    }
  }

  const mutations = targets.flatMap((target, index) =>
    placeVote(
      votes,
      { elementId: target.id, voterId: ballot, placedAt },
      { record: ids.record(), order: ids.orders[index], board: ids.board },
      hasCollection || index > 0,
    ),
  );
  return { ok: true, mutations };
};

/**
 * The votes that count: unarchived dots on live, currently visible elements.
 *
 * Filtering at read time rather than cascading (ADR-0039 §2): a deleted or
 * withheld target takes its dots out of the tally without archiving them, and
 * a restored element brings its dots back. `liveIds` is the set of element
 * ids that pass the board's visibility predicate; the caller owns that
 * predicate so this module never imports the reveal rules.
 */
export const filterLiveVotes = (
  votes: readonly Vote[],
  liveIds: ReadonlySet<string>,
): Vote[] => votes.filter((vote) => liveIds.has(vote.elementId));

export type ResultRow = Readonly<{
  elementId: string;
  label: string;
  count: number;
}>;

/**
 * The Results tab: one row per element with at least one live dot, best
 * first. Ties break on element id, not `localeCompare`, for the same reason
 * `leaders` does: two clients with different locales must not disagree about
 * "the top three" on a projector.
 */
export const resultsRows = (
  votes: readonly Vote[],
  elements: readonly Readonly<{ id: string; label: string }>[],
): ResultRow[] => {
  const counts = new Map<string, number>();
  for (const vote of votes) {
    counts.set(vote.elementId, (counts.get(vote.elementId) ?? 0) + 1);
  }
  const labels = new Map(
    elements.map((element) => [element.id, element.label]),
  );
  return [...counts.entries()]
    .map(([elementId, count]) => ({
      elementId,
      label: labels.get(elementId) ?? "Deleted element",
      count,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.elementId < b.elementId ? -1 : a.elementId > b.elementId ? 1 : 0),
    );
};
