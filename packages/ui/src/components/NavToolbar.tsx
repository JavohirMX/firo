import React from "react";

import {
  ZoomInIcon,
  ZoomOutIcon,
  ZoomFitIcon,
  MinimapIcon,
  GridIcon,
} from "../icons";

import "./NavToolbar.scss";

/**
 * Miro's zoom stops (parity matrix row 11): 50 / 70 / 100 / 400.
 */
export const NAV_ZOOM_STOPS: readonly number[] = [0.5, 0.7, 1, 4];

const ZOOM_STOP_EPSILON = 0.001;

export interface NavToolbarProps {
  zoom: number; // e.g. 1 for 100%
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomToFit: () => void;
  gridEnabled?: boolean;
  gridType?: "dots" | "lines" | "crosses" | "isometric";
  onToggleGrid?: () => void;
  minimapEnabled?: boolean;
  isMinimapOpen?: boolean;
  onToggleMinimap?: () => void;
  /**
   * When provided, the zoom readout opens a navigation menu (Miro parity
   * row 11): preset stops, full screen and the selection's dimensions.
   * Without it the readout stays a bare reset button, as before.
   */
  onZoomTo?: (zoom: number) => void;
  zoomStops?: readonly number[];
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  selectionSize?: { width: number; height: number } | null;
}

export const NavToolbar: React.FC<NavToolbarProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onZoomToFit,
  gridEnabled = false,
  gridType,
  onToggleGrid,
  minimapEnabled = false,
  isMinimapOpen,
  onToggleMinimap,
  onZoomTo,
  zoomStops = NAV_ZOOM_STOPS,
  isFullscreen = false,
  onToggleFullscreen,
  selectionSize = null,
}) => {
  const isMinimapActive = isMinimapOpen ?? minimapEnabled;
  const zoomDisplay =
    zoom < 0.01 ? `${(zoom * 100).toFixed(1)}%` : `${Math.round(zoom * 100)}%`;

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

      {onZoomTo ? (
        <ZoomMenu
          zoomDisplay={zoomDisplay}
          zoom={zoom}
          stops={zoomStops}
          onZoomTo={onZoomTo}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          selectionSize={selectionSize}
        />
      ) : (
        <button
          type="button"
          className="firo-nav-toolbar__zoom-value"
          onClick={onResetZoom}
          title="Reset Zoom to 100% (Ctrl+0)"
          aria-label={`Current Zoom: ${zoomDisplay}. Click to reset.`}
        >
          {zoomDisplay}
        </button>
      )}

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
          title={
            gridEnabled && gridType
              ? `Toggle Grid (${gridType}) (G)`
              : "Toggle Grid (G)"
          }
          aria-label="Toggle Grid"
          aria-keyshortcuts="G"
          data-grid-type={gridType}
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
          title="Toggle Minimap (M)"
          aria-label="Toggle Minimap"
          aria-keyshortcuts="M"
          aria-pressed={isMinimapActive}
        >
          <MinimapIcon size={18} />
        </button>
      )}
    </div>
  );
};

interface ZoomMenuProps {
  zoomDisplay: string;
  zoom: number;
  stops: readonly number[];
  onZoomTo: (zoom: number) => void;
  isFullscreen: boolean;
  onToggleFullscreen?: () => void;
  selectionSize: { width: number; height: number } | null;
}

/*
 * The navigation menu behind the zoom readout (Miro parity row 11). The
 * toolbar already surfaces fit, grid and minimap as first-class buttons —
 * better than Miro's buried menu rows — so the menu only carries what the
 * toolbar does not: the preset stops, full screen and the selection's
 * dimensions. Resetting stays one tap away as the 100% stop, and Ctrl+0
 * still resets directly.
 */
const ZoomMenu: React.FC<ZoomMenuProps> = ({
  zoomDisplay,
  zoom,
  stops,
  onZoomTo,
  isFullscreen,
  onToggleFullscreen,
  selectionSize,
}) => {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="firo-nav-toolbar__zoom-menu-root" ref={rootRef}>
      <button
        type="button"
        className="firo-nav-toolbar__zoom-value"
        onClick={() => setOpen((value) => !value)}
        title="Zoom and navigation"
        aria-label={`Zoom and navigation. Current zoom: ${zoomDisplay}.`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="nav-zoom-trigger"
      >
        {zoomDisplay}
      </button>
      {open && (
        <div
          className="firo-nav-toolbar__zoom-menu"
          role="menu"
          data-testid="nav-zoom-menu"
        >
          {stops.map((stop) => {
            const current = Math.abs(zoom - stop) < ZOOM_STOP_EPSILON;
            return (
              <button
                key={stop}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                className={`firo-nav-toolbar__zoom-menu-item ${
                  current ? "firo-nav-toolbar__zoom-menu-item--current" : ""
                }`}
                data-testid={`nav-zoom-stop-${stop * 100}`}
                onClick={() => {
                  onZoomTo(stop);
                  setOpen(false);
                }}
              >
                {`${stop * 100}%`}
              </button>
            );
          })}
          {onToggleFullscreen && (
            <>
              <div className="firo-nav-toolbar__zoom-menu-separator" />
              <button
                type="button"
                role="menuitem"
                className="firo-nav-toolbar__zoom-menu-item"
                data-testid="nav-zoom-fullscreen"
                onClick={() => {
                  onToggleFullscreen();
                  setOpen(false);
                }}
              >
                {isFullscreen ? "Exit full screen" : "Full screen"}
              </button>
            </>
          )}
          {selectionSize && (
            <>
              <div className="firo-nav-toolbar__zoom-menu-separator" />
              <div
                className="firo-nav-toolbar__zoom-menu-dimensions"
                data-testid="nav-zoom-dimensions"
              >
                {`${selectionSize.width} × ${selectionSize.height}`}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
