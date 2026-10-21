import { describe, expect, it } from "vitest";

import { changedDocBlockIds } from "../docContentSync";

describe("changedDocBlockIds", () => {
  it("reports blocks whose content changed", () => {
    const seen = new Map([
      ["a", "x"],
      ["b", "y"],
    ]);
    const next = new Map([
      ["a", "x"],
      ["b", "z"],
    ]);
    expect([...changedDocBlockIds(seen, next, null)]).toEqual(["b"]);
    expect(seen.get("b")).toBe("z");
  });

  it("reports a newly arrived block", () => {
    const seen = new Map<string, string>();
    expect([...changedDocBlockIds(seen, new Map([["n", "{}"]]), null)]).toEqual(
      ["n"],
    );
  });

  it("reports nothing when content is unchanged", () => {
    const seen = new Map([["a", "x"]]);
    expect(changedDocBlockIds(seen, new Map([["a", "x"]]), null).size).toBe(0);
  });

  it("excludes the locally edited block but still records its content", () => {
    const seen = new Map([["a", "x"]]);
    const out = changedDocBlockIds(seen, new Map([["a", "y"]]), "a");
    expect(out.size).toBe(0);
    expect(seen.get("a")).toBe("y");
  });
});
