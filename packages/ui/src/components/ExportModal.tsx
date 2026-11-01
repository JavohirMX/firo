import React, { useState, useEffect } from "react";

import {
  CloseIcon,
  DownloadIcon,
  CopyIcon,
  FilePdfIcon,
  FrameIcon,
  StickyNoteIcon,
  FolderIcon,
  CheckIcon,
} from "../icons";

import "./ExportModal.scss";

export type ExportTab = "image" | "pdf" | "archive" | "csv" | "interop";

export interface FrameInfo {
  id: string;
  name: string;
}

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: ExportTab;
  boardName?: string;
  hasSelection?: boolean;
  frames?: FrameInfo[];
  stickyNoteCount?: number;
  hasRecords?: boolean;
  previewNode?: React.ReactNode;

  // Actions
  onExportImage?: (opts: {
    format: "png" | "jpg" | "svg";
    scale: number;
    background: boolean;
    selectionOnly: boolean;
    embedScene: boolean;
  }) => void;
  onCopyImage?: (opts: {
    format: "png" | "svg";
    scale: number;
    background: boolean;
    selectionOnly: boolean;
  }) => void;
  onExportPdf?: (opts: {
    mode: "frames" | "single";
    background: boolean;
  }) => void;
  onExportArchive?: (opts: { format: "firo" | "directory" }) => void;
  onExportCsv?: (opts: { target: "stickies" | "records" }) => void;
  onExportExcalidraw?: () => void;
  onExportMiroScript?: () => void;
  onExportBatchFrames?: (opts: {
    format: "png" | "svg";
    scale: number;
  }) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  defaultTab = "image",
  boardName = "Untitled board",
  hasSelection = false,
  frames = [],
  stickyNoteCount = 0,
  hasRecords = false,
  previewNode,
  onExportImage,
  onCopyImage,
  onExportPdf,
  onExportArchive,
  onExportCsv,
  onExportExcalidraw,
  onExportMiroScript,
  onExportBatchFrames,
}) => {
  const [activeTab, setActiveTab] = useState<ExportTab>(defaultTab);

  // Image tab options
  const [imageFormat, setImageFormat] = useState<"png" | "jpg" | "svg">("png");
  const [imageScale, setImageScale] = useState<number>(2);
  const [imageBackground, setImageBackground] = useState<boolean>(true);
  const [imageSelectionOnly, setImageSelectionOnly] =
    useState<boolean>(hasSelection);
  const [imageEmbedScene, setImageEmbedScene] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // PDF tab options
  const [pdfMode, setPdfMode] = useState<"frames" | "single">(
    frames.length > 0 ? "frames" : "single",
  );
  const [pdfBackground, setPdfBackground] = useState<boolean>(true);

  // Archive tab options
  const [archiveFormat, setArchiveFormat] = useState<"firo" | "directory">(
    "firo",
  );

  // CSV tab options
  const [csvTarget, setCsvTarget] = useState<"stickies" | "records">(
    stickyNoteCount > 0 ? "stickies" : hasRecords ? "records" : "stickies",
  );

  // Interop tab options
  const [interopFormat, setInteropFormat] = useState<
    "excalidraw" | "miro" | "batch_frames"
  >("excalidraw");
  const [batchFormat, setBatchFormat] = useState<"png" | "svg">("png");
  const [batchScale, setBatchScale] = useState<number>(2);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
      setImageSelectionOnly(hasSelection);
      setPdfMode(frames.length > 0 ? "frames" : "single");
    }
  }, [isOpen, defaultTab, hasSelection, frames.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleCopyImage = () => {
    if (!onCopyImage || imageFormat === "jpg") {
      return;
    }
    onCopyImage({
      format: imageFormat,
      scale: imageScale,
      background: imageBackground,
      selectionOnly: imageSelectionOnly,
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      className="firo-export-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="firo-export-modal"
        role="dialog"
        aria-label="Export Board"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="firo-export-modal__header">
          <div className="firo-export-modal__title-group">
            <h2 className="firo-export-modal__title">Export Board</h2>
            <p className="firo-export-modal__subtitle">
              Export &ldquo;{boardName}&rdquo; into images, documents, or data.
            </p>
          </div>
          <button
            type="button"
            className="firo-export-modal__close-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="firo-export-modal__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "image"}
            className={`firo-export-modal__tab ${
              activeTab === "image" ? "firo-export-modal__tab--active" : ""
            }`}
            onClick={() => setActiveTab("image")}
          >
            <span>Image</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "pdf"}
            className={`firo-export-modal__tab ${
              activeTab === "pdf" ? "firo-export-modal__tab--active" : ""
            }`}
            onClick={() => setActiveTab("pdf")}
          >
            <span className="firo-export-modal__tab-label">
              <span>PDF Document</span>
              {frames.length > 0 && (
                <span className="firo-export-modal__badge">
                  {frames.length} {frames.length === 1 ? "page" : "pages"}
                </span>
              )}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "archive"}
            className={`firo-export-modal__tab ${
              activeTab === "archive" ? "firo-export-modal__tab--active" : ""
            }`}
            onClick={() => setActiveTab("archive")}
          >
            <span>Board Archive</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "csv"}
            className={`firo-export-modal__tab ${
              activeTab === "csv" ? "firo-export-modal__tab--active" : ""
            }`}
            onClick={() => setActiveTab("csv")}
          >
            <span>Spreadsheet (CSV)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "interop"}
            className={`firo-export-modal__tab ${
              activeTab === "interop" ? "firo-export-modal__tab--active" : ""
            }`}
            onClick={() => setActiveTab("interop")}
          >
            <span>Interop</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="firo-export-modal__content">
          {/* TAB 1: IMAGE */}
          {activeTab === "image" && (
            <div className="firo-export-tab firo-export-tab--image">
              <div className="firo-export-tab__col">
                <div className="firo-export-section">
                  <label className="firo-export-section__label">Format</label>
                  <div className="firo-export-pill-group">
                    <button
                      type="button"
                      className={`firo-export-pill ${
                        imageFormat === "png" ? "firo-export-pill--active" : ""
                      }`}
                      onClick={() => setImageFormat("png")}
                    >
                      PNG (Raster)
                    </button>
                    <button
                      type="button"
                      className={`firo-export-pill ${
                        imageFormat === "jpg" ? "firo-export-pill--active" : ""
                      }`}
                      onClick={() => setImageFormat("jpg")}
                    >
                      JPG (Raster)
                    </button>
                    <button
                      type="button"
                      className={`firo-export-pill ${
                        imageFormat === "svg" ? "firo-export-pill--active" : ""
                      }`}
                      onClick={() => setImageFormat("svg")}
                    >
                      SVG (Vector)
                    </button>
                  </div>
                </div>

                {imageFormat !== "svg" && (
                  <div className="firo-export-section">
                    <label className="firo-export-section__label">
                      Resolution Scale
                    </label>
                    <div className="firo-export-pill-group">
                      {[1, 2, 3].map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`firo-export-pill ${
                            imageScale === s ? "firo-export-pill--active" : ""
                          }`}
                          onClick={() => setImageScale(s)}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="firo-export-section">
                  <label className="firo-export-section__label">Options</label>
                  <div className="firo-export-options-list">
                    <label className="firo-export-checkbox-row">
                      <input
                        type="checkbox"
                        checked={imageFormat === "jpg" ? true : imageBackground}
                        disabled={imageFormat === "jpg"}
                        title={
                          imageFormat === "jpg"
                            ? "JPG always includes the canvas background (no transparency)"
                            : undefined
                        }
                        onChange={(e) => setImageBackground(e.target.checked)}
                      />
                      <span>Canvas background</span>
                    </label>

                    {hasSelection && (
                      <label className="firo-export-checkbox-row">
                        <input
                          type="checkbox"
                          checked={imageSelectionOnly}
                          onChange={(e) =>
                            setImageSelectionOnly(e.target.checked)
                          }
                        />
                        <span>Selection only</span>
                      </label>
                    )}

                    {imageFormat === "png" && (
                      <label className="firo-export-checkbox-row">
                        <input
                          type="checkbox"
                          checked={imageEmbedScene}
                          onChange={(e) => setImageEmbedScene(e.target.checked)}
                        />
                        <span>Embed board data (can reopen in Firo)</span>
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {previewNode && (
                <div className="firo-export-tab__col firo-export-tab__col--preview">
                  <label className="firo-export-section__label">Preview</label>
                  <div className="firo-export-preview-container">
                    {previewNode}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PDF DOCUMENT */}
          {activeTab === "pdf" && (
            <div className="firo-export-tab firo-export-tab--pdf">
              <div className="firo-export-section">
                <label className="firo-export-section__label">
                  Export Mode
                </label>
                <div className="firo-export-cards-grid">
                  <div
                    className={`firo-export-mode-card ${
                      pdfMode === "frames"
                        ? "firo-export-mode-card--active"
                        : ""
                    }`}
                    onClick={() => setPdfMode("frames")}
                  >
                    <div className="firo-export-mode-card__header">
                      <FrameIcon size={20} />
                      <span className="firo-export-mode-card__title">
                        Presentation Deck (Multi-Page)
                      </span>
                    </div>
                    <p className="firo-export-mode-card__desc">
                      Each Frame on your canvas becomes a page in sequence (Miro
                      presentation style).
                    </p>
                    <div className="firo-export-mode-card__meta">
                      {frames.length > 0 ? (
                        <span className="firo-export-mode-card__count">
                          {frames.length}{" "}
                          {frames.length === 1
                            ? "frame detected"
                            : "frames detected"}
                        </span>
                      ) : (
                        <span className="firo-export-mode-card__warning">
                          No frames found — entire board will be 1 page.
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    className={`firo-export-mode-card ${
                      pdfMode === "single"
                        ? "firo-export-mode-card--active"
                        : ""
                    }`}
                    onClick={() => setPdfMode("single")}
                  >
                    <div className="firo-export-mode-card__header">
                      <FilePdfIcon size={20} />
                      <span className="firo-export-mode-card__title">
                        Single Page (Full Board)
                      </span>
                    </div>
                    <p className="firo-export-mode-card__desc">
                      Fits your entire board (or current selection) onto a
                      single high-resolution vector PDF document.
                    </p>
                  </div>
                </div>
              </div>

              {pdfMode === "frames" && frames.length > 0 && (
                <div className="firo-export-section">
                  <label className="firo-export-section__label">
                    Deck Pages ({frames.length})
                  </label>
                  <div className="firo-export-frames-list">
                    {frames.map((frame, index) => (
                      <div key={frame.id} className="firo-export-frame-item">
                        <span className="firo-export-frame-item__num">
                          Page {index + 1}
                        </span>
                        <span className="firo-export-frame-item__name">
                          {frame.name || `Frame ${index + 1}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="firo-export-section">
                <label className="firo-export-section__label">Options</label>
                <label className="firo-export-checkbox-row">
                  <input
                    type="checkbox"
                    checked={pdfBackground}
                    onChange={(e) => setPdfBackground(e.target.checked)}
                  />
                  <span>Include canvas background color</span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: BOARD ARCHIVE */}
          {activeTab === "archive" && (
            <div className="firo-export-tab firo-export-tab--archive">
              <div className="firo-export-cards-grid">
                <div
                  className={`firo-export-mode-card ${
                    archiveFormat === "firo"
                      ? "firo-export-mode-card--active"
                      : ""
                  }`}
                  onClick={() => setArchiveFormat("firo")}
                >
                  <div className="firo-export-mode-card__header">
                    <DownloadIcon size={20} />
                    <span className="firo-export-mode-card__title">
                      .firo File (ZIP Package)
                    </span>
                  </div>
                  <p className="firo-export-mode-card__desc">
                    A standalone portable package carrying your complete board:
                    vector elements, rich text, database records, and all
                    embedded media files.
                  </p>
                </div>

                <div
                  className={`firo-export-mode-card ${
                    archiveFormat === "directory"
                      ? "firo-export-mode-card--active"
                      : ""
                  }`}
                  onClick={() => setArchiveFormat("directory")}
                >
                  <div className="firo-export-mode-card__header">
                    <FolderIcon size={20} />
                    <span className="firo-export-mode-card__title">
                      Diffable Folder (Git Version Control)
                    </span>
                  </div>
                  <p className="firo-export-mode-card__desc">
                    Exports directly to a local directory via the File System
                    Access API. Canonical JSON formatting enables clean,
                    readable git diffs.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SPREADSHEET (CSV) */}
          {activeTab === "csv" && (
            <div className="firo-export-tab firo-export-tab--csv">
              <div className="firo-export-section">
                <label className="firo-export-section__label">
                  Data Target
                </label>
                <div className="firo-export-cards-grid">
                  <div
                    className={`firo-export-mode-card ${
                      csvTarget === "stickies"
                        ? "firo-export-mode-card--active"
                        : ""
                    }`}
                    onClick={() => setCsvTarget("stickies")}
                  >
                    <div className="firo-export-mode-card__header">
                      <StickyNoteIcon size={20} />
                      <span className="firo-export-mode-card__title">
                        Sticky Notes
                      </span>
                    </div>
                    <p className="firo-export-mode-card__desc">
                      Exports sticky notes into an RFC 4180 CSV table with text,
                      color, author, and spatial positioning.
                    </p>
                    <div className="firo-export-mode-card__meta">
                      <span className="firo-export-mode-card__count">
                        {stickyNoteCount} sticky{" "}
                        {stickyNoteCount === 1 ? "note" : "notes"} available
                      </span>
                    </div>
                  </div>

                  <div
                    className={`firo-export-mode-card ${
                      csvTarget === "records"
                        ? "firo-export-mode-card--active"
                        : ""
                    } ${!hasRecords ? "firo-export-mode-card--disabled" : ""}`}
                    onClick={() => hasRecords && setCsvTarget("records")}
                  >
                    <div className="firo-export-mode-card__header">
                      <FolderIcon size={20} />
                      <span className="firo-export-mode-card__title">
                        Database Records
                      </span>
                    </div>
                    <p className="firo-export-mode-card__desc">
                      Exports structured records and collection tables into
                      standard CSV columns.
                    </p>
                    <div className="firo-export-mode-card__meta">
                      <span className="firo-export-mode-card__count">
                        {hasRecords
                          ? "Records available"
                          : "No records on canvas"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: INTEROP & TOOLS */}
          {activeTab === "interop" && (
            <div className="firo-export-tab firo-export-tab--interop">
              <div className="firo-export-section">
                <label className="firo-export-section__label">
                  Select Format
                </label>
                <div className="firo-export-cards-grid">
                  <div
                    className={`firo-export-mode-card ${
                      interopFormat === "excalidraw"
                        ? "firo-export-mode-card--active"
                        : ""
                    }`}
                    onClick={() => setInteropFormat("excalidraw")}
                  >
                    <div className="firo-export-mode-card__header">
                      <span className="firo-export-mode-card__title">
                        Excalidraw (.excalidraw)
                      </span>
                    </div>
                    <p className="firo-export-mode-card__desc">
                      Scene JSON compatible with excalidraw.com. Rich text
                      formatting is converted to standard bound text.
                    </p>
                  </div>

                  <div
                    className={`firo-export-mode-card ${
                      interopFormat === "miro"
                        ? "firo-export-mode-card--active"
                        : ""
                    }`}
                    onClick={() => setInteropFormat("miro")}
                  >
                    <div className="firo-export-mode-card__header">
                      <span className="firo-export-mode-card__title">
                        Miro Web SDK Script
                      </span>
                    </div>
                    <p className="firo-export-mode-card__desc">
                      Generates a JavaScript script. Paste it into your Miro
                      browser console to recreate shapes, text, and sticky notes
                      on a Miro board.
                    </p>
                  </div>

                  <div
                    className={`firo-export-mode-card ${
                      interopFormat === "batch_frames"
                        ? "firo-export-mode-card--active"
                        : ""
                    }`}
                    onClick={() => setInteropFormat("batch_frames")}
                  >
                    <div className="firo-export-mode-card__header">
                      <FrameIcon size={20} />
                      <span className="firo-export-mode-card__title">
                        Batch Frames Archive (.zip)
                      </span>
                    </div>
                    <p className="firo-export-mode-card__desc">
                      Renders every Frame on your canvas as an individual image
                      file and packages them into a single .zip download.
                    </p>
                    <div className="firo-export-mode-card__meta">
                      <span className="firo-export-mode-card__count">
                        {frames.length}{" "}
                        {frames.length === 1 ? "frame" : "frames"} to export
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {interopFormat === "batch_frames" && (
                <>
                  <div className="firo-export-section">
                    <label className="firo-export-section__label">
                      Frame Image Format
                    </label>
                    <div className="firo-export-pill-group">
                      <button
                        type="button"
                        className={`firo-export-pill ${
                          batchFormat === "png"
                            ? "firo-export-pill--active"
                            : ""
                        }`}
                        onClick={() => setBatchFormat("png")}
                      >
                        PNG
                      </button>
                      <button
                        type="button"
                        className={`firo-export-pill ${
                          batchFormat === "svg"
                            ? "firo-export-pill--active"
                            : ""
                        }`}
                        onClick={() => setBatchFormat("svg")}
                      >
                        SVG
                      </button>
                    </div>
                  </div>

                  {batchFormat === "png" && (
                    <div className="firo-export-section">
                      <label className="firo-export-section__label">
                        Scale
                      </label>
                      <div className="firo-export-pill-group">
                        {[1, 2, 3].map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={`firo-export-pill ${
                              batchScale === s ? "firo-export-pill--active" : ""
                            }`}
                            onClick={() => setBatchScale(s)}
                          >
                            {s}x
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="firo-export-modal__footer">
          <button
            type="button"
            className="firo-export-modal__cancel-btn"
            onClick={onClose}
          >
            Cancel
          </button>

          <div className="firo-export-modal__action-group">
            {activeTab === "image" && (
              <>
                {imageFormat !== "jpg" && (
                  <button
                    type="button"
                    className="firo-export-modal__secondary-btn"
                    onClick={handleCopyImage}
                  >
                    {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                    <span>{copied ? "Copied!" : "Copy to Clipboard"}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="firo-export-modal__primary-btn"
                  onClick={() => {
                    onExportImage?.({
                      format: imageFormat,
                      scale: imageScale,
                      // JPEG has no alpha: background is always composited
                      background:
                        imageFormat === "jpg" ? true : imageBackground,
                      selectionOnly: imageSelectionOnly,
                      embedScene: imageEmbedScene,
                    });
                    onClose();
                  }}
                >
                  <DownloadIcon size={16} />
                  <span>Download {imageFormat.toUpperCase()}</span>
                </button>
              </>
            )}

            {activeTab === "pdf" && (
              <button
                type="button"
                className="firo-export-modal__primary-btn"
                onClick={() => {
                  onExportPdf?.({
                    mode: pdfMode,
                    background: pdfBackground,
                  });
                  onClose();
                }}
              >
                <DownloadIcon size={16} />
                <span>
                  {pdfMode === "frames" && frames.length > 0
                    ? `Export Deck PDF (${frames.length} pages)`
                    : "Export Full Board PDF"}
                </span>
              </button>
            )}

            {activeTab === "archive" && (
              <button
                type="button"
                className="firo-export-modal__primary-btn"
                onClick={() => {
                  onExportArchive?.({
                    format: archiveFormat,
                  });
                  onClose();
                }}
              >
                {archiveFormat === "firo" ? (
                  <DownloadIcon size={16} />
                ) : (
                  <FolderIcon size={16} />
                )}
                <span>
                  {archiveFormat === "firo"
                    ? "Download .firo Archive"
                    : "Save to Local Folder..."}
                </span>
              </button>
            )}

            {activeTab === "csv" && (
              <button
                type="button"
                className="firo-export-modal__primary-btn"
                disabled={csvTarget === "stickies" && stickyNoteCount === 0}
                onClick={() => {
                  onExportCsv?.({
                    target: csvTarget,
                  });
                  onClose();
                }}
              >
                <DownloadIcon size={16} />
                <span>Download CSV</span>
              </button>
            )}

            {activeTab === "interop" && (
              <>
                {interopFormat === "excalidraw" && (
                  <button
                    type="button"
                    className="firo-export-modal__primary-btn"
                    onClick={() => {
                      onExportExcalidraw?.();
                      onClose();
                    }}
                  >
                    <DownloadIcon size={16} />
                    <span>Download .excalidraw</span>
                  </button>
                )}

                {interopFormat === "miro" && (
                  <button
                    type="button"
                    className="firo-export-modal__primary-btn"
                    onClick={() => {
                      onExportMiroScript?.();
                      onClose();
                    }}
                  >
                    <CopyIcon size={16} />
                    <span>Generate Miro Script</span>
                  </button>
                )}

                {interopFormat === "batch_frames" && (
                  <button
                    type="button"
                    className="firo-export-modal__primary-btn"
                    disabled={frames.length === 0}
                    onClick={() => {
                      onExportBatchFrames?.({
                        format: batchFormat,
                        scale: batchScale,
                      });
                      onClose();
                    }}
                  >
                    <DownloadIcon size={16} />
                    <span>
                      {frames.length > 0
                        ? `Download ZIP (${frames.length} frames)`
                        : "No Frames to Export"}
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
