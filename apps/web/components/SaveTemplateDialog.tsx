import React, { useEffect, useState } from "react";
import { useFocusTrap } from "@firo/editor";
import { CloseIcon } from "@firo/ui";

import type { BinaryFiles, ExcalidrawImperativeAPI } from "@firo/editor/types";

import { captureTemplateFragment } from "../board/templateFragment";
import {
  parseTemplateTags,
  validateTemplateDescription,
  validateTemplateName,
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_NAME_MAX,
} from "../board/templateFields";
import { saveTemplate } from "../board/templateStore";

import "./SaveTemplateDialog.scss";

import type { CapturedFragment } from "../board/templateFragment";

export interface SaveTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

/** The thumbnail's budget: at most 320px on the fragment's long edge. */
const THUMBNAIL_LONG_EDGE = 320;

/**
 * Save the current selection as a template (parity matrix row 56,
 * [`ADR-0038`] §4).
 *
 * The fragment is captured when the dialog opens — remote edits while it is
 * open do not change what will be saved — and the preview is the real
 * renderer drawing the real fragment, because a card that cannot show what
 * will be inserted is a label, not a gallery. Saving writes to the local
 * templates store only: no board state, no undo step, no sync.
 *
 * [`ADR-0038`]: ../../../docs/adr/0038-templates-are-content.md
 */
