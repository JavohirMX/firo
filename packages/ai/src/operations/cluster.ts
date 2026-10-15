/**
 * Sticky note clustering operation.
 *
 * Analyzes sticky notes by keyword, topic, and sentiment; groups them into distinct
 * spatial clusters (with optional enclosing canvas frames) and generated group titles.
 */
import { asElementId, isElementType } from "@firo/schema";

import type {
  FiroElement,
  FrameElement,
  StickyNoteElement,
} from "@firo/schema";

import type { ElementUpdate, Mutation } from "@firo/doc";
import type { Radians } from "@firo/math";

import { createElementBase } from "./utils.js";

import type {
  ClusterOptions,
  ClusterResult,
  LlmClient,
  SentimentType,
  StickyCluster,
} from "../types.js";

type RawClusterResponse = {
  clusters?: Array<{
    id?: string;
    title?: string;
    topic?: string;
    sentiment?: string;
    keywords?: string[];
    noteIds?: string[];
  }>;
};

const NOTE_WIDTH = 200;
const NOTE_HEIGHT = 200;
const NOTE_GAP = 24;
const FRAME_PADDING = 32;
const FRAME_TITLE_HEIGHT = 48;
const DEFAULT_CLUSTER_GAP = 120;
const DEFAULT_COLUMNS = 3;

/**
 * Clusters sticky notes by topic, keyword, and sentiment, and calculates
 * non-overlapping spatial positions and optional enclosing frames.
 */
