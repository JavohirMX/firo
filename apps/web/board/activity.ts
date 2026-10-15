/**
 * Local activity feed (Task 8.4).
 *
 * Records user actions (creations, edits, deletions, tags, comments) per board and
 * globally as a local history buffer stored in IndexedDB.
 */

import { get, set } from "idb-keyval";
import { randomId } from "@firo/common";

import type { ActivityActionKind, ActivityFeedItem } from "@firo/ui";

import { boardStore } from "./storage";

export type { ActivityActionKind, ActivityFeedItem };

const ACTIVITY_KEY = "board-activity";
const MAX_ACTIVITY_ENTRIES = 200;

export const recordActivity = async (
  entry: Omit<ActivityFeedItem, "id" | "timestamp"> & {
    id?: string;
    timestamp?: number;
  },
): Promise<ActivityFeedItem> => {
  const full: ActivityFeedItem = {
    id: entry.id ?? randomId(),
    boardId: entry.boardId,
    boardName: entry.boardName,
    timestamp: entry.timestamp ?? Date.now(),
    kind: entry.kind,
    summary: entry.summary,
    details: entry.details,
  };

  try {
    const existing =
      (await get<ActivityFeedItem[]>(ACTIVITY_KEY, boardStore)) ?? [];
    // Prepend new entry, limit to MAX_ACTIVITY_ENTRIES
    const updated = [full, ...existing.filter((e) => e.id !== full.id)].slice(
      0,
      MAX_ACTIVITY_ENTRIES,
    );
    await set(ACTIVITY_KEY, updated, boardStore);
  } catch (error) {
    // Non-fatal logging if storage fails
    console.warn("Failed to record activity:", error);
  }

  return full;
};

export const listActivity = async (options?: {
  boardId?: string;
  limit?: number;
}): Promise<ActivityFeedItem[]> => {
  try {
    const all = (await get<ActivityFeedItem[]>(ACTIVITY_KEY, boardStore)) ?? [];
    let filtered = options?.boardId
      ? all.filter((e) => e.boardId === options.boardId)
      : all;
    if (options?.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }
    return filtered;
  } catch {
    return [];
  }
};

export const clearActivity = async (boardId?: string): Promise<void> => {
  try {
    if (!boardId) {
      await set(ACTIVITY_KEY, [], boardStore);
      return;
    }
    const all = (await get<ActivityFeedItem[]>(ACTIVITY_KEY, boardStore)) ?? [];
    await set(
      ACTIVITY_KEY,
      all.filter((e) => e.boardId !== boardId),
      boardStore,
    );
  } catch (error) {
    console.warn("Failed to clear activity:", error);
  }
};
