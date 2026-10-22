/**
 * The voting panel: run a dot-voting session, see the ranking.
 *
 * Parity matrix row 35; the rules are ADR-0039 and live in
 * `@firo/facilitation` (`session.ts`). This component is only their surface.
 *
 * ## Why a docked panel and not a dialog
 *
 * The measured surface is the right dock's wide slot (380 px), non-modal, and
 * Escape does not close it (ADR-0035): a facilitator votes *while* the panel
 * is open, so a modal would make the feature unusable. ADR-0035's unified
 * dock is not built yet; this panel is its first occupant, fixed to the
 * measured geometry, and does not migrate the existing drawers.
 *
 * ## What the tabs show
 *
 * - **New session** is the driver's form: votes per person, minutes, the two
 *   switches, and the eligible-type list with live counts. While a round
 *   runs, the tab shows the fixed settings, the time remaining, and End
 *   session for the driver; a non-driver sees the same thing read-only.
 * - **Results** is the live tally, best first, ties broken on element id so
 *   two clients never disagree about the ranking on a projector.
 */

import React, { useEffect, useMemo, useReducer, useState } from "react";

import {
  DEFAULT_VOTING_SETTINGS,
  MINUTES_MAX,
  MINUTES_MIN,
  VOTES_PER_PERSON_MAX,
  VOTES_PER_PERSON_MIN,
  formatRemaining,
  isVotingOpen,
  remainingRoundMs,
  resultsRows,
} from "@firo/facilitation";

import { visibleElements } from "@firo/facilitation";

import { getCommonBounds } from "@firo/element/bounds";

import { zoomToFitBounds } from "@firo/editor/viewport";

import type { VotingSettings } from "@firo/facilitation";
import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import { boardDoc } from "../board/board";
import { getReveal, subscribeToFacilitation } from "../board/facilitator";
import {
  countableVotes,
  endVotingRound,
  readSession,
  startVotingRound,
} from "../board/votingSession";

import "./VotingPanel.scss";

export interface VotingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

type Tab = "new" | "results";

/**
 * A name a person can read for an element, from what the element carries.
 * Text-bearing elements give their first line; everything else gives its
 * kind. Never the raw id, which reads as noise on a projector.
 */
const elementLabel = (element: {
  id: string;
  type: string;
  text?: unknown;
}): string => {
  const raw = element.text;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().split("\n")[0].slice(0, 60);
  }
  if (raw && typeof raw === "object") {
    // ProseMirror: first text node anywhere in the doc (ADR-0004).
    const stack = [...((raw as { content?: unknown[] }).content ?? [])];
    while (stack.length > 0) {
      const node = stack.shift() as {
        text?: string;
        content?: unknown[];
      };
      if (typeof node?.text === "string" && node.text.trim()) {
        return node.text.trim().slice(0, 60);
      }
      if (Array.isArray(node?.content)) {
        stack.push(...node.content);
      }
    }
  }
  return element.type;
};

/** One second, only while the panel is open and a round is running. */
const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
};