export async function clusterStickyNotes(
  notesOrElements: readonly FiroElement[],
  client: LlmClient,
  options: ClusterOptions = {},
): Promise<ClusterResult> {
  const stickyNotes = notesOrElements.filter(
    (el): el is StickyNoteElement =>
      !el.isDeleted && isElementType(el, "stickynote"),
  );

  if (stickyNotes.length === 0) {
    return {
      clusters: [],
      frames: [],
      mutations: [],
    };
  }

  // Build prompt for LLM
  const notesSummary = stickyNotes.map((note) => ({
    id: note.id,
    text: note.text,
    tags: note.tags ?? [],
  }));

  const prompt = `You are an AI assistant organizing a collaborative whiteboard.
Analyze the following sticky notes by keywords, core topic, and sentiment (positive, neutral, negative, mixed).
Group every sticky note into logical clusters with meaningful, descriptive titles.

Notes:
${JSON.stringify(notesSummary, null, 2)}

Respond with a JSON object conforming to:
{
  "clusters": [
    {
      "id": "cluster-1",
      "title": "Descriptive Group Title",
      "topic": "Brief summary of the group's theme",
      "sentiment": "positive" | "neutral" | "negative" | "mixed",
      "keywords": ["keyword1", "keyword2"],
      "noteIds": ["note-id-1", "note-id-2"]
    }
  ]
}
Every note id must be assigned to exactly one cluster. Return JSON only.`;

  const rawResult = await client.completeJson<RawClusterResponse>(prompt);
  const rawClusters = rawResult.clusters ?? [];

  // Account for all note IDs
  const assignedNoteIds = new Set<string>();
  const validClusters: Array<{
    id: string;
    title: string;
    topic: string;
    sentiment: SentimentType;
    keywords: string[];
    noteIds: string[];
  }> = [];

  for (let i = 0; i < rawClusters.length; i++) {
    const rc = rawClusters[i];
    const clusterId = rc.id || `cluster-${i + 1}`;
    const title = rc.title || `Cluster ${i + 1}`;
    const topic = rc.topic || "";
    const rawSentiment = (rc.sentiment || "neutral").toLowerCase();
    const sentiment: SentimentType =
      rawSentiment === "positive" ||
      rawSentiment === "negative" ||
      rawSentiment === "mixed"
        ? rawSentiment
        : "neutral";
    const keywords = Array.isArray(rc.keywords) ? rc.keywords : [];

    const noteIds: string[] = [];
    if (Array.isArray(rc.noteIds)) {
      for (const nid of rc.noteIds) {
        if (
          stickyNotes.some((n) => n.id === nid) &&
          !assignedNoteIds.has(nid)
        ) {
          noteIds.push(nid);
          assignedNoteIds.add(nid);
        }
      }
    }

    if (noteIds.length > 0) {
      validClusters.push({
        id: clusterId,
        title,
        topic,
        sentiment,
        keywords,
        noteIds,
      });
    }
  }

  // Catch any unassigned notes into a fallback cluster
  const unassignedNotes = stickyNotes.filter((n) => !assignedNoteIds.has(n.id));
  if (unassignedNotes.length > 0) {
    if (validClusters.length > 0) {
      // Add to first cluster or miscellaneous
      validClusters.push({
        id: `cluster-misc`,
        title: "Miscellaneous",
        topic: "Additional thoughts and notes",
        sentiment: "neutral",
        keywords: ["other"],
        noteIds: unassignedNotes.map((n) => n.id),
      });
    } else {
      validClusters.push({
        id: "cluster-1",
        title: "All Notes",
        topic: "Board thoughts",
        sentiment: "neutral",
        keywords: [],
        noteIds: stickyNotes.map((n) => n.id),
      });
    }
  }

  // Spatial Layout
  const originX = options.originX ?? 0;
  const originY = options.originY ?? 0;
  const columnsPerCluster = options.columnsPerCluster ?? DEFAULT_COLUMNS;
  const clusterGap = options.clusterGap ?? DEFAULT_CLUSTER_GAP;
  const shouldCreateFrames = options.createFrames !== false;

  let currentClusterX = originX;
  const updates: ElementUpdate[] = [];
  const frames: FrameElement[] = [];
  const finalClusters: StickyCluster[] = [];

  for (let cIdx = 0; cIdx < validClusters.length; cIdx++) {
    const c = validClusters[cIdx];
    const count = c.noteIds.length;
    const cols = Math.max(1, Math.min(count, columnsPerCluster));
    const rows = Math.ceil(count / cols);

    const notesAreaWidth = cols * NOTE_WIDTH + (cols - 1) * NOTE_GAP;
    const notesAreaHeight = rows * NOTE_HEIGHT + (rows - 1) * NOTE_GAP;

    const frameWidth = notesAreaWidth + FRAME_PADDING * 2;
    const frameHeight =
      notesAreaHeight + FRAME_PADDING * 2 + FRAME_TITLE_HEIGHT;

    const frameX = currentClusterX;
    const frameY = originY;

    const frameId = asElementId(`frame-${c.id}-${Date.now()}-${cIdx}`);

    if (shouldCreateFrames) {
      const frame: FrameElement = {
        ...createElementBase(frameId, "frame", {
          x: frameX,
          y: frameY,
          width: frameWidth,
          height: frameHeight,
          angle: 0 as Radians,
        }),
        type: "frame",
        name: c.title,
        strokeColor: "#999999",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roundness: { type: 3 },
        roughness: 0,
        opacity: 100,
      };
      frames.push(frame);
    }

    // Position each note inside this cluster
    for (let nIdx = 0; nIdx < c.noteIds.length; nIdx++) {
      const noteId = c.noteIds[nIdx];
      const col = nIdx % cols;
      const row = Math.floor(nIdx / cols);

      const noteX = frameX + FRAME_PADDING + col * (NOTE_WIDTH + NOTE_GAP);
      const noteY =
        frameY +
        FRAME_PADDING +
        FRAME_TITLE_HEIGHT +
        row * (NOTE_HEIGHT + NOTE_GAP);

      updates.push({
        id: noteId,
        changes: {
          x: noteX,
          y: noteY,
          ...(shouldCreateFrames ? { frameId } : {}),
        },
      });
    }

    finalClusters.push({
      id: c.id,
      title: c.title,
      topic: c.topic,
      sentiment: c.sentiment,
      keywords: c.keywords,
      noteIds: c.noteIds,
      bounds: {
        x: frameX,
        y: frameY,
        width: frameWidth,
        height: frameHeight,
      },
    });

    currentClusterX += frameWidth + clusterGap;
  }

  const mutations: Mutation[] = [];
  if (frames.length > 0) {
    mutations.push({ kind: "createElements", elements: frames });
  }
  if (updates.length > 0) {
    mutations.push({ kind: "updateElements", updates });
  }

  return {
    clusters: finalClusters,
    frames,
    mutations,
  };
}
