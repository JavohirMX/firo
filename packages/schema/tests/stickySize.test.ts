import { expect, it } from "vitest";

import { migrateElement, RepairLog } from "../src/index.js";
it.each([75, 243.96, 2000, 12345.67])(
  "preserves imported sticky height %s",
  (height) => {
    const log = new RepairLog();
    const { element } = migrateElement(
      { id: "note", type: "stickynote", width: 3000, height },
      log,
    );
    expect(element.width).toBe(3000);
    expect(element.height).toBe(height);
    expect(log.all.some((entry) => entry.field === "height")).toBe(false);
  },
);
