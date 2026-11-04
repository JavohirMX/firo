import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { createStickyNote } from "@firo/board";
import { FiroDoc } from "@firo/doc";
import { fromEditorElements, toEditorElements } from "@firo/board";

import { setSessionShareRole } from "../facilitator";
import { setElementVisibility } from "../visibility";

afterEach(() => setSessionShareRole(null));

describe("visibility authoring", () => {
  it.each(["hiddenUntilRevealed", "hideInPresentation"] as const)(
    "sets and clears %s, preserving it through the editor boundary",
    (flag) => {
      const doc = new FiroDoc(new Y.Doc());
      doc.commit([
        {
          kind: "createElement",
          element: createStickyNote({ id: "note", x: 0, y: 0 }),
        },
      ]);
      const refresh = vi.fn();
      setElementVisibility(() => doc, refresh, ["note", "missing"], flag, true);
      expect(doc.read().elements[0][flag]).toBe(true);
      const folded = fromEditorElements(
        doc.read().elements.flatMap((element) => toEditorElements(element)),
      );
      expect(folded[0][flag]).toBe(true);
      setElementVisibility(() => doc, refresh, ["note"], flag, true);
      expect(refresh).toHaveBeenCalledTimes(1);
      setElementVisibility(() => doc, refresh, ["note"], flag, false);
      expect(doc.read().elements[0][flag]).toBe(false);
      expect(refresh).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["viewer", "commenter"])(
    "refuses a stale callback for %s",
    (role) => {
      const doc = new FiroDoc(new Y.Doc());
      doc.commit([
        {
          kind: "createElement",
          element: createStickyNote({ id: "note", x: 0, y: 0 }),
        },
      ]);
      const refresh = vi.fn();
      setSessionShareRole(role);
      setElementVisibility(
        () => doc,
        refresh,
        ["note"],
        "hiddenUntilRevealed",
        true,
      );
      expect(doc.read().elements[0].hiddenUntilRevealed).toBeUndefined();
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  it("ignores deleted targets", () => {
    const doc = new FiroDoc(new Y.Doc());
    doc.commit([
      {
        kind: "createElement",
        element: createStickyNote({ id: "note", x: 0, y: 0 }),
      },
    ]);
    doc.commit([{ kind: "deleteElements", ids: ["note"] }]);
    const refresh = vi.fn();
    setElementVisibility(
      () => doc,
      refresh,
      ["note"],
      "hideInPresentation",
      true,
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
