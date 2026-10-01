import { describe, expect, it } from "vitest";

import { formatReport, type RunReport } from "./harness";

/*
 * The report is the product here. A benchmark that flatters itself is worse than
 * no benchmark, and the specific way this one flattered itself was printing 0.0
 * for a level that collected no frames -- which reads as the best possible frame
 * time, and still let the run print PASSES.
 *
 * These tests pin the two cases where a missing measurement could be mistaken for
 * a good one.
 */

const frame = (over: Partial<RunReport["scenarios"][0]["frames"]> = {}) => ({
  frames: 100,
  durations: [8, 9, 10],
  meanMs: 9,
  p50: 9,
  p95: 10,
  max: 10,
  fps: 111,
  dropped: 0,
  ...over,
});

const report = (over: Partial<RunReport> = {}): RunReport => ({
  options: {
    count: 10,
    viewport: { width: 1280, height: 800 },
    sampleMs: 3000,
    baseUrl: "http://localhost:3000",
  },
  scene: {
    count: 10,
    profile: "realistic",
    seed: 1,
    worldSize: 1024,
    expectedVisible: 10,
    extent: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    byType: { rectangle: 10 },
  },
  scenarios: [{ name: "pan", frames: frame(), heapBytes: null }],
  zoom: [
    { requested: 1, applied: 1, frames: frame() },
    {
      requested: 0.1,
      applied: 0.1,
      frames: frame({ frames: 0, durations: [], meanMs: 0, max: 0 }),
    },
  ],
  idleHeapBytes: 1000,
  userAgent: "Mozilla/5.0 Chrome/153.0.0.0",
  renderer: { raw: "ANGLE (Apple, Metal)", kind: "gpu" },
  ...over,
});

describe("formatReport", () => {
  it("does not print a number for a level that collected no frames", () => {
    const out = formatReport(report());
    expect(out).toContain("NO DATA");
  });

  it("does not report 0.0 ms for a starved level", () => {
    // 0.0 is the best frame time there is, so printing it for an unmeasured
    // level is the specific lie this guards against.
    const out = formatReport(report());
    expect(out).not.toMatch(/^\s+0\.0\s+0\s+/m);
  });

  it("refuses to judge criterion 5 when a level starved", () => {
    const out = formatReport(report());
    expect(out).toContain("CANNOT JUDGE criterion 5");
    expect(out).not.toContain("PASSES criterion 5");
  });

  it("names the level that starved", () => {
    expect(formatReport(report())).toContain("10%");
  });

  it("still passes when every level reported", () => {
    const out = formatReport(
      report({
        zoom: [
          { requested: 1, applied: 1, frames: frame() },
          { requested: 0.1, applied: 0.1, frames: frame({ max: 40 }) },
        ],
      }),
    );
    expect(out).toContain("PASSES criterion 5");
    expect(out).not.toContain("NO DATA");
  });

  it("still fails when a reported level is over budget", () => {
    const out = formatReport(
      report({
        zoom: [
          { requested: 1, applied: 1, frames: frame({ max: 250 }) },
          { requested: 0.1, applied: 0.1, frames: frame() },
        ],
      }),
    );
    expect(out).toContain("FAILS criterion 5");
  });

  it("states the renderer, since the numbers depend on it", () => {
    expect(formatReport(report())).toContain("GPU");
  });

  it("warns when --gpu did not actually get a GPU", () => {
    const out = formatReport(
      report({
        options: { ...report().options, gpu: true },
        renderer: { raw: "SwiftShader", kind: "software" },
      }),
    );
    expect(out).toContain("WARNING");
    expect(out).toContain("SOFTWARE");
  });

  it("does not warn when --gpu was not requested", () => {
    const out = formatReport(
      report({ renderer: { raw: "SwiftShader", kind: "software" } }),
    );
    expect(out).not.toContain("WARNING");
    expect(out).toContain("SOFTWARE");
  });
});
