import { COLOR_PALETTE, MIRO_STICKY_NOTE_COLORS } from "@firo/common";
import {
  getBoundTextElement,
  isFrameLikeElement,
  isTextElement,
} from "@firo/element";

import { t } from "@firo/editor/i18n";

import type { TranslationKeys } from "@firo/editor/i18n";
import type { AccessibilityTreeItem } from "@firo/ui";
import type { ElementsMap, ExcalidrawElement } from "@firo/element/types";

/**
 * The host's half of the accessibility tree: element types into the vocabulary
 * a screen reader needs.
 *
 * `@firo/ui` owns the tree and its *naming rules*, but it is dependency-free
 * and knows nothing about elements. This module is the mapping between the two:
 * an Excalidraw element becomes an `AccessibilityTreeItem`, and every choice
 * that needs to know what a sticky note *is* lives here.
 *
 * See [`docs/trd/09-accessibility.md`](../../../docs/trd/09-accessibility.md).
 */

/**
 * Reverse index from colour value to its palette name.
 *
 * The palette is the single source of colour names in the app
 * (`@firo/common`), so the label cannot drift from the picker. `transparent` is
 * deliberately excluded: it is the absence of a fill, not a colour to announce.
 */
/**
 * Spoken names for the sticky-note palette.
 *
 * Sticky notes are their own colour domain
 * (`MIRO_STICKY_NOTE_COLORS`), so their values are not in `COLOR_PALETTE`. The
 * TRD's own example label is "Sticky note: Write the RFC. Yellow." — without
 * these, the most important element on the board would announce no colour at
 * all. Names read as the shade a sighted user sees, not as the palette key.
 */
const STICKY_NOTE_COLOR_NAMES: Record<
  keyof typeof MIRO_STICKY_NOTE_COLORS,
  string
> = {
  yellow: "Yellow",
  yellowDark: "Dark yellow",
  greenLight: "Light green",
  greenMint: "Mint green",
  blueSky: "Sky blue",
  blue: "Blue",
  pinkSoft: "Soft pink",
  pink: "Pink",
  purple: "Purple",
  orange: "Orange",
  gray: "Gray",
};

/**
 * Reverse index from colour value to its spoken name.
 *
 * Built from the two palettes that name colours in the app (`@firo/common`),
 * so a label cannot drift from the picker. `transparent` is deliberately
 * excluded: it is the absence of a fill, not a colour to announce.
 */
const COLOR_NAMES: Record<string, string> = (() => {
  const names: Record<string, string> = {};
  for (const [name, value] of Object.entries(COLOR_PALETTE)) {
    if (name === "transparent") {
      continue;
    }
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    for (const shade of Array.isArray(value) ? value : [value]) {
      names[String(shade).toLowerCase()] = label;
    }
  }
  for (const [key, value] of Object.entries(MIRO_STICKY_NOTE_COLORS)) {
    names[value.toLowerCase()] =
      STICKY_NOTE_COLOR_NAMES[key as keyof typeof MIRO_STICKY_NOTE_COLORS];
  }
  return names;
})();

/**
 * The noun for an element's type.
 *
 * It comes from the same `element.*` translations the stats panel and the
 * convert menu use, so "Sticky note" here is the same string as everywhere
 * else. A type with no translation falls back to its own name rather than to a
 * blank.
 */
const kindForElement = (type: string): string =>
  t(`element.${type}` as TranslationKeys, null, type);

/**
 * The text to read for an element.
 *
 * Three cases, and the second is the one that matters: a container's text is
 * not on the container, it is on a *bound label element*, so reading
 * `element.text` alone would announce every sticky note as empty.
 *
 * - A free-standing text element holds its own `text`.
 * - A frame holds a plain `name` ([`docs/trd/05-rich-text.md`](../../../docs/trd/05-rich-text.md)
 *   keeps frame names as strings on purpose).
 * - Anything else that can hold a label reads it from the bound text element.
 */
const textForElement = (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
): string | undefined => {
  if (isTextElement(element)) {
    return element.text;
  }
  if (isFrameLikeElement(element)) {
    return element.name ?? undefined;
  }
  const boundText = getBoundTextElement(element, elementsMap);
  return boundText?.text;
};

/**
 * Build the tree items for a board, in reading order.
 *
 * Order is the scene's order — the same order the elements are drawn in — so
 * "next element" means the same thing to a keyboard user as it does to the
 * renderer.
 *
 * A text element bound to a container is skipped: it is the container's label,
 * and announcing it separately would make every sticky note appear twice.
 */
export const toAccessibilityItems = (
  elements: readonly ExcalidrawElement[],
  elementsMap: ElementsMap,
): AccessibilityTreeItem[] => {
  const items: AccessibilityTreeItem[] = [];

  for (const element of elements) {
    if (isTextElement(element) && element.containerId) {
      continue;
    }

    items.push({
      id: element.id,
      kind: kindForElement(element.type),
      text: textForElement(element, elementsMap),
      colorName: COLOR_NAMES[String(element.backgroundColor).toLowerCase()],
      locked: element.locked || undefined,
    });
  }

  return items;
};

/** A map of the given elements, for `toAccessibilityItems`. */
export const toElementsMap = (
  elements: readonly ExcalidrawElement[],
): ElementsMap => new Map(elements.map((element) => [element.id, element]));
