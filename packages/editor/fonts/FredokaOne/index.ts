import { GOOGLE_FONTS_RANGES } from "@firo/common";

import { type ExcalidrawFontFaceDescriptor } from "../Fonts";

import Latin from "./FredokaOne-latin.woff2";

export const FredokaOneFontFaces: ExcalidrawFontFaceDescriptor[] = [
  {
    uri: Latin,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN, weight: "400" },
  },
];
