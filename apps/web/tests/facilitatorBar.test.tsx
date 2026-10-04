import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";

/*
 * The facilitator's readout.
 *
 * The two properties worth protecting are both about *not* writing: the readout
 * repaints from its own interval and must never put a per-second value into the
 * document, and it must stay in step with the anchor when a facilitator acts.
 * The first is the reason the timer is an anchor at all; the second is why there
 * is a component here rather than a string in a menu.
 *
 * ## The third property, added after the first two shipped
 *
 * The bar subscribed to `boardDoc().onUpdate` -- the document's **durable** update
 * signal. Every facilitator mode is *ephemeral*, which is awareness, which produces
 * no document update by design (rule 1). So the bar repainted only when something
 * durable happened to reach the document:
 *
 * > A facilitator presses `Alt+T`. No clock appears. They press it again -- still
 * > nothing. They type in a note, and the clock appears showing the state from the
 * > first press.
 *
 * The reveal toggle was accidentally immune because its button re-read the state
 * inline after clicking. That immunity lasted exactly as long as the control stayed
 * a button, and moving it to the keyboard -- which AC-8 requires -- removed it.
 *
 * So the assertions at the bottom are the negative ones: **no durable write happens,
 * and the readout still changes.** A test that committed something to make the bar
 * repaint would pass against the old code, and passing against the old code is the
 * definition of not testing this.
 */

/** Replace the app's document singleton for the duration of a test. */
const withDocument = (): FiroDoc => {
  const doc = new FiroDoc(new Y.Doc());
  vi.doMock("../board/board", () => ({
    boardDoc: () => doc,
    refreshBoard: vi.fn(),
  }));
  return doc;
};

let doc: FiroDoc;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  doc = withDocument();
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("../board/board");
  vi.resetModules();
});

/** Render after the mock is in place, so the component picks up `doc`. */
const renderBar = async () => {
  const { FacilitatorBar: Bar } = await import("../components/FacilitatorBar");
  return render(<Bar />);
};

/** A frame the board's fold accepts, so a deck can exist. */
const frame = (id: string) =>
  ({
    id,
    type: "frame",
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    angle: 0,
    name: id,
    strokeColor: "#1e1e1e",
    backgroundColor: "#ffffff",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 1,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 7,
    index: "a0",
    isDeleted: false,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    created: 1000,
    updated: 2000,
  } as never);

/** A board with `n` frames, which is the only thing a deck needs. */
const withDeck = (n: number) => {
  doc.commit(
    Array.from({ length: n }, (_, i) => ({
      kind: "createElement",
      element: frame(`f${i}`),
    })) as never,
  );
};

const slide = () => screen.queryByTestId("facilitator-slide");

