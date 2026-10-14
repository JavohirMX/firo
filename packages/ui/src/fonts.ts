/**
 * The chrome typeface: **Plus Jakarta Sans**, SIL OFL 1.1
 * ([ADR-0023](../../../docs/adr/0023-open-icons-and-ui-typeface.md),
 * [ADR-0024](../../../docs/adr/0024-the-chrome-font-lives-with-the-chrome.md)).
 *
 * Chrome text is UI labels at UI sizes, which is a different problem from
 * diagram labels at 12 px — so this face is deliberately *not* in
 * `FONT_METADATA`, not in the canvas font picker, and not reachable from
 * `DEFAULT_FONT_FAMILY`. The canvas default stays Nunito (ADR-0023 item 4).
 *
 * ## Why the faces are registered from TypeScript, not from a stylesheet
 *
 * The obvious version of this file is `@font-face` rules in SCSS with
 * `url("../fonts/…")`. It was written that way first, and a production build
 * disproved it: Vite only emits a font that is **imported as a module**, which
 * is why every canvas face is imported by `packages/editor/fonts/<Family>/index.ts`.
 * A `url()` written in a stylesheet reached through `@use` is left as a literal
 * relative path, the file is never copied into the build, and the CSS then points
 * at nothing. In dev it resolves and looks correct. The rules below are
 * registered through the `FontFace` API with the URLs the bundler actually
 * emitted, so dev and production agree by construction rather than by luck.
 *
 * ## The subsets
 *
 * Four, because a browser downloads only the subsets whose `unicode-range` a
 * rendered character needs. Both the files and their ranges are Google Fonts'
 * own, fetched from the stylesheet it serves to a browser UA. Re-fetch rather
 * than hand-editing if this face is ever updated:
 *
 *   curl -H 'User-Agent: <a Chrome UA>' \
 *     'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400..700&display=swap'
 *
 * ## Licence
 *
 * `OFL.txt` sits beside the binaries, and
 * `packages/common/tests/fonts.test.ts` fails if either is ever separated from
 * the other or left out of `FONT-LICENSES.md`.
 */

import cyrillicExt from "./fonts/PlusJakartaSans/PlusJakartaSans-cyrillic-ext.woff2";
import latinExt from "./fonts/PlusJakartaSans/PlusJakartaSans-latin-ext.woff2";
import latin from "./fonts/PlusJakartaSans/PlusJakartaSans-latin.woff2";
import vietnamese from "./fonts/PlusJakartaSans/PlusJakartaSans-vietnamese.woff2";

/** The family the chrome's CSS asks for, and the name `--firo-font-ui` leads with. */
export const CHROME_FONT_FAMILY = "Plus Jakarta Sans";

/**
 * The weights the subsets cover.
 *
 * They are variable fonts, so one face covers the whole range rather than one
 * face per weight — which is also why this is a range and not `"400"`.
 */
export const CHROME_FONT_WEIGHTS = "400 700";

export type ChromeFontSubset = {
  readonly uri: string;
  readonly unicodeRange: string;
};

/**
 * The four subsets, with the unicode ranges Google declares for them.
 *
 * Order is irrelevant to correctness — a browser picks by range and coverage,
 * not by position — so they are listed shortest-range-first, which is the order
 * the source stylesheet uses.
 */
export const CHROME_FONT_SUBSETS: readonly ChromeFontSubset[] = [
  {
    uri: cyrillicExt,
    unicodeRange:
      "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
  },
  {
    uri: vietnamese,
    unicodeRange:
      "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
  },
  {
    uri: latinExt,
    unicodeRange:
      "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
  },
  {
    uri: latin,
    unicodeRange:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  },
];

/**
 * One registration per document, not per module.
 *
 * `@firo/ui` is embeddable, and an embed has its own `Document`. Keying the
 * cache on the document makes a second embed register its own faces rather than
 * silently inheriting the first one's, and makes a re-render a no-op instead of
 * a second `FontFace` for every subset.
 *
 * A `WeakMap` because nothing else keeps a live reference to an unmounted
 * document, and a font registration must not be the thing that does.
 */
const registered = new WeakMap<Document, Promise<FontFace[]>>();

/**
 * Register the chrome's four subsets on `ownerDocument` and resolve once they
 * are ready to paint.
 *
 * Call this once before the chrome renders — a host that does not call it still
 * gets correct text via the `Nunito` fallback in `--firo-font-ui`, which is a
 * worse-looking board rather than a broken one.
 *
 * Rejects if the browser has no `FontFace` to register with, which is the
 * honest outcome for a non-browser context: there is nothing to draw with.
 */
export const loadChromeFonts = (
  ownerDocument: Document,
): Promise<FontFace[]> => {
  const existing = registered.get(ownerDocument);
  if (existing) {
    return existing;
  }

  const view = ownerDocument.defaultView;
  if (!view || typeof view.FontFace !== "function") {
    return Promise.reject(
      new Error(
        "loadChromeFonts needs a Document with a browsing context to register font faces",
      ),
    );
  }

  const pending = Promise.all(
    CHROME_FONT_SUBSETS.map(({ uri, unicodeRange }) => {
      const face = new view.FontFace(CHROME_FONT_FAMILY, `url(${uri})`, {
        style: "normal",
        weight: CHROME_FONT_WEIGHTS,
        unicodeRange,
        display: "swap",
      });

      ownerDocument.fonts.add(face);

      return face.load();
    }),
  ).catch((error) => {
    // Do not cache a failure: a subset that did not load is a subset that can
    // be retried, and caching the rejection would make one bad response
    // permanent for the life of the document.
    registered.delete(ownerDocument);
    throw error;
  });

  registered.set(ownerDocument, pending);

  return pending;
};
