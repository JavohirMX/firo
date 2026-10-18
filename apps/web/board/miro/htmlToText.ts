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
  "&bull;": "•",
  "&middot;": "•",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
};

export const decodeHtmlEntities = (text: string): string => {
  let decoded = text.replace(
    /&(?:amp|lt|gt|quot|apos|nbsp|#39|#47|#x2F|bull|middot|mdash|ndash|hellip|copy|reg|trade);/g,
    (match) => {
      return ENTITY_MAP[match] ?? match;
    },
  );

  // Decode decimal numeric entities (e.g., &#8226;)
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => {
    try {
      return String.fromCharCode(parseInt(dec, 10));
    } catch {
      return _;
    }
  });

  // Decode hex numeric entities (e.g., &#x2022;)
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return _;
    }
  });

  return decoded;
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

  // Add bullet prefixes to unordered lists if not already prefixed
  text = text.replace(/<li[^>]*>/gi, "• ");

  // Normalize <br></p> or <br></div> before replacing
  text = text.replace(/<br\s*\/?>\s*<\/(p|div)>/gi, "</$1>");

  // Replace <br> or <br/> with newline
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Replace closing </p>, </div>, </li> with newline
  text = text.replace(/<\/(p|div|li)>/gi, "\n");

  // Strip all other HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Normalize multiple consecutive blank lines to at most one blank line
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
};