describe("the slide readout", () => {
  it("appears when a presentation starts and says where we are", async () => {
    withDeck(3);
    await renderBar();
    expect(slide()).toBeNull();

    const { startPresenting } = await import("../board/presentation");
    const { refreshBoard } = await import("../board/board");
    act(() => {
      startPresenting(() => doc, undefined, refreshBoard);
    });

    await waitFor(() => expect(slide()).not.toBeNull());
    expect(slide()?.textContent).toBe("1 / 3");
  });

  it("follows the slide as the deck advances", async () => {
    withDeck(3);
    await renderBar();

    const { startPresenting, stepPresentation } = await import(
      "../board/presentation"
    );
    const { refreshBoard } = await import("../board/board");
    act(() => {
      startPresenting(() => doc, undefined, refreshBoard);
    });
    await waitFor(() => expect(slide()).toHaveTextContent("1 / 3"));

    act(() => {
      stepPresentation(() => doc, 1, undefined, refreshBoard);
    });
    await waitFor(() => expect(slide()).toHaveTextContent("2 / 3"));
  });

  it("goes away when the presentation stops", async () => {
    withDeck(2);
    await renderBar();

    const { startPresenting, stopPresenting } = await import(
      "../board/presentation"
    );
    const { refreshBoard } = await import("../board/board");
    act(() => {
      startPresenting(() => doc, undefined, refreshBoard);
    });
    await waitFor(() => expect(slide()).not.toBeNull());

    act(() => {
      stopPresenting(() => doc, refreshBoard);
    });

    /*
     * A bar still reading "1 / 2" after presenting has ended is a facilitator
     * convinced they are still presenting, which is worse than no bar at all.
     */
    await waitFor(() => expect(slide()).toBeNull());
  });

  it("labels the position in words a screen reader can use", async () => {
    // "2 / 3" read aloud is two unrelated numbers.
    withDeck(3);
    await renderBar();

    const { startPresenting, stepPresentation } = await import(
      "../board/presentation"
    );
    const { refreshBoard } = await import("../board/board");
    act(() => {
      startPresenting(() => doc, undefined, refreshBoard);
      stepPresentation(() => doc, 1, undefined, refreshBoard);
    });

    await waitFor(() =>
      expect(slide()?.getAttribute("aria-label")).toBe("Slide 2 of 3"),
    );
  });

  it("writes nothing to get there", async () => {
    withDeck(3);
    await renderBar();

    const updates: unknown[] = [];
    doc.ydoc.on("update", (update: unknown) => updates.push(update));

    const { startPresenting, stepPresentation } = await import(
      "../board/presentation"
    );
    const { refreshBoard } = await import("../board/board");
    act(() => {
      startPresenting(() => doc, undefined, refreshBoard);
      stepPresentation(() => doc, 1, undefined, refreshBoard);
    });

    await waitFor(() => expect(slide()).toHaveTextContent("2 / 3"));
    expect(updates).toEqual([]);
  });
});

