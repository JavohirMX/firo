import React, { useEffect, useMemo, useState } from "react";
import { useFocusTrap } from "@firo/editor";
import { TIMER_PRESETS } from "@firo/facilitation";

import { getTimer, timerControls } from "../board/facilitator";
import { boardDoc } from "../board/board";

import "./TimerSetupDialog.scss";

export interface TimerSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** The stepper's bounds, in whole minutes. */
const MIN_MINUTES = 1;
const MAX_MINUTES = 99;

const clampMinutes = (value: number): number =>
  Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(value)));

/**
 * The timer's setup dialog: how long, then Start.
 *
 * Parity matrix row 34. Miro's popover also offers music; that row is
 * deliberately omitted here (licensed audio — the matrix records the call).
 *
 * ## Why this is a dialog and not controls on the FacilitatorBar
 *
 * `FacilitatorBar.tsx` argues at length that the bar is a readout and carries
 * no controls, because a chip with buttons would be a second, mouse-only path
 * that drifts from the keyboard path. This dialog is opened *by* an action
 * (`setupFacilitatorTimer`, palette-reachable), so the keyboard path stays
 * primary and the bar stays a clock.
 *
 * ## What Start does to a running timer
 *
 * Starting from here sets the duration and restarts from full length. That is
 * the facilitator's meaning of "set up a timer" mid-exercise — "the next
 * block is ten minutes" — and it is the same state machine `Alt+T` drives,
 * so the two paths cannot disagree about what "running" means.
 */
export const TimerSetupDialog: React.FC<TimerSetupDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);

  // The duration the room will get, in minutes. Seeds from the current
  // timer's setting so reopening the dialog shows what is already chosen,
  // not a fixed five.
  const seedMinutes = (): number => {
    const current = getTimer(boardDoc);
    if (current && Number.isFinite(current.durationMs)) {
      return clampMinutes(current.durationMs / 60_000);
    }
    return 5;
  };
  const [minutes, setMinutes] = useState<number>(5);
  const [custom, setCustom] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setMinutes(seedMinutes());
      setCustom("");
    }
    // Seeding is a one-time event per open; the seed reads the live document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const presets = useMemo(
    () =>
      Object.entries(TIMER_PRESETS).map(([label, ms]) => ({
        label,
        minutes: Math.round(ms / 60_000),
      })),
    [],
  );

  const start = () => {
    const controls = timerControls(boardDoc);
    controls.setDurationMs(minutes * 60_000);
    controls.start();
    onCloseRef.current();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="firo-timer-setup__overlay"
      onClick={onClose}
      data-testid="timer-setup-overlay"
    >
      <div
        ref={focusTrapRef}
        className="firo-timer-setup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="timer-setup-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="timer-setup-dialog"
      >
        <h2 id="timer-setup-title" className="firo-timer-setup__title">
          Set up timer
        </h2>

        <div
          className="firo-timer-setup__presets"
          role="group"
          aria-label="Preset durations"
        >
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`firo-timer-setup__preset${
                minutes === preset.minutes && custom === ""
                  ? " firo-timer-setup__preset--active"
                  : ""
              }`}
              aria-pressed={minutes === preset.minutes && custom === ""}
              onClick={() => {
                setMinutes(preset.minutes);
                setCustom("");
              }}
              data-testid={`timer-preset-${preset.label}`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="firo-timer-setup__custom">
          <button
            type="button"
            className="firo-timer-setup__step"
            aria-label="One minute less"
            onClick={() => {
              setMinutes((m) => clampMinutes(m - 1));
              setCustom("");
            }}
            data-testid="timer-step-down"
          >
            −
          </button>
          <label className="firo-timer-setup__custom-label">
            <span className="firo-timer-setup__custom-text">Minutes</span>
            <input
              className="firo-timer-setup__input"
              type="number"
              inputMode="numeric"
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              value={custom === "" ? String(minutes) : custom}
              onChange={(event) => {
                const raw = event.target.value;
                setCustom(raw);
                const parsed = Number.parseInt(raw, 10);
                if (Number.isFinite(parsed)) {
                  setMinutes(clampMinutes(parsed));
                }
              }}
              onBlur={() => setCustom("")}
              data-testid="timer-custom-minutes"
            />
          </label>
          <button
            type="button"
            className="firo-timer-setup__step"
            aria-label="One minute more"
            onClick={() => {
              setMinutes((m) => clampMinutes(m + 1));
              setCustom("");
            }}
            data-testid="timer-step-up"
          >
            +
          </button>
        </div>

        <button
          type="button"
          className="firo-timer-setup__start"
          onClick={start}
          data-testid="timer-setup-start"
        >
          Start {minutes} minute{minutes === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
};

export default TimerSetupDialog;
