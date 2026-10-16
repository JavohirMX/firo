/**
 * Canvas drawing helper for Doc Blocks on infinite canvas (§10.5, TRD-05).
 *
 * Renders structured ProseMirror documents onto 2D canvas with:
 * - Layout computed from ProseMirror nodes (headings, paragraphs, lists, quotes, code).
 * - Text measurement caching per (fontFamily, fontSize, fontWeight, text) tuple per TRD-05.
 * - Frozen canvas rendering during active editing (overlay lifecycle step 1).
 */
import { parseDocBlockJson } from "@firo/records";

import type { DocBlockRecord } from "@firo/schema";

import type { Node as ProseMirrorNode } from "prosemirror-model";

/**
 * Text measurement cache per TRD-05:
 * "Measurement is cached per (fontFamily, fontSize, fontWeight, text) tuple.
 * Uncached measureText per layout node is the most common source of canvas text jank."
 */
const textMeasurementCache = new Map<string, number>();

const getCachedTextWidth = (
  context: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: string | number,
): number => {
  const key = `${fontFamily}|${fontSize}|${fontWeight}|${text}`;
  const cached = textMeasurementCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const width = context.measureText(text).width;
  textMeasurementCache.set(key, width);
  return width;
};

export type LayoutLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

export type LayoutBlock = {
  type:
    | "heading"
    | "paragraph"
    | "bulletItem"
    | "orderedItem"
    | "blockquote"
    | "codeBlock"
    | "horizontalRule";
  level?: number;
  orderNumber?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: LayoutLine[];
};

export type DocBlockComputedLayout = {
  width: number;
  height: number;
  contentHeight: number;
  blocks: LayoutBlock[];
};

/**
 * Wrap words into lines based on maximum available width.
 */
const wrapTextToLines = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontFamily: string,
  fontSize: number,
  fontWeight: string | number,
  lineHeight: number,
  startX: number,
  startY: number,
): LayoutLine[] => {
  const words = text.split(/\s+/);
  const lines: LayoutLine[] = [];
  let currentLine = "";
  let currentY = startY;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) {
      continue;
    }
    const testLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
    const testWidth = getCachedTextWidth(
      context,
      testLine,
      fontFamily,
      fontSize,
      fontWeight,
    );

    if (testWidth > maxWidth && currentLine.length > 0) {
      const lineWidth = getCachedTextWidth(
        context,
        currentLine,
        fontFamily,
        fontSize,
        fontWeight,
      );
      lines.push({
        text: currentLine,
        x: startX,
        y: currentY,
        width: lineWidth,
        height: lineHeight,
      });
      currentLine = word;
      currentY += lineHeight;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine.length > 0) {
    const lineWidth = getCachedTextWidth(
      context,
      currentLine,
      fontFamily,
      fontSize,
      fontWeight,
    );
    lines.push({
      text: currentLine,
      x: startX,
      y: currentY,
      width: lineWidth,
      height: lineHeight,
    });
  }

  return lines;
};

/**
 * Compute the layout tree for a ProseMirror document inside a Doc Block container.
 */
