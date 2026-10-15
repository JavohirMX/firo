/**
 * TypeScript definitions for Miro board items and archives.
 *
 * Covers both Miro Web SDK v2 / REST API structures and Miro .rtb backup files.
 */

export interface MiroPosition {
  x: number;
  y: number;
  origin?: "center" | "top-left";
}

export interface MiroGeometry {
  width: number;
  height: number;
  rotation?: number;
}

export interface MiroStyle {
  fillColor?: string;
  fillOpacity?: number | string;
  borderColor?: string;
  borderWidth?: number | string;
  borderStyle?: "normal" | "dotted" | "dashed";
  color?: string;
  textAlign?: "left" | "center" | "right";
  textAlignVertical?: "top" | "middle" | "bottom";
  fontSize?: number | string;
  fontFamily?: string;
  strokeColor?: string;
  strokeStyle?: string;
  strokeWidth?: number | string;
  cardTheme?: string;
}

export interface MiroItemData {
  content?: string;
  title?: string;
  description?: string;
  shape?: string;
  url?: string;
  format?: string;
  [key: string]: unknown;
}

export interface MiroConnectorEndpoint {
  item?: string;
  position?: { x: number; y: number };
  snapTo?: string;
}

export interface MiroCaption {
  content: string;
  position?: number;
}

export interface MiroItem {
  id: string;
  type: string;
  data?: MiroItemData;
  style?: MiroStyle;
  position?: MiroPosition;
  geometry?: MiroGeometry;
  parentId?: string | null;
  // Alternative flattened / REST format properties:
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  content?: string;
  title?: string;
  shape?: string;
  start?: MiroConnectorEndpoint;
  end?: MiroConnectorEndpoint;
  startItem?: { id: string };
  endItem?: { id: string };
  captions?: MiroCaption[];
  resourceId?: string | number;
  [key: string]: unknown;
}

export interface MiroResourceMeta {
  id: number | string;
  name: string;
  extension: string;
  type?: string;
  infected?: boolean;
}

export interface MiroBoardMeta {
  id?: number | string;
  name?: string;
  description?: string;
  iconResourceId?: number | string;
}

export interface MiroRtbArchive {
  board?: MiroBoardMeta;
  resources?: MiroResourceMeta[];
  mediaFiles: Map<string, Uint8Array>;
  isEncrypted: boolean;
  encryptionVersion?: string;
}
