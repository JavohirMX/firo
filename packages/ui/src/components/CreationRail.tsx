import React, { useEffect, useRef, useState } from "react";

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
  MoreVerticalIcon,
  TemplateIcon,
  FlyoutChevron,
  ConnectorIcon,
  ShapesIcon,
  CommentIcon,
  PlusIcon,
  DocIcon,
  SparklesIcon,
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
  | "laser"
  | "templates"
  | "comment"
  | "shapes"
  | "connectors"
  | "pen"
  | "more"
  | "docblock"
  | "ai";

export interface RailFlyoutItem {
  id: RailToolType;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
}

export interface RailToolItem {
  id: RailToolType;
  label: string;
  icon: React.ReactNode;
  /**
   * Non-removable and non-movable. Miro keeps its cursor at the head of the
   * rail: a pinned entry offers no Unpin and cannot be dragged, and dropping
   * another tool on it lands the tool *after* it.
   */
  pinned?: boolean;
  /**
   * The tool ids that light this entry up. Defaults to `[id]`. The merged
   * Select/Hand entry passes both, because one control represents two tools
   * ([ADR-0029]).
   *
   * [ADR-0029]: ../../../../docs/adr/0029-the-rail-is-a-per-user-arrangement.md
   */
  activeOn?: RailToolType[];
  /** Sub-tools available in a flyout popover for this tool group */
  flyoutItems?: RailFlyoutItem[];
  /** Currently selected sub-tool within the flyout group */
  activeSubTool?: RailToolType;
}

/**
 * The rail's authored glyphs, keyed by tool id ([ADR-0023]).
 *
 * The ids are the *editor's* tool ids; the glyphs are `@firo/ui`'s. Labels and
 * shortcuts are deliberately not repeated here: the host reads them from the
 * editor's `TOOLS` registry and pairs them with these glyphs, so `@firo/ui` owns
 * no second copy of the tool set ([ADR-0022] clause 4). The host, not this
 * component, owns the *order* — and now also owns where that order is stored.
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
  templates: <TemplateIcon />,
  comment: <CommentIcon />,
  shapes: <ShapesIcon />,
  connectors: <ConnectorIcon />,
  pen: <PenIcon />,
  more: <PlusIcon />,
  docblock: <DocIcon />,
  ai: <SparklesIcon />,
};

/** Default tool list and creation items including docblock (§10.5) */
export const DEFAULT_CREATION_ITEMS: RailToolItem[] = [
  { id: "docblock", label: "Document", icon: <DocIcon /> },
  { id: "ai", label: "AI Assistant", icon: <SparklesIcon /> },
];

export const DEFAULT_RAIL_TOOLS: RailToolItem[] = [
  {
    id: "selection",
    label: "Select / Hand",
    icon: <SelectIcon />,
    pinned: true,
  },
  { id: "templates", label: "Templates", icon: <TemplateIcon /> },
  { id: "text", label: "Text", icon: <TextIcon /> },
  { id: "stickynote", label: "Sticky note", icon: <StickyNoteIcon /> },
  { id: "shapes", label: "Shapes", icon: <ShapesIcon /> },
  { id: "connectors", label: "Connectors", icon: <ConnectorIcon /> },
  { id: "pen", label: "Pen", icon: <PenIcon /> },
  { id: "frame", label: "Frame", icon: <FrameIcon /> },
  { id: "comment", label: "Comment", icon: <CommentIcon /> },
  { id: "docblock", label: "Document", icon: <DocIcon /> },
  { id: "ai", label: "AI Assistant", icon: <SparklesIcon /> },
];

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
  /** The rail's visible tools, in order. Built by the host from its stored layout. */
  tools: RailToolItem[];
  /**
   * Tools the user has unpinned, offered back through the "hidden tools"
   * popover. Without this the rail would be a one-way door.
   */
  hiddenTools?: RailToolItem[];
  /** Called with the full visible order (pinned entries included) after a drag. */
  onReorder?: (order: RailToolType[]) => void;
  /** Called when a tool is unpinned from its right-click menu. */
  onUnpin?: (tool: RailToolType) => void;
  /** Called when an unpinned tool is chosen from the hidden-tools list. */
  onRestore?: (tool: RailToolType) => void;
  /** Called when Miro-style '+' button is clicked to open more tools/apps. */
  onMoreTools?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

