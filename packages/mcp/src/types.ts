/**
 * Re-exports and common types for @firo/mcp.
 */

export type {
  Arrowhead,
  Binding,
  Collection,
  Column,
  ColumnType,
  CommentAnchor,
  CommentEntry,
  CommentThread,
  ElementGeometry,
  ElementId,
  ElementStyle,
  ElementType,
  FieldValue,
  FillStyle,
  FiroElement,
  FiroRecord,
  GroupId,
  LinearElement,
  LinearType,
  RoundnessType,
  SelectOption,
  ShapeElement,
  ShapeType,
  StickyNoteElement,
  StrokeStyle,
  TextElement,
} from "@firo/schema";

export type { Radians } from "@firo/math";
export type { FractionalIndex } from "@firo/element/types";

export type {
  BoardSnapshot,
  CommentThreadChanges,
  CommitResult,
  ElementChanges,
  ElementUpdate,
  FiroDoc,
  Mutation,
  RecordChanges,
  RecordUpdate,
} from "@firo/doc";

export type { Projection, RecordMutation } from "@firo/records";
