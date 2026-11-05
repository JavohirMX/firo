/** One awareness-owned room state. No peer fields are copied into local state. */
import { isVotingOpen, resolveDriver } from "@firo/facilitation";
import { EMPTY_EPHEMERAL_STATE } from "@firo/doc";

import type { EphemeralState, FiroDoc } from "@firo/doc";

type SessionFields = Pick<
  EphemeralState,
  "timer" | "reveal" | "presentation" | "voting"
>;
export type SharedSession = Readonly<{
  driver: number | null;
  self: number;
  isDriver: boolean;
  state: SessionFields;
}>;

export const hasLiveSessionState = (
  state: SessionFields,
  now = Date.now(),
): boolean =>
  state.timer !== null ||
  state.reveal.mode === "private" ||
  state.presentation.active ||
  (state.voting != null && isVotingOpen(state.voting, now));

/** Missing/invalid claims never turn an old peer's local fields into room state. */
export const getSession = (
  getDocument: () => FiroDoc,
  now = Date.now(),
): SharedSession => {
  const doc = getDocument();
  const peers = doc.peersEphemeral();
  const driver = resolveDriver(
    [...peers].map(([clientID, state]) => ({
      clientID,
      session: state.session ?? null,
      live: hasLiveSessionState(state, now),
    })),
  );
  const source =
    driver === null
      ? EMPTY_EPHEMERAL_STATE
      : peers.get(driver) ?? EMPTY_EPHEMERAL_STATE;
  return {
    driver,
    self: doc.awareness.clientID,
    isDriver: driver !== null && driver === doc.awareness.clientID,
    state: {
      timer: source.timer,
      reveal: source.reveal,
      presentation: source.presentation,
      voting: source.voting ?? null,
    },
  };
};

/** The caller owns role policy; this boundary owns existing-session ownership. */
export const mayChangeSession = (getDocument: () => FiroDoc): boolean => {
  const session = getSession(getDocument);
  return session.driver === null || session.isDriver;
};

/** Claim and fields publish atomically. No durable write and no follower write. */
export const writeSession = (
  getDocument: () => FiroDoc,
  patch: Partial<SessionFields>,
): boolean => {
  if (!mayChangeSession(getDocument)) {
    return false;
  }
  const doc = getDocument();
  const next = { ...doc.getEphemeral(), ...patch };
  doc.setEphemeral({
    ...patch,
    session: hasLiveSessionState(next)
      ? { leader: doc.awareness.clientID }
      : null,
  });
  return true;
};

/** A simultaneous losing claim yields once, so it cannot revive on disconnect. */
export const yieldLosingClaim = (getDocument: () => FiroDoc): boolean => {
  const doc = getDocument();
  const local = doc.getEphemeral();
  const session = getSession(getDocument);
  if (local.session === null || session.driver === null || session.isDriver) {
    return false;
  }
  doc.setEphemeral({
    session: null,
    timer: null,
    reveal: EMPTY_EPHEMERAL_STATE.reveal,
    presentation: EMPTY_EPHEMERAL_STATE.presentation,
    voting: null,
  });
  return true;
};
