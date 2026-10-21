/**
 * The zoom cluster's navigation menu (Miro parity matrix row 11).
 *
 * Miro's zoom-percentage control opens a menu: preset stops, fit, full
 * screen, minimap, grid, and the selection's dimensions. Firo had every one
 * of those behaviours but only as hidden shortcuts (G for grid, M for the
 * host minimap, Shift+1 for fit, ⌘0 for 100%), so the menu is a discovery
 * surface over existing actions, not new behaviour. The one genuinely new
 * entry is full screen, which no control reached before.
 *
 * The percentage trigger REPLACES the old reset-zoom button as the cluster's
 * middle control: resetting to 100% is the menu's third stop, and ⌘0 still
 * resets directly. Zoom math mirrors `actionResetZoom` — anchor the viewport
 * centre and run it through `getViewportForZoomWithScrollConstraints` so
 * viewport locks behave exactly as they do for the other zoom actions.
 */
import { useEffect, useState } from "react";

import { getCommonBounds } from "@firo/utils";

import { actionToggleGridMode } from "../../actions/actionToggleGridMode";
import { actionZoomToFit } from "../../actions/actionCanvas";
import { t } from "../../i18n";
import { getNormalizedZoom } from "../../scene";
import { getViewportForZoomWithScrollConstraints } from "../../viewport";
import { useApp } from "../App";
import DropdownMenu from "../dropdownMenu/DropdownMenu";

import type { ActionManager } from "../../actions/manager";

/** Miro's stops: 50 / 70 / 100 / 400. */
const ZOOM_STOPS = [0.5, 0.7, 1, 4] as const;

const ZOOM_STOP_EPSILON = 0.001;

export const ZoomMenu = ({
  actionManager,
}: {
  actionManager: ActionManager;
}) => {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(
    () => !!document.fullscreenElement,
  );

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const appState = app.state;

  const zoomTo = (nextZoomValue: number) => {
    app.requestUnfollow();
    app.setAppState({
      ...getViewportForZoomWithScrollConstraints(
        {
          viewportX: appState.width / 2 + appState.offsetLeft,
          viewportY: appState.height / 2 + appState.offsetTop,
          nextZoom: getNormalizedZoom(nextZoomValue),
        },
        appState,
      ),
    });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  };

  const selectedElements = app.scene
    .getNonDeletedElements()
    .filter((element) => appState.selectedElementIds[element.id]);
  const bounds =
    selectedElements.length > 0 ? getCommonBounds(selectedElements) : null;
  const selectionSize = bounds
    ? {
        width: Math.round(bounds[2] - bounds[0]),
        height: Math.round(bounds[3] - bounds[1]),
      }
    : null;

  const zoomValue = appState.zoom.value;

  return (
    <DropdownMenu open={open}>
      <DropdownMenu.Trigger
        className="reset-zoom-button zoom-button zoom-menu-trigger"
        title={t("buttons.zoomMenu")}
        aria-label={t("buttons.zoomMenu")}
        data-testid="zoom-menu-trigger"
        onToggle={() => {
          setOpen(!open);
          app.setAppState({ openMenu: null, openPopup: null });
        }}
      >
        {(zoomValue * 100).toFixed(0)}%
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        onClickOutside={() => setOpen(false)}
        onSelect={() => setOpen(false)}
        align="start"
        className="zoom-menu"
      >
        {ZOOM_STOPS.map((stop) => (
          <DropdownMenu.Item
            key={stop}
            onSelect={() => zoomTo(stop)}
            selected={Math.abs(zoomValue - stop) < ZOOM_STOP_EPSILON}
            data-testid={`zoom-menu-stop-${stop * 100}`}
          >
            {`${stop * 100}%`}
          </DropdownMenu.Item>
        ))}
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          onSelect={() => actionManager.executeAction(actionZoomToFit)}
          shortcut="Shift+1"
          data-testid="zoom-menu-fit"
        >
          {t("labels.zoomToFit")}
        </DropdownMenu.Item>
        <DropdownMenu.ItemCheckbox
          checked={appState.gridModeEnabled}
          onSelect={() => actionManager.executeAction(actionToggleGridMode)}
          shortcut="G"
          data-testid="zoom-menu-grid"
        >
          {t("labels.toggleGrid")}
        </DropdownMenu.ItemCheckbox>
        {(app.props.zoomMenuExtraItems ?? []).map((item) =>
          item.checked === undefined ? (
            <DropdownMenu.Item
              key={item.id}
              onSelect={item.onSelect}
              icon={item.icon}
              shortcut={item.shortcut}
              disabled={item.disabled}
              data-testid={`zoom-menu-${item.id}`}
            >
              {item.label}
            </DropdownMenu.Item>
          ) : (
            <DropdownMenu.ItemCheckbox
              key={item.id}
              checked={item.checked}
              onSelect={item.onSelect}
              shortcut={item.shortcut}
              disabled={item.disabled}
              data-testid={`zoom-menu-${item.id}`}
            >
              {item.label}
            </DropdownMenu.ItemCheckbox>
          ),
        )}
        <DropdownMenu.Item
          onSelect={toggleFullscreen}
          data-testid="zoom-menu-fullscreen"
        >
          {isFullscreen ? t("buttons.exitFullScreen") : t("buttons.fullScreen")}
        </DropdownMenu.Item>
        {selectionSize && (
          <>
            <DropdownMenu.Separator />
            <DropdownMenu.ItemCustom>
              <div
                className="zoom-menu__dimensions"
                data-testid="zoom-menu-dimensions"
              >
                {`${selectionSize.width} × ${selectionSize.height}`}
              </div>
            </DropdownMenu.ItemCustom>
          </>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};
