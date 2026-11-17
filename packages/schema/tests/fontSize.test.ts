import { describe, expect, it } from "vitest";

import { migrateElement, RepairLog } from "../src/index.js";

describe.each(["text", "stickynote"])("%s font sizes", (type) => {
  it.each([13, 25.5, 46.24860638131844, 129])(
    "preserves positive size %s",
    (fontSize) => {
      const log = new RepairLog();
      const { element } = migrateElement({ id: "font", type, fontSize }, log);
      expect("fontSize" in element ? element.fontSize : undefined).toBe(
        fontSize,
      );
      expect(
        log.all.some((entry) => "field" in entry && entry.field === "fontSize"),
      ).toBe(false);
    },
  );
  it.each([0, -2, NaN, Infinity, "24"])(
    "repairs invalid size %s",
    (fontSize) => {
      const log = new RepairLog();
      const { element } = migrateElement({ id: "font", type, fontSize }, log);
      expect("fontSize" in element ? element.fontSize : undefined).toBe(20);
      expect(
        log.all.some(
          (entry) => entry.kind === "coerced" && entry.field === "fontSize",
        ),
      ).toBe(true);
    },
  );
});
