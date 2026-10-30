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
  LassoIcon,
  UndoIcon,
  RedoIcon,
  TemplateIcon,
  FlyoutChevron,
  ShapesIcon,
  CommentIcon,
  PlusIcon,
  DocIcon,
  SparklesIcon,
  SmileIcon,
  HighlighterIcon,
} from "../icons";

import { ToolsCatalog } from "./ToolsCatalog";

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
  | "lasso"
  | "templates"
  | "comment"
  | "shapes"
  | "pen"
  | "more"
  | "docblock"
  | "ai"
  | "media"
  | "highlighter";

/**
 * What a rail slot *is*. A tool is a command; a family is a set of tools; an
 * options slot carries settings for one tool; a surface opens host chrome.
 *
 * `tool` is the default, so every existing single-tool entry keeps its shape
 * ([`ADR-0031`](../../../../docs/adr/0031-rail-slot-kinds-and-the-phase-11-composition.md)).
 */
export type RailSlotKind = "tool" | "family" | "options" | "surface";

export interface RailFlyoutItem {
  id: RailToolType;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
}

/**
 * One choice inside an options flyout. It is deliberately not a tool: it has
 * no tool id and selecting it never changes `activeTool`.
 */
export interface RailOptionItem {
  id: string;
  label: string;
  /** A CSS colour, for a swatch in a `swatches` group. */
  color?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  selected?: boolean;
  /**
   * `option` (default) is a persisted setting and reads as a radio;
   * `action` fires once — it opens a dialog or runs a command — so it reads
   * as a plain menu item and never carries `aria-checked`.
   */
  kind?: "option" | "action";
}

export interface RailOptionGroup {
  id: string;
  label?: string;
  /** `swatches` is a fixed grid; `list` is a row per choice. */
  layout?: "list" | "swatches";
  items: readonly RailOptionItem[];
}

export interface RailToolItem {
  id: RailToolType;
  label: string;
  icon: React.ReactNode;
  /** Defaults to `family` when `flyoutItems` is set, otherwise `tool`. */
  kind?: RailSlotKind;
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
  /** Sub-tools available in a flyout popover for a `family` slot. */
  flyoutItems?: RailFlyoutItem[];
  /** Settings and actions in a flyout for an `options` slot. */
  optionGroups?: readonly RailOptionGroup[];
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
  lasso: <LassoIcon />,
  templates: <TemplateIcon />,
  comment: <CommentIcon />,
  shapes: <ShapesIcon />,
  pen: <PenIcon />,
  more: <PlusIcon />,
  docblock: <DocIcon />,
  ai: <SparklesIcon />,
  media: <SmileIcon />,
  highlighter: <HighlighterIcon />,
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
  { id: "ai", label: "AI Assistant", icon: <SparklesIcon />, kind: "surface" },
  {
    id: "stickynote",
    label: "Sticky note",
    icon: <StickyNoteIcon />,
    kind: "options",
  },
  {
    id: "templates",
    label: "Templates",
    icon: <TemplateIcon />,
    kind: "surface",
  },
  { id: "text", label: "Text", icon: <TextIcon />, kind: "tool" },
  { id: "shapes", label: "Shapes", icon: <ShapesIcon />, kind: "family" },
  { id: "pen", label: "Pen", icon: <PenIcon />, kind: "family" },
  // Miro's frame slot flies out size presets; Firo has no preset target yet,
  // so the slot stays a plain tool rather than growing a dead chevron.
  { id: "frame", label: "Frame", icon: <FrameIcon />, kind: "tool" },
  { id: "media", label: "Emoji", icon: <SmileIcon />, kind: "surface" },
  { id: "comment", label: "Comment", icon: <CommentIcon />, kind: "tool" },
  { id: "docblock", label: "Document", icon: <DocIcon />, kind: "tool" },
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
  /** Show the "+" tools catalog. Hosts hide it when there is nothing to add. */
  showCatalog?: boolean;
  /** Called with the full visible order (pinned entries included) after a drag. */
  onReorder?: (order: RailToolType[]) => void;
  /** Called when a tool is unpinned from its right-click menu. */
  onUnpin?: (tool: RailToolType) => void;
  /** Called when an unpinned tool is pinned again from the catalog. */
  onRestore?: (tool: RailToolType) => void;
  /**
   * A `surface` slot opens host chrome instead of selecting a tool. The host
   * owns what the surface is; the rail only reports the request.
   */
  onOpenSurface?: (
    surface: RailToolType,
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  /** A choice inside an `options` flyout. Never changes the active tool. */
  onSelectOption?: (
    tool: RailToolType,
    option: RailOptionItem,
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => void;
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
  showCatalog = true,
  onReorder,
  onUnpin,
  onRestore,
  onOpenSurface,
  onSelectOption,
  canUndo = true,
  canRedo = true,
  onUndo,
  onRedo,
}) => {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<RailToolType | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [openFlyoutFor, setOpenFlyoutFor] = useState<RailToolType | null>(null);

  // Anything open closes on Escape, and on a pointer press outside the rail.
  // A press *inside* is left alone so the click that follows can land on the
  // menu item it was aimed at.
  useEffect(() => {
    if (menuFor === null && !catalogOpen && openFlyoutFor === null) {
      return;
    }
    const closeAll = () => {
      setMenuFor(null);
      setCatalogOpen(false);
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
    const ownerDocument = railRef.current?.ownerDocument ?? document;
    ownerDocument.addEventListener("pointerdown", onPointerDown);
    ownerDocument.addEventListener("keydown", onKeyDown);
    return () => {
      ownerDocument.removeEventListener("pointerdown", onPointerDown);
      ownerDocument.removeEventListener("keydown", onKeyDown);
    };
  }, [menuFor, catalogOpen, openFlyoutFor]);

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
          const kind =
            tool.kind ??
            (tool.flyoutItems && tool.flyoutItems.length > 0
              ? "family"
              : "tool");
          // A kind with nothing to show is not a flyout: the chevron and the
          // popover appear only when the host supplied their contents.
          const hasFamilyFlyout =
            kind === "family" && Boolean(tool.flyoutItems?.length);
          const hasOptionsFlyout =
            kind === "options" && Boolean(tool.optionGroups?.length);
          const hasFlyout = hasFamilyFlyout || hasOptionsFlyout;
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
                  if (kind === "surface") {
                    setOpenFlyoutFor(null);
                    onOpenSurface?.(tool.id, event);
                    return;
                  }

                  if (kind === "options" && hasOptionsFlyout) {
                    // The slot still selects its tool — the flyout carries the
                    // settings, not a second tool list — and toggles the
                    // palette in the same gesture.
                    setOpenFlyoutFor(flyoutOpen ? null : tool.id);
                    onSelectTool(tool.activeSubTool ?? tool.id, event);
                    return;
                  }

                  if (hasFamilyFlyout && isActive) {
                    setOpenFlyoutFor(flyoutOpen ? null : tool.id);
                  } else {
                    setOpenFlyoutFor(null);
                    onSelectTool(tool.activeSubTool ?? tool.id, event);
                  }
                }}
                onPointerDown={(event) => {
                  if (kind !== "surface") {
                    onPointerDownTool?.(tool.activeSubTool ?? tool.id, event);
                  }
                }}
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
                  kind === "surface"
                    ? "dialog"
                    : hasFlyout || (!tool.pinned && onUnpin)
                    ? "menu"
                    : undefined
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

