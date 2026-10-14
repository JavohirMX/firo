import * as common from "@firo/common";

import { API } from "@firo/editor/tests/helpers/api";

import { newElement, newLinearElement } from "../src/newElement";
import { mutateElement, newElementWith } from "../src/mutateElement";

describe("element creation time", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    "rectangle",
    "diamond",
    "ellipse",
    "text",
    "line",
    "arrow",
    "freedraw",
    "image",
    "frame",
    "magicframe",
    "embeddable",
    "iframe",
  ] as const)("initializes a new %s before any capture", (type) => {
    vi.spyOn(common, "getUpdatedTimestamp").mockReturnValue(123);
    const element = API.createElement({ type });
    expect(element.created).toBe(123);

    vi.mocked(common.getUpdatedTimestamp).mockReturnValue(456);
    const edited = newElementWith(element, { x: 50 });
    mutateElement(edited, new Map(), { y: 50 });

    expect(edited).toMatchObject({ created: 123, updated: 456 });
  });

  it.each([123, 0, null])(
    "preserves explicit created=%s when reconstructing the same element",
    (created) => {
      const original = newElement({
        type: "rectangle",
        x: 0,
        y: 0,
        created,
      });
      const converted = newLinearElement({ ...original, type: "line" });

      expect(converted).toMatchObject({ id: original.id, created });
    },
  );
});

describe("the roughness a new element is born with", () => {
  /*
   * ADR-0021 makes the canvas clean by default. That decision is only real if
   * it reaches the element constructors, because they are what a drawn shape
   * goes through -- `DEFAULT_ELEMENT_PROPS.roughness` being 0 while these
   * defaulted to `ROUGHNESS.artist` would leave the canvas exactly as sketchy
   * as before, with the constant test in `@firo/common` still green.
   */

  it.each(["rectangle", "diamond", "ellipse"] as const)(
    "is clean for a new %s",
    (type) => {
      expect(newElement({ type, x: 0, y: 0 }).roughness).toBe(
        common.ROUGHNESS.architect,
      );
    },
  );

  it("is clean for a new line", () => {
    expect(newLinearElement({ type: "line", x: 0, y: 0 }).roughness).toBe(
      common.ROUGHNESS.architect,
    );
  });

  it("is clean for a new arrow", () => {
    expect(newLinearElement({ type: "arrow", x: 0, y: 0 }).roughness).toBe(
      common.ROUGHNESS.architect,
    );
  });

  it("still honours an explicit roughness", () => {
    // The hand-drawn styles have to keep working per element: the default is a
    // starting point, not an override (ADR-0021 leaves the option in place).
    for (const roughness of [
      common.ROUGHNESS.artist,
      common.ROUGHNESS.cartoonist,
      common.ROUGHNESS.architect,
    ]) {
      expect(
        newElement({ type: "rectangle", x: 0, y: 0, roughness }).roughness,
      ).toBe(roughness);
    }
  });
});
