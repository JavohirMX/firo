/*
 * Reading the route out of the URL.
 *
 * Small and pure, which is why the decision was pulled out of `Root.tsx` and
 * given a name: the thing that must be right — "does this URL mean the home, a
 * board, or 'resume the last one'?" — should be checkable without mounting the
 * app or reading storage.
 */
import { describe, expect, it } from "vitest";

import { boardUrl, homeUrl, readRoute } from "../routes";

describe("readRoute", () => {
  it("reads a board id", () => {
    expect(readRoute("?board=abc")).toEqual({ kind: "board", id: "abc" });
  });

  it("decodes a board id", () => {
    expect(readRoute("?board=a%2Fb")).toEqual({ kind: "board", id: "a/b" });
  });

  it("reads the home", () => {
    expect(readRoute("?home=1")).toEqual({ kind: "home" });
  });

  it("lets the home win when both are present", () => {
    // The home has to be reachable from a board, and the board menu's link is
    // the only way there. If `?board` won, that link could never work.
    expect(readRoute("?board=abc&home=1")).toEqual({ kind: "home" });
  });

  it("returns null when the URL names neither", () => {
    expect(readRoute("")).toBeNull();
    expect(readRoute("?other=1")).toBeNull();
  });
});

describe("URL builders", () => {
  it("builds a board URL against the given base", () => {
    expect(boardUrl("abc", "/")).toBe("/?board=abc");
  });

  it("encodes an id that needs it", () => {
    expect(boardUrl("a/b", "/")).toBe("/?board=a%2Fb");
  });

  it("builds the home URL", () => {
    expect(homeUrl("/")).toBe("/?home=1");
  });
});
