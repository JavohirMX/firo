import React from "react";

import {
  ActivityIcon,
  CloseIcon,
  CommentIcon,
  PencilIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
} from "../icons";

import "./ActivityFeed.scss";

export type ActivityActionKind =
  | "create"
  | "update"
  | "delete"
  | "comment"
  | "tag"
  | "board";

export interface ActivityFeedItem {
  id: string;
  boardId: string;
  boardName?: string;
  timestamp: number;
  kind: ActivityActionKind;
  summary: string;
  details?: string;
}

export interface ActivityFeedProps {
  entries: readonly ActivityFeedItem[];
  isOpen: boolean;
  onClose: () => void;
  onSelectBoard?: (boardId: string) => void;
  onClear?: () => void;
  title?: string;
  dialogRef?: React.Ref<HTMLDivElement>;
}

const formatRelativeTime = (timestamp: number): string => {
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const renderIcon = (kind: ActivityActionKind) => {
  switch (kind) {
    case "comment":
      return <CommentIcon size={14} />;
    case "tag":
      return <TagIcon size={14} />;
    case "create":
      return <PlusIcon size={14} />;
    case "delete":
      return <TrashIcon size={14} />;
    case "board":
      return <ActivityIcon size={14} />;
    case "update":
    default:
      return <PencilIcon size={14} />;
  }
};

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  entries,
  isOpen,
  onClose,
  onSelectBoard,
  onClear,
  title = "Activity History",
  dialogRef,
}) => {
  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 86400000;

  const todayEntries = entries.filter((e) => e.timestamp >= startOfToday);
  const yesterdayEntries = entries.filter(
    (e) => e.timestamp >= startOfYesterday && e.timestamp < startOfToday,
  );
  const earlierEntries = entries.filter((e) => e.timestamp < startOfYesterday);

  const groups = [
    { title: "Today", items: todayEntries },
    { title: "Yesterday", items: yesterdayEntries },
    { title: "Earlier", items: earlierEntries },
  ].filter((g) => g.items.length > 0);

  return (
    <div
      ref={dialogRef}
      className="firo-activity-feed"
      role="dialog"
      aria-modal="true"
      aria-label="Activity Feed"
      data-testid="firo-activity-feed"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="firo-activity-feed__header">
        <h3>
          <ActivityIcon size={18} />
          {title}
        </h3>
        <div className="firo-activity-feed__actions">
          {entries.length > 0 && onClear && (
            <button
              type="button"
              className="firo-activity-feed__clear"
              onClick={onClear}
              data-testid="activity-clear-btn"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="firo-activity-feed__close"
            onClick={onClose}
            aria-label="Close activity feed"
            data-testid="activity-close-btn"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>

      <div className="firo-activity-feed__content">
        {groups.length === 0 ? (
          <div className="firo-activity-feed__empty">
            <ActivityIcon size={32} />
            <p>No activity recorded yet.</p>
            <p>Changes, comments, and board actions will appear here.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.title} className="firo-activity-feed__group">
              <span className="firo-activity-feed__group-title">
                {group.title}
              </span>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className="firo-activity-feed__item"
                  data-testid={`activity-item-${item.id}`}
                >
                  <div className="firo-activity-feed__icon">
                    {renderIcon(item.kind)}
                  </div>
                  <div className="firo-activity-feed__item-body">
                    <span className="firo-activity-feed__summary">
                      {item.summary}
                    </span>
                    <div className="firo-activity-feed__meta">
                      <span>{formatRelativeTime(item.timestamp)}</span>
                      {item.boardName && (
                        <button
                          type="button"
                          className="firo-activity-feed__board-badge"
                          onClick={() => onSelectBoard?.(item.boardId)}
                        >
                          {item.boardName}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
