import React from "react";

import {
  ZoomInIcon,
  ZoomOutIcon,
  ZoomFitIcon,
  MinimapIcon,
  GridIcon,
} from "../icons";

import "./NavToolbar.scss";

export interface NavToolbarProps {
  zoom: number; // e.g. 1 for 100%
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomToFit: () => void;
  gridEnabled?: boolean;
  onToggleGrid?: () => void;
  minimapEnabled?: boolean;
  isMinimapOpen?: boolean;
  onToggleMinimap?: () => void;
}

export const NavToolbar: React.FC<NavToolbarProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onZoomToFit,
  gridEnabled = false,
  onToggleGrid,
  minimapEnabled = false,
  isMinimapOpen,
  onToggleMinimap,
}) => {
  const isMinimapActive = isMinimapOpen ?? minimapEnabled;
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div
      className="firo-nav-toolbar"
      role="toolbar"
      aria-label="Navigation Toolbar"
    >
      <button
        type="button"
        className="firo-nav-toolbar__button"
        onClick={onZoomOut}
        title="Zoom Out (Ctrl+-)"
        aria-label="Zoom Out"
      >
        <ZoomOutIcon size={18} />
      </button>

      <button
        type="button"
        className="firo-nav-toolbar__zoom-value"
        onClick={onResetZoom}
        title="Reset Zoom to 100% (Ctrl+0)"
        aria-label={`Current Zoom: ${zoomPercent}%. Click to reset.`}
      >
        {zoomPercent}%
      </button>

      <button
        type="button"
        className="firo-nav-toolbar__button"
        onClick={onZoomIn}
        title="Zoom In (Ctrl++)"
        aria-label="Zoom In"
      >
        <ZoomInIcon size={18} />
      </button>

      <div className="firo-nav-toolbar__divider" />

      <button
        type="button"
        className="firo-nav-toolbar__button"
        onClick={onZoomToFit}
        title="Fit to Screen (Shift+1)"
        aria-label="Fit to Screen"
      >
        <ZoomFitIcon size={18} />
      </button>

      {onToggleGrid && (
        <button
          type="button"
          className={`firo-nav-toolbar__button ${
            gridEnabled ? "firo-nav-toolbar__button--active" : ""
          }`}
          onClick={onToggleGrid}
          title="Toggle Grid (Ctrl+')"
          aria-label="Toggle Grid"
          aria-pressed={gridEnabled}
        >
          <GridIcon size={18} />
        </button>
      )}

      {onToggleMinimap && (
        <button
          type="button"
          className={`firo-nav-toolbar__button ${
            isMinimapActive ? "firo-nav-toolbar__button--active" : ""
          }`}
          onClick={onToggleMinimap}
          title="Toggle Minimap"
          aria-label="Toggle Minimap"
          aria-pressed={isMinimapActive}
        >
          <MinimapIcon size={18} />
        </button>
      )}
    </div>
  );
};
