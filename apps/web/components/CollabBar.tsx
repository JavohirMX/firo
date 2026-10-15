import React, { useEffect, useState } from "react";

import { CollabBar as ShellCollabBar, ShareIcon } from "@firo/ui";
import { AWARENESS_KEY } from "@firo/doc";

import type { EphemeralState, FiroDoc } from "@firo/doc";

import { boardDoc } from "../board/board";

import { getCollaboratorColor } from "./RemoteCursorLayer";

import "./CollabBar.scss";

export type ConnectionStatus = "connected" | "connecting" | "offline";

export interface CollabBarCollaborator {
  clientId: number | string;
  name?: string;
  color?: string;
  role?: string;
  avatar?: string;
}

export interface CollabBarProps {
  connectionStatus?: ConnectionStatus;
  collaborators?: readonly CollabBarCollaborator[];
  onOpenShare?: () => void;
  children?: React.ReactNode;
  doc?: FiroDoc;
  awareness?: FiroDoc["awareness"];
}

/**
 * Derives a short 1-2 character initials string for avatar display.
 */
export const getInitials = (name?: string): string => {
  if (!name) {
    return "?";
  }
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
};

export const CollabBar: React.FC<CollabBarProps> = ({
  connectionStatus = "connected",
  collaborators: explicitCollaborators,
  onOpenShare,
  children,
  doc: propDoc,
  awareness: propAwareness,
}) => {
  const [awarenessCollaborators, setAwarenessCollaborators] = useState<
    CollabBarCollaborator[]
  >([]);

  // Automatically read collaborators from awareness if not explicitly provided
  useEffect(() => {
    if (explicitCollaborators) {
      return undefined;
    }

    let awarenessInstance: FiroDoc["awareness"] | undefined = propAwareness;
    if (!awarenessInstance) {
      try {
        const activeDoc = propDoc ?? boardDoc();
        awarenessInstance = activeDoc.awareness;
      } catch {
        // Doc might not be initialized yet
      }
    }

    if (!awarenessInstance) {
      return undefined;
    }

    const updateFromAwareness = () => {
      if (!awarenessInstance) {
        return;
      }
      const states = awarenessInstance.getStates();
      const localClientId = awarenessInstance.clientID;
      const list: CollabBarCollaborator[] = [];

      states.forEach((state, clientId) => {
        if (clientId === localClientId) {
          return; // Skip local user in remote collaborator avatars list
        }

        const raw = state as Record<string, unknown>;
        const firoState = raw[AWARENESS_KEY] as EphemeralState | undefined;
        const user = raw.user as
          | { name?: string; color?: string; avatar?: string; role?: string }
          | undefined;

        const name =
          user?.name ??
          (firoState as unknown as { name?: string })?.name ??
          `User ${clientId}`;
        const color = user?.color ?? getCollaboratorColor(clientId);
        const role = user?.role;

        list.push({
          clientId,
          name,
          color,
          role,
          avatar: user?.avatar,
        });
      });

      setAwarenessCollaborators(list);
    };

    updateFromAwareness();
    awarenessInstance.on("change", updateFromAwareness);
    return () => {
      awarenessInstance?.off("change", updateFromAwareness);
    };
  }, [explicitCollaborators, propAwareness, propDoc]);

  const activeCollaborators = explicitCollaborators ?? awarenessCollaborators;

  // Maximum avatars to display before showing "+N" counter
  const MAX_AVATARS = 4;
  const visibleCollaborators = activeCollaborators.slice(0, MAX_AVATARS);
  const overflowCount = activeCollaborators.length - MAX_AVATARS;

  return (
    <ShellCollabBar>
      <div className="firo-collab-bar-wrapper">
        {/* Left children slots (Activity, SaveStatus, FacilitatorBar) */}
        {children}

        {/* Connection status pill */}
        <div
          className="firo-connection-pill"
          data-testid="connection-status-pill"
          title={`Status: ${connectionStatus}`}
        >
          <span
            className={`firo-connection-pill__dot firo-connection-pill__dot--${connectionStatus}`}
            data-testid={`connection-dot-${connectionStatus}`}
          />
          <span className="firo-connection-pill__label">
            {connectionStatus === "connected" && "Connected"}
            {connectionStatus === "connecting" && "Connecting..."}
            {connectionStatus === "offline" && "Offline"}
          </span>
        </div>

        {/* Active collaborator avatars */}
        {activeCollaborators.length > 0 && (
          <div
            className="firo-collab-avatars"
            data-testid="collaborator-avatars"
          >
            {visibleCollaborators.map((collab) => {
              const id = String(collab.clientId);
              const color =
                collab.color ?? getCollaboratorColor(collab.clientId);
              const initials = getInitials(collab.name);
              const tooltip = `${collab.name ?? `Collaborator ${id}`}${
                collab.role ? ` (${collab.role})` : ""
              }`;

              return (
                <div
                  key={`avatar-${id}`}
                  className="firo-collab-avatars__avatar"
                  style={{ backgroundColor: color }}
                  title={tooltip}
                  data-testid={`collab-avatar-${id}`}
                >
                  {initials}
                </div>
              );
            })}

            {overflowCount > 0 && (
              <div
                className="firo-collab-avatars__avatar firo-collab-avatars__avatar--more"
                title={`${overflowCount} more collaborator${
                  overflowCount > 1 ? "s" : ""
                }`}
                data-testid="collab-avatar-overflow"
              >
                +{overflowCount}
              </div>
            )}
          </div>
        )}

        {/* Share Button */}
        {onOpenShare && (
          <button
            type="button"
            className="firo-share-button"
            onClick={onOpenShare}
            data-testid="share-button"
            title="Share board"
          >
            <ShareIcon size={14} />
            <span>Share</span>
          </button>
        )}
      </div>
    </ShellCollabBar>
  );
};
