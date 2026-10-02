import { ROUNDNESS } from "@firo/common";

import { asElementId } from "@firo/schema";

import { createStickyNote } from "../src/defaults.js";
import {
  fromEditorElements,
  labelIdFor,
  seedForId,
  toEditorElements,
  toEditorScene,
} from "../src/elements.js";

/*
 * The document/editor bridge.
 *
 * The mapping is the risky part of connecting the two halves of the app, so it is
 * tested here rather than through a browser. Each test names the failure it is
 * guarding, because the alternative -- discovering these on a canvas -- means
 * either a blank note or a note rendered twice, both of which look like bugs in
 * something else.
 */

const note = (over: Record<string, unknown> = {}) =>
  createStickyNote({ id: "note1", x: 10, y: 20, text: "hello", ...over });

describe("seedForId", () => {
  it("is stable for the same id", () => {
    // Otherwise a note's wobbly outline is re-rolled on every render, and two
    // people looking at the same board see different notes.
    expect(seedForId("abc")).toBe(seedForId("abc"));
  });

  it("differs between ids", () => {
    expect(seedForId("abc")).not.toBe(seedForId("abd"));
  });

  it("is a non-negative integer, which is what the renderer expects", () => {
    for (const id of ["a", "note-1", "zzz", "ünïcødé", "x".repeat(64)]) {
      const seed = seedForId(id);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
    }
  });

  it("spreads short ids apart rather than clustering them", () => {
    // A weak hash would give near-identical notes identical jitter, which reads
    // as "the shapes are not hand-drawn".
    const seeds = new Set(
      Array.from({ length: 50 }, (_, i) => seedForId(`note-${i}`)),
    );
    expect(seeds.size).toBe(50);
  });
});

describe("toEditorElements", () => {
  it("emits a note and a label, because one document note is two editor elements", () => {
    const [sticky, label] = toEditorElements(note());

    expect(sticky.type).toBe("stickynote");
    expect(label.type).toBe("text");
    // If this ever returns one element the note has nowhere to put its text and
    // renders blank.
    expect(toEditorElements(note())).toHaveLength(2);
  });

  it("carries the note's text onto the label", () => {
    const [, label] = toEditorElements(note({ text: "buy milk" }));
    expect(label.type === "text" && label.text).toBe("buy milk");
  });

  it("points the label back at its note", () => {
    const [sticky, label] = toEditorElements(note());
    expect(label.type === "text" && label.containerId).toBe(sticky.id);
  });

  it("gives the label a derived id that cannot collide with a real element", () => {
    // Ids come from nanoid's alphabet, which has no `~`, so a label id can never
    // be mistaken for a board element.
    expect(labelIdFor("abc")).toBe("abc~label");
    expect(labelIdFor("abc")).not.toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is deterministic, so reloading a board does not churn its elements", () => {
    // The *same* note projected twice. Projecting two freshly created notes
    // would differ on `created`/`updated` and `versionNonce`, which is correct
    // and not what this is about.
    const original = note();
    expect(toEditorElements(original)).toEqual(toEditorElements(original));
  });

  it("carries geometry and style across unchanged", () => {
    const [sticky] = toEditorElements(
      note({ x: 5, y: 6, width: 195, height: 150 }),
    );
    expect(sticky).toMatchObject({ x: 5, y: 6, width: 195, height: 150 });
    expect(sticky.type === "stickynote" && sticky.baseHeight).toBe(150);
  });

  it("gives a note a stable seed derived from its id", () => {
    const [sticky] = toEditorElements(note({ id: "fixed" }));
    expect(sticky.seed).toBe(seedForId("fixed"));
  });

  it("refuses a type it cannot draw rather than dropping it", () => {
    // Silently skipping is how a board loses content without anyone noticing.
    expect(() => toEditorElements({ type: "frame" } as never)).toThrow(
      /cannot draw/,
    );
  });

  it("keeps a note's label out of the z-order as a separate entry", () => {
    // The label follows its note rather than floating in the scene on its own.
    const scene = toEditorScene([note()]);
    expect(scene).toHaveLength(2);
    expect(scene[1].type).toBe("text");
  });
});

