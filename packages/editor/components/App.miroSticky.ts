import { KEYS, getGridPoint } from "@firo/common";

import {
  isStickyNoteElement,
  makeNextSelectedElementIds,
  newStickyNoteElement,
} from "@firo/element";

import type {
  ExcalidrawElement,
  ExcalidrawStickyNoteElement,
} from "@firo/element/types";

import { stickyNoteSizeForKey } from "../actions/actionStickyNoteSize";

import type App from "./App";

export class AppMiroSticky {
  constructor(private app: App) {}

  public maybeHandleCanvasDoubleClick(
    event: { altKey?: boolean },
    sceneX: number,
    sceneY: number,
    container?: ExcalidrawElement | null | boolean,
  ): boolean {
    if (container) {
      return false;
    }
    if (
      this.app.getElementAtPosition(sceneX, sceneY, {
        includeLockedElements: true,
        includeBoundTextElement: true,
      })
    ) {
      return false;
    }
    if (event.altKey) {
      return false;
    }
    if (
      this.app.state.activeTool.type !==
      this.app.state.preferredSelectionTool.type
    ) {
      return false;
    }

    const size = stickyNoteSizeForKey(this.app.state.currentItemStickynoteSize);
    const [x, y] = getGridPoint(
      sceneX - size / 2,
      sceneY - size / 2,
      this.app.getEffectiveGridSize(),
    );

    const note = newStickyNoteElement({
      type: "stickynote",
      x,
      y,
      width: size,
      height: size,
      baseHeight: size,
      strokeColor: this.app.state.currentItemStickynoteStrokeColor,
      backgroundColor: this.app.state.currentItemStickynoteBackgroundColor,
      fillStyle: this.app.state.currentItemFillStyle,
    });

    this.app.scene.replaceAllElements([
      ...this.app.scene.getElementsIncludingDeleted(),
      note,
    ]);
    this.app.store.scheduleCapture();
    this.app.scene.triggerUpdate();
    this.app.setState((prev) => ({
      selectedElementIds: makeNextSelectedElementIds({ [note.id]: true }, prev),
    }));
    this.app.text.startTextEditing({
      sceneX: x + size / 2,
      sceneY: y + size / 2,
      container: note,
    });

    return true;
  }

  public maybeHandleRapidCreation(
    event: React.KeyboardEvent | KeyboardEvent,
    selectedElements: readonly ExcalidrawElement[],
  ): boolean {
    if (
      selectedElements.length !== 1 ||
      !isStickyNoteElement(selectedElements[0])
    ) {
      return false;
    }

    if (this.app.state.editingTextElement) {
      return false;
    }

    const target = event.target as HTMLElement | null;
    if (
      target?.closest?.(
        '[role="dialog"], [role="menu"], [aria-modal="true"], .modal, .firo-share-modal, .firo-activity-feed, .firo-template-modal',
      )
    ) {
      return false;
    }

    const note = selectedElements[0] as ExcalidrawStickyNoteElement;

    if (event.key === KEYS.TAB) {
      event.preventDefault();
      event.stopPropagation();

      const direction = event.shiftKey ? "left" : "right";
      const GAP = 24;
      const targetX =
        direction === "right"
          ? note.x + note.width + GAP
          : note.x - note.width - GAP;
      const targetY = note.y;

      const newNote = newStickyNoteElement({
        type: "stickynote",
        x: targetX,
        y: targetY,
        width: note.width,
        height: note.baseHeight || note.height,
        baseHeight: note.baseHeight || note.height,
        strokeColor: note.strokeColor,
        backgroundColor: note.backgroundColor,
        fillStyle: note.fillStyle,
        strokeWidth: note.strokeWidth,
        strokeStyle: note.strokeStyle,
        roughness: note.roughness,
        opacity: note.opacity,
        roundness: note.roundness,
        locked: false,
        frameId: note.frameId,
      });

      this.app.scene.replaceAllElements([
        ...this.app.scene.getElementsIncludingDeleted(),
        newNote,
      ]);
      this.app.store.scheduleCapture();
      this.app.scene.triggerUpdate();
      this.app.setState((prev) => ({
        selectedElementIds: makeNextSelectedElementIds(
          { [newNote.id]: true },
          prev,
        ),
      }));
      this.app.text.startTextEditing({
        sceneX: newNote.x + newNote.width / 2,
        sceneY: newNote.y + newNote.height / 2,
        container: newNote,
      });

      return true;
    }

    if (event.key === KEYS.ENTER) {
      event.preventDefault();
      event.stopPropagation();

      const GAP = 24;
      const targetX = note.x;
      const targetY = note.y + note.height + GAP;

      const newNote = newStickyNoteElement({
        type: "stickynote",
        x: targetX,
        y: targetY,
        width: note.width,
        height: note.baseHeight || note.height,
        baseHeight: note.baseHeight || note.height,
        strokeColor: note.strokeColor,
        backgroundColor: note.backgroundColor,
        fillStyle: note.fillStyle,
        strokeWidth: note.strokeWidth,
        strokeStyle: note.strokeStyle,
        roughness: note.roughness,
        opacity: note.opacity,
        roundness: note.roundness,
        locked: false,
        frameId: note.frameId,
      });

      this.app.scene.replaceAllElements([
        ...this.app.scene.getElementsIncludingDeleted(),
        newNote,
      ]);
      this.app.store.scheduleCapture();
      this.app.scene.triggerUpdate();
      this.app.setState((prev) => ({
        selectedElementIds: makeNextSelectedElementIds(
          { [newNote.id]: true },
          prev,
        ),
      }));
      this.app.text.startTextEditing({
        sceneX: newNote.x + newNote.width / 2,
        sceneY: newNote.y + newNote.height / 2,
        container: newNote,
      });

      return true;
    }

    return false;
  }
}
