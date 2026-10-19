/**
 * Design tokens for the Firo chrome — the single source of truth.
 *
 * ## Why this file exists
 *
 * The Miro-style shell ([`docs/adr/0021`](../../../docs/adr/0021-miro-style-shell-and-clean-aesthetic.md))
 * introduces a surface with its own spacing, colour and motion logic. Without a
 * token layer that logic ends up as scattered literals across a dozen SCSS
 * files, which is how the inherited editor's theme got the way it is.
 *
 * ## How it is consumed
 *
 * - **TypeScript** imports the scales directly: `SPACE.md`, `Z_INDEX.rail`.
 * - **CSS** reads the custom properties declared in `theme.scss`. The map is
 *   exported as `THEME_VARIABLES` so `tests/tokens.test.ts` can assert the two
 *   agree: adding a token here without declaring its property there fails the
 *   test, and so does the reverse drift that matters (a value changed in one
 *   place and not the other).
 *
 * ## What this deliberately is not
 *
 * No vendor palette is reproduced. The values are ours, chosen for a clean
 * neutral surface with one accent. They are not derived from Miro's tokens, and
 * must not become so — see the clean-room guardrail in
 * [`docs/research/miro-ui.md`](../../../docs/research/miro-ui.md).
 *
 * ## Strict mode note
 *
 * `as const` throughout, so a token is a literal type and a typo is a compile
 * error rather than a string that happens to be unused.
 */

/** The prefix every custom property carries. Namespaced so it cannot collide with the editor's. */
export const CSS_PREFIX = "--firo-" as const;

/**
 * camelCase → kebab-case, for building property names from token keys.
 *
 * `panelRaised` becomes `panel-raised`, so the property reads
 * `--firo-color-panel-raised`.
 */
export const toCssName = (segment: string): string =>
  segment.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** A token value: either theme-independent, or a light/dark pair. */
export type ThemeValue =
  | string
  | { readonly light: string; readonly dark: string };

/**
 * Colour roles.
 *
 * Every role carries a light and a dark value in the same place, so a role
 * cannot exist in one theme and be forgotten in the other. The names describe a
 * *purpose* (`surface`, `panel`, `border`) rather than a hue, so a palette change
 * does not make the names lie.
 */
export const COLOR = {
  /** Behind the board; the largest field of colour on the screen. */
  surface: { light: "#f5f6f8", dark: "#151619" },
  /** Toolbars, the rail and the inspector. */
  panel: { light: "#ffffff", dark: "#212227" },
  /** Popovers and the floating selection toolbar, which sit above `panel`. */
  panelRaised: { light: "#ffffff", dark: "#292a30" },
  /** Hairline separators and control outlines. */
  border: { light: "#e4e5ea", dark: "#34363d" },
  /** Outlines that must stay visible against `panel`, e.g. an active control. */
  borderStrong: { light: "#c9cbd3", dark: "#454851" },
  /** Primary text. */
  text: { light: "#111318", dark: "#f2f3f7" },
  /** Secondary and disabled text. */
  textMuted: { light: "#5f6270", dark: "#9c9fab" },
  /** The one accent. Active tool, primary button, links. */
  accent: { light: "#5b4bff", dark: "#8f86ff" },
  /** Text and icons drawn on top of `accent`. */
  onAccent: { light: "#ffffff", dark: "#0d0e12" },
  /** The keyboard focus ring. Distinct from `accent` on purpose: focus must not be mistaken for selection. */
  focusRing: { light: "#0b7285", dark: "#4dd4e8" },
  /** The canvas selection outline. */
  selection: { light: "#5b4bff", dark: "#8f86ff" },
  /** The active tool's wash. Ours, not the reference's measured colour. */
  activeTool: {
    light: "rgba(91, 75, 255, 0.1)",
    dark: "rgba(143, 134, 255, 0.16)",
  },
  /** Quiet secondary buttons, e.g. present and share. Ours, not measured. */
  buttonSecondary: {
    light: "rgba(17, 19, 24, 0.05)",
    dark: "rgba(255, 255, 255, 0.06)",
  },
  danger: { light: "#d5253c", dark: "#ff7183" },
  success: { light: "#12794a", dark: "#4fd18e" },
  warning: { light: "#a35c00", dark: "#f2b04a" },
  /** The base shadow colour; elevations compose it. */
  shadow: { light: "rgba(15, 17, 26, 0.12)", dark: "rgba(0, 0, 0, 0.5)" },
} as const;

/** The 4 px spacing scale. Every gap in the chrome is one of these. */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Control geometry.
 *
 * `size` is the 40 × 40 cell measured across the rail, the bars and the
 * floating selection lane; `sizeSm` is the 32 px pill used by the avatar,
 * present and share controls. See
 * [`docs/adr/0034`](../../../docs/adr/0034-the-measured-geometry-as-tokens.md).
 */
export const CONTROL = {
  size: 40,
  sizeSm: 32,
} as const;

/** Shell bar heights. Both top bars and the floating selection bar are 48. */
export const BAR = {
  height: 48,
} as const;

/** The creation rail's container width. Its pitch is `CONTROL.size + SPACE.xs`. */
export const RAIL = {
  width: 48,
} as const;

/** Dock widths. `widthWide` is reserved for the voting dock. */
export const PANEL = {
  width: 340,
  widthWide: 380,
} as const;

/**
 * Menu geometry, in three systems.
 *
 * `separator` is the measured cost of a divider between item starts — the line
 * plus its margins — not a margin alone. These are the only nested tokens: the
 * three systems are only legible together.
 */
