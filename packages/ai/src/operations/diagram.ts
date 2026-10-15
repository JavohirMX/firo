/**
 * Text-to-diagram operation.
 *
 * Converts natural language process descriptions into structured canvas shapes
 * (rectangles, diamonds, ellipses) and bound, connected arrows.
 */
import { asElementId } from "@firo/schema";

import type {
  Binding,
  FiroElement,
  LinearElement,
  ShapeElement,
  TextElement,
} from "@firo/schema";
import type { Mutation } from "@firo/doc";
import type { Radians } from "@firo/math";

import { createElementBase, textToProseMirrorDoc } from "./utils.js";

import type {
  DiagramEdge,
  DiagramNode,
  DiagramResult,
  DiagramShapeType,
  LlmClient,
  TextToDiagramOptions,
} from "../types.js";

type RawDiagramResponse = {
  title?: string;
  nodes?: Array<{
    id?: string;
    label?: string;
    shape?: string;
    role?: "start" | "end" | "step" | "decision";
  }>;
  edges?: Array<{
    from?: string;
    to?: string;
    label?: string;
  }>;
};

const DEFAULT_ORIGIN_X = 100;
const DEFAULT_ORIGIN_Y = 100;
const RECT_WIDTH = 180;
const RECT_HEIGHT = 70;
const DIAMOND_WIDTH = 160;
const DIAMOND_HEIGHT = 100;
const ELLIPSE_WIDTH = 140;
const ELLIPSE_HEIGHT = 60;
const HORIZONTAL_GAP = 60;
const VERTICAL_GAP = 90;

/**
 * Converts natural language descriptions of flows and processes into positioned
 * shapes and connected arrows.
 */
