import clsx from "clsx";
import React, { useEffect, useRef, useState } from "react";

import { KEYS } from "@firo/common";

import type { ExcalidrawElement } from "@firo/element/types";

import { getShortcutFromShortcutName } from "../actions/shortcuts";
import { CONTEXT_MENU_ANCHOR_ACTIONS } from "../actions/actionCanvasAnchor";
import { t } from "../i18n";

import { useExcalidrawAppState, useExcalidrawElements } from "./App";
import { chevronRight } from "./icons";
import { Popover } from "./Popover";

import "./ContextMenu.scss";

import type { ActionManager } from "../actions/manager";
import type { ShortcutName } from "../actions/shortcuts";
import type { Action } from "../actions/types";
import type { AppClassProperties, AppProps, AppState } from "../types";

import type { TranslationKeys } from "../i18n";

type ContextMenuPredicate = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  appProps: AppProps,
  app: AppClassProperties,
) => boolean;

/**
 * The lane's five item kinds (ADR-0033): action and checkable action come
 * from the action registry; submenu, fact and separator are menu structure.
 * Every row still resolves through the action manager, so the palette and
 * the lane see the same commands.
 */
export type ContextMenuFact = {
  kind: "fact";
  key: string;
  label: TranslationKeys;
  value: (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    app: AppClassProperties,
  ) => string;
  predicate?: ContextMenuPredicate;
};

export type ContextMenuSubmenu = {
  kind: "submenu";
  key: string;
  label: TranslationKeys;
  items: ContextMenuItems;
  predicate?: ContextMenuPredicate;
};

export type ContextMenuItem =
  | typeof CONTEXT_MENU_SEPARATOR
  | Action
  | ContextMenuFact
  | ContextMenuSubmenu;

export type ContextMenuItems = (ContextMenuItem | false | null | undefined)[];

type ContextMenuProps = {
  actionManager: ActionManager;
  items: ContextMenuItems;
  top: number;
  left: number;
  onClose: (callback?: () => void) => void;
};

export const CONTEXT_MENU_SEPARATOR = "separator";

const isSubmenu = (item: ContextMenuItem): item is ContextMenuSubmenu =>
  typeof item === "object" && "kind" in item && item.kind === "submenu";

const isFact = (item: ContextMenuItem): item is ContextMenuFact =>
  typeof item === "object" && "kind" in item && item.kind === "fact";

type FocusRequest =
  | { kind: "first" }
  | { kind: "submenuFirst" }
  | { kind: "parent"; key: string };

