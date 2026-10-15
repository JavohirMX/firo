import React from "react";

import { BoardHomeScreen } from "./BoardHomeScreen";
import {
  getBoardMeta,
  openBoardById,
  putBoardMeta,
  resolveInitialBoard,
  setActiveBoard,
} from "./board/library";
import { resolveShareToken } from "./board/collabProvider";
import { boardUrl, readRoute } from "./board/routes";

/**
 * The app's composition root: the board home, or the editor.
 *
 * ## Why the editor is loaded lazily
 *
 * `./board/board.ts` builds its document and its autosave **at module scope**,
 * and registers a `pagehide` handler that flushes that document to storage. That
 * is correct for a tab that is showing a board — the document is the board. On
 * the home screen it is not: the document would be empty, and the flush would
 * write that empty document over a real board's bytes. So the home must not load
 * the editor module at all, and the import is deferred until a board is actually
 * being shown.
 *
 * The deferral has a second, smaller benefit: the home does not pay for the
 * canvas bundle to draw a list of names.
 *
 * ## Ordering
 *
 * The active board is set on the module (`setActiveBoard`) *before* the screen
 * switches, and the editor is imported after that. So by the time `restoreBoard`
 * runs — inside the editor's own module — it is restoring the board the URL
 * named, not the default.
 */

const LazyEditor = React.lazy(() => import("./App"));

type Screen = { kind: "home" } | { kind: "board" };

export const Root: React.FC = () => {
  const [screen, setScreen] = React.useState<Screen | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const decide = async () => {
      try {
        // Capability share link entry: /s/:token
        const shareMatch = window.location.pathname.match(/^\/s\/([^/]+)/);
        if (shareMatch) {
          const token = shareMatch[1];
          const resolved = await resolveShareToken(token);
          if (cancelled) {
            return;
          }
          if (resolved?.boardId) {
            let meta = await getBoardMeta(resolved.boardId);
            if (!meta) {
              meta = await putBoardMeta({
                id: resolved.boardId,
                name: "Shared Board",
              });
            }
            setActiveBoard(meta);
            setScreen({ kind: "board" });
            return;
          }
        }

        const route = readRoute(window.location.search);

        if (route?.kind === "home") {
          setScreen({ kind: "home" });
          return;
        }

        if (route?.kind === "board") {
          const meta = await openBoardById(route.id);
          if (cancelled) {
            return;
          }
          if (meta) {
            setActiveBoard(meta);
            setScreen({ kind: "board" });
          } else {
            // An id that names no live board — a deleted board, or a stale link.
            // The home is the honest answer; a blank editor pretending to be a
            // board is not.
            setScreen({ kind: "home" });
          }
          return;
        }

        // No route. Resume the last board, or land on the home when there is none.
        const meta = await resolveInitialBoard();
        if (cancelled) {
          return;
        }
        if (meta) {
          setActiveBoard(meta);
          window.history.replaceState(null, "", boardUrl(meta.id));
          setScreen({ kind: "board" });
        } else {
          setScreen({ kind: "home" });
        }
      } catch (error) {
        console.error("Failed to resolve route, falling back to home:", error);
        if (!cancelled) {
          setScreen({ kind: "home" });
        }
      }
    };

    void decide();

    return () => {
      cancelled = true;
    };
  }, []);

  // Resolving. Rendering an empty home here would flash "no boards" at someone
  // who has boards; rendering the editor would render the wrong board.
  if (screen === null) {
    return null;
  }

  if (screen.kind === "home") {
    return <BoardHomeScreen />;
  }

  return (
    <React.Suspense fallback={null}>
      <LazyEditor />
    </React.Suspense>
  );
};
