import { describe, expect, it } from "vitest";

import { isMinimapShortcut } from "../chromeShortcuts";

/**
 * A `KeyboardEvent` carrying only the fields `isMinimapShortcut` reads. The
 * `target` is a real DOM node so `isWritableElement` behaves exactly as it does
 * in the app — a stub would prove less than nothing about the guard.
 */
const keydown = (
  overrides: Partial<KeyboardEvent> & { target?: EventTarget | null } = {},
): KeyboardEvent => {
  const { target = null, ...rest } = overrides;
  return {
    code: "KeyM",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    target,
    ...rest,
  } as unknown as KeyboardEvent;
};

describe("the minimap chrome shortcut", () => {
  it("fires on a bare M", () => {
    expect(isMinimapShortcut(keydown({ target: document.body }))).toBe(true);
  });

  it("ignores every modifier, so it never shadows a chord", () => {
    for (const modifier of [
      "altKey",
      "ctrlKey",
      "metaKey",
      "shiftKey",
    ] as const) {
      expect(isMinimapShortcut(keydown({ [modifier]: true }))).toBe(false);
    }
  });

  it("ignores auto-repeat, so holding M does not flicker the map", () => {
    expect(isMinimapShortcut(keydown({ repeat: true }))).toBe(false);
  });

  it("ignores any other key", () => {
    expect(isMinimapShortcut(keydown({ code: "KeyG" }))).toBe(false);
    expect(isMinimapShortcut(keydown({ code: "Escape" }))).toBe(false);
  });

  it("stays inert while the caret is in text", () => {
    const textarea = document.createElement("textarea");
    expect(isMinimapShortcut(keydown({ target: textarea }))).toBe(false);

    const input = document.createElement("input");
    input.type = "text";
    expect(isMinimapShortcut(keydown({ target: input }))).toBe(false);

    // The ProseMirror mount the editor mounts over the canvas for rich text.
    const wysiwyg = document.createElement("div");
    wysiwyg.dataset.type = "wysiwyg";
    expect(isMinimapShortcut(keydown({ target: wysiwyg }))).toBe(false);
  });

  it("keys off the physical position, not the produced character", () => {
    // `event.code`, so the binding survives a non-Latin layout. A stray `key`
    // value must not sway the decision.
    expect(
      isMinimapShortcut(keydown({ key: "ь", target: document.body })),
    ).toBe(true);
  });
});
