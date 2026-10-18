import "fake-indexeddb/auto";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import { createFiroDoc } from "@firo/doc";

import { SaveStatusIndicator } from "../components/SaveStatusIndicator";
import {
  VersionHistoryModal,
  formatBytes,
  formatRelativeTime,
} from "../components/VersionHistoryModal";
import * as storageModule from "../board/storage";

let mockSaveStatusListener: ((status: string) => void) | null = null;
let currentMockSaveStatus = "idle";

vi.mock("../board/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../board/storage")>();
  return {
    ...actual,
    getSaveStatus: () => currentMockSaveStatus,
    subscribeSaveStatus: (listener: (status: string) => void) => {
      mockSaveStatusListener = listener;
      listener(currentMockSaveStatus);
      return () => {
        mockSaveStatusListener = null;
      };
    },
  };
});

describe("SaveStatusIndicator Visual Sync Status", () => {
  beforeEach(() => {
    currentMockSaveStatus = "idle";
  });

  it("renders null when status is idle", () => {
    render(<SaveStatusIndicator />);
    expect(screen.queryByTestId("firo-save-status")).toBeNull();
  });

  it("displays server sync states when collabStatus is 'connected'", () => {
    render(<SaveStatusIndicator collabStatus="connected" />);

    act(() => {
      mockSaveStatusListener?.("saving");
    });
    let indicator = screen.getByTestId("firo-save-status");
    expect(indicator.textContent).toContain("Syncing...");

    act(() => {
      mockSaveStatusListener?.("saved");
    });
    indicator = screen.getByTestId("firo-save-status");
    expect(indicator.textContent).toContain("Synced to server");

    act(() => {
      mockSaveStatusListener?.("error");
    });
    indicator = screen.getByTestId("firo-save-status");
    expect(indicator.textContent).toContain("Error saving");
  });

  it("displays local storage states when collabStatus is 'offline'", () => {
    render(<SaveStatusIndicator collabStatus="offline" />);

    act(() => {
      mockSaveStatusListener?.("saving");
    });
    let indicator = screen.getByTestId("firo-save-status");
    expect(indicator.textContent).toContain("Saving locally...");

    act(() => {
      mockSaveStatusListener?.("saved");
    });
    indicator = screen.getByTestId("firo-save-status");
    expect(indicator.textContent).toContain("Saved locally");

    act(() => {
      mockSaveStatusListener?.("error");
    });
    indicator = screen.getByTestId("firo-save-status");
    expect(indicator.textContent).toContain("Error saving");
  });

  it("pill is interactive, supports clicking to open Version History", () => {
    const handleClick = vi.fn();
    render(
      <SaveStatusIndicator collabStatus="connected" onClick={handleClick} />,
    );

    act(() => {
      mockSaveStatusListener?.("saved");
    });
    const indicator = screen.getByTestId("firo-save-status");
    expect(indicator.getAttribute("title")).toBe(
      "Version history & storage status",
    );
    expect(indicator.style.cursor).toBe("pointer");

    fireEvent.click(indicator);
    expect(handleClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(indicator, { key: "Enter" });
    expect(handleClick).toHaveBeenCalledTimes(2);
  });
});

describe("VersionHistoryModal", () => {
  const sampleRevisions: storageModule.BoardRevision[] = [
    {
      id: "rev-1",
      timestamp: Date.now() - 120000, // 2 mins ago
      elementCount: 42,
      label: "Milestone A",
      payload: JSON.stringify({
        elementSchemaVersion: 1,
        recordSchemaVersion: 1,
        elements: [{ id: "el1", type: "rectangle" }],
        collections: [],
        records: [],
      }),
    },
    {
      id: "rev-2",
      timestamp: Date.now() - 3600000, // 1 hour ago
      elementCount: 15,
      payload: JSON.stringify({
        elementSchemaVersion: 1,
        recordSchemaVersion: 1,
        elements: [],
        collections: [],
        records: [],
      }),
    },
  ];

  beforeEach(() => {
    vi.spyOn(storageModule, "getBoardRevisions").mockResolvedValue(
      sampleRevisions,
    );
    vi.spyOn(storageModule, "isStoragePersisted").mockResolvedValue(true);
    vi.spyOn(storageModule, "getStorageEstimate").mockResolvedValue({
      usage: 4.2 * 1024 * 1024,
      quota: 50 * 1024 * 1024 * 1024,
      percent: 0.01,
    });
  });

  it("does not render when isOpen is false", () => {
    render(<VersionHistoryModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders header, storage health card, and revisions when isOpen is true", async () => {
    render(
      <VersionHistoryModal
        isOpen={true}
        onClose={vi.fn()}
        collabStatus="connected"
        boardId="test-board"
      />,
    );

    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getByText("Version History & Storage")).not.toBeNull();

    // Storage Health Card
    await waitFor(() => {
      const persistedPill = screen.getByTestId("storage-persisted-pill");
      expect(persistedPill.textContent).toContain("Persistent Storage: Active");
    });

    const usageText = screen.getByTestId("storage-usage-text");
    expect(usageText.textContent).toContain("Usage: 4.2 MB / Quota: 50 GB");

    const syncInfo = screen.getByTestId("sync-connection-info");
    expect(syncInfo.textContent).toContain(
      "Sync: Connected to Self-Hosted Server",
    );

    // Revisions List
    await waitFor(() => {
      expect(screen.getByTestId("revision-item-rev-1")).not.toBeNull();
      expect(screen.getByTestId("revision-item-rev-2")).not.toBeNull();
    });

    expect(screen.getByText("Milestone A")).not.toBeNull();
    expect(screen.getByText("42 elements")).not.toBeNull();
    expect(screen.getByText("15 elements")).not.toBeNull();
  });

  it("displays offline sync status when disconnected", async () => {
    render(
      <VersionHistoryModal
        isOpen={true}
        onClose={vi.fn()}
        collabStatus="offline"
      />,
    );

    await waitFor(() => {
      const syncInfo = screen.getByTestId("sync-connection-info");
      expect(syncInfo.textContent).toContain(
        "Sync: Local Browser Only (Offline)",
      );
    });
  });

  it("restores a revision when 'Restore this version' button is clicked", async () => {
    const restoreSpy = vi
      .spyOn(storageModule, "restoreBoardRevision")
      .mockResolvedValue({ status: "restored", elements: 42 });
    const onRestoreMock = vi.fn();
    const testDoc = createFiroDoc();

    render(
      <VersionHistoryModal
        isOpen={true}
        onClose={vi.fn()}
        doc={testDoc}
        boardId="test-board"
        onRestore={onRestoreMock}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("revision-item-rev-1")).not.toBeNull();
    });

    const restoreButtons = screen.getAllByText("Restore this version");
    fireEvent.click(restoreButtons[0]);

    await waitFor(() => {
      expect(restoreSpy).toHaveBeenCalledWith(testDoc, "rev-1", "test-board");
      expect(onRestoreMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText(/Successfully restored version/)).not.toBeNull();
  });

  it("handles downloading snapshot file", async () => {
    const createObjectURLMock = vi.fn().mockReturnValue("blob:fake-url");
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(
      <VersionHistoryModal
        isOpen={true}
        onClose={vi.fn()}
        boardId="test-board"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("revision-item-rev-1")).not.toBeNull();
    });

    const downloadButtons = screen.getAllByText("Download snapshot");
    fireEvent.click(downloadButtons[0]);

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("supports keyboard navigation: closes on Escape key", async () => {
    const onCloseMock = vi.fn();
    render(<VersionHistoryModal isOpen={true} onClose={onCloseMock} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it("closes when the close button is clicked", async () => {
    const onCloseMock = vi.fn();
    render(<VersionHistoryModal isOpen={true} onClose={onCloseMock} />);

    const closeBtn = screen.getByLabelText("Close dialog");
    fireEvent.click(closeBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});

describe("helpers", () => {
  it("formats bytes correctly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(4.2 * 1024 * 1024)).toBe("4.2 MB");
    expect(formatBytes(50 * 1024 * 1024 * 1024)).toBe("50 GB");
  });

  it("formats relative time correctly", () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 10000)).toBe("Just now");
    expect(formatRelativeTime(now - 45000)).toBe("45 seconds ago");
    expect(formatRelativeTime(now - 120000)).toBe("2 minutes ago");
    expect(formatRelativeTime(now - 7200000)).toBe("2 hours ago");
    expect(formatRelativeTime(now - 172800000)).toBe("2 days ago");
  });
});