export const computeDocBlockLayout = (
  context: CanvasRenderingContext2D,
  doc: ProseMirrorNode | Record<string, unknown>,
  availableWidth: number,
  baseFontSize = 16,
  fontFamily = "sans-serif",
  padding = 24,
): DocBlockComputedLayout => {
  const node =
    "content" in doc ? (doc as ProseMirrorNode) : parseDocBlockJson(doc);
  const contentWidth = Math.max(availableWidth - padding * 2, 100);
  const blocks: LayoutBlock[] = [];

  let currentY = padding;

  node.forEach((child) => {
    const blockType = child.type.name;

    if (blockType === "heading") {
      const level = (child.attrs.level as number) || 1;
      const headingFontSize =
        level === 1
          ? Math.round(baseFontSize * 1.75)
          : level === 2
          ? Math.round(baseFontSize * 1.4)
          : Math.round(baseFontSize * 1.15);
      const lineHeight = Math.round(headingFontSize * 1.3);
      const text = child.textContent;

      const lines = wrapTextToLines(
        context,
        text,
        contentWidth,
        fontFamily,
        headingFontSize,
        "bold",
        lineHeight,
        padding,
        currentY,
      );

      const blockHeight = Math.max(lines.length * lineHeight, lineHeight);
      blocks.push({
        type: "heading",
        level,
        x: padding,
        y: currentY,
        width: contentWidth,
        height: blockHeight,
        lines,
      });
      currentY += blockHeight + 12;
    } else if (blockType === "paragraph") {
      const fontSize = baseFontSize;
      const lineHeight = Math.round(fontSize * 1.5);
      const text = child.textContent;

      if (!text.trim()) {
        currentY += lineHeight / 2;
        return;
      }

      const lines = wrapTextToLines(
        context,
        text,
        contentWidth,
        fontFamily,
        fontSize,
        "normal",
        lineHeight,
        padding,
        currentY,
      );

      const blockHeight = lines.length * lineHeight;
      blocks.push({
        type: "paragraph",
        x: padding,
        y: currentY,
        width: contentWidth,
        height: blockHeight,
        lines,
      });
      currentY += blockHeight + 8;
    } else if (blockType === "bulletList") {
      const fontSize = baseFontSize;
      const lineHeight = Math.round(fontSize * 1.5);
      const indent = 20;

      child.forEach((listItem) => {
        const text = listItem.textContent;
        const lines = wrapTextToLines(
          context,
          text,
          contentWidth - indent,
          fontFamily,
          fontSize,
          "normal",
          lineHeight,
          padding + indent,
          currentY,
        );

        const itemHeight = Math.max(lines.length * lineHeight, lineHeight);
        blocks.push({
          type: "bulletItem",
          x: padding,
          y: currentY,
          width: contentWidth,
          height: itemHeight,
          lines,
        });
        currentY += itemHeight + 4;
      });
      currentY += 6;
    } else if (blockType === "orderedList") {
      const fontSize = baseFontSize;
      const lineHeight = Math.round(fontSize * 1.5);
      const indent = 24;
      let order = (child.attrs.order as number) || 1;

      child.forEach((listItem) => {
        const text = listItem.textContent;
        const lines = wrapTextToLines(
          context,
          text,
          contentWidth - indent,
          fontFamily,
          fontSize,
          "normal",
          lineHeight,
          padding + indent,
          currentY,
        );

        const itemHeight = Math.max(lines.length * lineHeight, lineHeight);
        blocks.push({
          type: "orderedItem",
          orderNumber: order++,
          x: padding,
          y: currentY,
          width: contentWidth,
          height: itemHeight,
          lines,
        });
        currentY += itemHeight + 4;
      });
      currentY += 6;
    } else if (blockType === "blockquote") {
      const fontSize = baseFontSize;
      const lineHeight = Math.round(fontSize * 1.5);
      const indent = 16;
      const text = child.textContent;

      const lines = wrapTextToLines(
        context,
        text,
        contentWidth - indent,
        fontFamily,
        fontSize,
        "italic",
        lineHeight,
        padding + indent,
        currentY,
      );

      const blockHeight = Math.max(lines.length * lineHeight, lineHeight);
      blocks.push({
        type: "blockquote",
        x: padding,
        y: currentY,
        width: contentWidth,
        height: blockHeight,
        lines,
      });
      currentY += blockHeight + 12;
    } else if (blockType === "codeBlock") {
      const fontSize = Math.max(baseFontSize - 2, 12);
      const lineHeight = Math.round(fontSize * 1.4);
      const codeLines = child.textContent.split("\n");
      const lines: LayoutLine[] = [];

      let lineY = currentY + 10;
      for (const line of codeLines) {
        const lineWidth = getCachedTextWidth(
          context,
          line,
          "monospace",
          fontSize,
          "normal",
        );
        lines.push({
          text: line,
          x: padding + 12,
          y: lineY,
          width: lineWidth,
          height: lineHeight,
          code: true,
        });
        lineY += lineHeight;
      }

      const blockHeight = lines.length * lineHeight + 20;
      blocks.push({
        type: "codeBlock",
        x: padding,
        y: currentY,
        width: contentWidth,
        height: blockHeight,
        lines,
      });
      currentY += blockHeight + 12;
    } else if (blockType === "horizontalRule") {
      blocks.push({
        type: "horizontalRule",
        x: padding,
        y: currentY + 8,
        width: contentWidth,
        height: 2,
        lines: [],
      });
      currentY += 20;
    }
  });

  return {
    width: availableWidth,
    height: Math.max(currentY + padding, 100),
    contentHeight: currentY,
    blocks,
  };
};

/**
 * Render a Doc Block on 2D canvas.
 *
 * When isEditing is true, freezes canvas rendering of the content (step 1 of overlay lifecycle).
 */