/**
 * The creation rail: Miro's left-hand tool column, customisable.
 *
 * ## The two gestures, and where the state lives
 *
 * Reorder is drag-and-drop and removal is a right-click *Unpin* — Miro's own
 * pair, and the pair the interaction inventory recorded. Pinning is reversible
 * through the hidden-tools list, because a rail you can only shorten is a rail
 * you can brick.
 *
 * This component renders the arrangement but never decides it: it reports a
 * reorder, an unpin and a restore upward and re-renders whatever comes back.
 * The host holds the layout and persists it — locally, per user, never in the
 * document ([ADR-0029]).
 *
 * Both gestures are pointer gestures. Miro does not offer rail customisation on
 * touch, and neither does this: HTML drag-and-drop has no touch gesture and a
 * long-press context menu is not the same interaction. That is a documented
 * limitation, not an oversight.
 *
 * [ADR-0029]: ../../../../docs/adr/0029-the-rail-is-a-per-user-arrangement.md
 */
export const CreationRail: React.FC<CreationRailProps> = ({
  activeTool,
  onSelectTool,
  onPointerDownTool,
  tools,
  hiddenTools = [],
  onReorder,
  onUnpin,
  onRestore,
  onMoreTools,
  canUndo = true,
  canRedo = true,
  onUndo,
  onRedo,
}) => {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<RailToolType | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [openFlyoutFor, setOpenFlyoutFor] = useState<RailToolType | null>(null);

  // Anything open closes on Escape, and on a pointer press outside the rail.
  // A press *inside* is left alone so the click that follows can land on the
  // menu item it was aimed at.
  useEffect(() => {
    if (menuFor === null && !hiddenOpen && openFlyoutFor === null) {
      return;
    }
    const closeAll = () => {
      setMenuFor(null);
      setHiddenOpen(false);
      setOpenFlyoutFor(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (railRef.current?.contains(event.target as Node)) {
        return;
      }
      closeAll();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAll();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuFor, hiddenOpen, openFlyoutFor]);

  /**
   * Slot 0 is the pinned pointer entry, so nothing may land there: a drop aimed
   * at it puts the tool immediately after it instead.
   */
  const move = (from: number, to: number) => {
    const target = Math.max(1, Math.min(to, tools.length - 1));
    if (from === target) {
      return;
    }
    const order = tools.map((tool) => tool.id);
    const [moved] = order.splice(from, 1);
    order.splice(target, 0, moved);
    onReorder?.(order);
  };

  return (
    <div
      className="firo-rail"
      role="toolbar"
      aria-label="Creation Toolbar"
      ref={railRef}
    >
      <div className="firo-rail__pill">
        {tools.map((tool, index) => {
          const isActive = (tool.activeOn ?? [tool.id]).includes(
            activeTool as RailToolType,
          );
          const menuOpen = menuFor === tool.id;
          const hasFlyout = Boolean(
            tool.flyoutItems && tool.flyoutItems.length > 0,
          );
          const flyoutOpen = openFlyoutFor === tool.id;

          return (
            <div className="firo-rail__slot" key={tool.id}>
              <button
                type="button"
                className={`firo-rail__item${
                  isActive ? " firo-rail__item--active" : ""
                }${dragging === index ? " firo-rail__item--dragging" : ""}${
                  hasFlyout ? " firo-rail__item--has-flyout" : ""
                }`}
                draggable={!tool.pinned && Boolean(onReorder)}
                onClick={(event) => {
                  if (hasFlyout && isActive) {
                    setOpenFlyoutFor(flyoutOpen ? null : tool.id);
                  } else {
                    setOpenFlyoutFor(null);
                    onSelectTool(tool.activeSubTool ?? tool.id, event);
                  }
                }}
                onPointerDown={(event) =>
                  onPointerDownTool?.(tool.activeSubTool ?? tool.id, event)
                }
                onContextMenu={(event) => {
                  if (tool.pinned || !onUnpin) {
                    return;
                  }
                  event.preventDefault();
                  setMenuFor(menuOpen ? null : tool.id);
                }}
                onDragStart={(event) => {
                  if (tool.pinned) {
                    return;
                  }
                  setDragging(index);
                  if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", tool.id);
                  }
                }}
                onDragOver={(event) => {
                  if (dragging === null) {
                    return;
                  }
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (dragging === null) {
                    return;
                  }
                  event.preventDefault();
                  move(dragging, tool.pinned ? 1 : index);
                  setDragging(null);
                }}
                onDragEnd={() => setDragging(null)}
                title={tool.label}
                aria-label={tool.label}
                aria-pressed={isActive}
                aria-haspopup={
                  hasFlyout
                    ? "menu"
                    : tool.pinned || !onUnpin
                    ? undefined
                    : "menu"
                }
                aria-expanded={hasFlyout ? flyoutOpen : menuOpen || undefined}
              >
                {tool.icon}
                {hasFlyout && (
                  <span
                    className="firo-rail__flyout-indicator"
                    aria-hidden="true"
                  >
                    <FlyoutChevron />
                  </span>
                )}
              </button>

              {menuOpen ? (
                <div
                  className="firo-rail__menu"
                  role="menu"
                  aria-label={`${tool.label} options`}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="firo-rail__menu-item"
                    onClick={() => {
                      setMenuFor(null);
                      onUnpin?.(tool.id);
                    }}
                  >
                    Unpin
                  </button>
                </div>
              ) : null}

              {hasFlyout && flyoutOpen ? (
                <div
                  className="firo-rail__flyout"
                  role="menu"
                  aria-label={`${tool.label} options`}
                >
                  {tool.flyoutItems!.map((sub) => {
                    const isSubActive =
                      activeTool === sub.id || tool.activeSubTool === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isSubActive}
                        className={`firo-rail__flyout-item${
                          isSubActive ? " firo-rail__flyout-item--active" : ""
                        }`}
                        onClick={(event) => {
                          setOpenFlyoutFor(null);
                          onSelectTool(sub.id, event);
                        }}
                        title={sub.label}
                        aria-label={sub.label}
                      >
                        <span className="firo-rail__flyout-icon">
                          {sub.icon}
                        </span>
                        <span className="firo-rail__flyout-label">
                          {sub.label}
                        </span>
                        {sub.shortcut ? (
                          <span className="firo-rail__flyout-shortcut">
                            {sub.shortcut}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        {/* Miro-style '+' button at the bottom of the tools pill */}
        <div className="firo-rail__slot">
          <button
            type="button"
            className="firo-rail__item firo-rail__item--more"
            onClick={() => {
              if (onMoreTools) {
                onMoreTools();
              } else if (hiddenTools.length > 0) {
                setHiddenOpen((open) => !open);
              }
            }}
            title="More tools (+)"
            aria-label={
              hiddenTools.length > 0 ? "Unpinned tools" : "More tools"
            }
            aria-haspopup="menu"
            aria-expanded={hiddenOpen}
          >
            <PlusIcon />
          </button>
          {hiddenOpen && hiddenTools.length > 0 && !onMoreTools ? (
            <div
              className="firo-rail__menu firo-rail__menu--wide"
              role="menu"
              aria-label="Unpinned tools"
            >
              {hiddenTools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  role="menuitem"
                  className="firo-rail__menu-item"
                  onClick={() => {
                    setHiddenOpen(false);
                    onRestore?.(tool.id);
                  }}
                >
                  <span className="firo-rail__menu-icon">{tool.icon}</span>
                  {tool.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Hidden tools backward-compatibility popover trigger when not in main pill */}
      {hiddenTools.length > 0 && onMoreTools ? (
        <div className="firo-rail__pill">
          <div className="firo-rail__slot">
            <button
              type="button"
              className="firo-rail__item"
              onClick={() => setHiddenOpen((open) => !open)}
              title="Unpinned tools"
              aria-label="Unpinned tools"
              aria-haspopup="menu"
              aria-expanded={hiddenOpen}
            >
              <MoreVerticalIcon />
            </button>
            {hiddenOpen ? (
              <div
                className="firo-rail__menu firo-rail__menu--wide"
                role="menu"
                aria-label="Unpinned tools"
              >
                {hiddenTools.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    role="menuitem"
                    className="firo-rail__menu-item"
                    onClick={() => {
                      setHiddenOpen(false);
                      onRestore?.(tool.id);
                    }}
                  >
                    <span className="firo-rail__menu-icon">{tool.icon}</span>
                    {tool.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

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