export const VotingPanel: React.FC<VotingPanelProps> = ({
  isOpen,
  onClose,
  excalidrawAPI,
}) => {
  const [tab, setTab] = useState<Tab>("new");
  const [draft, setDraft] = useState<VotingSettings>(DEFAULT_VOTING_SETTINGS);
  // A manual re-render trigger: awareness changes (a peer's session) and the
  // document's durable changes (votes are records) both land here.
  const [generation, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const doc = boardDoc();
    const offFacilitation = subscribeToFacilitation(boardDoc, bump);
    const offDoc = doc.subscribe(bump);
    const onAwareness = () => bump();
    doc.awareness.on("update", onAwareness);
    return () => {
      offFacilitation();
      offDoc();
      doc.awareness.off("update", onAwareness);
    };
  }, [isOpen]);

  const session = isOpen ? readSession(boardDoc) : null;
  const round = session?.round ?? null;
  const open = round !== null && isVotingOpen(round, Date.now());
  const now = useNow(isOpen && open);
  void generation;

  const snapshot = isOpen ? boardDoc().read() : null;
  const liveElements = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    // The reveal predicate, so a hidden note's count cannot leak into the
    // panel any more than it can leak into a badge (ADR-0039 section 4).
    return visibleElements(snapshot.elements, {
      mode: getReveal(boardDoc).mode,
    }).map((element) => ({
      id: element.id,
      type: element.type,
      label: elementLabel(element),
    }));
    // Re-derived when the panel (re)reads; snapshot identity changes per read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, generation]);

  const liveIds = useMemo(
    () => new Set(liveElements.map((element) => element.id)),
    [liveElements],
  );

  const votes = isOpen ? countableVotes(boardDoc, liveIds) : [];
  const rows = resultsRows(votes, liveElements);
  const outstandingDots = votes.length;

  /** Every element type on the board, with live counts, for the filter. */
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const element of liveElements) {
      counts.set(element.type, (counts.get(element.type) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [liveElements]);

  if (!isOpen || !session || !snapshot) {
    return null;
  }

  const canEditSettings = session.driver === null;

  const step = (field: "votesPerPerson" | "minutes", delta: number) => {
    const [min, max] =
      field === "votesPerPerson"
        ? [VOTES_PER_PERSON_MIN, VOTES_PER_PERSON_MAX]
        : [MINUTES_MIN, MINUTES_MAX];
    setDraft((current) => ({
      ...current,
      [field]: Math.min(max, Math.max(min, current[field] + delta)),
    }));
  };

  const toggleType = (type: string) => {
    setDraft((current) => {
      const currentList = current.eligibleTypes;
      const all = typeCounts.map(([name]) => name);
      const active = currentList === null ? all : currentList;
      const next = active.includes(type)
        ? active.filter((name) => name !== type)
        : [...active, type];
      // All types checked is spelled `null`, so a type added to the board
      // later is eligible by default rather than silently filtered out.
      return {
        ...current,
        eligibleTypes: next.length === all.length ? null : next,
      };
    });
  };

  const start = () => {
    const cleared = startVotingRound(boardDoc, draft);
    void cleared;
    bump();
  };

  const selectRow = (elementId: string) => {
    const api = excalidrawAPI;
    if (!api) {
      return;
    }
    api.updateScene({
      appState: { selectedElementIds: { [elementId]: true } },
    });

    /*
     * Scroll the winner into view. The fork's imperative API has no
     * `scrollToContent`, so this reuses the presentation module's fit: bounds
     * plus `zoomToFitBounds`, and only the three viewport fields go back --
     * re-applying the spread appState would close dialogs and selections as a
     * side effect of clicking a result row (see `board/presentation.ts`).
     */
    const element = boardDoc()
      .read()
      .elements.find((candidate) => String(candidate.id) === elementId);
    if (!element) {
      return;
    }
    const appState = api.getAppState();
    if (!(appState.width > 0) || !(appState.height > 0)) {
      return;
    }
    const fitted = zoomToFitBounds({
      bounds: getCommonBounds([element as never]),
      appState,
      canvasOffsets: api.getViewportOffsets(),
      fit: "scale-down",
    });
    api.updateScene({
      appState: {
        scrollX: fitted.appState.scrollX,
        scrollY: fitted.appState.scrollY,
        zoom: fitted.appState.zoom,
      },
    });
  };

  return (
    <>
      {/*
       * The voting area: a dashed outline of the viewport that was visible
       * when the panel opened (ADR-0039 section 4). It is not a frame, is not
       * an element, does not scope the round, and never enters undo or export.
       */}
      <div className="voting-area-outline" aria-hidden="true" />
      {/*
       * A div, not an aside: `.excalidraw--mobile aside { display: none }`
       * hides every aside inside the editor on phone, panel included.
       * `role="complementary"` keeps the landmark. */}
      <div
        className="voting-panel"
        data-testid="voting-panel"
        role="complementary"
        aria-label="Voting"
      >
        <div className="voting-panel__header">
          <h2>Voting</h2>
          <button
            type="button"
            className="voting-panel__close"
            aria-label="Close voting panel"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="voting-panel__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "new"}
            className={tab === "new" ? "is-active" : ""}
            onClick={() => setTab("new")}
          >
            New session
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "results"}
            className={tab === "results" ? "is-active" : ""}
            onClick={() => setTab("results")}
          >
            Results{outstandingDots > 0 ? ` (${outstandingDots})` : ""}
          </button>
        </div>

        {tab === "new" && (
          <div className="voting-panel__body">
            {round && (
              <div className="voting-panel__status" role="status">
                {open ? (
                  <>
                    Session open -{" "}
                    {formatRemaining(remainingRoundMs(round, now))} left
                  </>
                ) : (
                  <>Session ended. Results stay readable below.</>
                )}
              </div>
            )}

            <fieldset disabled={!canEditSettings && !open}>
              <label className="voting-panel__stepper">
                <span>Votes per person</span>
                <span className="voting-panel__stepper-controls">
                  <button
                    type="button"
                    aria-label="Fewer votes per person"
                    disabled={!canEditSettings || round !== null}
                    onClick={() => step("votesPerPerson", -1)}
                  >
                    −
                  </button>
                  <strong>
                    {round
                      ? round.settings.votesPerPerson
                      : draft.votesPerPerson}
                  </strong>
                  <button
                    type="button"
                    aria-label="More votes per person"
                    disabled={!canEditSettings || round !== null}
                    onClick={() => step("votesPerPerson", 1)}
                  >
                    +
                  </button>
                </span>
              </label>

              <label className="voting-panel__stepper">
                <span>Minutes</span>
                <span className="voting-panel__stepper-controls">
                  <button
                    type="button"
                    aria-label="Fewer minutes"
                    disabled={!canEditSettings || round !== null}
                    onClick={() => step("minutes", -1)}
                  >
                    −
                  </button>
                  <strong>
                    {round ? round.settings.minutes : draft.minutes}
                  </strong>
                  <button
                    type="button"
                    aria-label="More minutes"
                    disabled={!canEditSettings || round !== null}
                    onClick={() => step("minutes", 1)}
                  >
                    +
                  </button>
                </span>
              </label>

              <label className="voting-panel__switch">
                <input
                  type="checkbox"
                  checked={
                    round
                      ? round.settings.oneVotePerObject
                      : draft.oneVotePerObject
                  }
                  disabled={!canEditSettings || round !== null}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      oneVotePerObject: event.target.checked,
                    }))
                  }
                />
                <span>One vote per object</span>
              </label>

              <label className="voting-panel__switch">
                <input
                  type="checkbox"
                  checked={
                    round ? round.settings.showResults : draft.showResults
                  }
                  // The one live switch: a display choice cannot invalidate a
                  // vote, so the driver may flip it mid-round (ADR-0039 §2).
                  disabled={round !== null && !session.isDriver}
                  onChange={(event) => {
                    if (round && session.isDriver) {
                      boardDoc().setEphemeral({
                        voting: {
                          ...round,
                          settings: {
                            ...round.settings,
                            showResults: event.target.checked,
                          },
                        },
                      });
                      bump();
                    } else {
                      setDraft((current) => ({
                        ...current,
                        showResults: event.target.checked,
                      }));
                    }
                  }}
                />
                <span>Show results on the board</span>
              </label>

              {round === null && typeCounts.length > 0 && (
                <div className="voting-panel__filter">
                  <span>What can be voted on</span>
                  {typeCounts.map(([type, count]) => {
                    const active =
                      draft.eligibleTypes === null ||
                      draft.eligibleTypes.includes(type);
                    return (
                      <label key={type} className="voting-panel__switch">
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={!canEditSettings}
                          onChange={() => toggleType(type)}
                        />
                        <span>
                          {type} ({count})
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>

            {session.driver !== null && !session.isDriver && (
              <p className="voting-panel__note">
                Another facilitator is driving this session. You can cast dots;
                only they can change it.
              </p>
            )}

            <div className="voting-panel__footer">
              {round && session.isDriver && (
                <button
                  type="button"
                  className="voting-panel__end"
                  onClick={() => {
                    endVotingRound(boardDoc);
                    bump();
                  }}
                >
                  End session
                </button>
              )}
              {session.driver === null && (
                <button
                  type="button"
                  className="voting-panel__start"
                  onClick={start}
                >
                  {outstandingDots > 0
                    ? `Start - clears ${outstandingDots} dot${
                        outstandingDots === 1 ? "" : "s"
                      }`
                    : "Start"}
                </button>
              )}
            </div>
          </div>
        )}

        {tab === "results" && (
          <div className="voting-panel__body">
            {rows.length === 0 ? (
              <p className="voting-panel__note">
                No dots yet. Select a note and press Alt+D to place the first
                one.
              </p>
            ) : (
              <ul className="voting-panel__results">
                {rows.map((row) => (
                  <li key={row.elementId}>
                    <button
                      type="button"
                      onClick={() => selectRow(row.elementId)}
                      title="Select and scroll to this element"
                    >
                      <span className="voting-panel__result-label">
                        {row.label}
                      </span>
                      <span className="voting-panel__result-count">
                        {row.count}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default VotingPanel;
