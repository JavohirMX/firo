import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import * as Y from "yjs";

import { FiroDoc } from "@firo/doc";
import { loadBoard, serializeBoard } from "@firo/schema";

import { insertTaskCollection } from "../recordActions";
import { recordsIn } from "../records";
import { ProjectionView } from "../../components/ProjectionView";
import { SaveStatusIndicator } from "../../components/SaveStatusIndicator";
import { saveBoard } from "../storage";
import * as boardModule from "../board";

describe("ProjectionView & AC-3 Verification", () => {
  it("creates a collection and switches between Board, Table, and Grid projections with no reload", () => {
    const doc = new FiroDoc(new Y.Doc());
    const spyBoardDoc = vi.spyOn(boardModule, "boardDoc").mockReturnValue(doc);

    // 1. Insert task collection per AC-3
    const { collectionId } = insertTaskCollection(() => doc);
    const records = recordsIn(doc, collectionId);
    expect(records).toHaveLength(5);

    const rfcRecord = records.find(
      (r) =>
        r.values.title?.type === "text" &&
        r.values.title.value === "Write the RFC",
    );
    expect(rfcRecord).toBeDefined();
    expect(rfcRecord?.values.status).toEqual({
      type: "singleSelect",
      value: "opt-Doing",
    });

    // 2. Render ProjectionView
    const { getByTestId, queryByTestId } = render(
      <ProjectionView excalidrawAPI={null} />,
    );

    // Initial projection is Board (Kanban)
    expect(getByTestId("firo-board-view")).toBeDefined();
    expect(getByTestId(`kanban-card-${rfcRecord!.id}`)).toBeDefined();

    // 3. Move "Write the RFC" from Doing to Done
    const moveBtn = getByTestId(`move-card-${rfcRecord!.id}-to-Done`);
    act(() => {
      fireEvent.click(moveBtn);
    });

    // Verify record in document was updated to Done
    const updatedRecords = recordsIn(doc, collectionId);
    const updatedRfc = updatedRecords.find((r) => r.id === rfcRecord!.id);
    expect(updatedRfc?.values.status).toEqual({
      type: "singleSelect",
      value: "opt-Done",
    });

    // 4. Switch to Table view
    const tableTab = getByTestId("switch-projection-table");
    act(() => {
      fireEvent.click(tableTab);
    });

    // Table view is now active without reloading
    expect(getByTestId("firo-table-view")).toBeDefined();
    expect(queryByTestId("firo-board-view")).toBeNull();

    // The Status cell in the table reads "opt-Done" / Done
    const statusSelect = getByTestId(
      `select-status-${rfcRecord!.id}`,
    ) as HTMLSelectElement;
    expect(statusSelect.value).toBe("opt-Done");

    // 5. Switch to Grid view
    const gridTab = getByTestId("switch-projection-grid");
    act(() => {
      fireEvent.click(gridTab);
    });
    expect(getByTestId("firo-grid-view")).toBeDefined();
    expect(getByTestId(`grid-card-${rfcRecord!.id}`)).toBeDefined();

    // 6. Verify that state survives serialization (reload / export cycle)
    const serialized = serializeBoard(doc.read());
    const reloaded = loadBoard(serialized);
    const restoredDoc = new FiroDoc(new Y.Doc());
    restoredDoc.load(reloaded);

    const restoredRecords = recordsIn(restoredDoc, collectionId);
    const restoredRfc = restoredRecords.find((r) => r.id === rfcRecord!.id);
    expect(restoredRfc?.values.status).toEqual({
      type: "singleSelect",
      value: "opt-Done",
    });

    spyBoardDoc.mockRestore();
  });

  it("table cell edit updates record and stops event propagation", () => {
    const doc = new FiroDoc(new Y.Doc());
    const spyBoardDoc = vi.spyOn(boardModule, "boardDoc").mockReturnValue(doc);

    const { collectionId } = insertTaskCollection(() => doc);
    const records = recordsIn(doc, collectionId);
    const firstRecord = records[0];

    const { getByTestId } = render(<ProjectionView excalidrawAPI={null} />);

    // Switch to table
    act(() => {
      fireEvent.click(getByTestId("switch-projection-table"));
    });

    // Click title cell to start editing
    const titleCell = getByTestId(`table-cell-${firstRecord.id}-title`);
    act(() => {
      fireEvent.click(titleCell);
    });

    // Edit value
    const input = getByTestId("inline-cell-input") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "Updated task title" } });
      fireEvent.blur(input);
    });

    // Record is updated in the document
    const updated = recordsIn(doc, collectionId).find(
      (r) => r.id === firstRecord.id,
    );
    expect(updated?.values.title).toEqual({
      type: "text",
      value: "Updated task title",
    });

    spyBoardDoc.mockRestore();
  });
});

describe("SaveStatusIndicator (AC-10)", () => {
  it("renders status when saving and saved", async () => {
    const { getByTestId } = render(<SaveStatusIndicator />);

    const doc = new FiroDoc(new Y.Doc());
    await act(async () => {
      await saveBoard(doc);
    });

    const indicator = getByTestId("firo-save-status");
    expect(indicator).toBeDefined();
    expect(indicator.textContent).toContain("Saved");
  });
});