export async function textToDiagram(
  description: string,
  client: LlmClient,
  options: TextToDiagramOptions = {},
): Promise<DiagramResult> {
  const prompt = `You are an AI diagram designer.
Convert the following natural language process or system description into a structured flowchart graph.

Description:
"""${description}"""

Choose shape types appropriately:
- "ellipse" for start/end points
- "diamond" for conditional questions, checks, or decisions
- "rectangle" for steps, actions, or operations

Respond with a JSON object conforming to:
{
  "title": "Title of the diagram",
  "nodes": [
    {
      "id": "node_1",
      "label": "Text inside node",
      "shape": "rectangle" | "diamond" | "ellipse",
      "role": "start" | "end" | "step" | "decision"
    }
  ],
  "edges": [
    {
      "from": "node_1",
      "to": "node_2",
      "label": "Yes" // optional branch label
    }
  ]
}
Return JSON only.`;

  const raw = await client.completeJson<RawDiagramResponse>(prompt);

  const title = raw.title || "Process Flow";
  const rawNodes = raw.nodes ?? [];
  const rawEdges = raw.edges ?? [];

  // Sanitize nodes
  const nodes: DiagramNode[] = rawNodes.map((n, idx) => {
    const rawShape = (n.shape || "").toLowerCase();
    const shape: DiagramShapeType =
      rawShape === "diamond" || rawShape === "ellipse" ? rawShape : "rectangle";
    return {
      id: n.id || `node_${idx + 1}`,
      label: n.label || `Step ${idx + 1}`,
      shape,
      role: n.role,
    };
  });

  const nodeMap = new Map<string, DiagramNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Sanitize edges
  const edges: DiagramEdge[] = [];
  for (const e of rawEdges) {
    if (e.from && e.to && nodeMap.has(e.from) && nodeMap.has(e.to)) {
      edges.push({
        from: e.from,
        to: e.to,
        label: e.label,
      });
    }
  }

  if (nodes.length === 0) {
    return {
      title,
      nodes: [],
      edges: [],
      elements: [],
      mutations: [],
    };
  }

  // Layout Engine: Level/Rank Assignment (Topological / BFS DAG layout)
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of edges) {
    adj.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  // Assign ranks
  const ranks = new Map<string, number>();
  const queue: string[] = [];

  // Start with nodes having inDegree == 0
  for (const node of nodes) {
    if ((inDegree.get(node.id) ?? 0) === 0) {
      ranks.set(node.id, 0);
      queue.push(node.id);
    }
  }

  // If no root (e.g. cycle), start with the first node
  if (queue.length === 0 && nodes.length > 0) {
    ranks.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currRank = ranks.get(curr) ?? 0;
    const neighbors = adj.get(curr) ?? [];
    for (const nxt of neighbors) {
      const existingRank = ranks.get(nxt);
      if (existingRank === undefined || existingRank < currRank + 1) {
        ranks.set(nxt, currRank + 1);
        queue.push(nxt);
      }
    }
  }

  // Ensure every node has a rank
  for (const node of nodes) {
    if (!ranks.has(node.id)) {
      ranks.set(node.id, 0);
    }
  }

  // Group nodes by rank
  const levels = new Map<number, DiagramNode[]>();
  let maxRank = 0;
  for (const node of nodes) {
    const r = ranks.get(node.id) ?? 0;
    if (r > maxRank) {
      maxRank = r;
    }
    const list = levels.get(r) ?? [];
    list.push(node);
    levels.set(r, list);
  }

  // Dimensions per shape
  const getNodeDimensions = (shape: DiagramShapeType) => {
    switch (shape) {
      case "diamond":
        return { w: DIAMOND_WIDTH, h: DIAMOND_HEIGHT };
      case "ellipse":
        return { w: ELLIPSE_WIDTH, h: ELLIPSE_HEIGHT };
      case "rectangle":
      default:
        return { w: RECT_WIDTH, h: RECT_HEIGHT };
    }
  };

  // Calculate coordinates
  const originX = options.originX ?? DEFAULT_ORIGIN_X;
  const originY = options.originY ?? DEFAULT_ORIGIN_Y;
  const nodePositions = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();

  // Determine row widths to center nodes per level
  const levelWidths = new Map<number, number>();
  let maxLevelWidth = 0;

  for (let r = 0; r <= maxRank; r++) {
    const rowNodes = levels.get(r) ?? [];
    let width = 0;
    for (let i = 0; i < rowNodes.length; i++) {
      const dim = getNodeDimensions(rowNodes[i].shape);
      width += dim.w;
      if (i < rowNodes.length - 1) {
        width += HORIZONTAL_GAP;
      }
    }
    levelWidths.set(r, width);
    if (width > maxLevelWidth) {
      maxLevelWidth = width;
    }
  }

  let currentY = originY;
  for (let r = 0; r <= maxRank; r++) {
    const rowNodes = levels.get(r) ?? [];
    const rowWidth = levelWidths.get(r) ?? 0;
    let currentX = originX + (maxLevelWidth - rowWidth) / 2;
    let maxHeightInRow = 0;

    for (const node of rowNodes) {
      const { w, h } = getNodeDimensions(node.shape);
      if (h > maxHeightInRow) {
        maxHeightInRow = h;
      }
      nodePositions.set(node.id, {
        x: currentX,
        y: currentY,
        width: w,
        height: h,
      });
      currentX += w + HORIZONTAL_GAP;
    }

    currentY += maxHeightInRow + VERTICAL_GAP;
  }

  // Construct FiroElements
  const elements: FiroElement[] = [];

  for (const node of nodes) {
    const pos = nodePositions.get(node.id)!;
    const elementId = asElementId(`diagram-${node.id}`);

    // Color styling based on role and shape
    let strokeColor = "#2b2c30";
    let backgroundColor = "#ffffff";
    if (node.shape === "diamond") {
      strokeColor = "#d97706";
      backgroundColor = "#fff9db";
    } else if (node.shape === "ellipse") {
      strokeColor = "#0ca678";
      backgroundColor = "#e6fcf5";
    } else {
      strokeColor = "#3b5bdb";
      backgroundColor = "#edf2ff";
    }

    const shapeElement: ShapeElement = {
      ...createElementBase(elementId, node.shape, {
        x: pos.x,
        y: pos.y,
        width: pos.width,
        height: pos.height,
        angle: 0 as Radians,
      }),
      type: node.shape,
      strokeColor,
      backgroundColor,
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roundness: node.shape === "rectangle" ? { type: 3 } : null,
      roughness: 1,
      opacity: 100,
      text: textToProseMirrorDoc(node.label),
    };

    elements.push(shapeElement);
  }

  // Build arrow connectors for edges
  for (let eIdx = 0; eIdx < edges.length; eIdx++) {
    const edge = edges[eIdx];
    const sourcePos = nodePositions.get(edge.from)!;
    const targetPos = nodePositions.get(edge.to)!;

    const sourceElId = asElementId(`diagram-${edge.from}`);
    const targetElId = asElementId(`diagram-${edge.to}`);

    // Arrow from bottom of source to top of target (or side if same level)
    let startX = sourcePos.x + sourcePos.width / 2;
    let startY = sourcePos.y + sourcePos.height;
    let endX = targetPos.x + targetPos.width / 2;
    let endY = targetPos.y;

    if (sourcePos.y === targetPos.y) {
      // Same level: route horizontally
      startX = sourcePos.x + sourcePos.width;
      startY = sourcePos.y + sourcePos.height / 2;
      endX = targetPos.x;
      endY = targetPos.y + targetPos.height / 2;
    }

    const arrowId = asElementId(`arrow-${edge.from}-${edge.to}-${eIdx}`);

    const bindings: readonly Binding[] = [
      { elementId: sourceElId, focus: 0, gap: 4 },
      { elementId: targetElId, focus: 0, gap: 4 },
    ];

    const dx = endX - startX;
    const dy = endY - startY;

    // Arrow geometry: bounding box
    const arrowX = Math.min(startX, endX);
    const arrowY = Math.min(startY, endY);
    const arrowWidth = Math.max(1, Math.abs(dx));
    const arrowHeight = Math.max(1, Math.abs(dy));

    const relPoints: readonly (readonly [number, number])[] = [
      [startX - arrowX, startY - arrowY],
      [endX - arrowX, endY - arrowY],
    ];

    const arrowElement: LinearElement = {
      ...createElementBase(arrowId, "arrow", {
        x: arrowX,
        y: arrowY,
        width: arrowWidth,
        height: arrowHeight,
        angle: 0 as Radians,
      }),
      type: "arrow",
      strokeColor: "#495057",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roundness: { type: 2 },
      roughness: 1,
      opacity: 100,
      points: relPoints,
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: true,
      bindings,
    };

    elements.push(arrowElement);

    // If edge has a label, add a TextElement beside the arrow
    if (edge.label && edge.label.trim()) {
      const labelId = asElementId(`label-${arrowId}`);
      const labelText = edge.label.trim();
      const midX = (startX + endX) / 2 + 8;
      const midY = (startY + endY) / 2 - 10;

      const labelElement: TextElement = {
        ...createElementBase(labelId, "text", {
          x: midX,
          y: midY,
          width: 50,
          height: 20,
          angle: 0 as Radians,
        }),
        type: "text",
        text: labelText,
        fontSize: 14,
        fontFamily: 1,
        textAlign: "center",
        verticalAlign: "middle",
        autoResize: true,
        lineHeight: 1.2,
        strokeColor: "#868e96",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roundness: null,
        roughness: 0,
        opacity: 100,
      };

      elements.push(labelElement);
    }
  }

  const mutations: Mutation[] = [
    {
      kind: "createElements",
      elements,
    },
  ];

  return {
    title,
    nodes,
    edges,
    elements,
    mutations,
  };
}