describe("fromEditorElements", () => {
  const roundTrip = (over: Record<string, unknown> = {}) => {
    const original = note(over);
    const folded = fromEditorElements(toEditorElements(original));
    expect(folded).toHaveLength(1);
    return { original, folded: folded[0] };
  };

  it("folds a note and its label into one document element", () => {
    // The asymmetry is the whole point: two in, one out.
    const { folded } = roundTrip();
    expect(folded.type).toBe("stickynote");
  });

  it("keeps the text, which lives on the label and not the note", () => {
    const { folded } = roundTrip({ text: "a longer piece of text" });
    expect(folded.type === "stickynote" && folded.text).toBe(
      "a longer piece of text",
    );
  });

  it("stores the text the user typed, not the layout's wrapped version", () => {
    /*
     * The regression this guards. A sticky note's label carries `text` (wrapped
     * to fit, with hard line breaks) alongside `originalText` (what was typed).
     * Reading `text` stores the layout as content: the note still looks correct,
     * so nothing looks broken, but each save bakes in the current wrapping and
     * the next pass wraps text that already has breaks in it. Caught by drawing
     * a note, typing "hello board", and finding "hello\nboard" stored.
     */
    const [sticky, label] = toEditorElements(note({ text: "alpha beta" }));
    // Emulate the renderer: `text` is the wrapped form, `originalText` is not.
    const wrapped = {
      ...label,
      text: "alpha\nbeta",
      originalText: "alpha beta",
    };
    expect(label.type === "text" && label.originalText).toBe("alpha beta");

    const folded = fromEditorElements([sticky, wrapped] as never);
    expect(folded[0].type === "stickynote" && folded[0].text).toBe(
      "alpha beta",
    );
  });

  it("does not accumulate line breaks across repeated round trips", () => {
    const original = note({ text: "one two three four" });
    let current = original;
    for (let i = 0; i < 5; i++) {
      const projected = toEditorElements(current);
      const [sticky, label] = projected;
      // Emulate a layout that wraps at a different width each time.
      const wrapped = {
        ...label,
        text: (label as { originalText: string }).originalText.replace(
          " ",
          "\n",
        ),
        originalText: (label as { originalText: string }).originalText,
      };
      const [next] = fromEditorElements([sticky, wrapped] as never);
      current = next as typeof current;
    }
    // Five layouts later, the content is unchanged: still no line breaks.
    expect(current.text).toBe("one two three four");
  });

  it("does not emit the label as a document element of its own", () => {
    // Otherwise every note would also be a stray text element rendering a second
    // copy of its words. Firo has no standalone text element type, so the check
    // is that one note in means exactly one element out.
    const folded = fromEditorElements(toEditorElements(note({ text: "once" })));
    expect(folded).toHaveLength(1);
  });

  it("preserves geometry, style and identity through a round trip", () => {
    const { original, folded } = roundTrip({ x: 42, y: 43 });
    expect(folded).toMatchObject({
      id: original.id,
      x: 42,
      y: 43,
      width: original.width,
      height: original.height,
    });
  });

  it("preserves the fractional index, so z-order survives", () => {
    const { folded } = roundTrip({ index: "a0" as never });
    expect(folded.index).toBe("a0");
  });

  it("preserves a tombstone, so a deleted note stays deleted", () => {
    const { folded } = roundTrip({ isDeleted: true });
    expect(folded.isDeleted).toBe(true);
  });

  it("folds a note with no label as empty text rather than dropping the note", () => {
    // Excalidraw can leave a note label-less mid-edit. The note is still the note.
    const [sticky] = toEditorElements(note({ text: "gone" }));
    const folded = fromEditorElements([sticky]);
    expect(folded).toHaveLength(1);
    expect(folded[0].type === "stickynote" && folded[0].text).toBe("");
  });

  it("ignores an orphan label with no note to belong to", () => {
    const [, label] = toEditorElements(note());
    const orphan = { ...label, containerId: "missing" } as never;
    expect(fromEditorElements([orphan])).toHaveLength(0);
  });

  it("skips a type the document has no schema for, rather than failing the whole sync", () => {
    /*
     * The gap is real and shrinking: `image` and `frame` are not types yet, so a
     * picture or a frame a user drops is not in their document. Skipping beats
     * throwing -- throwing would freeze the board over something the user can
     * see -- but it is a hole, not a virtue.
     *
     * This used to name `freedraw`, which was correct when written and stopped
     * being correct the moment `freedraw` gained a schema. It then asserted that a
     * type the document fully supports is skipped, and it passed for the wrong
     * reason: the branch it hit was a shape's, which skipped it because the shape
     * branch had no points. A test that keeps passing after the thing it describes
     * stops being true is worse than one that fails, because it looks like
     * coverage.
     */
    const foreign = { type: "image", id: "r1" } as never;
    expect(fromEditorElements([foreign])).toHaveLength(0);
  });

  it("folds a stroke the document does support, with defaults for missing fields", () => {
    // The other half of the test above, and the reason the unsupported-type list
    // needs to be honest. A stroke with no pressures is corrupt, but the fold runs
    // over the whole scene on every change, so throwing here would take the whole
    // board's sync with it. It folds with defaults and the validator repairs it on
    // load, which is recoverable in a way that a frozen board is not.
    const bare = { type: "freedraw", id: "r1" } as never;
    const [folded] = fromEditorElements([bare]);

    expect(folded?.type).toBe("freedraw");
    expect((folded as unknown as { pressures: number[] }).pressures).toEqual(
      [],
    );
    expect(
      (folded as unknown as { simulatePressure: boolean }).simulatePressure,
    ).toBe(true);
  });

  it("preserves containerId through customData", () => {
    // Firo nests shapes; Excalidraw has no field for it, so it rides in
    // customData. Losing it would be silent data loss the day sections exist.
    const { folded } = roundTrip({ containerId: asElementId("section7") });
    expect(
      (folded.customData as Record<string, unknown>)["firo.containerId"],
    ).toBe("section7");
  });

  it("leaves a host application's customData alone", () => {
    const { folded } = roundTrip({ customData: { "app.example": 42 } });
    expect((folded.customData as Record<string, unknown>)["app.example"]).toBe(
      42,
    );
  });

  it("keeps a note's roundness type as a number the renderer accepts", () => {
    // The drift this guards: the schema once used strings, so a note would carry
    // a corner style the canvas cannot read.
    const { folded } = roundTrip({
      roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
    });
    const roundness = folded.roundness as { type: number };
    expect(Object.values(ROUNDNESS)).toContain(roundness.type);
  });
});

