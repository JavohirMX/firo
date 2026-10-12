import React, { useEffect, useState } from "react";
import { VOTE_COLLECTION_ID } from "@firo/facilitation";
import {
  displayValue,
  groupingColumnFor,
  groupsOf,
  projectionFor,
  valueOf,
} from "@firo/records";

import type { Collection, FiroRecord } from "@firo/schema";
import type { AppState, ExcalidrawImperativeAPI } from "@firo/editor/types";

import { boardDoc, refreshBoard } from "../board/board";
import { applyRecordMutation, recordsIn } from "../board/records";
import { addRecordToCollection } from "../board/recordActions";

import "./ProjectionView.scss";

interface ProjectionViewProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

type ProjectionMode = "board" | "table" | "grid";

interface EditingCell {
  recordId: string;
  columnKey: string;
  currentValue: string;
}

export const ProjectionView: React.FC<ProjectionViewProps> = ({
  excalidrawAPI,
}) => {
  const [, setDocRevision] = useState(0);
  const [activeModes, setActiveModes] = useState<
    Record<string, ProjectionMode>
  >({});
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  // Subscribe to document updates
  useEffect(() => {
    const doc = boardDoc();
    const unsubscribe = doc.onUpdate(() => {
      setDocRevision((prev) => prev + 1);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const doc = boardDoc();
  const collections = doc
    .read()
    .collections.filter((col) => col.id !== VOTE_COLLECTION_ID);

  if (collections.length === 0) {
    return null;
  }

  const appState: AppState | undefined = excalidrawAPI?.getAppState();
  const zoom = appState?.zoom.value ?? 1;
  const scrollX = appState?.scrollX ?? 0;
  const scrollY = appState?.scrollY ?? 0;

  return (
    <div
      className="firo-projections-layer"
      data-testid="firo-projections-layer"
    >
      {collections.map((collection, index) => {
        const mode = activeModes[collection.id] ?? "board";
        const records = recordsIn(doc, collection.id);
        const originX = 120 + index * 60;
        const originY = 120 + index * 40;

        // Canvas coordinate to viewport coordinate
        const left = (originX + scrollX) * zoom;
        const top = (originY + scrollY) * zoom;

        const setMode = (newMode: ProjectionMode) => {
          setActiveModes((prev) => ({ ...prev, [collection.id]: newMode }));
        };

        const handleAddRecord = () => {
          addRecordToCollection(boardDoc, collection.id);
          refreshBoard();
        };

        const handleCellEditSubmit = (
          recordId: string,
          columnKey: string,
          nextValue: string,
        ) => {
          const projection = projectionFor(mode);
          const mutation = projection.interpret(collection, records, {
            kind: "edit",
            recordId,
            columnKey,
            value: nextValue,
          });

          if (mutation) {
            applyRecordMutation(doc, collection.id, mutation);
            refreshBoard();
          }
          setEditingCell(null);
        };

        const handleCardDrop = (
          recordId: string,
          targetGroupId: string | null,
        ) => {
          const groupingColumn = groupingColumnFor(collection);
          if (!groupingColumn) {
            return;
          }

          const mutation = {
            kind: "setField" as const,
            recordId,
            columnKey: groupingColumn.key,
            value: {
              type: "singleSelect" as const,
              value: targetGroupId ? targetGroupId : null,
            },
          };

          applyRecordMutation(doc, collection.id, mutation);
          refreshBoard();
        };

        return (
          <div
            key={collection.id}
            className="firo-projection-container"
            style={{
              transform: `translate(${left}px, ${top}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
            data-testid={`projection-container-${collection.id}`}
          >
            {/* Header with Switcher */}
            <div className="firo-projection-header">
              <div className="firo-projection-header__title">
                <h3>{collection.name}</h3>
                <span className="firo-projection-header__count">
                  {records.length} {records.length === 1 ? "item" : "items"}
                </span>
              </div>

              {/* View Switcher: Table | Board | Grid */}
              <div
                className="firo-projection-switcher"
                role="tablist"
                aria-label="View switcher"
              >
                <button
                  type="button"
                  role="tab"
                  className={`firo-projection-switcher__tab ${
                    mode === "board" ? "is-active" : ""
                  }`}
                  aria-selected={mode === "board"}
                  data-testid="switch-projection-board"
                  onClick={() => setMode("board")}
                >
                  Board
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`firo-projection-switcher__tab ${
                    mode === "table" ? "is-active" : ""
                  }`}
                  aria-selected={mode === "table"}
                  data-testid="switch-projection-table"
                  onClick={() => setMode("table")}
                >
                  Table
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`firo-projection-switcher__tab ${
                    mode === "grid" ? "is-active" : ""
                  }`}
                  aria-selected={mode === "grid"}
                  data-testid="switch-projection-grid"
                  onClick={() => setMode("grid")}
                >
                  Grid
                </button>
              </div>

              <button
                type="button"
                className="firo-projection-header__add"
                onClick={handleAddRecord}
                data-testid="add-record-button"
              >
                + New task
              </button>
            </div>

            {/* Projection Content */}
            <div className="firo-projection-body">
              {mode === "board" && (
                <BoardKanbanView
                  collection={collection}
                  records={records}
                  onDropCard={handleCardDrop}
                />
              )}

              {mode === "table" && (
                <TableView
                  collection={collection}
                  records={records}
                  editingCell={editingCell}
                  onStartEdit={(recordId, columnKey, currentValue) =>
                    setEditingCell({ recordId, columnKey, currentValue })
                  }
                  onSubmitEdit={handleCellEditSubmit}
                  onCancelEdit={() => setEditingCell(null)}
                />
              )}

              {mode === "grid" && (
                <GridView collection={collection} records={records} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Board (Kanban) View Component                                              */
/* -------------------------------------------------------------------------- */

interface BoardKanbanViewProps {
  collection: Collection;
  records: readonly FiroRecord[];
  onDropCard: (recordId: string, targetGroupId: string | null) => void;
}

const BoardKanbanView: React.FC<BoardKanbanViewProps> = ({
  collection,
  records,
  onDropCard,
}) => {
  const groups = groupsOf(collection, records);
  const groupingColumn = groupingColumnFor(collection);

  return (
    <div className="firo-board-view" data-testid="firo-board-view">
      {groups.map((group) => {
        const handleDragOver = (e: React.DragEvent) => {
          e.preventDefault();
        };

        const handleDrop = (e: React.DragEvent) => {
          e.preventDefault();
          const recordId = e.dataTransfer.getData("text/plain");
          if (recordId) {
            onDropCard(recordId, group.id);
          }
        };

        return (
          <div
            key={group.id ?? "ungrouped"}
            className="firo-board-column"
            data-testid={`kanban-column-${group.name}`}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="firo-board-column__header">
              <span className="firo-board-column__name">{group.name}</span>
              <span className="firo-board-column__badge">
                {group.records.length}
              </span>
            </div>

            <div className="firo-board-column__cards">
              {group.records.map((record) => {
                const titleVal = valueOf(record, "title");
                const title =
                  titleVal?.type === "text" ? titleVal.value : "Untitled";

                const handleDragStart = (e: React.DragEvent) => {
                  e.dataTransfer.setData("text/plain", record.id);
                };

                return (
                  <div
                    key={record.id}
                    className="firo-board-card"
                    draggable
                    onDragStart={handleDragStart}
                    data-testid={`kanban-card-${record.id}`}
                  >
                    <div className="firo-board-card__title">{title}</div>
                    {/* Quick move buttons for keyboard accessibility & testing */}
                    {groupingColumn?.options && (
                      <div className="firo-board-card__actions">
                        {groupingColumn.options.map((opt) => {
                          if (opt.id === group.id) {
                            return null;
                          }
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              className="firo-board-card__move-btn"
                              onClick={() => onDropCard(record.id, opt.id)}
                              aria-label={`Move ${title} to ${opt.name}`}
                              data-testid={`move-card-${record.id}-to-${opt.name}`}
                            >
                              → {opt.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Table View Component                                                       */
/* -------------------------------------------------------------------------- */

interface TableViewProps {
  collection: Collection;
  records: readonly FiroRecord[];
  editingCell: EditingCell | null;
  onStartEdit: (
    recordId: string,
    columnKey: string,
    currentValue: string,
  ) => void;
  onSubmitEdit: (
    recordId: string,
    columnKey: string,
    nextValue: string,
  ) => void;
  onCancelEdit: () => void;
}

const TableView: React.FC<TableViewProps> = ({
  collection,
  records,
  editingCell,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
}) => {
  return (
    <div className="firo-table-view" data-testid="firo-table-view">
      <table className="firo-table">
        <thead>
          <tr>
            {collection.columns.map((column) => (
              <th key={column.id} className="firo-table__header-cell">
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} data-testid={`table-row-${record.id}`}>
              {collection.columns.map((column) => {
                const cellText = displayValue(record, column);
                const isEditing =
                  editingCell?.recordId === record.id &&
                  editingCell?.columnKey === column.key;

                return (
                  <td
                    key={column.id}
                    className="firo-table__cell"
                    data-testid={`table-cell-${record.id}-${column.key}`}
                    onClick={() => {
                      if (!isEditing && column.type === "text") {
                        onStartEdit(record.id, column.key, cellText);
                      }
                    }}
                  >
                    {isEditing ? (
                      <InlineCellEditor
                        initialValue={editingCell.currentValue}
                        onSave={(val) =>
                          onSubmitEdit(record.id, column.key, val)
                        }
                        onCancel={onCancelEdit}
                      />
                    ) : column.type === "singleSelect" && column.options ? (
                      <select
                        className="firo-table__select"
                        value={
                          valueOf(record, column.key)?.type === "singleSelect"
                            ? (valueOf(record, column.key) as { value: string })
                                .value ?? ""
                            : ""
                        }
                        onChange={(e) => {
                          onSubmitEdit(record.id, column.key, e.target.value);
                        }}
                        data-testid={`select-status-${record.id}`}
                      >
                        <option value="">(None)</option>
                        {column.options.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="firo-table__cell-value">
                        {cellText || "—"}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Inline Cell Editor Component                                               */
/* -------------------------------------------------------------------------- */

interface InlineCellEditorProps {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

const InlineCellEditor: React.FC<InlineCellEditorProps> = ({
  initialValue,
  onSave,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Prevent stealing canvas shortcuts (Cmd+A, Delete, etc.)
    e.stopPropagation();

    if (e.key === "Enter") {
      e.preventDefault();
      onSave(value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <input
      type="text"
      autoFocus
      className="firo-table__cell-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSave(value)}
      onKeyDown={handleKeyDown}
      data-testid="inline-cell-input"
    />
  );
};

/* -------------------------------------------------------------------------- */
/* Grid View Component                                                        */
/* -------------------------------------------------------------------------- */

interface GridViewProps {
  collection: Collection;
  records: readonly FiroRecord[];
}

const GridView: React.FC<GridViewProps> = ({ collection, records }) => {
  return (
    <div className="firo-grid-view" data-testid="firo-grid-view">
      {records.map((record) => {
        const titleVal = valueOf(record, "title");
        const title = titleVal?.type === "text" ? titleVal.value : "Untitled";

        return (
          <div
            key={record.id}
            className="firo-grid-card"
            data-testid={`grid-card-${record.id}`}
          >
            <h4 className="firo-grid-card__title">{title}</h4>
            <div className="firo-grid-card__fields">
              {collection.columns.map((col) => {
                if (col.key === "title") {
                  return null;
                }
                const val = displayValue(record, col);
                return (
                  <div key={col.id} className="firo-grid-card__field">
                    <span className="firo-grid-card__label">{col.name}:</span>
                    <span className="firo-grid-card__val">{val || "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProjectionView;
