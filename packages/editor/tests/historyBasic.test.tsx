import { KEYS } from "@firo/common";

import { Excalidraw } from "../index";

import { Keyboard, Pointer, UI } from "./helpers/ui";
import { act, render, waitFor } from "./test-utils";

/**
 * The basic undo case, which no existing history test covers.
 *
 * ## Why this file exists
 *
 * `history.test.tsx` has fourteen tests and every one of them is a corner:
 * corrupted entries, empty deltas, unrelated appstate changes, redo-stack
 * clearing, drag-and-drop and paste imports. There is no test for "draw a shape,
 * undo, the shape is gone".
 *
 * That gap is why a working undo could go unverified for so long. The corners
 * were covered and the middle was not, and the middle is the part a person uses.
 *
 * The tests go through the real interaction path — pointer down, move, up —
 * rather than setting elements directly the way the other tests do, because that
 * is the path with no coverage at all. A drag makes several internal commits and
 * has to collapse into one undo step, and only a real drag exercises that.
 *
 * ## The trap, if these are ever "simplified"
 *
 * Undo *tombstones*. It flips `isDeleted` and keeps the element in the scene so it
 * can be restored. Asserting on `h.elements.length` therefore passes or fails for
 * reasons unrelated to whether undo worked, and it never goes down. `live()` below
 * is the only count these tests use. See the note in
 * `docs/plans/phase-3-interaction.md` §3.5 for the full account.
 */
describe("undoing a drawn shape", () => {
  const h = window.h;
  const mouse = new Pointer("mouse");

  const drawRectangle = async (at: [number, number] = [100, 100]) => {
    UI.clickTool("rectangle");
    await mouse.down(at[0], at[1]);
    await mouse.moveTo(at[0] + 100, at[1] + 80);
    await mouse.up();
    // The commit history records lands on pointer-up, not during the drag.
  };

  /** Cmd/Ctrl+Z, through the real keyboard path so the action manager is involved. */
  const undo = async () => {
    await act(async () => {
      Keyboard.withModifierKeys({ ctrl: true }, () => {
        Keyboard.keyPress(KEYS.Z);
      });
    });
  };

  const redo = async () => {
    await act(async () => {
      Keyboard.withModifierKeys({ ctrl: true, shift: true }, () => {
        Keyboard.keyPress(KEYS.Z);
      });
    });
  };

  /**
   * Elements a person can see, as opposed to tombstones.
   *
   * `h.elements` is `getElementsIncludingDeleted()`. Undo soft-deletes rather than
   * drops, so this count is the only one that moves when undo works. See the file
   * header.
   */
  const live = () => h.elements.filter((el) => !el.isDeleted);

  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally />);
    mouse.reset();
  });

  it("records a history entry for a drawn shape", async () => {
    await drawRectangle();

    await waitFor(() => expect(live()).toHaveLength(1));
    expect(h.history.undoStack.length).toBeGreaterThan(0);
  });

  it("makes a drawn shape disappear", async () => {
    await drawRectangle();
    await waitFor(() => expect(live()).toHaveLength(1));

    await undo();

    await waitFor(() => {
      expect(live()).toHaveLength(0);
    });
  });

  it("brings the shape back when the undo is redone", async () => {
    await drawRectangle();
    await waitFor(() => expect(live()).toHaveLength(1));

    await undo();
    await waitFor(() => expect(live()).toHaveLength(0));

    await redo();
    await waitFor(() => expect(live()).toHaveLength(1));
  });

  it("removes only the last shape when two are drawn", async () => {
    await drawRectangle();
    await waitFor(() => expect(live()).toHaveLength(1));

    await drawRectangle([300, 300]);
    await waitFor(() => expect(live()).toHaveLength(2));

    await undo();

    await waitFor(() => expect(live()).toHaveLength(1));
  });

  it("tombstones rather than drops, so the shape can come back", async () => {
    // Not an implementation detail: the document keeps a tombstone too, and a
    // hard delete would lose the element's history and allow a concurrent edit to
    // resurrect it silently. Pinned so a future "cleanup" does not make undo
    // irreversible.
    await drawRectangle();
    await waitFor(() => expect(live()).toHaveLength(1));

    await undo();
    await waitFor(() => expect(live()).toHaveLength(0));

    expect(h.elements).toHaveLength(1);
    expect(h.elements[0].isDeleted).toBe(true);
  });

  it("counts one undo step per user action, not per internal commit", async () => {
    // A drag makes many internal commits but is one action, so it is one entry --
    // otherwise undo would rewind a drag in pieces, which is the thing undo is
    // most obviously for.
    await drawRectangle();
    await waitFor(() => expect(live()).toHaveLength(1));

    expect(h.history.undoStack.length).toBe(1);

    await undo();
    await waitFor(() => expect(live()).toHaveLength(0));
  });
});
