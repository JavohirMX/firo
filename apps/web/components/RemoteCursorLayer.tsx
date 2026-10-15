import React, { useEffect, useMemo, useRef, useState } from "react";

import { AWARENESS_KEY } from "@firo/doc";

import type { EphemeralState, FiroDoc } from "@firo/doc";

import type { ExcalidrawImperativeAPI } from "@firo/editor/types";

import { boardDoc } from "../board/board";

import "./RemoteCursorLayer.scss";

/**
 * Standard palette of collaborator colors matching Miro's vibrant aesthetic.
 */
export const COLLABORATOR_COLORS = [
  "#E5484D", // Red
  "#E57B00", // Amber / Orange
  "#0090FF", // Blue
  "#30A46C", // Green
  "#8E4EC6", // Purple
  "#D6409F", // Pink
  "#00A2C7", // Cyan
  "#F5B938", // Yellow
] as const;

/**
 * Get a deterministic, accessible color for a collaborator by their client ID or string ID.
 */
export const getCollaboratorColor = (id: number | string): string => {
  let hash = 0;
  const str = String(id);
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length];
};

export interface RemoteCollaborator {
  clientId: number | string;
  name?: string;
  color?: string;
  cursor?: { x: number; y: number } | null;
  laser?: { x: number; y: number } | null;
  idleSince?: number | null;
  isIdle?: boolean;
}

export interface RemoteCursorLayerProps {
  excalidrawAPI?: ExcalidrawImperativeAPI | null;
  /** Explicit viewport override, convenient for tests or fixed containers */
  viewport?: { scrollX: number; scrollY: number; zoom: number };
  /** Explicit collaborator list override (e.g. for unit tests) */
  collaborators?: readonly RemoteCollaborator[];
  /** Optional custom doc/awareness source; defaults to boardDoc() */
  doc?: FiroDoc;
  awareness?: FiroDoc["awareness"];
}

interface LaserTrailPoint {
  x: number;
  y: number;
  time: number;
}

const LASER_TRAIL_LIFETIME_MS = 1200;