describe("the facilitator bar", () => {
  it("shows nothing until a facilitator has done something", () => {
    // An empty bar is chrome for its own sake. The board should look like a
    // whiteboard until it is being used as one.
    return renderBar().then(({ container }) => {
      expect(
        container.querySelector("[data-testid=facilitator-bar]"),
      ).toBeNull();
    });
  });

  it("appears once a timer is started", async () => {
    doc.setEphemeral({
      timer: {
        startedAt: Date.now(),
        durationMs: 300_000,
        remainingMs: 300_000,
      },
    });

    const { container } = await renderBar();
    expect(
      container.querySelector("[data-testid=facilitator-timer]"),
    ).not.toBeNull();
    expect(screen.getByTestId("facilitator-timer").textContent).toBe("5:00");
  });

  it("counts down without writing anything, durable or ephemeral", async () => {
    // The property the whole anchor design exists for.
    //
    // The first version of this test watched `ydoc.on("update")` and asserted
    // zero durable writes — and it PASSED against a mutation that wrote the
    // derived value into ephemeral state on every tick. Because ephemeral state
    // goes to awareness and never to the document, a per-tick write is invisible
    // to that listener. The test was measuring the wrong channel and passing for
    // the wrong reason.
    //
    // The real invariant is that the *anchor* is untouched by time passing: the
    // stored timer must be byte-identical before and after ten seconds, whether
    // the readout ticks or not. That is what a mutation cannot fake.
    doc.setEphemeral({
      timer: {
        startedAt: Date.now(),
        durationMs: 300_000,
        remainingMs: 300_000,
      },
    });
    await renderBar();

    const before = { ...doc.getEphemeral().timer };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    // Untouched. Not merely "the document has no updates".
    expect(doc.getEphemeral().timer).toEqual(before);

    // And no durable write either, which is still worth asserting.
    const updates: unknown[] = [];
    doc.ydoc.on("update", (update: unknown) => updates.push(update));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(updates).toEqual([]);

    // And it really is counting, rather than frozen at 5:00.
    expect(screen.getByTestId("facilitator-timer").textContent).toBe("4:49");
  });

  it("says the time is up rather than showing a negative clock", async () => {
    doc.setEphemeral({
      timer: { startedAt: Date.now(), durationMs: 1_000, remainingMs: 1_000 },
    });
    await renderBar();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    const timer = screen.getByTestId("facilitator-timer");
    expect(timer.textContent).toBe("0:00");
    expect(timer.getAttribute("data-finished")).toBe("true");
  });

  it("labels the clock for a screen reader", async () => {
    // "3:00" alone reads as three hundred, or as a coordinate. The label says
    // what the number is, and AC-8 makes accessibility a gate.
    doc.setEphemeral({
      timer: {
        startedAt: Date.now(),
        durationMs: 300_000,
        remainingMs: 300_000,
      },
    });
    await renderBar();

    expect(
      screen.getByTestId("facilitator-timer").getAttribute("aria-label"),
    ).toContain("Time remaining");
  });

  it("announces politely rather than interrupting every second", async () => {
    doc.setEphemeral({
      timer: {
        startedAt: Date.now(),
        durationMs: 300_000,
        remainingMs: 300_000,
      },
    });
    const { container } = await renderBar();

    // A clock that interrupts every second makes the board unusable with a
    // screen reader, which is a worse outcome than being slightly late.
    expect(
      container.querySelector("[role=status]")?.getAttribute("aria-live"),
    ).toBe("polite");
  });

  it("shows private mode and its way back", async () => {
    doc.setEphemeral({ reveal: { mode: "private" } });
    await renderBar();

    expect(screen.getByTestId("facilitator-private")).toBeDefined();
    const toggle = screen.getByTestId("facilitator-reveal-toggle");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.textContent).toBe("Reveal board");
  });

  it("offers the reveal toggle as a real focusable button", async () => {
    // The one control this bar has, and it earns its place: hiding a board
    // changes what is on screen without changing any control's appearance, so
    // without this the state is legible only to whoever remembers pressing it.
    doc.setEphemeral({ reveal: { mode: "private" } });
    await renderBar();

    const toggle = screen.getByTestId("facilitator-reveal-toggle");
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.getAttribute("type")).toBe("button");
  });

  it("repaints when the timer is started, with nothing written", async () => {
    /*
     * The bug above, asserted.
     *
     * The state is changed *after* the bar is mounted, through the announcement path
     * the real seam uses. Nothing durable happens at any point, so this only passes
     * if the bar is listening to the ephemeral signal rather than to the document.
     */
    await renderBar();
    expect(screen.queryByTestId("facilitator-timer")).toBeNull();

    const updates: unknown[] = [];
    doc.ydoc.on("update", (update: unknown) => updates.push(update));
    const before = doc.durableUpdates;

    const { announceFacilitationChange } = await import("../board/facilitator");
    act(() => {
      doc.setEphemeral({
        timer: {
          startedAt: Date.now(),
          durationMs: 300_000,
          remainingMs: 300_000,
        },
      });
      announceFacilitationChange();
    });

    await waitFor(() =>
      expect(screen.getByTestId("facilitator-timer")).toBeDefined(),
    );

    expect(updates).toEqual([]);
    expect(doc.durableUpdates).toBe(before);
  });

  it("stops its interval when the timer goes away", async () => {
    // A leaked interval on a board with no timer is a repaint a second forever,
    // and it is invisible until someone profiles the tab.
    //
    // Asserted against a baseline rather than against zero. The first version of
    // this test asserted `toBe(0)` and failed -- not because of a leak, but
    // because earlier tests in this file had rendered bars that were still
    // mounted when this one counted. An absolute count measures the whole file;
    // the question is whether *this* component left anything behind.
    doc.setEphemeral({
      timer: {
        startedAt: Date.now(),
        durationMs: 300_000,
        remainingMs: 300_000,
      },
    });

    const baseline = vi.getTimerCount();
    const { unmount } = await renderBar();

    expect(vi.getTimerCount()).toBe(baseline + 1);
    unmount();
    expect(vi.getTimerCount()).toBe(baseline);
  });
});
