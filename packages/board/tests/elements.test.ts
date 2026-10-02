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
    //
    // `magicframe` rather than `frame`: this named `frame` for as long as frames had
    // no schema, and kept passing for the wrong reason once they did — the projection
    // walked into the frame branch and then threw on a missing `bindings` array, which
    // matched neither the assertion nor the message. A guard that fires for an
    // unrelated reason is not a guard, so the example is now a type that will not gain
    // a schema: Excalidraw's AI frame, which ADR-0012 keeps out of v1.
    expect(() => toEditorElements({ type: "magicframe" } as never)).toThrow(
      /cannot draw/,
    );
  });

  it("keeps a note's label out of the z-order as a separate entry", () => {
    // The label follows its note rather than floating in the scene on its own.
    const scene = toEditorScene([note()]);
    expect(scene).toHaveLength(2);
    expect(scene[1].type).toBe("text");
  });

  /*
   * A label needs a real fractional index, and this is the test that says so.
   *
   * It was `null`, on the reasoning that a derived element has no place in the
   * z-order. `index: null` is not a tolerated value — `validateFractionalIndices`
   * throws `InvalidFractionalIndexError` on it in development, on every scene
   * change — and nothing noticed for as long as it stood, because the editor builds
   * its own notes and gives their labels proper indices. The projection only runs on
   * restore, so the invalid label entered the scene the first time a board came back
   * from storage: a board that saved perfectly and then could not be opened.
   *
   * The value is one step after the note's, which is where Excalidraw puts it.
   * Measured by drawing a note in the app: note `"a0"`, label `"a1"`.
   */
  describe("a note's label index", () => {
    it("is a real fractional index, not null", () => {
      const scene = toEditorScene([note({ index: "a0" as never })]);
      const label = scene[1] as unknown as { index: string | null };

      expect(label.index).not.toBeNull();
      expect(typeof label.index).toBe("string");
    });

    it("sorts immediately after its note", () => {
      // After, not before: a label in front of its note would draw over anything
      // placed after it, which is not what a note's own label should do.
      const scene = toEditorScene([note({ index: "a0" as never })]);
      const [, label] = scene as unknown as Array<{ index: string | null }>;

      expect((label.index as unknown as string) > "a0").toBe(true);
    });

    it("is stable across projections, so a restore does not reshuffle z-order", () => {
      const element = note({ index: "a0" as never });
      const first = toEditorScene([element])[1] as unknown as { index: string };
      const second = toEditorScene([element])[1] as unknown as {
        index: string;
      };

      // Derived from the note's index, so it cannot drift between saves. A random
      // or time-based value would reorder the board on every reload.
      expect(first.index).toBe(second.index);
    });

    it("gives two notes on the same board different label indices", () => {
      const scene = toEditorScene([
        note({ id: "n1", index: "a0" as never }),
        note({ id: "n2", index: "a1" as never }),
      ]);
      const labels = scene
        .filter((element) => element.type === "text")
        .map((element) => (element as unknown as { index: string }).index);

      expect(new Set(labels).size).toBe(labels.length);
    });

    it("survives a round trip through the document without an invalid index", () => {
      // The end-to-end shape of the bug: project, fold, project again. If the label
      // index were derived from something that changed between the two, this is where
      // it would show.
      const scene = toEditorScene([note({ index: "a0" as never })]);
      const folded = fromEditorElements(scene as never);

      const reprojected = toEditorScene(folded);
      const label = reprojected[1] as unknown as { index: string | null };

      expect(label.index).not.toBeNull();
    });
  });

  /*
   * The state a note is actually in while its text is being edited.
   *
   * Double-clicking a note to type in it does not edit the note's bound label. It
   * tombstones that label and creates a replacement bound to the same container, so
   * for as long as the note lives there are two labels pointing at it — one deleted,
   * one current. Measured in the app, in both directions:
   *
   *   after draw:     note 3KqHnq + label XcLcXL (live)
   *   after dblclick: note 3KqHnq + label gbDe2B (live) + label XcLcXL (deleted)
   *
   * Two consequences, both of which the fold has to survive.
   *
   * The second label is a real edit in its own right, so a note's text is carried
   * by whichever of the two the fold happens to pick. And a note can end up with
   * *no* live label at all — edited to empty — in which case folding a tombstone
   * would hand back the text the person had just erased.
   *
   * The scene order here is the tombstone last, which is the arrangement that
   * failed. Both orders are covered below, because the bug was that the answer
   * depended on it.
   */
  describe("a note being edited", () => {
    const editingNote = (opts: {
      /** The label the editor created to replace the original. */
      live: { id: string; originalText: string };
      /** The label it tombstoned. */
      tombstoned: { id: string; originalText: string };
    }) => {
      const scene = toEditorScene([note()]) as unknown as Array<
        Record<string, unknown>
      >;
      const containerId = scene[0].id;

      const label = (id: string, originalText: string, deleted: boolean) => ({
        ...scene[1],
        id,
        containerId,
        originalText,
        text: originalText,
        isDeleted: deleted,
      });

      const live = label(opts.live.id, opts.live.originalText, false);
      const dead = label(
        opts.tombstoned.id,
        opts.tombstoned.originalText,
        true,
      );

      // `order` decides which of the two comes last, which is the whole point.
      return [scene[0], live, dead];
    };

    it("reads the live label when the tombstone sorts last", () => {
      const folded = fromEditorElements(
        editingNote({
          live: { id: "new-label", originalText: "hello board" },
          tombstoned: { id: "old-label", originalText: "" },
        }) as never,
      );

      expect(folded).toHaveLength(1);
      expect(folded[0].type === "stickynote" && folded[0].text).toBe(
        "hello board",
      );
    });

    it("reads the live label when it sorts last", () => {
      // The same two labels, opposite order. Before the fix this passed by luck.
      const scene = editingNote({
        live: { id: "new-label", originalText: "hello board" },
        tombstoned: { id: "old-label", originalText: "" },
      });
      const folded = fromEditorElements([
        scene[0],
        scene[2],
        scene[1],
      ] as never);

      expect(folded[0].type === "stickynote" && folded[0].text).toBe(
        "hello board",
      );
    });

    it("prefers the live label even when the tombstone still has text", () => {
      // A label tombstoned while holding the *old* text must not resurrect it. This
      // is the reverse of the bug: not an empty string, but a stale one.
      const folded = fromEditorElements(
        editingNote({
          live: { id: "new-label", originalText: "edited" },
          tombstoned: { id: "old-label", originalText: "the original" },
        }) as never,
      );

      expect(folded[0].type === "stickynote" && folded[0].text).toBe("edited");
    });

    it("reports empty text when the live label was erased", () => {
      // Editing a note to nothing deletes its label and leaves a tombstone. Reading
      // the tombstone would hand back the text the person just removed.
      const folded = fromEditorElements(
        editingNote({
          live: { id: "new-label", originalText: "" },
          tombstoned: { id: "old-label", originalText: "something typed" },
        }) as never,
      );

      expect(folded[0].type === "stickynote" && folded[0].text).toBe("");
    });

    it("still produces exactly one document element for the pair", () => {
      // The asymmetry is the contract: two labels in, one note out. A tombstone is
      // not a second note.
      const folded = fromEditorElements(
        editingNote({
          live: { id: "new-label", originalText: "x" },
          tombstoned: { id: "old-label", originalText: "y" },
        }) as never,
      );

      expect(folded).toHaveLength(1);
    });
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
     * A necessary hole. A board may legitimately hold an element type this version
     * does not understand, and skipping beats throwing — throwing would freeze the
     * board's sync over something the user can plainly see.
     *
     * This has now named three types in a row, and each was right when written and
     * wrong once that type gained a schema: `freedraw`, then `image`. Both times it
     * kept passing for the wrong reason — the element was a bare object with no
     * points, so the shape branch skipped it — and a test that keeps passing after the
     * thing it describes stops being true is worse than one that fails, because it
     * looks like coverage.
     *
     * `selection` is the example now, and it is not going anywhere: a rubber-band
     * rectangle is UI state, and rule 1 in AGENTS.md is that ephemeral state never
     * enters the document. `conformance.test.ts` holds the full list of types the
     * document declines, and this is one of them.
     */
    const foreign = { type: "selection", id: "r1" } as never;
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

  it("preserves containerId through customData, as the field and not a copy", () => {
    /*
     * Firo nests anything in anything (ADR-0007); Excalidraw shapes have no field for
     * it, so it rides in `customData` on the way to the canvas and has to be lifted
     * back out on the way home.
     *
     * This asserted the wrong thing for a long time. It checked that the value
     * survived *inside* `customData` under `firo.containerId`, which it did — the fold
     * wrote the key it was given and the key was never read. So the value was never
     * destroyed and nothing looked broken, while the document's `containerId` field
     * was `undefined` from the first fold onward.
     *
     * Measured over four trips, one shape in a section:
     *
     *     cycle 0: containerId="sec1"   customData=undefined
     *     cycle 1: containerId=undefined customData={"firo.containerId":"sec1"}
     *
     * It survived in a place nothing reads. The field is what ADR-0007 is about and
     * what anything computing a container's children will look at, and Phase 4 is that
     * consumer — so this would have surfaced as nesting that renders and then quietly
     * stops nesting.
     *
     * Asserted on both halves now: the field is set, *and* the duplicate is gone. Two
     * representations of one value can disagree, which is the same argument that keeps
     * a frame from also listing its children.
     */
    const { folded } = roundTrip({ containerId: asElementId("section7") });

    expect(folded.containerId).toBe("section7");
    expect(
      (folded.customData as Record<string, unknown> | undefined)?.[
        "firo.containerId"
      ],
    ).toBeUndefined();
  });

  it("still keeps a host application's own customData alongside a containerId", () => {
    // The lift must take Firo's key and nothing else. Dropping the whole object would
    // be the other way to break it, and less visibly: an application that stashed
    // something on an element would find it gone after a reload.
    const { folded } = roundTrip({
      containerId: asElementId("section7"),
      customData: { "app.example": 7 },
    });

    expect(folded.containerId).toBe("section7");
    expect((folded.customData as Record<string, unknown>)["app.example"]).toBe(
      7,
    );
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
