/**
 * Shared layout and element construction utilities for AI operations.
 */
import { generateKeyBetween } from "@firo/fractional-indexing";

import { asElementId, asFractionalIndex, firoTextSchema } from "@firo/schema";

import type {
  ElementBase,
  ElementGeometry,
  ElementStyle,
  ProseMirrorDoc,
} from "@firo/schema";

export const freshNonce = (): number => Math.floor(Math.random() * 2 ** 31);

export function textToProseMirrorDoc(text: string): ProseMirrorDoc {
  const trimmed = text.trim();
  const paragraphs = trimmed ? trimmed.split("\n\n") : [""];
  const nodes = paragraphs.map((p) => {
    const textNode = p ? [firoTextSchema.text(p)] : [];
    return firoTextSchema.node("paragraph", null, textNode);
  });
  return firoTextSchema.node("doc", null, nodes).toJSON() as ProseMirrorDoc;
}

export const DEFAULT_STYLE: ElementStyle = {
  strokeColor: "#1e1e1e",
  backgroundColor: "#ffffff",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roundness: { type: 3 }, // roundness
  roughness: 1,
  opacity: 100,
};

export function createElementBase(
  id: string,
  type: ElementBase["type"],
  geometry: ElementGeometry,
  overrides: Partial<ElementBase> = {},
): ElementBase {
  const now = Date.now();
  return {
    id: asElementId(id),
    type,
    ...DEFAULT_STYLE,
    ...geometry,
    version: 1,
    versionNonce: freshNonce(),
    index: asFractionalIndex(generateKeyBetween(null, null)),
    created: now,
    updated: now,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    ...overrides,
  };
}
