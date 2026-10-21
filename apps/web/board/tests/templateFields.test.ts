/*
 * The dialog field rules: small, and exactly the kind of thing that drifts
 * between the save dialog and the edit-details menu if each keeps its own
 * copy.
 */

import {
  parseTemplateTags,
  validateTemplateDescription,
  validateTemplateName,
} from "../templateFields";

describe("validateTemplateName", () => {
  it("trims and accepts a normal name", () => {
    expect(validateTemplateName("  Retro board  ")).toBe("Retro board");
  });
  it("rejects blank and overlong names", () => {
    expect(validateTemplateName("   ")).toBeNull();
    expect(validateTemplateName("x".repeat(81))).toBeNull();
    expect(validateTemplateName("x".repeat(80))).toBe("x".repeat(80));
  });
});

describe("validateTemplateDescription", () => {
  it("allows empty and up to 240 characters", () => {
    expect(validateTemplateDescription("")).toBe("");
    expect(validateTemplateDescription("x".repeat(240))).toBe("x".repeat(240));
    expect(validateTemplateDescription("x".repeat(241))).toBeNull();
  });
});

describe("parseTemplateTags", () => {
  it("parses, trims and ignores blanks", () => {
    expect(parseTemplateTags(" agile, retro,, ideas ")).toEqual({
      ok: true,
      tags: ["agile", "retro", "ideas"],
    });
  });
  it("deduplicates case-insensitively, keeping the first spelling", () => {
    expect(parseTemplateTags("Agile, agile, AGILE")).toEqual({
      ok: true,
      tags: ["Agile"],
    });
  });
  it("rejects a tag over 24 characters", () => {
    expect(parseTemplateTags(`ok, ${"x".repeat(25)}`)).toEqual({
      ok: false,
      reason: "tag-too-long",
    });
  });
  it("rejects more than 8 tags", () => {
    expect(parseTemplateTags("a,b,c,d,e,f,g,h,i")).toEqual({
      ok: false,
      reason: "too-many-tags",
    });
    expect(parseTemplateTags("a,b,c,d,e,f,g,h")).toEqual({
      ok: true,
      tags: ["a", "b", "c", "d", "e", "f", "g", "h"],
    });
  });
  it("accepts an empty field", () => {
    expect(parseTemplateTags("")).toEqual({ ok: true, tags: [] });
  });
});
