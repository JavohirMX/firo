/**
 * Converts Miro HTML-formatted strings into valid ProseMirror documents.
 *
 * Handles:
 * - Bold (<strong>, <b>)
 * - Italic (<em>, <i>)
 * - Underline (<u>)
 * - Strikethrough (<s>, <strike>, <del>)
 * - Inline code (<code>)
 * - Links (<a href="...">)
 * - Text color (<span style="color: ...">, <font color="...">)
 * - Unordered lists (<ul><li>) with bullet prefixes
 * - Ordered lists (<ol><li>) with numbered prefixes
 * - Paragraphs (<p>, <div>, <br>) and line breaks
 * - HTML entity decoding
 */
import type { ProseMirrorDoc } from "@firo/schema";

import { normalizeMiroColor } from "./convertFromMiro";
import { decodeHtmlEntities } from "./htmlToText";

export interface ProseMirrorMark {
  type: string;
  attrs?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProseMirrorTextNode {
  type: "text";
  text: string;
  marks?: ProseMirrorMark[];
  [key: string]: unknown;
}

export interface ProseMirrorParagraphNode {
  type: "paragraph";
  content: ProseMirrorDoc[];
  [key: string]: unknown;
}

/**
 * Parses Miro HTML content into a ProseMirror document JSON structure.
 */
export const miroHtmlToProseMirror = (
  html: string | null | undefined,
): ProseMirrorDoc => {
  if (!html || !html.trim()) {
    return {
      type: "doc",
      content: [{ type: "paragraph", content: [] }],
    };
  }

  const paragraphs: ProseMirrorParagraphNode[] = [];
  let currentParagraph: ProseMirrorTextNode[] = [];

  const closeCurrentParagraph = () => {
    if (currentParagraph.length > 0) {
      paragraphs.push({
        type: "paragraph",
        content: currentParagraph,
      });
      currentParagraph = [];
    }
  };

  const listStack: { type: "ul" | "ol"; count: number }[] = [];
  const activeMarks: ProseMirrorMark[] = [];
  let pendingPrefix: string | null = null;

  // Tokenize HTML tags and text runs
  const tokenRegex = /<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(html)) !== null) {
    const [fullMatch, tagNameRaw, attrString, textContent] = match;

    if (textContent !== undefined) {
      // Decode HTML entities
      const decoded = decodeHtmlEntities(textContent);
      // Split on newlines if present
      const lines = decoded.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          closeCurrentParagraph();
        }
        let line = lines[i];
        if (pendingPrefix) {
          line = pendingPrefix + line;
          pendingPrefix = null;
        }
        if (line.length > 0) {
          const marks = activeMarks.length > 0 ? [...activeMarks] : undefined;
          currentParagraph.push({
            type: "text",
            text: line,
            ...(marks ? { marks } : {}),
          });
        }
      }
      continue;
    }

    const tagName = tagNameRaw.toLowerCase();
    const isClosing = fullMatch.startsWith("</");
    const isSelfClosing = fullMatch.endsWith("/>");

    if (isClosing) {
      switch (tagName) {
        case "p":
        case "div":
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          closeCurrentParagraph();
          break;
        case "li":
          if (pendingPrefix) {
            currentParagraph.push({ type: "text", text: pendingPrefix });
            pendingPrefix = null;
          }
          closeCurrentParagraph();
          break;
        case "ul":
        case "ol":
          listStack.pop();
          closeCurrentParagraph();
          break;
        case "strong":
        case "b":
          removeMark("bold");
          break;
        case "em":
        case "i":
          removeMark("italic");
          break;
        case "u":
          removeMark("underline");
          break;
        case "s":
        case "strike":
        case "del":
          removeMark("strike");
          break;
        case "code":
          removeMark("code");
          break;
        case "a":
          removeMark("link");
          break;
        case "span":
        case "font":
          removeMark("color");
          break;
      }
    } else {
      // Opening tag
      switch (tagName) {
        case "p":
        case "div":
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          if (currentParagraph.length > 0) {
            closeCurrentParagraph();
          }
          break;

        case "br":
          closeCurrentParagraph();
          break;

        case "ul":
          listStack.push({ type: "ul", count: 0 });
          closeCurrentParagraph();
          break;

        case "ol":
          listStack.push({ type: "ol", count: 0 });
          closeCurrentParagraph();
          break;

        case "li": {
          closeCurrentParagraph();
          if (listStack.length > 0) {
            const currentList = listStack[listStack.length - 1];
            currentList.count++;
            pendingPrefix =
              currentList.type === "ul" ? "• " : `${currentList.count}. `;
          }
          break;
        }

        case "strong":
        case "b":
          addMark({ type: "bold" });
          break;

        case "em":
        case "i":
          addMark({ type: "italic" });
          break;

        case "u":
          addMark({ type: "underline" });
          break;

        case "s":
        case "strike":
        case "del":
          addMark({ type: "strike" });
          break;

        case "code":
          addMark({ type: "code" });
          break;

        case "a": {
          const hrefMatch = attrString?.match(/href\s*=\s*["']([^"']+)["']/i);
          if (hrefMatch) {
            addMark({ type: "link", attrs: { href: hrefMatch[1] } });
          }
          break;
        }

        case "span":
        case "font": {
          const styleColorMatch = attrString?.match(/color\s*:\s*([^;"]+)/i);
          const fontColorMatch = attrString?.match(
            /color\s*=\s*["']([^"']+)["']/i,
          );
          const rawColor = styleColorMatch?.[1] ?? fontColorMatch?.[1];
          if (rawColor) {
            const normalized = normalizeMiroColor(rawColor.trim());
            addMark({ type: "color", attrs: { color: normalized } });
          }
          break;
        }
      }

      if (isSelfClosing && tagName === "br") {
        closeCurrentParagraph();
      }
    }
  }

  // Push any remaining content
  if (currentParagraph.length > 0) {
    paragraphs.push({
      type: "paragraph",
      content: currentParagraph,
    });
  }

  // Ensure at least one paragraph exists
  if (paragraphs.length === 0) {
    paragraphs.push({
      type: "paragraph",
      content: [],
    });
  }

  return {
    type: "doc",
    content: paragraphs,
  };

  function addMark(mark: ProseMirrorMark) {
    activeMarks.push(mark);
  }

  function removeMark(type: string) {
    for (let i = activeMarks.length - 1; i >= 0; i--) {
      if (activeMarks[i].type === type) {
        activeMarks.splice(i, 1);
        break;
      }
    }
  }
};
