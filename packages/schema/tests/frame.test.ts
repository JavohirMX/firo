/**
 * The `frame` validator.
 *
 * ## Why a one-field type needs its own file
 *
 * A frame adds exactly one field to `ElementBase`, and that is not a reason to skip
 * the tests — it is the reason to write them. A field nothing exercises is a field
 * nothing has checked, and this file records the two decisions that are easy to get
 * wrong and impossible to notice:
 *
 * 1. **`name` is nullable and `null` survives.** An unnamed frame and a frame named
 *    with nothing in it are different states: the first is what you get the moment
 *    you drag a frame out, the second is what a cleared text field produces. A
 *    validator that normalised `null` to `""` would make them one value, and the
 *    renderer draws a label for `""` and nothing for `null`.
 *
 * 2. **Membership is not stored on the frame.** The elements inside a frame carry its
 *    id in `frameId`; the frame holds no `children`. A frame that also listed its
 *    children would be holding one relation twice, and the two would disagree the
 *    first time a shape was dragged from one frame to another. The nesting case is
 *    the same field, which is why a frame can sit inside a frame with no extra
 *    structure at all.
 */
import { describe, expect, it } from "vitest";

import { migrateElement, RepairLog } from "../src/index.js";

import type { FrameElement } from "../src/index.js";

const frame = (overrides: Record<string, unknown> = {}) => {
  const log = new RepairLog();
  const { element } = migrateElement(
    {
      id: "fr-1",
      type: "frame",
      x: 10,
      y: 20,
      width: 400,
      height: 300,
      name: "Discovery",
      ...overrides,
    },
    log,
  );
  return { element: element as FrameElement, log };
};

describe("a frame element", () => {
  it("keeps its name", () => {
    expect(frame().element.name).toBe("Discovery");
  });

  it("keeps an empty name as an empty name", () => {
    // Not the same as unnamed. Someone who types a space and deletes it has named the
    // frame; the label is empty either way, and only one of them was deliberate.
    expect(frame({ name: "" }).element.name).toBe("");
  });

  it("keeps `null` rather than turning it into an empty string", () => {
    // The renderer draws a name at the frame's top-left and draws nothing for null.
    // Collapsing the two would put a stray empty label on every frame nobody named.
    expect(frame({ name: null }).element.name).toBeNull();
  });

  it("treats a missing name as unnamed", () => {
    // A frame drawn by an older client, or by a host that never had the field. The
    // absence of the key and an explicit null mean the same thing here.
    expect(frame({ name: undefined }).element.name).toBeNull();
  });

  it("repairs a name that is not a string, and says so", () => {
    // Dropped to null rather than stringified: a number where a label belongs is a
    // file that says something the schema cannot hold, and the log is how a person
    // finds out which file to open.
    const { element, log } = frame({ name: 42 });
    expect(element.name).toBeNull();
    expect(log.hasRepairs).toBe(true);
  });

  it("is itself a container, and can be inside one", () => {
    // The general case is `containerId` (ADR-0007) and a frame is a container like
    // any other, so a frame in a section needs nothing this type does not have.
    expect(frame().element.containerId).toBeNull();
    expect(frame({ containerId: "sec-1" }).element.containerId).toBe("sec-1");
  });

  it("can be a member of another frame", () => {
    // Frame-in-frame is what "nestable" means in Phase 4, and it is `frameId` on the
    // inner frame rather than anything the frame itself declares.
    expect(frame({ frameId: "fr-outer" }).element.frameId).toBe("fr-outer");
  });

  it("carries no list of its own children", () => {
    // The absence is the assertion. `children` would be a second source of truth for
    // a relation `frameId` already states on the other side, and the two would
    // disagree on the first drag between frames.
    expect(frame().element).not.toHaveProperty("children");
  });

  it("keeps the width and height of the box positive", () => {
    // A frame is resized by dragging a handle backwards as often as forwards. The
    // renderer takes the absolute value, so storing the negative form would make two
    // clients disagree about the same frame.
    const { element } = frame({ width: -400, height: -300 });
    expect(element.width).toBe(400);
    expect(element.height).toBe(300);
  });

  it("preserves a field it does not recognise", () => {
    // Migration rule 1. Phase 4 will add fields here — page order, a background —
    // and an older Firo must not delete them on the way through.
    const { element } = frame({ phase4Only: { slideIndex: 3 } });
    expect((element as { phase4Only?: unknown }).phase4Only).toEqual({
      slideIndex: 3,
    });
  });

  it("round-trips through the file format unchanged", () => {
    // The whole reason this type exists is that a frame used to be drawn, saved by
    // the editor's own copy, and absent from every file. A frame that does not
    // survive a round trip is the bug this file exists to prevent, coming back.
    const original = frame().element;
    const reloaded = migrateElement(
      JSON.parse(JSON.stringify(original)) as Record<string, unknown>,
      new RepairLog(),
    ).element as FrameElement;

    expect(reloaded).toEqual(original);
  });
});
