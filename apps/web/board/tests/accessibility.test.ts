import type { ExcalidrawElement } from "@firo/element/types";

import { toAccessibilityItems, toElementsMap } from "../accessibility";

/*
 * The host's half of the accessibility tree: what a screen reader hears for
 * each element. `@firo/ui` owns the tree; this module owns the mapping, and
 * every choice here is one a blind user hears:
 *
 * 1. **A container's text is its bound label element**, not its own missing
 *    `text` -- reading the field would announce every sticky note as empty.
 * 2. **A bound label is not announced twice.** It is skipped as its own
 *    item and read as the container's text.
 * 3. **Colours are spoken as names** from the app's two palettes, case-
 *    insensitively; `transparent` is the absence of a fill, not a colour.
 * 4. **Reading order is scene order**, the order the elements are drawn in.
 */

const element = (
  id: string,
  type: string,
  extra: Record<string, unknown> = {},
): ExcalidrawElement =>
  ({
    id,
    type,
    backgroundColor: "transparent",
    locked: false,
    ...extra,
  } as unknown as ExcalidrawElement);

describe("toAccessibilityItems", () => {
  it("reads a free-standing text element's own text", () => {
    const items = toAccessibilityItems(
      [element("t1", "text", { text: "Hello there" })],
      new Map(),
    );
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("Hello there");
  });

  it("reads a container's label from its bound text element, announced once", () => {
    const note = element("n1", "stickynote", {
      backgroundColor: "#FFF9B1",
      boundElements: [{ id: "t1", type: "text" }],
    });
    const label = element("t1", "text", {
      text: "Write the RFC",
      containerId: "n1",
    });
    const elements = [note, label];
    const items = toAccessibilityItems(elements, toElementsMap(elements));
    // The TRD's own example: "Sticky note: Write the RFC. Yellow."
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("n1");
    expect(items[0].kind).toBe("Sticky note");
    expect(items[0].text).toBe("Write the RFC");
    expect(items[0].colorName).toBe("Yellow");
  });

  it("reads a frame's plain name, undefined when unnamed", () => {
    const named = toAccessibilityItems(
      [element("f1", "frame", { name: "Sprint 12" })],
      new Map(),
    );
    expect(named[0].text).toBe("Sprint 12");
    const unnamed = toAccessibilityItems(
      [element("f2", "frame", { name: null })],
      new Map(),
    );
    expect(unnamed[0].text).toBeUndefined();
  });

  it("names palette colours by their picker name, any shade, any case", () => {
    const items = toAccessibilityItems(
      [
        element("a", "rectangle", { backgroundColor: "#ffd43b" }),
        element("b", "rectangle", { backgroundColor: "#FFF9DB" }),
      ],
      new Map(),
    );
    // Both are shades of the palette's yellow (#ffd43b mid, #fff9db lightest).
    expect(items[0].colorName).toBe("Yellow");
    expect(items[1].colorName).toBe("Yellow");
  });

  it("announces no colour for transparent or unknown fills", () => {
    const items = toAccessibilityItems(
      [
        element("a", "rectangle", { backgroundColor: "transparent" }),
        element("b", "rectangle", { backgroundColor: "#123456" }),
      ],
      new Map(),
    );
    expect(items[0].colorName).toBeUndefined();
    expect(items[1].colorName).toBeUndefined();
  });

  it("marks only locked elements as locked", () => {
    const items = toAccessibilityItems(
      [
        element("a", "rectangle", { locked: true }),
        element("b", "rectangle", { locked: false }),
      ],
      new Map(),
    );
    expect(items[0].locked).toBe(true);
    expect(items[1].locked).toBeUndefined();
  });

  it("keeps scene order as reading order", () => {
    const items = toAccessibilityItems(
      [
        element("z", "rectangle"),
        element("a", "ellipse"),
        element("m", "diamond"),
      ],
      new Map(),
    );
    expect(items.map((item) => item.id)).toEqual(["z", "a", "m"]);
  });

  it("falls back to the type name when no translation exists", () => {
    const items = toAccessibilityItems(
      [element("u1", "unicron-3000")],
      new Map(),
    );
    expect(items[0].kind).toBe("unicron-3000");
  });
});

describe("toElementsMap", () => {
  it("maps elements by id", () => {
    const elements = [element("a", "rectangle"), element("b", "ellipse")];
    const map = toElementsMap(elements);
    expect(map.get("a")).toBe(elements[0]);
    expect(map.get("b")).toBe(elements[1]);
    expect(map.size).toBe(2);
  });
});