describe("createStickyNote", () => {
  it("keeps Excalidraw's width-to-height ratio", () => {
    const created = createStickyNote({ id: "n", x: 0, y: 0, height: 200 });
    expect(created.width).toBe(260);
  });

  it("gives every note a distinct versionNonce", () => {
    // Merge tie-breaks on this. Two notes sharing one would merge as if they
    // were the same element and one would vanish.
    const nonces = new Set(
      Array.from(
        { length: 20 },
        (_, i) => createStickyNote({ id: `n${i}`, x: 0, y: 0 }).versionNonce,
      ),
    );
    expect(nonces.size).toBe(20);
  });

  it("starts at the end of the z-order", () => {
    // null lets the document assign the fractional index rather than the caller
    // guessing at a string key.
    expect(createStickyNote({ id: "n", x: 0, y: 0 }).index).toBeNull();
  });

  it("starts undeleted and unlocked", () => {
    const created = createStickyNote({ id: "n", x: 0, y: 0 });
    expect(created.isDeleted).toBe(false);
    expect(created.locked).toBe(false);
  });

  it("rejects a height outside Excalidraw's set", () => {
    // A height Excalidraw does not have would produce a note it cannot lay out.
    expect(() =>
      createStickyNote({ id: "n", x: 0, y: 0, height: 123 }),
    ).toThrow(/height must be one of/);
  });

  it("accepts every size Excalidraw has", () => {
    for (const height of [100, 150, 200, 250]) {
      expect(() =>
        createStickyNote({ id: "n", x: 0, y: 0, height }),
      ).not.toThrow();
    }
  });

  it("stamps both timestamps the same on creation", () => {
    const created = createStickyNote({ id: "n", x: 0, y: 0 });
    expect(created.created).toBe(created.updated);
  });

  it("is never a container, which is a type change rather than a flag", () => {
    expect(createStickyNote({ id: "n", x: 0, y: 0 }).isContainer).toBe(false);
  });
});
