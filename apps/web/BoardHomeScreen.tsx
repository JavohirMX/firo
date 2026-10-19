import { BoardHome, CloseIcon } from "@firo/ui";
import React from "react";

import { createFiroDoc, putAsset } from "@firo/doc";
import { mintBoardId } from "@firo/board";
import { serializeBoard } from "@firo/schema";

import { getAssetBytes } from "@firo/doc";

import { loadBoard } from "@firo/schema";

import { exportToPdf } from "@firo/utils/export";

import type {
  ActivityFeedItem,
  BoardCardData,
  TemplateCardData,
} from "@firo/ui";

import { clearActivity, listActivity } from "./board/activity";

import {
  createBlankBoard,
  createBoard,
  createBoardFromTemplate,
  createFolder,
  deleteBoardForever,
  deleteFolder,
  duplicateBoard,
  formatLastOpened,
  listBoards,
  listFolders,
  renameBoard,
  renameFolder,
  restoreTrashedBoard,
  setBoardFolder,
  toggleStarBoard,
  trashBoard,
} from "./board/library";
import { BOARD_TEMPLATES, templateById } from "./board/templates";
import { boardUrl } from "./board/routes";
import {
  downloadBoard,
  exportBoard,
  exportPackagedBoard,
  importBoardFile,
  pickBinaryFile,
  type ExportResult,
  type PackagedExportResult,
} from "./board/files";
import { readBoardPayload } from "./board/storage";

import type { MiroRtbArchive } from "./board/miro";

import type { BoardFolder, BoardMeta } from "./board/library";

/**
 * The board home, wired to the board library.
 *
 * ## The split
 *
 * `BoardHome` is presentational and lives in `@firo/ui`, because it is chrome
 * ([ADR-0022](../../docs/adr/0022-ui-package-owns-the-chrome.md)). This file is
 * the app: it reads and writes storage, decides what "open" means, and hands the
 * component data with no storage in it. Every callback here is a library call
 * plus a refresh; none of them is UI.
 *
 * ## Why opening reloads
 *
 * `openBoard` navigates rather than switching a tree. See `./board/routes.ts`.
 * It also touches the board first, so recents reflects what was actually opened.
 */

const templateCards: TemplateCardData[] = BOARD_TEMPLATES.map((template) => ({
  id: template.id,
  name: template.name,
  description: template.description,
  tags: template.tags,
  color: template.color,
}));

const toCard = (meta: BoardMeta, foldersList: BoardFolder[]): BoardCardData => {
  const folder = meta.folderId
    ? foldersList.find((f) => f.id === meta.folderId)
    : undefined;
  return {
    id: meta.id,
    name: meta.name,
    tags: meta.tags,
    lastOpenedLabel: meta.trashedAt
      ? undefined
      : formatLastOpened(meta.lastOpened),
    color: meta.color,
    thumbnail: meta.thumbnail,
    trashed: Boolean(meta.trashedAt),
    folderId: meta.folderId,
    folderName: folder?.name,
    starred: Boolean(meta.starred),
    createdAt: meta.created,
    lastOpenedAt: meta.lastOpened,
  };
};

let cachedMiroRtbArchive: MiroRtbArchive | null = null;

