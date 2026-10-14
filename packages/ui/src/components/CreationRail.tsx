import {
  SelectIcon,
  HandIcon,
  StickyNoteIcon,
  RectangleIcon,
  DiamondIcon,
  EllipseIcon,
  ArrowIcon,
  LineIcon,
  TextIcon,
  PenIcon,
  FrameIcon,
  EraserIcon,
  LaserIcon,
  UndoIcon,
  RedoIcon,
} from "../icons";

import "./CreationRail.scss";

export type RailToolType =
  | "selection"
  | "hand"
  | "stickynote"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "text"
  | "freedraw"
  | "frame"
  | "eraser"
  | "laser";

export interface RailToolItem {
  id: RailToolType;
  label: string;
  icon: React.ReactNode;
}

/**
 * The rail's authored glyphs, keyed by tool id ([ADR-0023]).
 *
 * The ids are the *editor's* tool ids; the glyphs are `@firo/ui`'s. Labels and
 * shortcuts are deliberately not repeated here: the host reads them from the
 * editor's `TOOLS` registry and pairs them with these glyphs, so `@firo/ui` owns
 * no second copy of the tool set ([ADR-0022] clause 4). The host, not this
 * module, decides the rail's order, because order is presentation.
 *
 * [ADR-0022]: ../../../../docs/adr/0022-ui-package-owns-the-chrome.md
 * [ADR-0023]: ../../../../docs/adr/0023-open-icons-and-ui-typeface.md
 */
export const RAIL_TOOL_ICONS: Record<RailToolType, React.ReactNode> = {
  selection: <SelectIcon />,
  hand: <HandIcon />,
  stickynote: <StickyNoteIcon />,
  rectangle: <RectangleIcon />,
  diamond: <DiamondIcon />,
  ellipse: <EllipseIcon />,
  arrow: <ArrowIcon />,
  line: <LineIcon />,
  text: <TextIcon />,
  freedraw: <PenIcon />,
  frame: <FrameIcon />,
  eraser: <EraserIcon />,
  laser: <LaserIcon />,
};

export interface CreationRailProps {
  activeTool: string;
  onSelectTool: (
    tool: RailToolType,
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  onPointerDownTool?: (
    tool: RailToolType,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  /** The rail's tools, in order. Built by the host from the editor's registry. */
  tools: RailToolItem[];
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const CreationRail: React.FC<CreationRailProps> = ({
  activeTool,
  onSelectTool,
  onPointerDownTool,
  tools,
  canUndo = true,
  canRedo = true,
  onUndo,
  onRedo,
}) => {
  return (
    <div className="firo-rail" role="toolbar" aria-label="Creation Toolbar">
      <div className="firo-rail__pill">
        {tools.map((tool) => {
          const isActive = activeTool === tool.id;

          return (
            <button
              key={tool.id}
              type="button"
              className={`firo-rail__item ${
                isActive ? "firo-rail__item--active" : ""
              }`}
              onClick={(e) => {
                if (e.shiftKey) {
                  onSelectTool(tool.id, e);
                } else {
                  onSelectTool(tool.id);
                }
              }}
              onPointerDown={(e) => onPointerDownTool?.(tool.id, e)}
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={isActive}
            >
              {tool.icon}
            </button>
          );
        })}
      </div>

      <div className="firo-rail__pill">
        <button
          type="button"
          className="firo-rail__item"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="firo-rail__item"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <RedoIcon />
        </button>
      </div>
    </div>
  );
};
