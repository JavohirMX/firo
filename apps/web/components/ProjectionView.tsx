import React, { useEffect, useState } from "react";
import { VOTE_COLLECTION_ID } from "@firo/facilitation";
import { randomId } from "@firo/common";
import {
  DAY_WIDTH,
  descendantIds,
  DOC_BLOCK_COLLECTION_ID,
  displayValue,
  groupingColumnFor,
  groupsOf,
  mindmapProjection,
  projectionFor,
  relationColumnFor,
  SIDEBAR_WIDTH,
  timelineProjection,
  titleColumnKeyFor,
  valueOf,
} from "@firo/records";

import type { Mutation } from "@firo/doc";
import type { RecordMutation } from "@firo/records";

import type { Collection, FiroRecord } from "@firo/schema";
import type { AppState, ExcalidrawImperativeAPI } from "@firo/editor/types";

import { boardDoc, refreshBoard } from "../board/board";
import { applyRecordMutation, recordsIn } from "../board/records";
import { addRecordToCollection } from "../board/recordActions";

import "./ProjectionView.scss";

interface ProjectionViewProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

type ProjectionMode = "board" | "table" | "grid" | "timeline" | "mindmap";

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

  /*
   * Re-render on document updates, but only when there is something to show.
   *
   * Every committed transaction notifies subscribers, and a stroke being drawn
   * commits once per pointer move -- so this used to throw away a render per
   * pointer move, on every board, including the many boards that hold no
   * collections at all. The component renders `null` in that case, so the render
   * was pure waste.
   *
   * The gate keeps the boolean answer in the loop instead. It re-renders when
   * there are collections (so their contents stay live), and when the answer
   * *changed* -- so a board that loses its last collection still unmounts its
   * view rather than freezing on a stale one.
   */
  useEffect(() => {
    const doc = boardDoc();
    const hasCollections = () =>
      doc
        .read()
        .collections.some(
          (collection) =>
            collection.id !== VOTE_COLLECTION_ID &&
            collection.id !== DOC_BLOCK_COLLECTION_ID,
        );

    let last = hasCollections();
    const unsubscribe = doc.onUpdate(() => {
      const now = hasCollections();
      if (now || now !== last) {
        setDocRevision((prev) => prev + 1);
      }
      last = now;
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const doc = boardDoc();
  const collections = doc
    .read()
    .collections.filter(
      (col) =>
        col.id !== VOTE_COLLECTION_ID && col.id !== DOC_BLOCK_COLLECTION_ID,
    );

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

        /*
         * Drag-reparent in the mind map: the projection validates the drop
         * (not-self, in-collection, not-a-descendant) and a rejected drop is a
         * no-op, the same rule the kanban's dead drop zones follow.
         */
        const handleReparent = (
          recordId: string,
          newParentId: string | null,
        ) => {
          const projection = projectionFor("mindmap");
          const mutation = projection.interpret(collection, records, {
            kind: "reparent",
            recordId,
            newParentId,
          });
          if (mutation) {
            applyRecordMutation(doc, collection.id, mutation);
            refreshBoard();
          }
        };

        /* The table's relation picker writes the same kind of mutation. */
        const handleRelationChange = (
          recordId: string,
          columnKey: string,
          newParentId: string | null,
        ) => {
          const mutation: RecordMutation = {
            kind: "setField",
            recordId,
            columnKey,
            value: { type: "relation", value: newParentId },
          };
          applyRecordMutation(doc, collection.id, mutation);
          refreshBoard();
        };

        /*
         * The empty state's offer. Key "parent-2" when "parent" is taken by a
         * column of another type: values are keyed by Column.key, and reusing
         * the key would read another column's stored values as relations.
         */
        const handleAddRelationColumn = () => {
          const key = collection.columns.some((c) => c.key === "parent")
            ? "parent-2"
            : "parent";
          const mutation: Mutation = {
            kind: "updateCollection",
            id: collection.id,
            changes: {
              columns: [
                ...collection.columns,
                {
                  id: `col-${randomId()}`,
                  key,
                  name: "Parent",
                  type: "relation",
                },
              ],
            },
          };
          doc.commit([mutation]);
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
                <button
                  type="button"
                  role="tab"
                  className={`firo-projection-switcher__tab ${
                    mode === "timeline" ? "is-active" : ""
                  }`}
                  aria-selected={mode === "timeline"}
                  data-testid="switch-projection-timeline"
                  onClick={() => setMode("timeline")}
                >
                  Timeline
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`firo-projection-switcher__tab ${
                    mode === "mindmap" ? "is-active" : ""
                  }`}
                  aria-selected={mode === "mindmap"}
                  data-testid="switch-projection-mindmap"
                  onClick={() => setMode("mindmap")}
                >
                  Mind map
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
                  onChangeRelation={handleRelationChange}
                />
              )}

              {mode === "grid" && (
                <GridView collection={collection} records={records} />
              )}

              {mode === "mindmap" && (
                <MindMapView
                  collection={collection}
                  records={records}
                  editingCell={editingCell}
                  onStartEdit={(recordId, columnKey, currentValue) =>
                    setEditingCell({ recordId, columnKey, currentValue })
                  }
                  onSubmitEdit={handleCellEditSubmit}
                  onCancelEdit={() => setEditingCell(null)}
                  onReparent={handleReparent}
                  onAddRelationColumn={handleAddRelationColumn}
                />
              )}

              {mode === "timeline" && (
                <TimelineView
                  collection={collection}
                  records={records}
                  onMoveBar={(recordId, newX) => {
                    const projection = projectionFor("timeline");
                    const mutation = projection.interpret(collection, records, {
                      kind: "move",
                      recordId,
                      x: newX,
                      y: 0,
                    });
                    if (mutation) {
                      applyRecordMutation(doc, collection.id, mutation);
                      refreshBoard();
                    }
                  }}
                />
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
  onChangeRelation: (
    recordId: string,
    columnKey: string,
    newParentId: string | null,
  ) => void;
}

const TableView: React.FC<TableViewProps> = ({
  collection,
  records,
  editingCell,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  onChangeRelation,
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
                const cellText = displayValue(record, column, {
                  collection,
                  records,
                });
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
                    ) : column.type === "relation" ? (
                      <RelationPicker
                        collection={collection}
                        records={records}
                        record={record}
                        columnKey={column.key}
                        onChange={onChangeRelation}
                      />
                    ) : column.type === "singleSelect" && column.options ? (
                      <select
                        className="firo-table__select"
                        aria-label={column.name}
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
      aria-label="Edit cell value"
    />
  );
};

/* -------------------------------------------------------------------------- */
/* Mind Map View Component                                                    */
/* -------------------------------------------------------------------------- */

interface MindMapViewProps {
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
  onReparent: (recordId: string, newParentId: string | null) => void;
  onAddRelationColumn: () => void;
}

/*
 * DOM nodes over an SVG edge layer. The projection owns the geometry; this
 * component only turns `ProjectionElement`s into pixels, which is the same
 * split the table and kanban keep. A drop on a node re-parents to it, a drop
 * on the background roots the record, and a drop the projection rejects is a
 * no-op rather than an error toast: dragging is exploratory.
 */
const MindMapView: React.FC<MindMapViewProps> = ({
  collection,
  records,
  editingCell,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  onReparent,
  onAddRelationColumn,
}) => {
  const column = relationColumnFor(collection);

  if (column === null) {
    return (
      <div className="firo-mindmap-empty" data-testid="mindmap-empty">
        <p>
          A mind map links each record to a parent record. This collection has
          no parent relation yet.
        </p>
        <button
          type="button"
          data-testid="add-parent-relation"
          onClick={onAddRelationColumn}
        >
          Add parent relation
        </button>
      </div>
    );
  }

  const titleKey = titleColumnKeyFor(collection);
  const elements = mindmapProjection.layout(collection, records);
  const nodes = elements.filter((element) => element.type === "card");
  const edges = elements.filter((element) => element.type === "edge");

  if (nodes.length === 0) {
    return (
      <div className="firo-mindmap-empty" data-testid="mindmap-empty">
        <p>No records yet.</p>
      </div>
    );
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));

  return (
    <div
      className="firo-mindmap-view"
      data-testid="firo-mindmap-view"
      style={{ position: "relative", width: maxX, height: maxY }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const recordId = e.dataTransfer.getData("text/plain");
        if (recordId) {
          onReparent(recordId, null);
        }
      }}
    >
      <svg
        className="firo-mindmap-edges"
        width={maxX}
        height={maxY}
        aria-hidden="true"
      >
        {edges.map((edge) => {
          const from = nodeById.get(edge.fromId ?? "");
          const to = nodeById.get(edge.toId ?? "");
          if (!from || !to) {
            return null;
          }
          const x1 = from.x + from.width;
          const y1 = from.y + from.height / 2;
          const x2 = to.x;
          const y2 = to.y + to.height / 2;
          const midX = (x1 + x2) / 2;
          return (
            <path
              key={edge.id}
              data-testid={edge.id}
              className="firo-mindmap-edge"
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              fill="none"
            />
          );
        })}
      </svg>
      {nodes.map((node) => {
        const isEditing =
          editingCell?.recordId === node.recordId &&
          editingCell?.columnKey === titleKey;
        return (
          <div
            key={node.id}
            className="firo-mindmap-node"
            data-testid={`mindmap-node-${node.recordId}`}
            style={{
              position: "absolute",
              left: node.x,
              top: node.y,
              width: node.width,
              height: node.height,
            }}
            draggable={!isEditing}
            onDragStart={(e) =>
              e.dataTransfer.setData("text/plain", node.recordId)
            }
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const recordId = e.dataTransfer.getData("text/plain");
              if (recordId) {
                onReparent(recordId, node.recordId);
              }
            }}
            onDoubleClick={() => {
              if (!isEditing) {
                onStartEdit(node.recordId, titleKey, node.text ?? "");
              }
            }}
          >
            {isEditing ? (
              <InlineCellEditor
                initialValue={editingCell.currentValue}
                onSave={(value) => onSubmitEdit(node.recordId, titleKey, value)}
                onCancel={onCancelEdit}
              />
            ) : (
              <span className="firo-mindmap-node__title">
                {node.text || "Untitled"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Relation Picker (table cells)                                              */
/* -------------------------------------------------------------------------- */

/*
 * The parent picker for a relation cell (ADR-0040 section 4): None, every
 * non-archived record in the collection except the row itself and its
 * descendants (offering a descendant would offer a cycle), and a named
 * "(Missing record)" entry when the stored parent is gone so the cell can
 * keep showing the truth until it is changed.
 */
const RelationPicker: React.FC<{
  collection: Collection;
  records: readonly FiroRecord[];
  record: FiroRecord;
  columnKey: string;
  onChange: (
    recordId: string,
    columnKey: string,
    newParentId: string | null,
  ) => void;
}> = ({ collection, records, record, columnKey, onChange }) => {
  const value = valueOf(record, columnKey);
  const current =
    value !== null && value.type === "relation" ? value.value : null;
  const excluded = descendantIds(records, columnKey, record.id);
  const titleKey = titleColumnKeyFor(collection);
  const dangling =
    current !== null && !records.some((candidate) => candidate.id === current);

  return (
    <select
      className="firo-table__select"
      aria-label={columnKey}
      value={current ?? ""}
      onChange={(e) =>
        onChange(
          record.id,
          columnKey,
          e.target.value === "" ? null : e.target.value,
        )
      }
      data-testid={`select-relation-${record.id}`}
    >
      <option value="">(None)</option>
      {dangling && <option value={current}>(Missing record)</option>}
      {records
        .filter((candidate) => !excluded.has(candidate.id))
        .map((candidate) => {
          const titleValue = valueOf(candidate, titleKey);
          const title =
            titleValue !== null &&
            titleValue.type === "text" &&
            titleValue.value !== ""
              ? titleValue.value
              : candidate.id;
          return (
            <option key={candidate.id} value={candidate.id}>
              {title}
            </option>
          );
        })}
    </select>
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

/* -------------------------------------------------------------------------- */
/* Timeline (Gantt) View Component                                            */
/* -------------------------------------------------------------------------- */

interface TimelineViewProps {
  collection: Collection;
  records: readonly FiroRecord[];
  onMoveBar: (recordId: string, newX: number) => void;
}

const TimelineView: React.FC<TimelineViewProps> = ({
  collection,
  records,
  onMoveBar,
}) => {
  const elements = timelineProjection.layout(collection, records);
  const headers = elements.filter((e) => e.type === "header");
  const labels = elements.filter((e) => e.type === "cell");
  const bars = elements.filter((e) => e.type === "card");

  return (
    <div className="firo-timeline-view" data-testid="firo-timeline-view">
      <div className="firo-timeline-table">
        <div className="firo-timeline-header-row">
          <div className="firo-timeline-header-cell firo-timeline-header-cell--label">
            Item
          </div>
          <div className="firo-timeline-header-cells">
            {headers.map((hdr) => (
              <div
                key={hdr.id}
                className="firo-timeline-day-header"
                style={{ width: hdr.width, minWidth: hdr.width }}
              >
                {hdr.text}
              </div>
            ))}
          </div>
        </div>

        <div className="firo-timeline-body">
          {labels.map((lbl) => {
            const bar = bars.find((b) => b.recordId === lbl.recordId);
            return (
              <div
                key={lbl.recordId}
                className="firo-timeline-row"
                data-testid={`timeline-row-${lbl.recordId}`}
              >
                <div className="firo-timeline-row-label">{lbl.text}</div>
                <div className="firo-timeline-row-track">
                  {bar && (
                    <div
                      className="firo-timeline-bar"
                      data-testid={`timeline-bar-${bar.recordId}`}
                      style={{
                        left: Math.max(0, bar.x - SIDEBAR_WIDTH),
                        width: bar.width,
                      }}
                    >
                      <span className="firo-timeline-bar__title">
                        {bar.text}
                      </span>
                      <div className="firo-timeline-bar__controls">
                        <button
                          type="button"
                          className="firo-timeline-bar__btn"
                          data-testid={`shift-earlier-${bar.recordId}`}
                          title="Shift earlier"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveBar(bar.recordId, bar.x - DAY_WIDTH);
                          }}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className="firo-timeline-bar__btn"
                          data-testid={`shift-later-${bar.recordId}`}
                          title="Shift later"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveBar(bar.recordId, bar.x + DAY_WIDTH);
                          }}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ProjectionView;
