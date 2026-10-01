import { describe, expect, it } from "vitest";

import { aggregate, inclusive, type CpuProfile } from "./profile";

/*
 * Tests for the profile aggregation, not for the renderer.
 *
 * These exist because the aggregation is what turns a raw Chrome profile into a
 * claim, and a wrong claim here is indistinguishable from a wrong claim about
 * the renderer. Both bugs below were possible and neither was visible in the
 * output: one inflated a total, the other would have made a function look like
 * it owned the whole frame.
 */

const node = (
  id: number,
  functionName: string,
  children: number[] = [],
): CpuProfile["nodes"][number] => ({
  id,
  callFrame: {
    functionName,
    url: "http://localhost:3000/app.js",
    lineNumber: 0,
  },
  children,
});

/** A profile whose every sample lands on one node, for exact arithmetic. */
const single = (
  nodes: CpuProfile["nodes"],
  samples: number[],
  timeDeltas: number[],
): CpuProfile => ({ nodes, samples, timeDeltas });

describe("aggregate", () => {
  it("sums self time per function", () => {
    const profile = single(
      [node(1, "a"), node(2, "b")],
      [1, 2, 1],
      [1000, 2000, 3000],
    );
    const totals = aggregate(profile);
    const a = totals.find((f) => f.name === "a");
    expect(a?.selfMs).toBe(4);
    expect(totals.find((f) => f.name === "b")?.selfMs).toBe(2);
  });

  it("ranks by self time, descending", () => {
    const profile = single(
      [node(1, "cheap"), node(2, "costly")],
      [1, 2],
      [1000, 9000],
    );
    expect(aggregate(profile)[0].name).toBe("costly");
  });

  it("groups anonymous frames instead of dropping them", () => {
    const profile = single([node(1, "")], [1], [5000]);
    expect(aggregate(profile)[0].name).toBe("(anonymous)");
  });

  it("ignores samples pointing at nodes the profile does not contain", () => {
    const profile = single([node(1, "a")], [1, 99], [1000, 4000]);
    expect(aggregate(profile).reduce((s, f) => s + f.selfMs, 0)).toBe(1);
  });
});

describe("inclusive", () => {
  it("charges an ancestor for its descendants' time", () => {
    // root -> middle -> leaf, all 1000us of self time on the leaf.
    const profile = single(
      [node(1, "root", [2]), node(2, "middle", [3]), node(3, "leaf")],
      [3],
      [1000],
    );
    const byName = new Map(
      inclusive(profile).totals.map((f) => [f.name, f.inclMs]),
    );
    expect(byName.get("leaf")).toBe(1);
    expect(byName.get("middle")).toBe(1);
    expect(byName.get("root")).toBe(1);
  });

  it("keeps self and inclusive apart", () => {
    // root has 500us of its own and a child with 500us.
    const profile = single(
      [node(1, "root", [2]), node(2, "leaf")],
      [1, 2],
      [500, 500],
    );
    const self = aggregate(profile);
    const incl = new Map(inclusive(profile).totals.map((f) => [f.name, f]));
    expect(self.find((f) => f.name === "root")?.selfMs).toBe(0.5);
    expect(incl.get("root")?.selfMs).toBe(0);
    expect(incl.get("root")?.inclMs).toBe(1);
  });

  /*
   * The bug this guards against: a naive walk adds each node's self time to
   * every ancestor, so a recursive call is counted once per appearance. Chrome
   * profiles renderer frames as genuinely recursive, so this is the normal
   * case, not a corner one.
   */
  it("does not double count a recursive call", () => {
    // ping -> pong -> ping. 1000us at each of the two nodes.
    const profile = single(
      [node(1, "ping", [2]), node(2, "pong", [1])],
      [1, 2],
      [1000, 1000],
    );
    const { totals } = inclusive(profile);
    const ping = totals.find((f) => f.name === "ping");
    const pong = totals.find((f) => f.name === "pong");
    // Each function is charged at most the 2ms that was actually sampled.
    expect(ping?.inclMs).toBeLessThanOrEqual(2);
    expect(pong?.inclMs).toBeLessThanOrEqual(2);
  });

  it("does not blow up on a cycle with no samples", () => {
    const profile = single(
      [node(1, "ping", [2]), node(2, "pong", [1])],
      [],
      [],
    );
    expect(() => inclusive(profile)).not.toThrow();
    expect(inclusive(profile).totals).toEqual([]);
  });

  it("finds roots even when they are listed last", () => {
    const profile = single(
      [node(2, "leaf"), node(1, "root", [2])],
      [2],
      [1000],
    );
    expect(
      inclusive(profile).totals.find((f) => f.name === "root")?.inclMs,
    ).toBe(1);
  });

  it("reports the heaviest path outermost first", () => {
    const profile = single(
      [node(1, "root", [2]), node(2, "middle", [3]), node(3, "leaf")],
      [3],
      [7000],
    );
    const { heaviestPath } = inclusive(profile);
    expect(heaviestPath[0]).toContain("root");
    expect(heaviestPath[heaviestPath.length - 1]).toContain("leaf");
  });

  it("ignores a child id the profile does not contain", () => {
    const profile = single([node(1, "root", [42])], [1], [1000]);
    expect(() => inclusive(profile)).not.toThrow();
    expect(
      inclusive(profile).totals.find((f) => f.name === "root")?.inclMs,
    ).toBe(1);
  });

  it("survives a profile with no samples and no deltas", () => {
    expect(() => inclusive({ nodes: [node(1, "a")] })).not.toThrow();
    expect(inclusive({ nodes: [node(1, "a")] }).totals).toEqual([]);
  });

  it("never reports inclusive time above the time actually sampled", () => {
    // Deep chain, 1ms total. Every inclusive figure must be at most 1ms, which
    // is the invariant a double count would break.
    const nodes = Array.from({ length: 40 }, (_, i) =>
      node(i + 1, `f${i}`, i < 39 ? [i + 2] : []),
    );
    const profile = single(nodes, [40], [1000]);
    for (const fn of inclusive(profile).totals) {
      expect(fn.inclMs).toBeLessThanOrEqual(1);
    }
  });
});