export const MENU = {
  app: { itemHeight: 40, pitch: 44, separator: 9 },
  create: { itemHeight: 40, pitch: 48 },
  canvas: { itemHeight: 32, pitch: 36, separator: 5 },
} as const;

/** Corner radii. `pill` is a sentinel large enough for any control height. */
export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

/** Type sizes for chrome text. Sizes are `px`, not `rem`, because the chrome is not content-resizable. */
export const FONT_SIZE = {
  xs: 11,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
} as const;

export const FONT_WEIGHT = {
  regular: "400",
  medium: "500",
  semibold: "600",
} as const;

/**
 * The chrome typeface stack.
 *
 * Plus Jakarta Sans is the decided face ([`docs/adr/0023`](../../../docs/adr/0023-open-icons-and-ui-typeface.md)),
 * OFL 1.1, not yet bundled at the time of writing — so the stack degrades to
 * Nunito (bundled for the canvas) and then to the system UI face. The first
 * entry is what a reader of this file should take as the intent.
 */
export const FONT_FAMILY_UI =
  '"Plus Jakarta Sans", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';

export const LINE_HEIGHT = {
  tight: "1.2",
  normal: "1.45",
} as const;

/**
 * Elevations, built from the `shadow` colour above.
 *
 * Two levels is deliberate. A chrome with four shadow depths reads as a
 * collection of widgets; two reads as one surface with things resting on it.
 */
export const ELEVATION = {
  /** Toolbars and the rail: a hint of separation from the canvas. */
  panel:
    "0 1px 2px var(--firo-color-shadow), 0 4px 12px var(--firo-color-shadow)",
  /** Popovers and the floating selection toolbar. */
  floating: "0 6px 20px var(--firo-color-shadow)",
} as const;

/** Transition durations and the one easing curve. */
export const MOTION = {
  fast: "120ms",
  base: "180ms",
  slow: "260ms",
  ease: "cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

/** Stacking order. Named so a value is never written twice with different meanings. */
export const Z_INDEX = {
  /** The creation rail and navigation toolbar. */
  rail: 3,
  /** The floating selection toolbar, above panel chrome. */
  selection: 5,
  /** The right-side inspector. */
  panel: 4,
  /** Menus and popovers. */
  menu: 6,
  /** Modal overlays. */
  overlay: 7,
} as const;

/* -------------------------------------------------------------------------
 * Derived: the CSS custom properties `theme.scss` must declare.
 * ---------------------------------------------------------------------- */

const withPrefix = (group: string, key: string) =>
  `${CSS_PREFIX}${group}-${toCssName(key)}`;

type PixelValue = number | Readonly<Record<string, number>>;
type PixelScale = Readonly<Record<string, PixelValue>>;

/** Flatten the one nested level the token contract allows into path keys. */
const flattenPixelScale = (
  scale: PixelScale,
): ReadonlyArray<readonly [string, number]> =>
  Object.entries(scale).flatMap(([key, value]) =>
    typeof value === "number"
      ? [[key, value] as const]
      : Object.entries(value).map(
          ([child, childValue]) => [`${key}-${child}`, childValue] as const,
        ),
  );

const pxGroup = (
  group: string,
  scale: PixelScale,
): Record<string, ThemeValue> =>
  Object.fromEntries(
    flattenPixelScale(scale).map(([key, value]) => [
      withPrefix(group, key),
      `${value}px`,
    ]),
  );

const plainGroup = (
  group: string,
  scale: Readonly<Record<string, string>>,
): Record<string, ThemeValue> =>
  Object.fromEntries(
    Object.entries(scale).map(([key, value]) => [
      withPrefix(group, key),
      value,
    ]),
  );

/** Numbers that carry no unit and must not gain one, e.g. a z-index. */
const unitlessGroup = (
  group: string,
  scale: Readonly<Record<string, number>>,
): Record<string, ThemeValue> =>
  Object.fromEntries(
    Object.entries(scale).map(([key, value]) => [
      withPrefix(group, key),
      String(value),
    ]),
  );

/**
 * Every custom property the theme declares, keyed by property name.
 *
 * The colour roles keep their `{ light, dark }` shape so the parity test can
 * assert both values are present — a colour that exists in one theme and not the
 * other is the exact failure this map exists to catch.
 */
export const THEME_VARIABLES: Readonly<Record<string, ThemeValue>> = {
  [`${CSS_PREFIX}font-ui`]: FONT_FAMILY_UI,
  ...Object.fromEntries(
    Object.entries(COLOR).map(([role, value]) => [
      withPrefix("color", role),
      value,
    ]),
  ),
  ...pxGroup("space", SPACE),
  ...pxGroup("control", CONTROL),
  ...pxGroup("bar", BAR),
  ...pxGroup("rail", RAIL),
  ...pxGroup("panel", PANEL),
  ...pxGroup("menu", MENU),
  ...pxGroup("radius", RADIUS),
  ...pxGroup("font-size", FONT_SIZE),
  ...plainGroup("font-weight", FONT_WEIGHT),
  ...plainGroup("line-height", LINE_HEIGHT),
  ...plainGroup("elevation", ELEVATION),
  ...plainGroup("motion", MOTION),
  ...unitlessGroup("z", Z_INDEX),
};

/** The property names, in declaration order. Convenience for consumers and tests. */
export const THEME_VARIABLE_NAMES = Object.keys(
  THEME_VARIABLES,
) as ReadonlyArray<string>;
