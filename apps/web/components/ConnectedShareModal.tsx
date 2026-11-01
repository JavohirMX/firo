import React, { useCallback, useEffect, useState } from "react";

import { syncApi, useSyncSession } from "../sync/session";

import { ShareModal } from "./ShareModal";

import type { SyncShare } from "../sync/api";
import type { ShareLink, ShareLinkOptions, ShareRole } from "./ShareModal";

export interface ConnectedShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  onSignIn: () => void;
}

const toLink = (share: SyncShare): ShareLink => ({
  id: share.id,
  token: share.token,
  role: share.role === "owner" ? "editor" : share.role,
  createdAt: share.createdAt,
  expiresAt: share.expiresAt,
  url: `${window.location.origin}/s/${share.token}`,
});

const isLive = (share: SyncShare): boolean =>
  !share.revoked && (!share.expiresAt || share.expiresAt > Date.now());

/**
 * The share dialog backed by the sync server. Links it shows are real: the
 * server knows them, enforces their role and expiry, and can revoke them.
 * Without a session or a server it says so instead of making up links.
 */
export const ConnectedShareModal: React.FC<ConnectedShareModalProps> = ({
  isOpen,
  onClose,
  boardId,
  onSignIn,
}) => {
  const session = useSyncSession();
  const signedIn = session.status === "signedIn";
  const [initialLinks, setInitialLinks] = useState<ShareLink[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped on every open so the dialog remounts with the fresh list.
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    if (!isOpen || !signedIn) {
      setInitialLinks(null);
      setLoadError(null);
      return undefined;
    }
    let cancelled = false;
    setInitialLinks(null);
    setLoadError(null);
    setOpenCount((n) => n + 1);
    (async () => {
      try {
        await syncApi.createBoard(boardId);
        const shares = await syncApi.listShares(boardId);
        if (!cancelled) {
          setInitialLinks(shares.filter(isLive).map(toLink));
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error && err.message
              ? err.message
              : "Could not load share links.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, signedIn, boardId]);

  const handleGenerate = useCallback(
    async (role: ShareRole, options: ShareLinkOptions) => {
      const share = await syncApi.createShare(boardId, {
        role,
        expiresAt: options.expiresAt,
        password: options.password ?? undefined,
      });
      return toLink(share);
    },
    [boardId],
  );

  // The modal revokes by token; the server revokes by id or token.
  const handleRevoke = useCallback(
    (token: string) => syncApi.revokeShare(boardId, token),
    [boardId],
  );

  if (!isOpen) {
    return null;
  }

  let unavailableMessage: string | undefined;
  let unavailableAction: { label: string; onSelect: () => void } | undefined;
  if (session.status === "unavailable") {
    unavailableMessage =
      "Sharing needs a Firo sync server. This copy of Firo is not connected to one, so your boards stay on this device.";
  } else if (session.status === "signedOut") {
    unavailableMessage =
      "Sign in to create share links that work for other people.";
    unavailableAction = { label: "Sign in", onSelect: onSignIn };
  } else if (session.status === "unknown") {
    unavailableMessage = "Checking the sync server…";
  } else if (loadError) {
    unavailableMessage = loadError;
  } else if (initialLinks === null) {
    unavailableMessage = "Loading share links…";
  }

  return (
    <ShareModal
      key={openCount}
      isOpen={isOpen}
      onClose={onClose}
      boardId={boardId}
      initialLinks={initialLinks ?? []}
      onGenerateLink={handleGenerate}
      onRevokeLink={handleRevoke}
      unavailableMessage={unavailableMessage}
      unavailableAction={unavailableAction}
    />
  );
};
