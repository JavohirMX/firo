import React from "react";

import { isFirefox, isWindows } from "@firo/common";

import { actionToggleTheme } from "../actions";
import { getShortcutFromShortcutName } from "../actions/shortcuts";

import { probablySupportsClipboardBlob } from "../clipboard";
import { t } from "../i18n";
import { getShortcutKey } from "../shortcut";

import { getToolShortcuts } from "./Tools";

import { useExcalidrawActionManager } from "./App";
import { Dialog } from "./Dialog";

import "./HelpDialog.scss";

import type { JSX } from "react";

/**
 * The Help dialog's link row.
 *
 * Upstream linked to four things, all of them Excalidraw's: its documentation
 * site, its Excalidraw+ blog (a paid product), its GitHub issue tracker, and
 * its YouTube channel. None of them describe Firo, and a team self-hosting
 * Firo should not be sent to a vendor's sales pages.
 *
 * The keyboard-shortcut reference below is the dialog's real content and is
 * kept in full. The link row is intentionally empty until Firo has somewhere of
 * its own to point — add entries here when it does, in this file, rather than
 * reintroducing third-party links.
 */
const Header = () => null;

const Section = (props: { title: string; children: React.ReactNode }) => (
  <>
    <h3>{props.title}</h3>
    <div className="HelpDialog__islands-container">{props.children}</div>
  </>
);

const ShortcutIsland = (props: {
  caption: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`HelpDialog__island ${props.className}`}>
    <h4 className="HelpDialog__island-title">{props.caption}</h4>
    <div className="HelpDialog__island-content">{props.children}</div>
  </div>
);

function* intersperse(as: JSX.Element[][], delim: string | null) {
  let first = true;
  for (const x of as) {
    if (!first) {
      yield delim;
    }
    first = false;
    yield x;
  }
}

const upperCaseSingleChars = (str: string) => {
  return str.replace(/\b[a-z]\b/, (c) => c.toUpperCase());
};

const Shortcut = ({
  label,
  shortcuts,
  isOr = true,
}: {
  label: string;
  shortcuts: string[];
  isOr?: boolean;
}) => {
  const splitShortcutKeys = shortcuts.map((shortcut) => {
    const keys = shortcut.endsWith("++")
      ? [...shortcut.slice(0, -2).split("+"), "+"]
      : shortcut.split("+");

    return keys.map((key) => (
      <ShortcutKey key={key}>{upperCaseSingleChars(key)}</ShortcutKey>
    ));
  });

  return (
    <div className="HelpDialog__shortcut">
      <div>{label}</div>
      <div className="HelpDialog__key-container">
        {[...intersperse(splitShortcutKeys, isOr ? t("helpDialog.or") : "")]}
      </div>
    </div>
  );
};

const ShortcutKey = (props: { children: React.ReactNode }) => (
  <kbd className="HelpDialog__key" {...props} />
);

