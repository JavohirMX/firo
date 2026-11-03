import { GOOGLE_FONTS_RANGES } from "@firo/common";

import { type ExcalidrawFontFaceDescriptor } from "../Fonts";

import Cyrillic_ext from "./NotoSans-cyrillic-ext.woff2";
import Cyrillic from "./NotoSans-cyrillic.woff2";
import Vietnamese from "./NotoSans-vietnamese.woff2";
import Latin_ext from "./NotoSans-latin-ext.woff2";
import Latin from "./NotoSans-latin.woff2";

export const NotoSansFontFaces: ExcalidrawFontFaceDescriptor[] = [
  {
    uri: Cyrillic_ext,
    descriptors: {
      unicodeRange: GOOGLE_FONTS_RANGES.CYRILIC_EXT,
      weight: "400",
    },
  },
  {
    uri: Cyrillic,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.CYRILIC, weight: "400" },
  },
  {
    uri: Vietnamese,
    descriptors: {
      unicodeRange: GOOGLE_FONTS_RANGES.VIETNAMESE,
      weight: "400",
    },
  },
  {
    uri: Latin_ext,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN_EXT, weight: "400" },
  },
  {
    uri: Latin,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN, weight: "400" },
  },
];