export const RemoteCursorLayer: React.FC<RemoteCursorLayerProps> = ({
  excalidrawAPI,
  viewport: explicitViewport,
  collaborators: explicitCollaborators,
  doc: propDoc,
  awareness: propAwareness,
}) => {
  const [viewportRevision, setViewportRevision] = useState(0);
  const [awarenessCollaborators, setAwarenessCollaborators] = useState<
    RemoteCollaborator[]
  >([]);

  // Listen to viewport pan/zoom changes from Excalidraw
  useEffect(() => {
    if (!excalidrawAPI) {
      return undefined;
    }
    const unsubscribe = excalidrawAPI.onScrollChange(() => {
      setViewportRevision((prev) => prev + 1);
    });
    return () => {
      unsubscribe();
    };
  }, [excalidrawAPI]);

  // Read awareness state if collaborators are not explicitly provided
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
      const list: RemoteCollaborator[] = [];

      states.forEach((state, clientId) => {
        if (clientId === localClientId) {
          return; // Skip local user's own cursor
        }

        const raw = state as Record<string, unknown>;
        const firoState = raw[AWARENESS_KEY] as EphemeralState | undefined;
        const user = raw.user as
          | { name?: string; color?: string; avatar?: string }
          | undefined;

        const cursor =
          firoState?.cursor ??
          (raw.cursor as { x: number; y: number } | null) ??
          null;
        const laser =
          firoState?.laser ??
          (raw.laser as { x: number; y: number } | null) ??
          null;
        const idleSince =
          firoState?.idleSince ?? (raw.idleSince as number | null) ?? null;
        const name =
          user?.name ??
          (firoState as unknown as { name?: string })?.name ??
          `User ${clientId}`;
        const color = user?.color ?? getCollaboratorColor(clientId);

        list.push({
          clientId,
          name,
          color,
          cursor,
          laser,
          idleSince,
          isIdle: idleSince !== null && Date.now() - idleSince > 5000,
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

  // Determine active collaborators list
  const collaborators = explicitCollaborators ?? awarenessCollaborators;

  // Laser history per collaborator: clientId -> LaserTrailPoint[]
  const trailsRef = useRef<Record<string, LaserTrailPoint[]>>({});
  const lastLaserPosRef = useRef<Record<string, { x: number; y: number }>>({});
  const [, setTrailRevision] = useState(0);

  // Track laser trail history
  useEffect(() => {
    const now = Date.now();
    let hasNewPoint = false;

    for (const collab of collaborators) {
      const id = String(collab.clientId);
      if (collab.laser) {
        const lastPos = lastLaserPosRef.current[id];
        if (
          !lastPos ||
          lastPos.x !== collab.laser.x ||
          lastPos.y !== collab.laser.y
        ) {
          lastLaserPosRef.current[id] = {
            x: collab.laser.x,
            y: collab.laser.y,
          };
          if (!trailsRef.current[id]) {
            trailsRef.current[id] = [];
          }
          trailsRef.current[id].push({
            x: collab.laser.x,
            y: collab.laser.y,
            time: now,
          });
          trailsRef.current[id] = trailsRef.current[id].filter(
            (p) => now - p.time <= LASER_TRAIL_LIFETIME_MS,
          );
          hasNewPoint = true;
        }
      }
    }

    if (hasNewPoint) {
      setTrailRevision((v) => v + 1);
    }
  }, [collaborators]);

  // Compute current viewport offset and zoom
  const viewport = useMemo(() => {
    void viewportRevision;
    if (explicitViewport) {
      return explicitViewport;
    }
    const appState = excalidrawAPI?.getAppState();
    return {
      scrollX: appState?.scrollX ?? 0,
      scrollY: appState?.scrollY ?? 0,
      zoom: appState?.zoom?.value ?? 1,
    };
  }, [explicitViewport, excalidrawAPI, viewportRevision]);

  // Convert board coordinate to viewport screen coordinate
  const toViewport = (boardX: number, boardY: number) => ({
    x: (boardX + viewport.scrollX) * viewport.zoom,
    y: (boardY + viewport.scrollY) * viewport.zoom,
  });

  return (
    <div
      className="firo-remote-cursor-layer"
      aria-hidden="true"
      data-testid="remote-cursor-layer"
    >
      {/* SVG overlay for laser pointer trails & heads */}
      <svg className="firo-remote-cursor-svg">
        {collaborators.map((collab) => {
          const id = String(collab.clientId);
          const color = collab.color ?? getCollaboratorColor(collab.clientId);
          const rawTrail = trailsRef.current[id] ?? [];
          const trailPoints =
            rawTrail.length > 0
              ? rawTrail
              : collab.laser
              ? [{ x: collab.laser.x, y: collab.laser.y, time: Date.now() }]
              : [];

          // Viewport-converted points for polyline
          const svgPoints = trailPoints
            .map((p) => {
              const vp = toViewport(p.x, p.y);
              return `${vp.x},${vp.y}`;
            })
            .join(" ");

          const activeLaserVp = collab.laser
            ? toViewport(collab.laser.x, collab.laser.y)
            : null;

          return (
            <g key={`laser-group-${id}`} data-testid={`laser-group-${id}`}>
              {svgPoints && (
                <polyline
                  points={svgPoints}
                  stroke={color}
                  strokeWidth={3 * viewport.zoom}
                  className="firo-laser-trail"
                  data-testid={`laser-trail-${id}`}
                />
              )}
              {activeLaserVp && (
                <g
                  className="firo-laser-head"
                  data-testid={`laser-pointer-${id}`}
                  style={{ color }}
                >
                  <circle
                    cx={activeLaserVp.x}
                    cy={activeLaserVp.y}
                    r={10 * viewport.zoom}
                    fill={color}
                    className="firo-laser-head__glow"
                  />
                  <circle
                    cx={activeLaserVp.x}
                    cy={activeLaserVp.y}
                    r={4 * viewport.zoom}
                    fill="#ffffff"
                    stroke={color}
                    strokeWidth={1.5}
                    className="firo-laser-head__core"
                  />
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Collaborator Cursors with Name Badges */}
      {collaborators.map((collab) => {
        if (!collab.cursor) {
          return null;
        }

        const id = String(collab.clientId);
        const color = collab.color ?? getCollaboratorColor(collab.clientId);
        const name = collab.name ?? `Collaborator ${id}`;
        const isIdle =
          collab.isIdle ??
          (collab.idleSince !== null &&
            collab.idleSince !== undefined &&
            Date.now() - collab.idleSince > 0);

        const { x: vx, y: vy } = toViewport(collab.cursor.x, collab.cursor.y);

        return (
          <div
            key={`cursor-${id}`}
            className={`firo-remote-cursor ${
              isIdle ? "is-inactive is-idle" : ""
            }`}
            style={{
              transform: `translate(${vx}px, ${vy}px)`,
            }}
            data-testid={`remote-cursor-${id}`}
          >
            {/* Sleek Miro-style cursor arrow */}
            <svg
              className="firo-remote-cursor__pointer"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 3L17 10L11 12L8 18L4 3Z"
                fill={color}
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>

            {/* Name badge */}
            <div
              className="firo-remote-cursor__badge"
              style={{ backgroundColor: color }}
              title={name}
            >
              {name}
            </div>
          </div>
        );
      })}
    </div>
  );
};