export const SaveTemplateDialog: React.FC<SaveTemplateDialogProps> = ({
  isOpen,
  onClose,
  excalidrawAPI,
}) => {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);

  const [fragment, setFragment] = useState<CapturedFragment | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<string | undefined>(undefined);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /*
   * Capture on open. The thumbnail renders in the same pass; a failed render
   * never blocks the save (ADR-0038 §3), it just leaves the preview blank.
   */
  useEffect(() => {
    if (!isOpen || !excalidrawAPI) {
      return;
    }
    setName("");
    setDescription("");
    setTagsRaw("");
    setSaving(false);
    setSaveError(null);
    setThumbnail(undefined);

    const captured = captureTemplateFragment({
      elements: excalidrawAPI.getSceneElements(),
      selectedElementIds: excalidrawAPI.getAppState().selectedElementIds,
      files: excalidrawAPI.getFiles(),
    });
    if (!captured.ok) {
      setFragment(null);
      setCaptureError(
        captured.reason === "missing-image-data"
          ? "A selected image is still loading or its data is missing, so this selection cannot be saved as a template."
          : "Select at least one object before saving a template.",
      );
      return;
    }
    setCaptureError(null);
    setFragment(captured.fragment);

    let cancelled = false;
    void (async () => {
      try {
        const { exportToCanvas } = await import("@firo/editor");
        const appState = excalidrawAPI.getAppState();
        const bounds = captured.fragment.elements.reduce(
          (acc, element) => ({
            minX: Math.min(acc.minX, element.x),
            minY: Math.min(acc.minY, element.y),
            maxX: Math.max(acc.maxX, element.x + element.width),
            maxY: Math.max(acc.maxY, element.y + element.height),
          }),
          { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
        );
        const longEdge = Math.max(
          bounds.maxX - bounds.minX,
          bounds.maxY - bounds.minY,
        );
        const files: BinaryFiles = {};
        for (const [id, file] of Object.entries(captured.fragment.files)) {
          files[id] = {
            id,
            dataURL: file.dataURL,
            mimeType: file.mimeType,
            created: file.created,
            lastRetrieved: Date.now(),
          } as BinaryFiles[string];
        }
        const canvas = await exportToCanvas({
          // The fragment holds only non-deleted elements by construction.
          elements: captured.fragment.elements as never,
          appState: {
            ...appState,
            exportBackground: true,
            exportScale:
              longEdge > 0 ? Math.min(1, THUMBNAIL_LONG_EDGE / longEdge) : 1,
            exportEmbedScene: false,
          },
          files,
        });
        if (!cancelled && canvas) {
          setThumbnail(canvas.toDataURL("image/png"));
        }
      } catch {
        // A failed thumbnail leaves the preview blank; the save still works.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Capturing re-reads the editor once per open; the api identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  // On the element, not `window`: the dialog renders inside the editor's
  // container, which would otherwise consume Escape first (see the gallery).
  const handleDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCloseRef.current();
    }
  };

  if (!isOpen) {
    return null;
  }

  const validName = validateTemplateName(name);
  const validDescription = validateTemplateDescription(description);
  const parsedTags = parseTemplateTags(tagsRaw);
  const canSave =
    !saving &&
    fragment !== null &&
    validName !== null &&
    validDescription !== null &&
    parsedTags.ok;

  const handleSave = async () => {
    if (!canSave || !fragment || validName === null || !parsedTags.ok) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await saveTemplate({
        name: validName,
        description: validDescription ?? "",
        tags: parsedTags.tags,
        thumbnail,
        elements: fragment.elements,
        files: fragment.files,
      });
      excalidrawAPI?.setToast?.({
        message: "Saved to My templates",
        closable: true,
        duration: 4000,
      });
      onClose();
    } catch (error) {
      // Quota and write failures surface here with the dialog open and the
      // selection intact (ADR-0038 §3).
      setSaveError(
        `The template could not be saved: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      setSaving(false);
    }
  };

  return (
    <div
      className="firo-save-template__overlay"
      onClick={onClose}
      data-testid="save-template-overlay"
    >
      <div
        ref={focusTrapRef}
        className="firo-save-template"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-template-title"
        onKeyDown={handleDialogKeyDown}
        onClick={(event) => event.stopPropagation()}
        data-testid="save-template-dialog"
      >
        <div className="firo-save-template__header">
          <h2 id="save-template-title" className="firo-save-template__title">
            Save as template
          </h2>
          <button
            type="button"
            className="firo-save-template__close"
            onClick={onClose}
            aria-label="Close"
            data-testid="save-template-close"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {captureError ? (
          <p className="firo-save-template__error" role="alert">
            {captureError}
          </p>
        ) : (
          <>
            <div className="firo-save-template__preview">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt="Preview of the selected objects"
                  data-testid="save-template-preview"
                />
              ) : (
                <div
                  className="firo-save-template__preview-placeholder"
                  data-testid="save-template-preview-placeholder"
                >
                  {fragment ? "Rendering preview…" : ""}
                </div>
              )}
            </div>

            <label className="firo-save-template__field">
              <span className="firo-save-template__label">Name</span>
              <input
                type="text"
                value={name}
                maxLength={TEMPLATE_NAME_MAX + 20}
                onChange={(event) => setName(event.target.value)}
                placeholder="Template name"
                autoFocus
                data-testid="save-template-name"
              />
            </label>

            <label className="firo-save-template__field">
              <span className="firo-save-template__label">Description</span>
              <textarea
                value={description}
                rows={2}
                maxLength={TEMPLATE_DESCRIPTION_MAX + 40}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional"
                data-testid="save-template-description"
              />
            </label>

            <label className="firo-save-template__field">
              <span className="firo-save-template__label">
                Tags (comma-separated, optional)
              </span>
              <input
                type="text"
                value={tagsRaw}
                onChange={(event) => setTagsRaw(event.target.value)}
                placeholder="workshop, retro"
                data-testid="save-template-tags"
              />
            </label>

            {!parsedTags.ok && (
              <p className="firo-save-template__error" role="alert">
                {parsedTags.reason === "too-many-tags"
                  ? "At most 8 tags."
                  : "Each tag can be at most 24 characters."}
              </p>
            )}
            {name.trim().length > TEMPLATE_NAME_MAX && (
              <p className="firo-save-template__error" role="alert">
                The name can be at most {TEMPLATE_NAME_MAX} characters.
              </p>
            )}
            {validDescription === null && (
              <p className="firo-save-template__error" role="alert">
                The description can be at most {TEMPLATE_DESCRIPTION_MAX}{" "}
                characters.
              </p>
            )}
            {saveError && (
              <p className="firo-save-template__error" role="alert">
                {saveError}
              </p>
            )}

            <div className="firo-save-template__actions">
              <button
                type="button"
                className="firo-save-template__button"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="firo-save-template__button firo-save-template__button--primary"
                onClick={handleSave}
                disabled={!canSave}
                data-testid="save-template-save"
              >
                {saving ? "Saving…" : "Save template"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
