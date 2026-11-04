import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { FiroDoc } from "@firo/doc";

let doc: FiroDoc;
beforeEach(() => {
  vi.resetModules();
  doc = new FiroDoc(new Y.Doc());
  vi.doMock("../board/board", () => ({ boardDoc: () => doc }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("../board/board");
  vi.resetModules();
});
const setup = async () => {
  const { TimerSetupDialog } = await import("../components/TimerSetupDialog");
  const onClose = vi.fn();
  const view = render(<TimerSetupDialog isOpen onClose={onClose} />);
  return { onClose, ...view };
};
describe("timer setup popover", () => {
  it("is non-modal, has an explicit close and no backdrop", async () => {
    const { onClose } = await setup();
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("false");
    expect(screen.queryByTestId("timer-setup-overlay")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close timer" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("closes outside without swallowing the board click", async () => {
    const { onClose } = await setup();
    const outside = vi.fn();
    document.body.addEventListener("pointerdown", outside);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
    expect(outside).toHaveBeenCalledOnce();
    document.body.removeEventListener("pointerdown", outside);
  });
  it("Escape closes and returns focus to facilitation tools", async () => {
    const trigger = document.createElement("button");
    trigger.dataset.testid = "facilitation-menu-trigger";
    document.body.appendChild(trigger);
    const { onClose } = await setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
  it("starts the chosen duration without a durable write", async () => {
    const { onClose } = await setup();
    const before = doc.durableUpdates;
    fireEvent.click(screen.getByTestId("timer-step-up"));
    fireEvent.click(screen.getByTestId("timer-setup-start"));
    expect(doc.getEphemeral().timer?.durationMs).toBe(360000);
    expect(doc.getEphemeral().timer?.startedAt).not.toBeNull();
    expect(doc.durableUpdates).toBe(before);
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("shows a ticking readout with pause, resume and reset", async () => {
    doc.setEphemeral({
      timer: { startedAt: Date.now(), durationMs: 60000, remainingMs: 60000 },
    });
    await setup();
    expect(screen.getByLabelText("Time remaining").textContent).toBe("1:00");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(doc.getEphemeral().timer?.startedAt).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(doc.getEphemeral().timer?.startedAt).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(doc.getEphemeral().timer?.startedAt).toBeNull();
    expect(doc.getEphemeral().timer?.remainingMs).toBe(300000);
    await act(async () => {});
  });
  it("opening and ticking writes no durable or ephemeral countdown", async () => {
    vi.useFakeTimers();
    doc.setEphemeral({
      timer: { startedAt: Date.now(), durationMs: 60000, remainingMs: 60000 },
    });
    await setup();
    const stored = doc.getEphemeral().timer;
    const before = doc.durableUpdates;
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByLabelText("Time remaining").textContent).toBe("0:58");
    expect(doc.getEphemeral().timer).toBe(stored);
    expect(doc.durableUpdates).toBe(before);
  });
  it("does not trap Tab on the last control", async () => {
    await setup();
    const start = screen.getByTestId("timer-setup-start");
    start.focus();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    start.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
  it("stale start remains refused after role changes to viewer", async () => {
    await setup();
    const { setSessionShareRole } = await import("../board/facilitator");
    setSessionShareRole("viewer");
    fireEvent.click(screen.getByTestId("timer-setup-start"));
    expect(doc.getEphemeral().timer).toBeNull();
    setSessionShareRole(null);
  });
  it("reopening uses the current time before its first tick", async () => {
    vi.useFakeTimers();
    const { TimerSetupDialog } = await import("../components/TimerSetupDialog");
    const onClose = vi.fn();
    const view = render(<TimerSetupDialog isOpen={false} onClose={onClose} />);
    act(() => vi.advanceTimersByTime(5000));
    doc.setEphemeral({
      timer: { startedAt: Date.now(), durationMs: 60000, remainingMs: 60000 },
    });
    view.rerender(<TimerSetupDialog isOpen onClose={onClose} />);
    expect(screen.getByLabelText("Time remaining").textContent).toBe("1:00");
  });
});
