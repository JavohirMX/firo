/**
 * Converts Miro's HTML-formatted strings into clean plain text for Firo elements.
 */

const ENTITY_MAP: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&#x2F;": "/",
  "&#47;": "/",
};

export const decodeHtmlEntities = (text: string): string => {
  return text.replace(
    /&(?:amp|lt|gt|quot|apos|nbsp|#39|#47|#x2F);/g,
    (match) => {
      return ENTITY_MAP[match] ?? match;
    },
  );
};

/**
 * Strips HTML tags, handles paragraph and line breaks, and decodes HTML entities.
 */
export const miroHtmlToPlainText = (
  html: string | null | undefined,
): string => {
  if (!html) {
    return "";
  }

  let text = html;

  // Replace <br> or <br/> with newline
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Replace closing </p>, </div>, </li> with newline
  text = text.replace(/<\/(p|div|li)>/gi, "\n");

  // Strip all other HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Normalize multiple consecutive blank lines to at most two
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
};
