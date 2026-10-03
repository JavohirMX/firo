/**
 * The faces under test, and where each one came from.
 *
 * ## Why this list is not the font picker
 *
 * These are *measurement inputs*, not product fonts. None of them is registered
 * in `FONT_METADATA`, none is selectable, and nothing in `packages/` imports
 * them. ADR-0014 defers the pick until the measurement exists, and the pick
 * needs sign-off; this file is an input to the measurement, not its conclusion.
 *
 * `Nunito` is the control. It is the current `DEFAULT_FONT_FAMILY`, so a
 * candidate that cannot beat it is not a candidate.
 *
 * ## Why the binaries live under `scripts/`
 *
 * ADR-0013 requirement 3 -- legibility at 12 px -- cannot be answered without
 * the actual outlines, and ADR-0013 requirement 4 forbids answering it on
 * paper. So the faces have to be here.
 *
 * `AGENTS.md` permits a font binary in the tree exactly when its licence has
 * been verified and recorded in `FONT-LICENSES.md` with the licence text
 * committed alongside. Every face below meets that: OFL 1.1, licence text
 * retrieved from the foundry's own repository, licence file written next to
 * the binary, and `fonts.test.ts` fails if a pair is separated.
 *
 * They sit in `scripts/` rather than `packages/editor/fonts/` because they are
 * not shipped. `packages/editor/fonts/` is what ends up in a user's browser;
 * this is what ends up in a screenshot.
 *
 * ## Why `Nunito` is re-downloaded instead of read from `packages/`
 *
 * The shipped copy is five unicode-range subsets of one face. The lab needs a
 * single file it can set as a whole `font-family`, and comparing a subsetted
 * webfont against loose TTFs would compare the subsetter as much as the faces.
 * The OFL text is byte-identical to the one now committed at
 * `packages/editor/fonts/Nunito/OFL.txt`, which `fonts.test.ts` asserts.
 */

export type Face = {
  /** Stable slug, used for file names. */
  id: string;
  /** Name to show a person. */
  label: string;
  /** The `font-family` name the page registers. */
  cssFamily: string;
  /** Binary, relative to `scripts/font-lab`. */
  file: string;
  /** Licence text, relative to `scripts/font-lab`. */
  licence: string;
  /** Upstream repository the binary and licence came from. */
  source: string;
  /** Whether this is the incumbent default or a candidate to replace it. */
  role: "control" | "candidate";
};

const GF = "https://github.com/google/fonts/tree/main/ofl";

export const FACES: readonly Face[] = [
  {
    id: "nunito",
    label: "Nunito",
    cssFamily: "FiroLab Nunito",
    file: "fonts/Nunito-Regular.ttf",
    licence: "fonts/Nunito-OFL.txt",
    source: `${GF}/nunito`,
    role: "control",
  },
  {
    id: "caveat",
    label: "Caveat",
    cssFamily: "FiroLab Caveat",
    file: "fonts/Caveat-Variable.ttf",
    licence: "fonts/Caveat-OFL.txt",
    source: `${GF}/caveat`,
    role: "candidate",
  },
  {
    id: "kalam",
    label: "Kalam",
    cssFamily: "FiroLab Kalam",
    file: "fonts/Kalam-Regular.ttf",
    licence: "fonts/Kalam-OFL.txt",
    source: `${GF}/kalam`,
    role: "candidate",
  },
  {
    id: "patrick-hand",
    label: "Patrick Hand",
    cssFamily: "FiroLab PatrickHand",
    file: "fonts/PatrickHand-Regular.ttf",
    licence: "fonts/PatrickHand-OFL.txt",
    source: `${GF}/patrickhand`,
    role: "candidate",
  },
  {
    id: "shadows-into-light",
    label: "Shadows Into Light",
    cssFamily: "FiroLab ShadowsIntoLight",
    file: "fonts/ShadowsIntoLight-Regular.ttf",
    licence: "fonts/ShadowsIntoLight-OFL.txt",
    source: `${GF}/shadowsintolight`,
    role: "candidate",
  },
  {
    id: "architects-daughter",
    label: "Architects Daughter",
    cssFamily: "FiroLab ArchitectsDaughter",
    file: "fonts/ArchitectsDaughter-Regular.ttf",
    licence: "fonts/ArchitectsDaughter-OFL.txt",
    source: `${GF}/architectsdaughter`,
    role: "candidate",
  },
  {
    id: "comic-neue",
    label: "Comic Neue",
    cssFamily: "FiroLab ComicNeue",
    file: "fonts/ComicNeue-Regular.ttf",
    licence: "fonts/ComicNeue-OFL.txt",
    source: `${GF}/comicneue`,
    role: "candidate",
  },
];

/** The face every candidate has to beat. */
export const CONTROL = FACES.find((face) => face.role === "control") as Face;

/**
 * Labels, chosen as the kinds of short text that actually appear on a board.
 *
 * ADR-0013 requirement 3 says "diagram labels are 12-16 px". These are the
 * shapes those labels take: a title, a phrase, a bare noun, a measurement, and
 * one deliberately awkward case.
 *
 * The awkward case is `gjqy 18%`. It has a descender, an ascender, two
 * diagonals, and a percent sign whose counters are the first thing to fill in at
 * 12 px. A face that reads the other four and loses this one is not a label
 * face.
 */
export const LABELS: readonly { id: string; kind: string; text: string }[] = [
  { id: "heading", kind: "heading", text: "Architecture review" },
  { id: "phrase", kind: "five-word phrase", text: "Sync engine retry budget" },
  { id: "word", kind: "single word", text: "Queue" },
  { id: "number", kind: "numeric label", text: "42.5 ms" },
  { id: "hard", kind: "diagonals + counters", text: "gjqy 18%" },
];

/** Canvas themes, matching the app's own defaults. */
export const THEMES = [
  // `COLOR_PALETTE.black` on `COLOR_PALETTE.white`, packages/common/src/colors.ts
  { id: "light", background: "#ffffff", ink: "#1e1e1e" },
  // `.theme--dark --default-bg-color`, packages/editor/css/theme.scss:198
  { id: "dark", background: "#121212", ink: "#ffffff" },
] as const;

/** Zoom levels. 0.5 is where small text fails first, so it is not optional. */
export const ZOOMS: readonly number[] = [1, 0.5];

/**
 * The size under test, in CSS px at 100% zoom.
 *
 * The bottom of ADR-0013 requirement 3's range, because it is the one that
 * discriminates. If a face passes 16 px and fails 12 px it is a heading face,
 * which is a different job from a label face.
 */
export const FONT_SIZE = 12;

/**
 * Reference scale for the fidelity metrics: the face drawn 16x and averaged
 * back down.
 *
 * 16x because at 12 px a glyph is 12 rows tall and a 16x reference has 192 --
 * enough that the downsample average is not itself quantisation noise. Larger
 * costs memory for no gain in the ratio's stability.
 */
export const REFERENCE_SCALE = 16;
