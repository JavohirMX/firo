/**
 * Tests for Sticky Note Clustering.
 */
import { describe, expect, test, vi } from "vitest";

import { generateKeyBetween } from "@firo/fractional-indexing";

import { asElementId, asFractionalIndex } from "@firo/schema";

import type { StickyNoteElement } from "@firo/schema";

import { createLlmClient } from "../src/client.js";
import { clusterStickyNotes } from "../src/operations/cluster.js";

const makeNote = (
  id: string,
  text: string,
  x = 0,
  y = 0,
): StickyNoteElement => ({
  id: asElementId(id),
  type: "stickynote",
  text,
  x,
  y,
  width: 200,
  height: 200,
  angle: 0 as any,
  strokeColor: "#1e1e1e",
  backgroundColor: "#fff9b1",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roundness: null,
  roughness: 1,
  opacity: 100,
  fontSize: 16,
  fontFamily: 1,
  textAlign: "center",
  verticalAlign: "middle",
  isContainer: false,
  version: 1,
  versionNonce: 12345,
  index: asFractionalIndex(generateKeyBetween(null, null)),
  created: 1000,
  updated: 1000,
  isDeleted: false,
  groupIds: [],
  frameId: null,
  containerId: null,
  bindings: [],
  link: null,
  locked: false,
});

describe("Sticky Note Clustering", () => {
  test("returns empty result if no sticky notes provided", async () => {
    const mockClient = createLlmClient({
      fetchFn: vi.fn(),
    });

    const result = await clusterStickyNotes([], mockClient);
    expect(result.clusters).toHaveLength(0);
    expect(result.frames).toHaveLength(0);
    expect(result.mutations).toHaveLength(0);
  });

  test("clusters sticky notes into distinct spatial groups and enclosing frames", async () => {
    const notes = [
      makeNote("n1", "Improve OAuth2 login flow"),
      makeNote("n2", "JWT token expiry bug"),
      makeNote("n3", "Canvas pan lag on 4K monitors"),
      makeNote("n4", "Reduce re-render frequency on pointer move"),
      makeNote("n5", "Team lunch on Friday"), // unassigned note
    ];

    const mockResponse = {
      clusters: [
        {
          id: "auth",
          title: "Authentication & Security",
          topic: "User login and session management",
          sentiment: "neutral",
          keywords: ["auth", "jwt", "oauth"],
          noteIds: ["n1", "n2"],
        },
        {
          id: "perf",
          title: "Rendering Performance",
          topic: "Canvas optimization and frame rate",
          sentiment: "negative",
          keywords: ["canvas", "lag", "re-render"],
          noteIds: ["n3", "n4"],
        },
      ],
    };

    const mockClient = createLlmClient({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify(mockResponse),
          },
        }),
      }) as any,
    });

    const result = await clusterStickyNotes(notes, mockClient, {
      originX: 100,
      originY: 200,
      clusterGap: 80,
    });

    expect(result.clusters).toHaveLength(3); // auth, perf, miscellaneous (for n5)
    expect(result.frames).toHaveLength(3);

    const authCluster = result.clusters.find((c) => c.id === "auth")!;
    expect(authCluster.title).toBe("Authentication & Security");
    expect(authCluster.sentiment).toBe("neutral");
    expect(authCluster.noteIds).toEqual(["n1", "n2"]);

    const perfCluster = result.clusters.find((c) => c.id === "perf")!;
    expect(perfCluster.title).toBe("Rendering Performance");
    expect(perfCluster.sentiment).toBe("negative");
    expect(perfCluster.noteIds).toEqual(["n3", "n4"]);

    const miscCluster = result.clusters.find((c) => c.id === "cluster-misc")!;
    expect(miscCluster.noteIds).toEqual(["n5"]);

    // Verify spatial separation: cluster 2 must be placed to the right of cluster 1
    const frame1 = result.frames[0];
    const frame2 = result.frames[1];
    expect(frame1.name).toBe("Authentication & Security");
    expect(frame2.name).toBe("Rendering Performance");
    expect(frame2.x).toBeGreaterThanOrEqual(frame1.x + frame1.width + 80);

    // Verify mutations: create frames and update notes
    expect(result.mutations).toHaveLength(2);
    expect(result.mutations[0].kind).toBe("createElements");
    expect(result.mutations[1].kind).toBe("updateElements");

    const updateMut = result.mutations[1] as {
      kind: "updateElements";
      updates: Array<{ id: string; changes: any }>;
    };
    expect(updateMut.updates).toHaveLength(5);

    // Assert that note positions are within their cluster's frame bounds
    const n1Update = updateMut.updates.find((u) => u.id === "n1")!;
    expect(n1Update.changes.frameId).toBe(frame1.id);
    expect(n1Update.changes.x).toBeGreaterThanOrEqual(frame1.x);
    expect(n1Update.changes.y).toBeGreaterThanOrEqual(frame1.y);

    const n3Update = updateMut.updates.find((u) => u.id === "n3")!;
    expect(n3Update.changes.frameId).toBe(frame2.id);
    expect(n3Update.changes.x).toBeGreaterThanOrEqual(frame2.x);
  });
});
