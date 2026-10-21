import { describe, expect, it, vi } from "vitest";

import { requestDialog, subscribeToDialogRequests } from "../uiRequests";

/*
 * The action-to-shell bridge. What is worth protecting: a dialog request
 * reaches the *current* subscribers, and an unsubscribed shell is never
 * asked — the leak case is a dialog opening in an app that no longer exists.
 */

describe("uiRequests", () => {
  it("delivers a request to every subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeToDialogRequests(a);
    const offB = subscribeToDialogRequests(b);
    requestDialog("timerSetup");
    expect(a).toHaveBeenCalledWith("timerSetup");
    expect(b).toHaveBeenCalledWith("timerSetup");
    offA();
    offB();
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const off = subscribeToDialogRequests(listener);
    off();
    requestDialog("bulkStickyNotes");
    expect(listener).not.toHaveBeenCalled();
  });

  it("is a no-op with no subscribers", () => {
    expect(() => requestDialog("timerSetup")).not.toThrow();
  });
});