export const renderDocBlock = (
  context: CanvasRenderingContext2D,
  record: DocBlockRecord,
  doc: ProseMirrorNode | Record<string, unknown>,
  x: number,
  y: number,
  width: number,
  height: number,
  zoom = 1,
  isEditing = false,
): void => {
  context.save();

  const styling = record.styling ?? {};
  const bgColor = styling.backgroundColor ?? "#ffffff";
  const textColor = styling.textColor ?? "#1e1e1e";
  const fontFamily =
    styling.fontFamily ?? "system-ui, -apple-system, sans-serif";
  const baseFontSize = styling.fontSize ?? 16;
  const padding = styling.padding ?? 24;
  const borderRadius = styling.borderRadius ?? 8;

  // 1. Draw card background with rounded corners
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(x, y, width, height, borderRadius);
  } else {
    context.rect(x, y, width, height);
  }
  context.fillStyle = bgColor;
  context.fill();

  // Subtle border & shadow
  context.lineWidth = 1;
  context.strokeStyle = "#e1e4e8";
  context.stroke();

  // 2. If actively editing, canvas render of content is FROZEN per TRD-05
  if (isEditing) {
    // Render editing indicator outline
    context.lineWidth = 2 / zoom;
    context.strokeStyle = "#1971c2";
    context.stroke();
    context.restore();
    return;
  }

  // 3. Render Title Header (if present)
  let contentOffsetY = 0;
  if (record.title) {
    const titleFontSize = Math.round(baseFontSize * 1.25);
    context.font = `600 ${titleFontSize}px ${fontFamily}`;
    context.fillStyle = textColor;
    context.textBaseline = "top";
    context.fillText(record.title, x + padding, y + padding);

    // Header divider
    const dividerY = y + padding + titleFontSize + 12;
    context.beginPath();
    context.moveTo(x + padding, dividerY);
    context.lineTo(x + width - padding, dividerY);
    context.strokeStyle = "#e9ecef";
    context.lineWidth = 1;
    context.stroke();

    contentOffsetY = titleFontSize + 24;
  }

  // 4. Compute layout and render content blocks
  const layout = computeDocBlockLayout(
    context,
    doc,
    width,
    baseFontSize,
    fontFamily,
    padding,
  );

  for (const block of layout.blocks) {
    const blockX = x + block.x;
    const blockY = y + block.y + contentOffsetY;

    // Blockquote left accent bar
    if (block.type === "blockquote") {
      context.beginPath();
      context.moveTo(blockX, blockY);
      context.lineTo(blockX, blockY + block.height);
      context.strokeStyle = "#adb5bd";
      context.lineWidth = 3;
      context.stroke();
    }

    // Code block background rect
    if (block.type === "codeBlock") {
      context.beginPath();
      if (context.roundRect) {
        context.roundRect(blockX, blockY, block.width, block.height, 4);
      } else {
        context.rect(blockX, blockY, block.width, block.height);
      }
      context.fillStyle = "#f8f9fa";
      context.fill();
      context.strokeStyle = "#e9ecef";
      context.lineWidth = 1;
      context.stroke();
    }

    // Horizontal rule
    if (block.type === "horizontalRule") {
      context.beginPath();
      context.moveTo(blockX, blockY);
      context.lineTo(blockX + block.width, blockY);
      context.strokeStyle = "#dee2e6";
      context.lineWidth = 1;
      context.stroke();
      continue;
    }

    // Bullet point for bulletItem
    if (block.type === "bulletItem") {
      context.font = `bold ${baseFontSize}px ${fontFamily}`;
      context.fillStyle = "#495057";
      context.textBaseline = "top";
      context.fillText("•", blockX + 4, blockY);
    }

    // Number prefix for orderedItem
    if (block.type === "orderedItem") {
      context.font = `600 ${baseFontSize}px ${fontFamily}`;
      context.fillStyle = "#495057";
      context.textBaseline = "top";
      context.fillText(`${block.orderNumber ?? 1}.`, blockX, blockY);
    }

    // Render lines of text
    for (const line of block.lines) {
      const lineX = x + line.x;
      const lineY = y + line.y + contentOffsetY;

      if (block.type === "heading") {
        const headingFontSize =
          block.level === 1
            ? Math.round(baseFontSize * 1.75)
            : block.level === 2
            ? Math.round(baseFontSize * 1.4)
            : Math.round(baseFontSize * 1.15);
        context.font = `700 ${headingFontSize}px ${fontFamily}`;
        context.fillStyle = textColor;
      } else if (block.type === "codeBlock") {
        context.font = `${Math.max(baseFontSize - 2, 12)}px monospace`;
        context.fillStyle = "#212529";
      } else if (block.type === "blockquote") {
        context.font = `italic ${baseFontSize}px ${fontFamily}`;
        context.fillStyle = "#495057";
      } else {
        context.font = `${baseFontSize}px ${fontFamily}`;
        context.fillStyle = textColor;
      }

      context.textBaseline = "top";
      context.fillText(line.text, lineX, lineY);
    }
  }

  context.restore();
};
