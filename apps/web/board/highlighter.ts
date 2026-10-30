/**
 * The highlighter is a preset of the freedraw tool, not a new tool or element
 * (ADR-0031: a pen mode is a real tool or a preset of one). Entering it
 * overrides the *next stroke's* defaults (colour, width, opacity); leaving it
 * restores exactly what the ordinary pen had, so a user's own pen settings are
 * never silently replaced.
 */
export interface PenStyle {
  currentItemStrokeColor: string;
  currentItemStrokeWidthKey: "thin" | "medium" | "bold";
  currentItemOpacity: number;
}

export const HIGHLIGHTER_STYLE: PenStyle = {
  currentItemStrokeColor: "#ffd43b",
  currentItemStrokeWidthKey: "bold",
  currentItemOpacity: 45,
};

export const snapshotPenStyle = (state: PenStyle): PenStyle => ({
  currentItemStrokeColor: state.currentItemStrokeColor,
  currentItemStrokeWidthKey: state.currentItemStrokeWidthKey,
  currentItemOpacity: state.currentItemOpacity,
});

/**
 * Tracks the saved ordinary-pen style across enter/leave. `enter` saves only
 * the first time (re-entering while already active never saves the highlighter
 * style as if it were the user's pen); `leave` returns the saved style once.
 */
export const createHighlighterSession = () => {
  let saved: PenStyle | null = null;
  return {
    get active() {
      return saved !== null;
    },
    enter(current: PenStyle): PenStyle {
      if (!saved) {
        saved = snapshotPenStyle(current);
      }
      return HIGHLIGHTER_STYLE;
    },
    leave(): PenStyle | null {
      const out = saved;
      saved = null;
      return out;
    },
  };
};