              {hasFamilyFlyout && flyoutOpen ? (
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

              {hasOptionsFlyout && flyoutOpen ? (
                <div
                  className="firo-rail__flyout firo-rail__options"
                  role="menu"
                  aria-label={`${tool.label} options`}
                >
                  {tool.optionGroups?.map((group) => (
                    <div
                      className="firo-rail__option-group"
                      key={group.id}
                      role="group"
                      aria-label={group.label ?? group.id}
                    >
                      {group.label ? (
                        <span
                          className="firo-rail__option-title"
                          aria-hidden="true"
                        >
                          {group.label}
                        </span>
                      ) : null}
                      <div
                        className={`firo-rail__option-items${
                          group.layout === "swatches"
                            ? " firo-rail__option-items--swatches"
                            : ""
                        }`}
                      >
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            role={
                              item.kind === "action"
                                ? "menuitem"
                                : "menuitemradio"
                            }
                            aria-checked={
                              item.kind === "action"
                                ? undefined
                                : item.selected ?? false
                            }
                            aria-label={item.label}
                            title={item.label}
                            className={`firo-rail__option-item${
                              item.color
                                ? " firo-rail__option-item--swatch"
                                : ""
                            }${
                              item.selected
                                ? " firo-rail__option-item--active"
                                : ""
                            }`}
                            onClick={(event) => {
                              // Deliberately does not select a tool: an option
                              // changes a setting of the tool already chosen.
                              onSelectOption?.(tool.id, item, event);
                            }}
                          >
                            {item.color ? (
                              <span
                                className="firo-rail__swatch"
                                style={{ backgroundColor: item.color }}
                                aria-hidden="true"
                              />
                            ) : (
                              <span className="firo-rail__flyout-icon">
                                {item.icon}
                              </span>
                            )}
                            {!item.color ? (
                              <span className="firo-rail__flyout-label">
                                {item.label}
                              </span>
                            ) : null}
                            {item.shortcut ? (
                              <span className="firo-rail__flyout-shortcut">
                                {item.shortcut}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        {/* The '+' is the catalog, and the catalog is the one restore path. */}
        {showCatalog && (
          <div className="firo-rail__slot">
            <button
              type="button"
              className="firo-rail__item firo-rail__item--more"
              onClick={() => setCatalogOpen((open) => !open)}
              title="Tools (+)"
              aria-label="Tools catalog"
              aria-haspopup="dialog"
              aria-expanded={catalogOpen}
            >
              <PlusIcon />
            </button>
          </div>
        )}
      </div>

      {showCatalog && catalogOpen ? (
        <ToolsCatalog
          tools={tools}
          hiddenTools={hiddenTools}
          onClose={() => setCatalogOpen(false)}
          onUnpin={onUnpin}
          onRestore={onRestore}
        />
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
