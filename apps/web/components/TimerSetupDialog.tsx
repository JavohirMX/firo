import React, { useEffect, useMemo, useState } from "react";

import {
  TIMER_PRESETS,
  formatRemaining,
  remainingMs,
} from "@firo/facilitation";

import { mayChangeSession } from "../board/sharedSession";
import { canDriveSession } from "../board/facilitator";

import {
  getTimer,
  timerControls,
  subscribeToFacilitation,
} from "../board/facilitator";
import { boardDoc } from "../board/board";

import "./TimerSetupDialog.scss";

export interface TimerSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** The stepper's bounds, in whole minutes. */
const MIN_MINUTES = 1;
const MAX_MINUTES = 60;

const clampMinutes = (value: number): number =>
  Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(value)));

/** ADR-0039: a non-modal, menu-anchored setup popover, never a scrim. */
export const TimerSetupDialog: React.FC<TimerSetupDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 64, left: 8 });
  const [timer, setTimer] = useState(() => getTimer(boardDoc));
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const update = () => {
      setTimer(getTimer(boardDoc));
      setNow(Date.now());
    };
    update();
    const unsubscribe = subscribeToFacilitation(boardDoc, update);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      unsubscribe();
      window.clearInterval(tick);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const place = () => {
      const trigger = document.querySelector(
        '[data-testid="facilitation-menu-trigger"]',
      );
      const rect = trigger?.getBoundingClientRect();
      const top = Math.max(
        8,
        Math.min(
          (rect?.bottom ?? 56) + 8,
          window.innerHeight - (rootRef.current?.offsetHeight ?? 400) - 8,
        ),
      );
      const left = Math.max(
        8,
        Math.min(
          rect?.left ?? window.innerWidth - 288,
          window.innerWidth - 288,
        ),
      );
      setPosition({ top, left });
    };
    place();
    closeRef.current?.focus();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [isOpen]);

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
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        document
          .querySelector<HTMLButtonElement>(
            '[data-testid="facilitation-menu-trigger"]',
          )
          ?.focus();
      }
    };
    const onOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onCloseRef.current();
      }
    };
    document.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", onOutside, true);
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
      ref={rootRef}
      style={position}
      className="firo-timer-setup"
      role="dialog"
      aria-modal="false"
      aria-labelledby="timer-setup-title"
      onClick={(e) => e.stopPropagation()}
      data-testid="timer-setup-dialog"
    >
      <div className="firo-timer-setup__header">
        <h2 id="timer-setup-title" className="firo-timer-setup__title">
          Timer
        </h2>
        <button
          ref={closeRef}
          type="button"
          className="firo-timer-setup__close"
          aria-label="Close timer"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {!mayChangeSession(boardDoc) && (
        <p>Another facilitator is driving this session.</p>
      )}
      <fieldset
        disabled={!canDriveSession() || !mayChangeSession(boardDoc)}
        style={{
          border: 0,
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {timer && (
          <div className="firo-timer-setup__running">
            <output aria-label="Time remaining">
              {formatRemaining(remainingMs(timer, now))}
            </output>
            <button
              type="button"
              onClick={() =>
                timer.startedAt === null
                  ? timerControls(boardDoc).start()
                  : timerControls(boardDoc).pause()
              }
            >
              {timer.startedAt === null ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => timerControls(boardDoc).reset()}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => timerControls(boardDoc).addMinute()}
            >
              Add minute
            </button>
          </div>
        )}

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
      </fieldset>
    </div>
  );
};

export default TimerSetupDialog;
