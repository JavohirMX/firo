import { GOOGLE_FONTS_RANGES } from "@firo/common";

import { type ExcalidrawFontFaceDescriptor } from "../Fonts";

import Cyrillic_ext from "./OpenSans-cyrillic-ext.woff2";
import Cyrillic from "./OpenSans-cyrillic.woff2";
import Vietnamese from "./OpenSans-vietnamese.woff2";
import Latin_ext from "./OpenSans-latin-ext.woff2";
import Latin from "./OpenSans-latin.woff2";

export const OpenSansFontFaces: ExcalidrawFontFaceDescriptor[] = [
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
