/**
 * Tests for Text-to-Diagram.
 */
import { describe, expect, test, vi } from "vitest";

import { isElementType, proseMirrorToPlainText } from "@firo/schema";

import type { LinearElement, ShapeElement } from "@firo/schema";

import { createLlmClient } from "../src/client.js";
import { textToDiagram } from "../src/operations/diagram.js";

describe("Text-to-Diagram", () => {
  test("converts natural language workflow into structured shapes and arrows", async () => {
    const description =
      "User submits login form -> verify credentials -> if valid, go to dashboard; if invalid, show error message.";

    const mockResponse = {
      title: "Authentication Workflow",
      nodes: [
        {
          id: "submit",
          label: "Submit Login Form",
          shape: "rectangle",
          role: "step",
        },
        {
          id: "verify",
          label: "Credentials Valid?",
          shape: "diamond",
          role: "decision",
        },
        {
          id: "dashboard",
          label: "Redirect to Dashboard",
          shape: "rectangle",
          role: "step",
        },
        {
          id: "error",
          label: "Display Error Notice",
          shape: "rectangle",
          role: "step",
        },
      ],
      edges: [
        { from: "submit", to: "verify" },
        { from: "verify", to: "dashboard", label: "Yes" },
        { from: "verify", to: "error", label: "No" },
      ],
    };

    const mockClient = createLlmClient({
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: JSON.stringify(mockResponse) },
        }),
      }) as any,
    });

    const result = await textToDiagram(description, mockClient, {
      originX: 100,
      originY: 100,
    });

    expect(result.title).toBe("Authentication Workflow");
    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(3);

    // Filter elements
    const shapes = result.elements.filter(
      (el): el is ShapeElement =>
        el.type === "rectangle" ||
        el.type === "diamond" ||
        el.type === "ellipse",
    );
    expect(shapes).toHaveLength(4);

    const diamond = shapes.find((s) => s.type === "diamond")!;
    expect(diamond).toBeDefined();
    expect(proseMirrorToPlainText(diamond.text!)).toBe("Credentials Valid?");

    // Check arrows
    const arrows = result.elements.filter(
      (el): el is LinearElement => el.type === "arrow",
    );
    expect(arrows).toHaveLength(3);

    // Verify arrow bindings
    for (const arrow of arrows) {
      expect(arrow.bindings).toHaveLength(2);
      expect(arrow.endArrowhead).toBe("arrow");
      expect(arrow.elbowed).toBe(true);
    }

    // Check edge labels
    const labels = result.elements.filter((el) => isElementType(el, "text"));
    const labelTexts = labels.map((l: any) => l.text);
    expect(labelTexts).toContain("Yes");
    expect(labelTexts).toContain("No");

    // Check mutations
    expect(result.mutations).toHaveLength(1);
    expect(result.mutations[0].kind).toBe("createElements");
    const createMut = result.mutations[0] as {
      kind: "createElements";
      elements: readonly any[];
    };
    expect(createMut.elements).toEqual(result.elements);
  });
});
