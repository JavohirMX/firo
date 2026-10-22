/**
 * The count badges: each voted element's live tally, on the canvas.
 *
 * ADR-0039 section 4: host chrome, not canvas content. The layer reads the
 * durable votes and the visible elements, draws nothing into the scene or an
 * export, and disappears when the round's **Show results on the board**
 * switch is off or no round exists. It obeys the reveal predicate, so a
 * hidden note's count cannot leak it.
 *
 * The badge sits at the element's top-right corner in container coordinates
 * (`(scene + scroll) * zoom`), the same transform the comment pins use, so
 * it tracks pan and zoom without any viewport offset bookkeeping.
 */

import React, { useEffect, useReducer } from "react";

import { tally, visibleElements } from "@firo/facilitation";
import { useExcalidrawStateValue } from "@firo/editor";

import { boardDoc } from "../board/board";
import { getReveal, subscribeToFacilitation } from "../board/facilitator";
import { countableVotes, readSession } from "../board/votingSession";

import "./VoteBadges.scss";

export const VoteBadges = (): React.JSX.Element | null => {
  const [generation, bump] = useReducer((x: number) => x + 1, 0);

  // Votes are durable records, so `subscribe` hears every peer's dot; the
  // facilitation seam and awareness carry the session and the reveal toggle.
  useEffect(() => {
    const doc = boardDoc();
    const offDoc = doc.subscribe(bump);
    const offFacilitation = subscribeToFacilitation(boardDoc, bump);
    const onAwareness = () => bump();
    doc.awareness.on("update", onAwareness);
    return () => {
      offDoc();
      offFacilitation();
      doc.awareness.off("update", onAwareness);
    };
  }, []);

  const scrollX = useExcalidrawStateValue((state) => state.scrollX) ?? 0;
  const scrollY = useExcalidrawStateValue((state) => state.scrollY) ?? 0;
  const zoom = useExcalidrawStateValue((state) => state.zoom.value) ?? 1;
  void generation;

  const session = readSession(boardDoc);
  const round = session.round;
  if (!round || !round.settings.showResults) {
    return null;
  }

  const snapshot = boardDoc().read();
  const reveal = getReveal(boardDoc);
  const live = visibleElements(snapshot.elements, { mode: reveal.mode });
  const counts = tally(
    countableVotes(boardDoc, new Set(live.map((e) => e.id))),
  );
  if (counts.size === 0) {
    return null;
  }

  const byId = new Map(live.map((element) => [String(element.id), element]));
  return (
    <div className="vote-badges" aria-hidden="true">
      {[...counts.entries()].map(([elementId, count]) => {
        const element = byId.get(elementId);
        if (!element) {
          return null;
        }
        const left = (element.x + element.width + scrollX) * zoom;
        const top = (element.y + scrollY) * zoom;
        return (
          <span
            key={elementId}
            className="vote-badges__badge"
            style={{ left, top }}
          >
            {count}
          </span>
        );
      })}
    </div>
  );
};

export default VoteBadges;
