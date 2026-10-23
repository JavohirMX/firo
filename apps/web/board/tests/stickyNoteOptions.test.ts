import { applyStickyOption } from "../stickyNoteOptions";

import type { StickyOptionDeps } from "../stickyNoteOptions";

/*
 * The sticky options dispatch shared by the desktop rail flyout and the
 * mobile dialog. The actions it fires belong to the editor and are tested
 * there; what only this seam owns is the routing:
 *
 * 1. **Colour** goes through the background-colour action, so the next note
 *    reads it from the sticky domain's default (ADR-0031 row 19).
 * 2. **A size preset** always sets the default for the next note, and only
 *    when sticky notes are actually selected does it also fire the
 *    selection resize -- the same action the selection toolbar uses, so the
 *    two paths cannot drift.
 * 3. **Unknown choices are refused**, leaving every surface untouched.
 */

// The real editor package pulls in the whole canvas; the presets are a
// static lookup this module only re-exports.
vi.mock("@firo/editor", () => ({
  STICKY_NOTE_SIZE_PRESETS: { s: 100, m: 200, l: 300 },
}));

type FakeElement = { id: string; type: string; isDeleted: boolean };
const sticky = (id: string): FakeElement =>
  ({ id, type: "stickynote", isDeleted: false } as FakeElement);
const rectangle = (id: string): FakeElement =>
  ({ id, type: "rectangle", isDeleted: false } as FakeElement);

const fakeDeps = (selected: FakeElement[] = []) => {
  const executed: Array<{ action: string; source: unknown; data: unknown }> =
    [];
  const appStateSets: Array<Record<string, unknown>> = [];
  const onOpenBulkSticky = vi.fn();
  const onCreateStickyStack = vi.fn();
  const actions: Record<string, string> = {
    changeBackgroundColor: "changeBackgroundColor",
    changeStickyNoteSize: "changeStickyNoteSize",
  };
  const deps: StickyOptionDeps = {
    actionManager: {
      actions,
      executeAction: (action: string, source: unknown, data: unknown) => {
        executed.push({ action, source, data });
      },
    } as unknown as StickyOptionDeps["actionManager"],
    setAppState: ((patch: Record<string, unknown>) => {
      appStateSets.push(patch);
    }) as unknown as StickyOptionDeps["setAppState"],
    app: {
      scene: {
        getNonDeletedElements: () => selected,
      },
      state: {
        selectedElementIds: Object.fromEntries(
          selected.map((element) => [element.id, true]),
        ),
      },
    } as unknown as StickyOptionDeps["app"],
    onOpenBulkSticky,
    onCreateStickyStack,
  };
  return {
    deps,
    executed,
    appStateSets,
    onOpenBulkSticky,
    onCreateStickyStack,
  };
};

describe("applyStickyOption", () => {
  it("routes a colour swatch through the background-colour action", () => {
    const { deps, executed } = fakeDeps();
    expect(
      applyStickyOption({ id: "color-yellow", color: "#ffd43b" }, deps),
    ).toBe(true);
    expect(executed).toEqual([
      {
        action: "changeBackgroundColor",
        source: "ui",
        data: { color: "#ffd43b" },
      },
    ]);
  });

  it("opens the stack and bulk flows through their callbacks", () => {
    const { deps, onCreateStickyStack, onOpenBulkSticky } = fakeDeps();
    expect(applyStickyOption({ id: "stack-create" }, deps)).toBe(true);
    expect(onCreateStickyStack).toHaveBeenCalledTimes(1);
    expect(applyStickyOption({ id: "bulk-create" }, deps)).toBe(true);
    expect(onOpenBulkSticky).toHaveBeenCalledTimes(1);
  });

  it("consumes the stack choice even without a callback wired", () => {
    const { deps } = fakeDeps();
    delete deps.onCreateStickyStack;
    expect(applyStickyOption({ id: "stack-create" }, deps)).toBe(true);
  });

  it("sets the next note's size without touching an empty selection", () => {
    const { deps, executed, appStateSets } = fakeDeps();
    expect(applyStickyOption({ id: "size-l" }, deps)).toBe(true);
    expect(appStateSets).toEqual([{ currentItemStickynoteSize: "l" }]);
    expect(executed).toEqual([]);
  });

  it("also resizes when sticky notes are selected", () => {
    const { deps, executed, appStateSets } = fakeDeps([
      sticky("s1"),
      sticky("s2"),
    ]);
    expect(applyStickyOption({ id: "size-s" }, deps)).toBe(true);
    expect(appStateSets).toEqual([{ currentItemStickynoteSize: "s" }]);
    expect(executed).toEqual([
      { action: "changeStickyNoteSize", source: "ui", data: "s" },
    ]);
  });

  it("does not resize when the selection holds no sticky notes", () => {
    const { deps, executed } = fakeDeps([rectangle("r1")]);
    expect(applyStickyOption({ id: "size-m" }, deps)).toBe(true);
    expect(executed).toEqual([]);
  });

  it("refuses an unknown size key before writing any default", () => {
    const { deps, executed, appStateSets } = fakeDeps([sticky("s1")]);
    expect(applyStickyOption({ id: "size-xl" }, deps)).toBe(false);
    expect(appStateSets).toEqual([]);
    expect(executed).toEqual([]);
  });

  it("refuses an unknown id and leaves everything untouched", () => {
    const { deps, executed, appStateSets, onCreateStickyStack } = fakeDeps();
    expect(applyStickyOption({ id: "explode" }, deps)).toBe(false);
    expect(executed).toEqual([]);
    expect(appStateSets).toEqual([]);
    expect(onCreateStickyStack).not.toHaveBeenCalled();
  });
});
