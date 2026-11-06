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

import { setSessionShareRole } from "../board/facilitator";

import { SaveStatusIndicator } from "../components/SaveStatusIndicator";
import {
  VersionsPanel,
  formatBytes,
  formatRelativeTime,
} from "../components/VersionsPanel";
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
    expect(indicator.textContent).toContain("Saving...");

    act(() => {
      mockSaveStatusListener?.("saved");
    });
    indicator = screen.getByTestId("firo-save-status");
    expect(indicator.textContent).toContain("Saved on this device");

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
    expect(indicator.textContent).toContain("Saving...");

    act(() => {
      mockSaveStatusListener?.("saved");
    });
    indicator = screen.getByTestId("firo-save-status");
    expect(indicator.textContent).toContain("Saved on this device");

    act(() => {
      mockSaveStatusListener?.("error");
    });
    indicator = screen.getByTestId("firo-save-status");
    expect(indicator.textContent).toContain("Error saving");
  });

  it("shows compact truthful details and history access", () => {
    const history = vi.fn();
    render(
      <SaveStatusIndicator
        compact
        collabStatus="connected"
        onClick={history}
      />,
    );
    act(() => mockSaveStatusListener?.("saved"));
    fireEvent.click(
      screen.getByRole("button", {
        name: /Board status: Saved on this device/,
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Board status details" }),
    ).not.toBeNull();
    expect(screen.getByText("Saved on this device")).not.toBeNull();
    expect(screen.getByText("Connected to server")).not.toBeNull();
    expect(screen.getByText(/does not confirm the latest edit/)).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Board status details" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Board status: Saved on this device/,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Version history and storage" }),
    );
    expect(history).toHaveBeenCalledOnce();
  });

  it("never hides a save failure in compact mode", () => {
    render(<SaveStatusIndicator compact collabStatus="offline" />);
    act(() => mockSaveStatusListener?.("error"));
    expect(screen.getByText("Save failed")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Error saving/ }));
    expect(screen.getByText("Error saving")).not.toBeNull();
    expect(screen.getByText("Offline or local-only")).not.toBeNull();
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

describe("VersionsPanel (ADR-0035 section 3)", () => {
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
    vi.restoreAllMocks();
    setSessionShareRole(null);
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

  it("renders the storage health card and revisions", async () => {
    render(<VersionsPanel collabStatus="connected" boardId="test-board" />);

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
    render(<VersionsPanel collabStatus="offline" />);

    await waitFor(() => {
      const syncInfo = screen.getByTestId("sync-connection-info");
      expect(syncInfo.textContent).toContain(
        "Sync: Local Browser Only (Offline)",
      );
    });
  });

  it("saves a 'Before restore' safety revision before restoring (reversible restore)", async () => {
    const callOrder: string[] = [];
    const saveSpy = vi
      .spyOn(storageModule, "saveBoardRevision")
      .mockImplementation(async (_doc, _boardId, label) => {
        callOrder.push(`save:${label}`);
        return null;
      });
    const restoreSpy = vi
      .spyOn(storageModule, "restoreBoardRevision")
      .mockImplementation(async () => {
        callOrder.push("restore");
        return { status: "restored", elements: 42 };
      });
    const onRestoreMock = vi.fn();
    const testDoc = createFiroDoc();

    render(
      <VersionsPanel
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

    // The safety snapshot parks the current state BEFORE the restore runs,
    // so the action is undoable through the same list.
    expect(saveSpy).toHaveBeenCalledWith(
      testDoc,
      "test-board",
      "Before restore",
    );
    expect(callOrder).toEqual(["save:Before restore", "restore"]);

    expect(screen.getByText(/Successfully restored version/)).not.toBeNull();
  });

  it.each(["viewer", "commenter"])(
    "keeps history, local snapshots and download but not restore for %s",
    async (role) => {
      render(<VersionsPanel boardId="test-board" readOnlyRole={role} />);
      await screen.findByTestId("revision-item-rev-1");
      expect(screen.queryByText("Restore this version")).toBeNull();
      expect(screen.getAllByText("Download snapshot")).toHaveLength(2);
      expect(screen.getByText("Create snapshot")).not.toBeNull();
    },
  );

  it("refuses a retained restore control after a live role downgrade", async () => {
    const save = vi.spyOn(storageModule, "saveBoardRevision");
    const restore = vi.spyOn(storageModule, "restoreBoardRevision");
    render(<VersionsPanel boardId="test-board" />);
    await screen.findByTestId("revision-item-rev-1");
    setSessionShareRole("viewer");
    fireEvent.click(screen.getAllByText("Restore this version")[0]);
    expect(save).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    setSessionShareRole(null);
  });

  it.each(["live role", "role prop"])(
    "refuses restore when %s changes during the safety snapshot",
    async (change) => {
      let finish!: (value: null) => void;
      vi.spyOn(storageModule, "saveBoardRevision").mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const restore = vi.spyOn(storageModule, "restoreBoardRevision");
      const view = render(<VersionsPanel boardId="test-board" />);
      await screen.findByTestId("revision-item-rev-1");
      fireEvent.click(screen.getAllByText("Restore this version")[0]);
      if (change === "live role") {
        setSessionShareRole("commenter");
      } else {
        view.rerender(
          <VersionsPanel boardId="test-board" readOnlyRole="viewer" />,
        );
      }
      await act(async () => {
        finish(null);
      });
      expect(restore).not.toHaveBeenCalled();
      setSessionShareRole(null);
    },
  );

  it("handles downloading snapshot file", async () => {
    const createObjectURLMock = vi.fn().mockReturnValue("blob:fake-url");
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<VersionsPanel boardId="test-board" />);

    await waitFor(() => {
      expect(screen.getByTestId("revision-item-rev-1")).not.toBeNull();
    });

    const downloadButtons = screen.getAllByText("Download snapshot");
    fireEvent.click(downloadButtons[0]);

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
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
