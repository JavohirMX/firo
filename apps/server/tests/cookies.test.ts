import { describe, expect, it } from "vitest";

import { parseCookies, parseSessionToken } from "../src/auth/session.js";

describe("Cookie parsing", () => {
  it("ignores malformed values without losing valid cookies", () => {
    expect(parseCookies("broken=%; firo_session=valid; invalid=%FF")).toEqual({
      firo_session: "valid",
    });
    expect(parseSessionToken({ cookie: "broken=%; firo_session=valid" })).toBe(
      "valid",
    );
  });

  it("does not authenticate a malformed session cookie", () => {
    expect(parseSessionToken({ cookie: "firo_session=%FF" })).toBeNull();
  });

  it("keeps valid encoded values and ignores cookies without equals", () => {
    expect(parseCookies("ignored; name=hello%20world; empty=")).toEqual({
      name: "hello world",
      empty: "",
    });
  });

  it("does not inherit a session from the object prototype", () => {
    expect(parseSessionToken({ cookie: "__proto__=value" })).toBeNull();
  });
});
