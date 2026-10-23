import {
  REDUCED_MOTION_CLASS,
  applyReducedMotion,
  readReducedMotion,
  writeReducedMotion,
} from "../reducedMotion";

/*
 * The per-session reduced-motion setting (docs/trd/09-accessibility.md: a
 * setting, not only a media query; per session, not per machine).
 *
 * What is worth protecting:
 *
 * 1. **Session scope.** The value lives in sessionStorage: it survives a
 *    reload within the tab and is gone when the tab closes.
 * 2. **Storage can be unavailable.** Private mode and blocked origins throw
 *    on access; a preference that cannot be read or written must never fail
 *    a render.
 * 3. **The class is the contract.** `@firo/ui`'s theme.scss styles
 *    `firo-reduced-motion` beside the media query it mirrors; the host only
 *    toggles that one class on the document element.
 */

beforeEach(() => {
  window.sessionStorage.clear();
  document.documentElement.classList.remove(REDUCED_MOTION_CLASS);
});

describe("readReducedMotion / writeReducedMotion", () => {
  it("is off when nothing is stored", () => {
    expect(readReducedMotion()).toBe(false);
  });

  it("round-trips on within the session", () => {
    writeReducedMotion(true);
    expect(readReducedMotion()).toBe(true);
  });

  it("turning it off removes the key rather than storing a zero", () => {
    writeReducedMotion(true);
    writeReducedMotion(false);
    expect(readReducedMotion()).toBe(false);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("reads anything but the stored one as off", () => {
    window.sessionStorage.setItem("firo.session.reducedMotion", "yes-please");
    expect(readReducedMotion()).toBe(false);
  });

  // jsdom hands out a fresh Storage per access, so a spy on its methods
  // never intercepts; poisoning the accessor itself is the honest throw.
  const withThrowingStorage = (run: () => void) => {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
    try {
      run();
    } finally {
      if (original) {
        Object.defineProperty(window, "sessionStorage", original);
      }
    }
  };

  it("reads as off when storage itself throws", () => {
    withThrowingStorage(() => {
      expect(readReducedMotion()).toBe(false);
    });
  });

  it("stays silent when the write is refused", () => {
    withThrowingStorage(() => {
      expect(() => writeReducedMotion(true)).not.toThrow();
    });
  });
});

describe("applyReducedMotion", () => {
  it("toggles exactly the reduced-motion class on the document element", () => {
    applyReducedMotion(true);
    expect(
      document.documentElement.classList.contains(REDUCED_MOTION_CLASS),
    ).toBe(true);
    applyReducedMotion(false);
    expect(
      document.documentElement.classList.contains(REDUCED_MOTION_CLASS),
    ).toBe(false);
  });

  it("applies to the document it is given, not the global one", () => {
    const other = document.implementation.createHTMLDocument("other");
    applyReducedMotion(true, other);
    expect(other.documentElement.classList.contains(REDUCED_MOTION_CLASS)).toBe(
      true,
    );
    expect(
      document.documentElement.classList.contains(REDUCED_MOTION_CLASS),
    ).toBe(false);
  });
});
