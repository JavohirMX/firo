import React from "react";

import { CloseIcon } from "../icons";

import "./ToolsCatalog.scss";

import type { RailToolItem } from "./CreationRail";

export interface ToolsCatalogProps {
  /** The visible rail, pointer entry included. */
  tools: readonly RailToolItem[];
  /** Tools the user has unpinned; the catalog is their way back. */
  hiddenTools: readonly RailToolItem[];
  onClose: () => void;
  onUnpin?: (tool: RailToolItem["id"]) => void;
  onRestore?: (tool: RailToolItem["id"]) => void;
}

/**
 * The tools catalog opened by the rail's `+`.
 *
 * It is the single restore path ([ADR-0031]): the visible row is the pinned
 * section, the hidden tools follow it, and every row reports pin or unpin
 * upward. The pointer entry is non-removable, so it appears without an action.
 *
 * [ADR-0031]: ../../../../docs/adr/0031-rail-slot-kinds-and-the-phase-11-composition.md
 */
export const ToolsCatalog: React.FC<ToolsCatalogProps> = ({
  tools,
  hiddenTools,
  onClose,
  onUnpin,
  onRestore,
}) => {
  return (
    <div
      className="firo-tools-catalog"
      role="dialog"
      aria-label="Tools"
      aria-modal="false"
    >
      <header className="firo-tools-catalog__header">
        <h2 className="firo-tools-catalog__title">Tools</h2>
        <button
          type="button"
          className="firo-tools-catalog__close"
          onClick={onClose}
          aria-label="Close tools catalog"
        >
          <CloseIcon />
        </button>
      </header>

      <section
        className="firo-tools-catalog__section"
        aria-labelledby="firo-catalog-pinned"
      >
        <h3
          id="firo-catalog-pinned"
          className="firo-tools-catalog__section-title"
        >
          On the toolbar
        </h3>
        <ul className="firo-tools-catalog__list">
          {tools.map((tool) => (
            <li className="firo-tools-catalog__row" key={tool.id}>
              <span className="firo-tools-catalog__icon" aria-hidden="true">
                {tool.icon}
              </span>
              <span className="firo-tools-catalog__label">{tool.label}</span>
              {tool.pinned ? (
                <span className="firo-tools-catalog__state">Pinned</span>
              ) : (
                <button
                  type="button"
                  className="firo-tools-catalog__action"
                  onClick={() => onUnpin?.(tool.id)}
                  aria-label={`Unpin ${tool.label}`}
                  disabled={!onUnpin}
                >
                  Unpin
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {hiddenTools.length > 0 ? (
        <section
          className="firo-tools-catalog__section"
          aria-labelledby="firo-catalog-hidden"
        >
          <h3
            id="firo-catalog-hidden"
            className="firo-tools-catalog__section-title"
          >
            Hidden
          </h3>
          <ul className="firo-tools-catalog__list">
            {hiddenTools.map((tool) => (
              <li className="firo-tools-catalog__row" key={tool.id}>
                <span className="firo-tools-catalog__icon" aria-hidden="true">
                  {tool.icon}
                </span>
                <span className="firo-tools-catalog__label">{tool.label}</span>
                <button
                  type="button"
                  className="firo-tools-catalog__action"
                  onClick={() => onRestore?.(tool.id)}
                  aria-label={`Add ${tool.label} to the toolbar`}
                  disabled={!onRestore}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};
