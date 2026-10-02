import { describe, expect, it } from "vitest";

import { aggregateEvents, formatTrace } from "./trace.js";

import type { TraceEvent } from "./trace.js";

/**
 * Trace aggregation.
 *
 * ## Why the aggregation needs its own tests
 *
 * The failure mode here is not a crash, it is a plausible number. A trace of a slow
 * frame that is aggregated wrongly still prints a ranked table; the table is just
 * about something other than what happened, and the person reading it has no way to
 * tell. That is the same trap the plan's own §2.1a section is about — a measurement
 * that cannot detect its own failure is worse than no measurement, because it is
 * believed.
 *
 * So the awkward cases are pinned here rather than left to a live run to discover:
 * nested `B`/`E` pairs (most events nest), an `E` with no `B` (a truncated trace),
 * `X` events, and instants. A change that gets any of them wrong fails here instead of
 * quietly re-ranking the report.
 */

/** A `B`/`E` pair of `durUs` microseconds. */
const pair = (name: string, durUs: number, thread = 1): TraceEvent[] => [
  { name, ph: "B", ts: 0, pid: 1, tid: thread },
  { name, ph: "E", ts: durUs, pid: 1, tid: thread },
];

describe("aggregateEvents", () => {
  it("times a B/E pair", () => {
    const [cost] = aggregateEvents(pair("Paint", 2000));
    expect(cost).toMatchObject({
      name: "Paint",
      count: 1,
      totalMs: 2,
      maxMs: 2,
    });
  });

  it("sums repeated events and keeps the longest", () => {
    const costs = aggregateEvents([
      ...pair("Paint", 1000),
      ...pair("Paint", 3000),
    ]);
    expect(costs[0]).toMatchObject({
      name: "Paint",
      count: 2,
      totalMs: 4,
      maxMs: 3,
    });
  });

  it("nests correctly, which is the case most events take", () => {
    /*
     * `Commit` contains `Paint` contains `RasterTask`, and all three nest. A flat sum
     * over all durations would report more time than the window contains, which is
     * why `formatTrace` says durations are not a percentage of a frame.
     *
     * What must hold is that each event keeps *its own* duration rather than its
     * parent's: `RasterTask` here is 1 ms, not the 10 ms its ancestors span.
     */
    const byName = new Map(
      aggregateEvents([
        { name: "Commit", ph: "B", ts: 0, pid: 1, tid: 1 },
        { name: "Paint", ph: "B", ts: 1000, pid: 1, tid: 1 },
        { name: "RasterTask", ph: "B", ts: 2000, pid: 1, tid: 1 },
        { name: "RasterTask", ph: "E", ts: 3000, pid: 1, tid: 1 },
        { name: "Paint", ph: "E", ts: 9000, pid: 1, tid: 1 },
        { name: "Commit", ph: "E", ts: 10_000, pid: 1, tid: 1 },
      ]).map((cost) => [cost.name, cost]),
    );

    expect(byName.get("Commit")).toMatchObject({ totalMs: 10 });
    expect(byName.get("Paint")).toMatchObject({ totalMs: 8 });
    expect(byName.get("RasterTask")).toMatchObject({ totalMs: 1 });
  });

  it("separates threads, because they run at once", () => {
    /*
     * Traces are per-thread and the threads overlap. Keeping one stack per thread is
     * what stops a raster thread's `B` from popping the compositor's, which would
     * produce a duration spanning both and make the report confidently wrong.
     */
    const costs = new Map(
      aggregateEvents([
        ...pair("RasterTask", 5000, 1),
        ...pair("Paint", 1000, 2),
      ]).map((cost) => [cost.name, cost]),
    );

    expect(costs.get("RasterTask")).toMatchObject({ totalMs: 5 });
    expect(costs.get("Paint")).toMatchObject({ totalMs: 1 });
  });

  it("counts an E with no B without inventing a duration", () => {
    // What a truncated trace looks like. Reporting a duration here would be inventing
    // one, and an invented duration in a ranked table is indistinguishable from a real
    // one.
    const [cost] = aggregateEvents([
      { name: "Paint", ph: "E", ts: 1000, pid: 1, tid: 1 },
    ]);
    expect(cost).toMatchObject({ name: "Paint", count: 1, totalMs: 0 });
  });

  it("reads an X event's own duration", () => {
    const [cost] = aggregateEvents([
      { name: "DrawFrame", ph: "X", ts: 0, dur: 8000, pid: 1, tid: 1 },
    ]);
    expect(cost).toMatchObject({ name: "DrawFrame", totalMs: 8, maxMs: 8 });
  });

  it("counts an instant without timing it", () => {
    // Instants have no duration by definition. Counting them keeps the event count
    // honest; timing them would mean reporting 0 ms as though it were a measurement.
    const [cost] = aggregateEvents([
      { name: "TracingStartedInBrowser", ph: "I", ts: 0, pid: 1, tid: 1 },
    ]);
    expect(cost).toMatchObject({ count: 1, totalMs: 0, maxMs: 0 });
  });

  it("never reports a negative duration, whatever the timestamps say", () => {
    // A clock that goes backwards, or an event that arrives out of order. `Math.max(0)`
    // is the whole defence, and the assertion is that a negative total cannot appear:
    // it would sort to the top of the table and be the most alarming line in it.
    const [cost] = aggregateEvents([
      { name: "Paint", ph: "B", ts: 5000, pid: 1, tid: 1 },
      { name: "Paint", ph: "E", ts: 1000, pid: 1, tid: 1 },
    ]);
    expect(cost.totalMs).toBe(0);
    expect(cost.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("sorts by total time, so the report leads with the heaviest", () => {
    const costs = aggregateEvents([
      ...pair("Cheap", 100),
      ...pair("Heavy", 9000),
      ...pair("Middling", 1000),
    ]);
    expect(costs.map((cost) => cost.name)).toEqual([
      "Heavy",
      "Middling",
      "Cheap",
    ]);
  });

  it("returns nothing for an empty trace, rather than throwing", () => {
    // Which is what an uninstrumented run looks like, and `formatTrace` has a message
    // for it precisely because an empty table reads as "no cost" rather than "no data".
    expect(aggregateEvents([])).toEqual([]);
  });
});

describe("formatTrace", () => {
  it("says so when there is nothing to report", () => {
    // The distinction that matters: an empty trace means the categories were not
    // instrumented, not that the frame was free.
    const text = formatTrace([
      {
        label: "zoom 0.1",
        renderer: "test",
        windowMs: 4000,
        events: 0,
        timed: 0,
        costs: [],
        longest: null,
      },
    ]);
    expect(text).toMatch(/not instrumented/);
  });

  it("prints the renderer, because it changes the answer", () => {
    const text = formatTrace([
      {
        label: "zoom 0.5",
        renderer: "ANGLE (SwiftShader)",
        windowMs: 4000,
        events: 3,
        timed: 1,
        costs: [{ name: "Paint", count: 2, totalMs: 4, maxMs: 3 }],
        longest: { name: "Paint", count: 2, totalMs: 4, maxMs: 3 },
      },
    ]);
    expect(text).toMatch(/SwiftShader/);
    expect(text).toMatch(/Paint/);
  });

  it("warns that the durations are not a share of the frame", () => {
    // The single most misleading thing a reader could take from this table. Stated in
    // the output rather than only in the source, because the output is what gets
    // pasted into a plan document.
    const text = formatTrace([]);
    expect(text).toMatch(/nest/);
    expect(text).toMatch(/not as a/);
  });
});
