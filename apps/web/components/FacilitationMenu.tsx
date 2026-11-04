import React, { useEffect, useRef, useState } from "react";

import { useExcalidrawActionManager } from "@firo/editor";
import { REACTION_KINDS } from "@firo/facilitation";
import { SparklesIcon, ClockIcon } from "@firo/ui";

import { getReveal, subscribeToFacilitation } from "../board/facilitator";
import { boardDoc, refreshBoard } from "../board/board";

import "./FacilitationMenu.scss";

/**
 * The people bar's facilitation menu (parity matrix row 2, ADR-0039).
 *
 * Miro's first people-bar control opens a menu of the room's tools; Firo's
 * people bar had the readouts (FacilitatorBar) and the dock panels but no
 * menu that gathers them, so the mouse path to the timer, voting, private
 * mode, presentation and the six reactions did not exist.
 *
 * ## Watchers watch
 *
 * ADR-0039 gives a viewer or commenter the room's state to read and the six
 * reactions to answer with (section 7), and nothing else: starting the timer,
 * opening voting, flipping private mode or presenting are owner/editor
 * surfaces. The room was never in danger -- a watcher cannot publish a driver
 * claim, so their clicks only painted a private chip and a timer nobody else
 * could see -- but a menu that offers controls which lie is its own defect,
 * so a read-only share gets the reactions row and nothing more.
 *
 * ## Every item executes the registered action
 *
 * The menu is a second path to the same commands, not a second
 * implementation: each row runs the action the palette and the chords run,
 * through `actionManager.executeAction`, so the keyboard contract (row 9's
 * honesty rule), the driver-claim rules and the view-mode predicates apply
 * identically no matter which path a facilitator takes. The bar keeps its
 * "actions, not buttons" argument; this menu is how a mouse reaches those
 * actions.
 */

const REACTION_ACTION = {
  thumbsUp: "sendReactionThumbsUp",
  love: "sendReactionLove",
  fire: "sendReactionFire",
  wow: "sendReactionWow",
  celebration: "sendReactionCelebration",
  wave: "sendReactionWave",
} as const;

type ActionMap = ReturnType<typeof useExcalidrawActionManager>["actions"];
type RegisteredAction = ActionMap[keyof ActionMap];

export const FacilitationMenu: React.FC<{
  readOnlyRole?: "viewer" | "commenter" | null;
}> = ({ readOnlyRole = null }) => {
  const actionManager = useExcalidrawActionManager();
  const [open, setOpen] = useState(false);
  const [revealMode, setRevealMode] = useState(() => getReveal(boardDoc).mode);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(
    () =>
      subscribeToFacilitation(boardDoc, () => {
        setRevealMode(getReveal(boardDoc).mode);
        refreshBoard();
      }),
    [],
  );

  // Click outside and Escape close the menu; Escape returns focus to the
  // trigger, matching the dock's keyboard contract.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const run = (name: string) => {
    const action = (
      actionManager.actions as unknown as Record<
        string,
        RegisteredAction | undefined
      >
    )[name];
    if (!action) {
      return;
    }
    setOpen(false);
    actionManager.executeAction(action, "commandPalette");
  };

  return (
    <div className="firo-facilitation-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="firo-collab-bar__btn firo-facilitation-menu__trigger"
        onClick={() => setOpen((value) => !value)}
        title="Facilitation tools"
        aria-label="Facilitation tools"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="facilitation-menu-trigger"
      >
        <SparklesIcon size={18} />
      </button>
      {open && (
        <div
          className="firo-facilitation-menu__popover"
          role="menu"
          aria-label="Facilitation tools"
          data-testid="facilitation-menu"
        >
          <div
            className="firo-facilitation-menu__reactions"
            role="group"
            aria-label="Reactions"
          >
            {REACTION_KINDS.map((entry) => (
              <button
                key={entry.kind}
                type="button"
                role="menuitem"
                className="firo-facilitation-menu__reaction"
                aria-label={entry.label}
                title={entry.label}
                data-testid={`facilitation-reaction-${entry.kind}`}
                onClick={() => run(REACTION_ACTION[entry.kind])}
              >
                <span aria-hidden="true">{entry.emoji}</span>
              </button>
            ))}
          </div>
          {!readOnlyRole && (
            <>
              <div className="firo-facilitation-menu__separator" />
              <button
                type="button"
                role="menuitem"
                className="firo-facilitation-menu__item"
                data-testid="facilitation-item-timer"
                onClick={() => run("setupFacilitatorTimer")}
              >
                <ClockIcon size={16} />
                <span>Timer...</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="firo-facilitation-menu__item"
                data-testid="facilitation-item-voting"
                onClick={() => run("openVotingPanel")}
              >
                <span
                  className="firo-facilitation-menu__dot"
                  aria-hidden="true"
                />
                <span>Voting</span>
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={revealMode === "private"}
                className="firo-facilitation-menu__item"
                data-testid="facilitation-item-private"
                onClick={() => run("toggleBoardReveal")}
              >
                <span
                  className={`firo-facilitation-menu__check ${
                    revealMode === "private"
                      ? "firo-facilitation-menu__check--on"
                      : ""
                  }`}
                  aria-hidden="true"
                >
                  {revealMode === "private" ? "✓" : ""}
                </span>
                <span>Private mode</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="firo-facilitation-menu__item"
                data-testid="facilitation-item-present"
                onClick={() => run("togglePresentation")}
              >
                <span
                  className="firo-facilitation-menu__play"
                  aria-hidden="true"
                >
                  ▶
                </span>
                <span>Presentation</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FacilitationMenu;
