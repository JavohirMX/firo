import { describe, expect, it, vi } from "vitest";

import {
  CHROME_FONT_FAMILY,
  CHROME_FONT_SUBSETS,
  CHROME_FONT_WEIGHTS,
  loadChromeFonts,
} from "../src/fonts";

/*
 * The chrome typeface is bundled, so its licence is stated and its gate passes
 * (`packages/common/tests/fonts.test.ts`). What these test is the half a licence
 * gate cannot see: that the faces are *registered*, against the URLs the bundler
 * emitted, and that registering them twice is a no-op.
 *
 * The `@font-face` registration runs against a stub document rather than jsdom's.
 * jsdom's `FontFace` cannot be replaced (`window.FontFace` is non-writable and
 * non-configurable) and its `load()` rejects, so a test that used the real global
 * could only assert the failure path. That the loader works against a real
 * browser was verified on the production build instead: all four subsets fetched
 * with 200, four faces registered, `document.fonts.check()` true — see the
 * verification notes in `docs/plans/phase-7-5-miro-ui.md`.
 */

type Construction = {
  family: string;
  source: string;
  descriptors: FontFaceDescriptors;
};

const makeDocumentStub = ({ loadRejects = false } = {}) => {
  const constructed: Construction[] = [];
  const added: unknown[] = [];

  class FontFaceStub {
    public readonly family: string;
    public readonly source: string;
    public readonly descriptors: FontFaceDescriptors;
    public status = "unloaded";

    constructor(
      family: string,
      source: string,
      descriptors?: FontFaceDescriptors,
    ) {
      this.family = family;
      this.source = source;
      this.descriptors = descriptors ?? {};
      constructed.push({ family, source, descriptors: this.descriptors });
    }

    public load() {
      if (loadRejects) {
        return Promise.reject(new Error("subset unreachable"));
      }
      this.status = "loaded";
      return Promise.resolve(this);
    }
  }

  const fonts = {
    add: vi.fn((face: unknown) => added.push(face)),
  };

  const ownerDocument = {
    defaultView: { FontFace: FontFaceStub },
    fonts,
  } as unknown as Document;

  return { ownerDocument, constructed, added, fonts };
};

describe("the chrome typeface's subsets", () => {
  it("ships four subsets, one per Google Fonts range", () => {
    // A dropped subset is a language the chrome cannot render in its own face,
    // and it is invisible in an English-only screenshot.
    expect(CHROME_FONT_SUBSETS).toHaveLength(4);
  });

  it("names the family the theme's stack leads with", () => {
    expect(CHROME_FONT_FAMILY).toBe("Plus Jakarta Sans");
    // The subsets are variable fonts, so one face covers the range.
    expect(CHROME_FONT_WEIGHTS).toBe("400 700");
  });

  it("has a well-formed unicode range on every subset", () => {
    /*
     * A range is the one part of this file that is copied by hand from Google's
     * stylesheet, and a typo in it does not throw: the face simply never matches
     * some characters. `U+AF-01B0` instead of `U+01AF-01B0` was written once
     * while adding this file, which is why the assertion is on the shape of the
     * whole string rather than on the presence of a few ranges.
     */
    for (const { uri, unicodeRange } of CHROME_FONT_SUBSETS) {
      expect(uri).toMatch(/\.woff2$/);
      expect(unicodeRange).toMatch(
        /^U\+[0-9A-F]+(-[0-9A-F]+)?(, U\+[0-9A-F]+(-[0-9A-F]+)?)*$/,
      );

      for (const range of unicodeRange.split(", ")) {
        const [start, end] = range.replace("U+", "").split("-");
        if (end !== undefined) {
          // An inverted range is accepted by the CSS parser and matches nothing.
          expect(parseInt(start, 16)).toBeLessThan(parseInt(end, 16));
        }
      }
    }
  });

  it("gives every subset a distinct range", () => {
    const ranges = CHROME_FONT_SUBSETS.map((s) => s.unicodeRange);
    expect(new Set(ranges).size).toBe(ranges.length);
  });
});

describe("loadChromeFonts", () => {
  it("registers a face per subset, with the emitted urls", async () => {
    const stub = makeDocumentStub();

    const faces = await loadChromeFonts(stub.ownerDocument);

    expect(faces).toHaveLength(CHROME_FONT_SUBSETS.length);
    expect(stub.fonts.add).toHaveBeenCalledTimes(CHROME_FONT_SUBSETS.length);
    expect(stub.added).toHaveLength(CHROME_FONT_SUBSETS.length);

    for (const [
      index,
      { family, source, descriptors },
    ] of stub.constructed.entries()) {
      expect(family).toBe(CHROME_FONT_FAMILY);
      // The url the bundler emitted, not a path written by hand: this is the
      // assertion that would have caught the stylesheet version of this file.
      expect(source).toBe(`url(${CHROME_FONT_SUBSETS[index].uri})`);
      expect(descriptors.weight).toBe(CHROME_FONT_WEIGHTS);
      expect(descriptors.display).toBe("swap");
      expect(descriptors.unicodeRange).toBe(
        CHROME_FONT_SUBSETS[index].unicodeRange,
      );
    }
  });

  it("resolves to the loaded faces, not the pending ones", async () => {
    const stub = makeDocumentStub();
    const faces = await loadChromeFonts(stub.ownerDocument);
    for (const face of faces) {
      expect(face.status).toBe("loaded");
    }
  });

  it("is a no-op the second time for the same document", async () => {
    /*
     * The chrome mounts, unmounts and remounts — a theme toggle, a route change,
     * React StrictMode in development. Registering four more faces on each one
     * would grow `document.fonts` for the life of the page, so idempotence is a
     * behaviour and not an optimisation.
     */
    const stub = makeDocumentStub();

    const first = loadChromeFonts(stub.ownerDocument);
    const second = loadChromeFonts(stub.ownerDocument);

    expect(second).toBe(first);
    await first;
    expect(stub.fonts.add).toHaveBeenCalledTimes(CHROME_FONT_SUBSETS.length);
  });

  it("registers per document, so a second embed is not left with no faces", async () => {
    // An embedded editor has its own document. Sharing one registration across
    // both would give the second embed a font it never registered.
    const first = makeDocumentStub();
    const second = makeDocumentStub();

    await loadChromeFonts(first.ownerDocument);
    await loadChromeFonts(second.ownerDocument);

    expect(first.fonts.add).toHaveBeenCalledTimes(CHROME_FONT_SUBSETS.length);
    expect(second.fonts.add).toHaveBeenCalledTimes(CHROME_FONT_SUBSETS.length);
  });

  it("does not cache a failure", async () => {
    /*
     * One unreachable subset must not make the face permanently unavailable for
     * the rest of the session: a reloaded URL, a flaky network or a cold cache
     * should all be able to succeed on the next call.
     */
    const stub = makeDocumentStub({ loadRejects: true });

    await expect(loadChromeFonts(stub.ownerDocument)).rejects.toThrow(
      "subset unreachable",
    );
    await expect(loadChromeFonts(stub.ownerDocument)).rejects.toThrow(
      "subset unreachable",
    );

    // Two attempts, not one cached rejection.
    expect(stub.fonts.add).toHaveBeenCalledTimes(
      2 * CHROME_FONT_SUBSETS.length,
    );
  });

  it("rejects rather than throwing when there is no browsing context", async () => {
    // A non-DOM context has nothing to draw with, and saying so beats returning
    // an empty array that reads as success.
    const detached = { defaultView: null } as unknown as Document;
    await expect(loadChromeFonts(detached)).rejects.toThrow(/browsing context/);
  });
});