export const HelpDialog = ({
  onClose,
  extraSections,
}: {
  onClose?: () => void;
  /** Host-supplied sections (facilitation, records) after the editor's own. */
  extraSections?: React.ReactNode;
}) => {
  const actionManager = useExcalidrawActionManager();
  const handleClose = React.useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  return (
    <>
      <Dialog
        onCloseRequest={handleClose}
        title={t("helpDialog.title")}
        className={"HelpDialog HelpDialog--no-links"}
      >
        <Header />
        <Section title={t("helpDialog.shortcuts")}>
          <ShortcutIsland
            className="HelpDialog__island--tools"
            caption={t("helpDialog.tools")}
          >
            <Shortcut
              label={t("toolBar.hand")}
              shortcuts={getToolShortcuts("hand")}
            />
            <Shortcut
              label={t("toolBar.selection")}
              shortcuts={getToolShortcuts("selection")}
            />
            <Shortcut
              label={t("toolBar.rectangle")}
              shortcuts={getToolShortcuts("rectangle")}
            />
            <Shortcut
              label={t("toolBar.diamond")}
              shortcuts={getToolShortcuts("diamond")}
            />
            <Shortcut
              label={t("toolBar.ellipse")}
              shortcuts={getToolShortcuts("ellipse")}
            />
            <Shortcut
              label={t("toolBar.arrow")}
              shortcuts={getToolShortcuts("arrow")}
            />
            <Shortcut
              label={t("toolBar.line")}
              shortcuts={getToolShortcuts("line")}
            />
            <Shortcut
              label={t("toolBar.freedraw")}
              shortcuts={getToolShortcuts("freedraw")}
            />
            <Shortcut
              label={t("toolBar.text")}
              shortcuts={getToolShortcuts("text")}
            />
            <Shortcut
              label={t("toolBar.stickynote")}
              shortcuts={getToolShortcuts("stickynote")}
            />
            <Shortcut
              label={t("toolBar.image")}
              shortcuts={getToolShortcuts("image")}
            />
            <Shortcut
              label={t("toolBar.eraser")}
              shortcuts={getToolShortcuts("eraser")}
            />
            <Shortcut
              label={t("toolBar.frame")}
              shortcuts={getToolShortcuts("frame")}
            />
            <Shortcut
              label={t("toolBar.laser")}
              shortcuts={getToolShortcuts("laser")}
            />
            <Shortcut
              label={t("toolBar.bucketfill")}
              shortcuts={getToolShortcuts("bucketfill")}
            />
            <Shortcut
              label={t("labels.eyeDropper")}
              shortcuts={[
                getShortcutFromShortcutName("eyeDropper"),
                getShortcutFromShortcutName("eyeDropper", 1),
                getShortcutFromShortcutName("eyeDropper", 2),
              ]}
            />
            <Shortcut
              label={t("helpDialog.editLineArrowPoints")}
              shortcuts={[getShortcutKey("CtrlOrCmd+Enter")]}
            />
            <Shortcut
              label={t("helpDialog.editText")}
              shortcuts={[getShortcutKey("Enter")]}
            />
            <Shortcut
              label={t("helpDialog.textNewLine")}
              shortcuts={[
                getShortcutKey("Enter"),
                getShortcutKey("Shift+Enter"),
              ]}
            />
            <Shortcut
              label={t("helpDialog.textFinish")}
              shortcuts={[
                getShortcutKey("Esc"),
                getShortcutKey("CtrlOrCmd+Enter"),
              ]}
            />
            <Shortcut
              label={t("helpDialog.curvedArrow")}
              shortcuts={[
                "A",
                t("helpDialog.click"),
                t("helpDialog.click"),
                t("helpDialog.click"),
              ]}
              isOr={false}
            />
            <Shortcut
              label={t("helpDialog.curvedLine")}
              shortcuts={[
                "L",
                t("helpDialog.click"),
                t("helpDialog.click"),
                t("helpDialog.click"),
              ]}
              isOr={false}
            />
            <Shortcut
              label={t("helpDialog.cropStart")}
              shortcuts={[t("helpDialog.doubleClick"), getShortcutKey("Enter")]}
              isOr={true}
            />
            <Shortcut
              label={t("helpDialog.cropFinish")}
              shortcuts={[getShortcutKey("Enter"), getShortcutKey("Escape")]}
              isOr={true}
            />
            <Shortcut
              label={t("toolBar.lock")}
              shortcuts={[getShortcutFromShortcutName("toolLock")]}
            />
            <Shortcut
              label={t("helpDialog.preventBinding")}
              shortcuts={[getShortcutKey("CtrlOrCmd")]}
            />
            <Shortcut
              label={t("toolBar.link")}
              shortcuts={[getShortcutFromShortcutName("hyperlink")]}
            />
            <Shortcut
              label={t("toolBar.convertElementType")}
              shortcuts={["Tab", "Shift+Tab"]}
              isOr={true}
            />
          </ShortcutIsland>
          <ShortcutIsland
            className="HelpDialog__island--view"
            caption={t("helpDialog.view")}
          >
            <Shortcut
              label={t("buttons.zoomIn")}
              shortcuts={[getShortcutFromShortcutName("zoomIn")]}
            />
            <Shortcut
              label={t("buttons.zoomOut")}
              shortcuts={[getShortcutFromShortcutName("zoomOut")]}
            />
            <Shortcut
              label={t("buttons.resetZoom")}
              shortcuts={[getShortcutFromShortcutName("resetZoom")]}
            />
            <Shortcut
              label={t("helpDialog.zoomToFit")}
              shortcuts={[getShortcutFromShortcutName("zoomToFit")]}
            />
            <Shortcut
              label={t("helpDialog.zoomToSelection")}
              shortcuts={[
                getShortcutFromShortcutName("zoomToFitSelectionInViewport"),
              ]}
            />
            <Shortcut
              label={t("helpDialog.movePageUpDown")}
              shortcuts={["PgUp/PgDn"]}
            />
            <Shortcut
              label={t("helpDialog.movePageLeftRight")}
              shortcuts={["Shift+PgUp/PgDn"]}
            />
            <Shortcut
              label={t("buttons.zenMode")}
              shortcuts={[getShortcutFromShortcutName("zenMode")]}
            />
            <Shortcut
              label={t("buttons.objectsSnapMode")}
              shortcuts={[getShortcutFromShortcutName("objectsSnapMode")]}
            />
            <Shortcut
              label={t("labels.toggleGrid")}
              shortcuts={[getShortcutFromShortcutName("gridMode")]}
            />
            <Shortcut
              label={t("labels.viewMode")}
              shortcuts={[getShortcutFromShortcutName("viewMode")]}
            />
            {actionManager.isActionEnabled(actionToggleTheme) && (
              <Shortcut
                label={t("labels.toggleTheme")}
                shortcuts={[getShortcutFromShortcutName("toggleTheme")]}
              />
            )}
            <Shortcut
              label={t("stats.fullTitle")}
              shortcuts={[getShortcutFromShortcutName("stats")]}
            />
            <Shortcut
              label={t("search.title")}
              shortcuts={[getShortcutFromShortcutName("searchMenu")]}
            />
            <Shortcut
              label={t("commandPalette.title")}
              shortcuts={
                isFirefox
                  ? [getShortcutFromShortcutName("commandPalette")]
                  : [
                      getShortcutFromShortcutName("commandPalette"),
                      getShortcutFromShortcutName("commandPalette", 1),
                    ]
              }
            />
          </ShortcutIsland>
          <ShortcutIsland
            className="HelpDialog__island--editor"
            caption={t("helpDialog.editor")}
          >
            <Shortcut
              label={t("helpDialog.createFlowchart")}
              shortcuts={[getShortcutKey(`CtrlOrCmd+Arrow Key`)]}
              isOr={true}
            />
            <Shortcut
              label={t("helpDialog.navigateFlowchart")}
              shortcuts={[getShortcutKey(`Alt+Arrow Key`)]}
              isOr={true}
            />
            <Shortcut
              label={t("labels.moveCanvas")}
              shortcuts={[
                getShortcutKey(`Space+${t("helpDialog.drag")}`),
                getShortcutKey(`Wheel+${t("helpDialog.drag")}`),
              ]}
              isOr={true}
            />
            <Shortcut
              label={t("buttons.clearReset")}
              shortcuts={[getShortcutFromShortcutName("clearCanvas")]}
            />
            <Shortcut
              label={t("labels.delete")}
              shortcuts={[
                getShortcutFromShortcutName("deleteSelectedElements"),
              ]}
            />
            <Shortcut
              label={t("labels.cut")}
              shortcuts={[getShortcutFromShortcutName("cut")]}
            />
            <Shortcut
              label={t("labels.copy")}
              shortcuts={[getShortcutFromShortcutName("copy")]}
            />
            <Shortcut
              label={t("labels.paste")}
              shortcuts={[getShortcutFromShortcutName("paste")]}
            />
            <Shortcut
              label={t("labels.pasteAsPlaintext")}
              shortcuts={[getShortcutKey("CtrlOrCmd+Shift+V")]}
            />
            <Shortcut
              label={t("labels.selectAll")}
              shortcuts={[getShortcutFromShortcutName("selectAll")]}
            />
            <Shortcut
              label={t("labels.multiSelect")}
              shortcuts={[getShortcutKey(`Shift+${t("helpDialog.click")}`)]}
            />
            <Shortcut
              label={t("helpDialog.deepSelect")}
              shortcuts={[getShortcutKey(`CtrlOrCmd+${t("helpDialog.click")}`)]}
            />
            <Shortcut
              label={t("helpDialog.deepBoxSelect")}
              shortcuts={[getShortcutKey(`CtrlOrCmd+${t("helpDialog.drag")}`)]}
            />
            {/* firefox supports clipboard API under a flag, so we'll
                show users what they can do in the error message */}
            {(probablySupportsClipboardBlob || isFirefox) && (
              <Shortcut
                label={t("labels.copyAsPng")}
                shortcuts={[getShortcutFromShortcutName("copyAsPng")]}
              />
            )}
            <Shortcut
              label={t("labels.copyStyles")}
              shortcuts={[getShortcutFromShortcutName("copyStyles")]}
            />
            <Shortcut
              label={t("labels.pasteStyles")}
              shortcuts={[getShortcutFromShortcutName("pasteStyles")]}
            />
            <Shortcut
              label={t("labels.sendToBack")}
              shortcuts={[getShortcutFromShortcutName("sendToBack")]}
            />
            <Shortcut
              label={t("labels.bringToFront")}
              shortcuts={[getShortcutFromShortcutName("bringToFront")]}
            />
            <Shortcut
              label={t("labels.sendBackward")}
              shortcuts={[getShortcutFromShortcutName("sendBackward")]}
            />
            <Shortcut
              label={t("labels.bringForward")}
              shortcuts={[getShortcutFromShortcutName("bringForward")]}
            />
            <Shortcut
              label={t("labels.alignTop")}
              shortcuts={[getShortcutFromShortcutName("alignTop")]}
            />
            <Shortcut
              label={t("labels.alignBottom")}
              shortcuts={[getShortcutFromShortcutName("alignBottom")]}
            />
            <Shortcut
              label={t("labels.alignLeft")}
              shortcuts={[getShortcutFromShortcutName("alignLeft")]}
            />
            <Shortcut
              label={t("labels.alignRight")}
              shortcuts={[getShortcutFromShortcutName("alignRight")]}
            />
            <Shortcut
              label={t("labels.duplicateSelection")}
              shortcuts={[
                getShortcutFromShortcutName("duplicateSelection"),
                getShortcutFromShortcutName("duplicateSelection", 1),
              ]}
            />
            <Shortcut
              label={t("helpDialog.toggleElementLock")}
              shortcuts={[getShortcutFromShortcutName("toggleElementLock")]}
            />
            <Shortcut
              label={t("buttons.undo")}
              shortcuts={[getShortcutKey("CtrlOrCmd+Z")]}
            />
            <Shortcut
              label={t("buttons.redo")}
              shortcuts={
                isWindows
                  ? [
                      getShortcutKey("CtrlOrCmd+Y"),
                      getShortcutKey("CtrlOrCmd+Shift+Z"),
                    ]
                  : [getShortcutKey("CtrlOrCmd+Shift+Z")]
              }
            />
            <Shortcut
              label={t("labels.group")}
              shortcuts={[getShortcutFromShortcutName("group")]}
            />
            <Shortcut
              label={t("labels.ungroup")}
              shortcuts={[getShortcutFromShortcutName("ungroup")]}
            />
            <Shortcut
              label={t("labels.flipHorizontal")}
              shortcuts={[getShortcutFromShortcutName("flipHorizontal")]}
            />
            <Shortcut
              label={t("labels.flipVertical")}
              shortcuts={[getShortcutFromShortcutName("flipVertical")]}
            />
            <Shortcut
              label={t("labels.showStroke")}
              shortcuts={[getShortcutKey("S")]}
            />
            <Shortcut
              label={t("labels.showBackground")}
              shortcuts={[getShortcutKey("G")]}
            />
            <Shortcut
              label={t("labels.showFonts")}
              shortcuts={[getShortcutKey("Shift+F")]}
            />
            <Shortcut
              label={t("labels.decreaseFontSize")}
              shortcuts={[getShortcutKey("CtrlOrCmd+Shift+<")]}
            />
            <Shortcut
              label={t("labels.increaseFontSize")}
              shortcuts={[getShortcutKey("CtrlOrCmd+Shift+>")]}
            />
          </ShortcutIsland>
        </Section>
        {extraSections}
      </Dialog>
    </>
  );
};