export const ContextMenu = React.memo(
  ({ actionManager, items, top, left, onClose }: ContextMenuProps) => {
    const appState = useExcalidrawAppState();
    const elements = useExcalidrawElements();
    const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
    const listRef = useRef<HTMLUListElement | null>(null);
    const focusRequestRef = useRef<FocusRequest | null>({ kind: "first" });

    const passes = (predicate?: ContextMenuPredicate) =>
      !predicate ||
      predicate(elements, appState, actionManager.app.props, actionManager.app);

    const filterItems = (list: ContextMenuItems): ContextMenuItem[] =>
      list.reduce((acc: ContextMenuItem[], item) => {
        if (!item) {
          return acc;
        }
        if (item === CONTEXT_MENU_SEPARATOR) {
          acc.push(item);
        } else if (isSubmenu(item)) {
          // a submenu whose rows all hide at open has no row of its own
          if (
            passes(item.predicate) &&
            filterItems(item.items).some(
              (child) => child !== CONTEXT_MENU_SEPARATOR,
            )
          ) {
            acc.push(item);
          }
        } else if (isFact(item)) {
          if (passes(item.predicate)) {
            acc.push(item);
          }
        } else if (
          !item.predicate ||
          item.predicate(
            elements,
            appState,
            actionManager.app.props,
            actionManager.app,
          )
        ) {
          acc.push(item);
        }
        return acc;
      }, []);

    const filteredItems = filterItems(items);

    // Roving focus (ADR-0033): on open the first actionable row is focused;
    // opening a submenu focuses its first row, closing one refocuses its
    // parent row. The request is read after the render that caused it.
    useEffect(() => {
      const request = focusRequestRef.current;
      focusRequestRef.current = null;
      const list = listRef.current;
      if (!request || !list) {
        return;
      }
      if (request.kind === "first") {
        list
          .querySelector<HTMLElement>(":scope > li button.context-menu-item")
          ?.focus();
      } else if (request.kind === "submenuFirst") {
        list
          .querySelector<HTMLElement>(
            ".context-menu-item__submenu button.context-menu-item",
          )
          ?.focus();
      } else {
        list
          .querySelector<HTMLElement>(
            `:scope > li > button[data-submenu="${request.key}"]`,
          )
          ?.focus();
      }
    });

    /*
     * The keyboard model (ADR-0033). This is a native listener on the lane
     * itself: the Popover's Tab-cycling listener lives on its container and
     * App's keydown is delegated at the React root, and both fire after a
     * native listener here, so a handled key never reaches the canvas — an
     * open lane no longer leaks arrows, Enter or Escape into the editor.
     */
    useEffect(() => {
      const list = listRef.current;
      if (!list) {
        return;
      }
      const handler = (event: KeyboardEvent) => {
        const openSub = list.querySelector<HTMLElement>(
          ".context-menu-item__submenu",
        );
        const rows = Array.from(
          (openSub ?? list).querySelectorAll<HTMLElement>(
            openSub
              ? "button.context-menu-item"
              : ":scope > li > button.context-menu-item",
          ),
        );
        const active = document.activeElement as HTMLElement | null;
        const index = rows.findIndex((row) => row === active);
        const stop = () => {
          event.preventDefault();
          event.stopImmediatePropagation();
        };
        switch (event.key) {
          case KEYS.ARROW_DOWN:
            stop();
            rows[(index + 1 + rows.length) % rows.length]?.focus();
            return;
          case KEYS.ARROW_UP:
            stop();
            rows[(index - 1 + rows.length) % rows.length]?.focus();
            return;
          case "Home":
            stop();
            rows[0]?.focus();
            return;
          case "End":
            stop();
            rows[rows.length - 1]?.focus();
            return;
          case KEYS.ARROW_RIGHT: {
            // arrows are menu keys while a lane is open; they never nudge
            stop();
            const key = active?.dataset.submenu;
            if (!openSub && key) {
              focusRequestRef.current = { kind: "submenuFirst" };
              setOpenSubmenu(key);
            }
            return;
          }
          case KEYS.ARROW_LEFT: {
            stop();
            if (openSub?.dataset.submenuParent) {
              focusRequestRef.current = {
                kind: "parent",
                key: openSub.dataset.submenuParent,
              };
              setOpenSubmenu(null);
            }
            return;
          }
          case KEYS.ESCAPE:
            stop();
            if (openSub?.dataset.submenuParent) {
              focusRequestRef.current = {
                kind: "parent",
                key: openSub.dataset.submenuParent,
              };
              setOpenSubmenu(null);
            } else {
              // the Escape rung: the lane closes, the selection stays
              onClose();
            }
            return;
          case KEYS.TAB:
            // close and let focus move onward from the board container
            stop();
            onClose();
            return;
          case KEYS.ENTER:
          case " ":
            // the focused row activates natively; the key stays in the lane
            event.stopImmediatePropagation();
            break;
          default:
            break;
        }
      };
      list.addEventListener("keydown", handler);
      return () => list.removeEventListener("keydown", handler);
    }, [onClose]);

    const renderActionRow = (
      item: Action,
      key: React.Key,
      closeOthers: boolean,
    ) => {
      const actionName = item.name;
      let label = "";
      if (item.label) {
        if (typeof item.label === "function") {
          label = t(
            item.label(
              elements,
              appState,
              actionManager.app,
            ) as unknown as TranslationKeys,
          );
        } else {
          label = t(item.label as unknown as TranslationKeys);
        }
      }

      const checked = item.checked ? !!item.checked(appState) : undefined;

      return (
        <li
          key={key}
          role="none"
          data-testid={actionName}
          onPointerEnter={closeOthers ? () => setOpenSubmenu(null) : undefined}
          onClick={() => {
            // we need update state before executing the action in case
            // the action uses the appState it's being passed (that still
            // contains a defined contextMenu) to return the next state.
            const anchor = appState.contextMenu;
            onClose(() => {
              actionManager.executeAction(
                item,
                "contextMenu",
                // the canvas lane's anchor rows get the scene anchor as
                // form data; every other row's form data stays null
                anchor && CONTEXT_MENU_ANCHOR_ACTIONS.has(item.name)
                  ? { x: anchor.anchorX, y: anchor.anchorY }
                  : null,
              );
            });
          }}
        >
          <button
            type="button"
            role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={checked}
            className={clsx("context-menu-item", {
              dangerous: actionName === "deleteSelectedElements",
              checkmark: checked,
            })}
          >
            <div className="context-menu-item__label">{label}</div>
            <kbd className="context-menu-item__shortcut">
              {actionName
                ? getShortcutFromShortcutName(actionName as ShortcutName)
                : ""}
            </kbd>
          </button>
        </li>
      );
    };

    const renderFactRow = (item: ContextMenuFact, key: React.Key) => (
      <li key={key} role="none" className="context-menu-item--fact">
        <div className="context-menu-item context-menu-item__fact">
          <div className="context-menu-item__label">{t(item.label)}</div>
          <div className="context-menu-item__fact-value">
            {item.value(elements, appState, actionManager.app)}
          </div>
        </div>
      </li>
    );

    const renderItems = (list: ContextMenuItem[], nested: boolean) =>
      list.map((item, idx) => {
        if (item === CONTEXT_MENU_SEPARATOR) {
          // separators are never leading, trailing or doubled
          if (
            !list[idx - 1] ||
            list[idx - 1] === CONTEXT_MENU_SEPARATOR ||
            !list[idx + 1] ||
            list[idx + 1] === CONTEXT_MENU_SEPARATOR
          ) {
            return null;
          }
          return <hr key={idx} className="context-menu-item-separator" />;
        }

        if (isFact(item)) {
          return renderFactRow(item, item.key);
        }

        if (isSubmenu(item)) {
          const open = openSubmenu === item.key;
          return (
            <li
              key={item.key}
              role="none"
              data-testid={`submenu-${item.key}`}
              className="context-menu-item--has-submenu"
              onPointerEnter={() => setOpenSubmenu(item.key)}
            >
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                data-submenu={item.key}
                className="context-menu-item context-menu-item--submenu-parent"
                // open only: on touch the tap's pointerenter opens the
                // submenu first, so a toggling click would close it again
                onClick={() => setOpenSubmenu(item.key)}
              >
                <div className="context-menu-item__label">{t(item.label)}</div>
                <div className="context-menu-item__chevron">{chevronRight}</div>
              </button>
              {open && (
                <ul
                  className="context-menu context-menu-item__submenu"
                  role="menu"
                  data-submenu-parent={item.key}
                >
                  {renderItems(filterItems(item.items), true)}
                </ul>
              )}
            </li>
          );
        }

        return renderActionRow(item, idx, !nested);
      });

    return (
      <Popover
        onCloseRequest={() => {
          onClose();
        }}
        top={top}
        left={left}
        fitInViewport={true}
        flipAbove={true}
        viewportWidth={appState.width}
        viewportHeight={appState.height}
        className="context-menu-popover"
      >
        <ul
          className="context-menu"
          role="menu"
          ref={listRef}
          onContextMenu={(event) => event.preventDefault()}
        >
          {renderItems(filteredItems, false)}
        </ul>
      </Popover>
    );
  },
);