export const BoardHomeScreen: React.FC = () => {
  const [boards, setBoards] = React.useState<BoardMeta[] | null>(null);
  const [folders, setFolders] = React.useState<BoardFolder[]>([]);
  const [activities, setActivities] = React.useState<ActivityFeedItem[]>([]);
  const [activeSection, setActiveSection] = React.useState<string>("all");
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = React.useState<"lastOpened" | "created" | "name">(
    "lastOpened",
  );

  const [miroModalArchive, setMiroModalArchive] =
    React.useState<MiroRtbArchive | null>(null);
  const miroModalOpen = miroModalArchive !== null;
  React.useEffect(() => {
    if (!miroModalOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMiroModalArchive(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [miroModalOpen]);
  const [miroPastedText, setMiroPastedText] = React.useState<string>("");
  const [copiedCmd, setCopiedCmd] = React.useState<boolean>(false);
  const [miroImportError, setMiroImportError] = React.useState<string | null>(
    null,
  );

  const refresh = React.useCallback(async () => {
    const [allBoards, allFolders, allActivities] = await Promise.all([
      listBoards(),
      listFolders(),
      listActivity({ limit: 50 }),
    ]);
    setBoards(allBoards);
    setFolders(allFolders);
    setActivities(allActivities);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = (id: string) => {
    window.location.assign(boardUrl(id));
  };

  const handleCreateBlank = async () => {
    open((await createBlankBoard()).id);
  };

  const handleFinishMiroImport = async (jsonText: string) => {
    try {
      setMiroImportError(null);
      const { id, mutation } = mintBoardId();
      const doc = createFiroDoc();
      doc.commit([mutation]);

      const archiveToUse =
        miroModalArchive ?? cachedMiroRtbArchive ?? undefined;
      const result = await importBoardFile(doc, jsonText, {
        putAsset: async (hash, data) => {
          await putAsset(hash, data as never, undefined);
        },
        miroRtbArchive: archiveToUse,
        force: true,
      });

      if (!result.ok) {
        setMiroImportError(`Import failed: ${result.detail}`);
        return;
      }

      const read = doc.read();
      const metaName = read.meta?.name;
      const boardName =
        typeof metaName === "string" &&
        metaName.trim() &&
        metaName !== "Untitled board"
          ? metaName
          : archiveToUse?.board?.name || "Imported Miro Board";

      const payload = JSON.stringify(serializeBoard(read));
      await createBoard({
        id,
        name: boardName,
        payload,
      });

      cachedMiroRtbArchive = null;
      setMiroModalArchive(null);
      open(id);
    } catch (err) {
      setMiroImportError(
        `Error processing Miro JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };

  const handlePasteMiroFromClipboard = async () => {
    try {
      const text = await navigator.clipboard?.readText?.();
      if (!text || !text.trim().startsWith("[")) {
        setMiroImportError(
          "Clipboard does not contain Miro items JSON. Please run the command in your Miro console and copy the result first.",
        );
        return;
      }
      await handleFinishMiroImport(text);
    } catch {
      setMiroImportError(
        "Clipboard read was blocked by your browser. Please paste the JSON into the box below and click Import.",
      );
    }
  };

  const handlePickMiroJsonFile = async () => {
    const picked = await pickBinaryFile(".json,application/json");
    if (!picked) {
      return;
    }
    const text = new TextDecoder().decode(picked.bytes);
    await handleFinishMiroImport(text);
  };

  const handleImportBoard = async () => {
    const picked = await pickBinaryFile(
      ".firo,.rtb,.excalidraw,.json,.csv,.zip,application/json,application/zip,application/octet-stream,text/csv",
    );
    if (!picked) {
      return;
    }

    const { id, mutation } = mintBoardId();
    const doc = createFiroDoc();
    doc.commit([mutation]);

    const result = await importBoardFile(doc, picked.bytes, {
      putAsset: async (hash, data) => {
        await putAsset(hash, data as never, undefined);
      },
      miroRtbArchive: cachedMiroRtbArchive ?? undefined,
      force: true,
    });

    if (result.ok) {
      cachedMiroRtbArchive = null;
      const read = doc.read();
      const metaName = read.meta?.name;
      const boardName =
        typeof metaName === "string" &&
        metaName.trim() &&
        metaName !== "Untitled board"
          ? metaName
          : picked.name.replace(/\.[^/.]+$/, "");
      const payload = JSON.stringify(serializeBoard(read));
      await createBoard({
        id,
        name: boardName,
        payload,
      });
      open(id);
      return;
    }

    if (result.reason === "miro-rtb-canvas-encrypted") {
      const archive = result.rtbArchive ?? null;
      cachedMiroRtbArchive = archive;
      setMiroModalArchive(archive);
      return;
    }

    alert(`That file could not be imported: ${result.detail}`);
  };

  const handleExportBoard = async (boardId: string, format: "firo" | "pdf") => {
    try {
      const rawPayload = await readBoardPayload(boardId);
      if (!rawPayload) {
        alert("Could not load board data for export.");
        return;
      }
      const doc = createFiroDoc();
      const loaded = loadBoard(JSON.parse(rawPayload));
      doc.load(loaded);
      const meta = (boards ?? []).find((b) => b.id === boardId);
      const boardName = meta?.name || "board";

      if (format === "firo") {
        let result: ExportResult | PackagedExportResult = exportBoard(doc);
        if (!result.ok && result.reason === "assets-not-carried") {
          result = await exportPackagedBoard(doc, {
            readAsset: async (hash) => {
              const bytes = await getAssetBytes(hash);
              return bytes ? new Uint8Array(bytes) : null;
            },
          });
        }
        if (result.ok) {
          downloadBoard({ ...result, filename: `${boardName}.firo` });
        } else {
          alert(`Export failed: ${result.detail}`);
        }
        return;
      }

      if (format === "pdf") {
        const elements = (doc.read().elements as any[]).filter(
          (e) => !e.isDeleted,
        );
        const frames = elements.filter((el) => el.type === "frame");
        const blob = await exportToPdf({
          elements,
          appState: {
            exportBackground: true,
            viewBackgroundColor: "#ffffff",
            name: boardName,
          } as any,
          files: {},
          exportMode: frames.length > 0 ? "multi-page-frames" : "single-page",
          frames,
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${boardName}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch (err) {
      console.error("Board export failed:", err);
      alert(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    const template = templateById(templateId);
    if (!template) {
      return;
    }
    open((await createBoardFromTemplate(template)).id);
  };

  const handleRename = async (id: string, name: string) => {
    await renameBoard(id, name);
    await refresh();
  };

  const handleTrash = async (id: string) => {
    await trashBoard(id);
    await refresh();
  };

  const handleRestore = async (id: string) => {
    await restoreTrashedBoard(id);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteBoardForever(id);
    await refresh();
  };

  const handleToggleStar = async (id: string, starred: boolean) => {
    await toggleStarBoard(id, starred);
    await refresh();
  };

  const handleDuplicate = async (id: string) => {
    await duplicateBoard(id);
    await refresh();
  };

  const handleMoveToFolder = async (boardId: string, folderId?: string) => {
    await setBoardFolder(boardId, folderId);
    await refresh();
  };

  const handleCreateFolder = async (name: string, color?: string) => {
    await createFolder(name, color);
    await refresh();
  };

  const handleRenameFolder = async (id: string, name: string) => {
    await renameFolder(id, name);
    await refresh();
  };

  const handleDeleteFolder = async (id: string) => {
    await deleteFolder(id);
    if (activeSection === id) {
      setActiveSection("all");
    }
    await refresh();
  };

  // Filter boards based on activeSection
  const displayedBoards = React.useMemo(() => {
    if (!boards) {
      return [];
    }
    const live = boards.filter((b) => !b.trashedAt);
    const trashed = boards.filter((b) => Boolean(b.trashedAt));

    if (activeSection === "trash") {
      return trashed;
    }
    if (activeSection === "recent") {
      return [...live].sort((a, b) => b.lastOpened - a.lastOpened);
    }
    if (activeSection === "starred") {
      return live.filter((b) => Boolean(b.starred));
    }
    if (activeSection === "all") {
      return live;
    }
    // Folder ID
    return live.filter((b) => b.folderId === activeSection);
  }, [boards, activeSection]);

  // Storage is asynchronous, and rendering an empty home first would flash "no
  // boards yet" at someone who has boards. Nothing is shown until the answer is.
  if (boards === null) {
    return null;
  }

  return (
    <>
      <BoardHome
        boards={displayedBoards.map((b) => toCard(b, folders))}
        templates={activeSection === "trash" ? [] : templateCards}
        folders={folders}
        activeSection={activeSection}
        viewMode={viewMode}
        sortBy={sortBy}
        onCreateBlank={handleCreateBlank}
        onImportBoard={handleImportBoard}
        onOpenBoard={open}
        onRenameBoard={handleRename}
        onTrashBoard={handleTrash}
        onRestoreBoard={handleRestore}
        onDeleteBoard={handleDelete}
        onCreateFromTemplate={handleCreateFromTemplate}
        onSelectSection={setActiveSection}
        onToggleStarBoard={handleToggleStar}
        onDuplicateBoard={handleDuplicate}
        onMoveBoardToFolder={handleMoveToFolder}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onChangeViewMode={setViewMode}
        onChangeSortBy={setSortBy}
        onExportBoard={handleExportBoard}
        activities={activities}
        onClearActivity={async () => {
          await clearActivity();
          setActivities([]);
        }}
      />

      {miroModalArchive && (
        <div
          className="firo-board-modal-overlay"
          onClick={() => setMiroModalArchive(null)}
          style={{ zIndex: 1000 }}
        >
          <div
            className="firo-board-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Complete Miro Import"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: 560, width: "90%" }}
          >
            <div className="firo-board-modal__header">
              <h3 className="firo-board-modal__title">
                Complete Miro Import:{" "}
                {miroModalArchive.board?.name || "Miro Board"}
              </h3>
              <button
                type="button"
                className="firo-board-modal__close"
                aria-label="Close dialog"
                onClick={() => setMiroModalArchive(null)}
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <div
              className="firo-board-modal__body"
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              <div
                style={{
                  background: "rgba(0, 150, 0, 0.08)",
                  border: "1px solid rgba(0, 150, 0, 0.2)",
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--firo-color-text)",
                }}
              >
                <strong>
                  ✓ Extracted {miroModalArchive.mediaFiles.size} media assets
                </strong>{" "}
                from backup.
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--firo-color-text-muted)",
                }}
              >
                Miro encrypts canvas layouts inside <code>.rtb</code> backups
                using KMS encryption. To place all notes, shapes, lines, frames,
                and your {miroModalArchive.mediaFiles.size} images onto the
                board:
              </p>
              <div
                style={{
                  background: "var(--firo-color-surface)",
                  padding: "12px",
                  borderRadius: 8,
                  border: "1px solid var(--firo-color-border)",
                  fontSize: 13,
                }}
              >
                <div style={{ marginBottom: 6, fontWeight: 500 }}>
                  1. In your open Miro board, press <code>Cmd+Option+I</code>{" "}
                  (or <code>F12</code>) &rarr; Console, then run:
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <code
                    style={{
                      flex: 1,
                      background: "var(--firo-color-panel)",
                      padding: "6px 10px",
                      borderRadius: 4,
                      fontSize: 12,
                      userSelect: "all",
                    }}
                  >
                    copy(JSON.stringify(await miro.board.get()))
                  </code>
                  <button
                    type="button"
                    style={{
                      padding: "6px 12px",
                      fontSize: 12,
                      cursor: "pointer",
                      borderRadius: 4,
                      background: "var(--firo-color-panel)",
                      border: "1px solid var(--firo-color-border)",
                    }}
                    onClick={() => {
                      void navigator.clipboard?.writeText(
                        "copy(JSON.stringify(await miro.board.get()))",
                      );
                      setCopiedCmd(true);
                      setTimeout(() => setCopiedCmd(false), 2000);
                    }}
                  >
                    {copiedCmd ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: 13,
                    marginBottom: 6,
                  }}
                >
                  2. Paste from clipboard or choose file:
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      padding: "8px 16px",
                      background: "var(--firo-color-accent)",
                      color: "var(--firo-color-on-accent)",
                      border: "none",
                      borderRadius: "var(--firo-radius-pill)",
                      cursor: "pointer",
                      fontWeight: 500,
                      fontSize: 13,
                    }}
                    onClick={handlePasteMiroFromClipboard}
                  >
                    Paste from Clipboard & Finish
                  </button>
                  <button
                    type="button"
                    style={{
                      padding: "8px 16px",
                      background: "var(--firo-color-panel)",
                      border: "1px solid var(--firo-color-border)",
                      borderRadius: "var(--firo-radius-pill)",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                    onClick={handlePickMiroJsonFile}
                  >
                    Choose items.json File
                  </button>
                </div>
                <textarea
                  placeholder="Or paste JSON here manually..."
                  value={miroPastedText}
                  onChange={(e) => setMiroPastedText(e.target.value)}
                  style={{
                    width: "100%",
                    height: 80,
                    boxSizing: "border-box",
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid var(--firo-color-border)",
                    background: "var(--firo-color-surface)",
                    color: "var(--firo-color-text)",
                    fontSize: 12,
                    fontFamily: "monospace",
                    resize: "vertical",
                  }}
                />
                {miroPastedText.trim() && (
                  <button
                    type="button"
                    style={{
                      marginTop: 8,
                      width: "100%",
                      padding: "8px 16px",
                      background: "var(--firo-color-accent)",
                      color: "var(--firo-color-on-accent)",
                      border: "none",
                      borderRadius: "var(--firo-radius-pill)",
                      cursor: "pointer",
                      fontWeight: 500,
                      fontSize: 13,
                    }}
                    onClick={() => handleFinishMiroImport(miroPastedText)}
                  >
                    Import Pasted JSON
                  </button>
                )}
              </div>

              {miroImportError && (
                <div
                  style={{
                    color: "var(--firo-color-danger, #d32f2f)",
                    fontSize: 13,
                  }}
                >
                  {miroImportError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
