/**
 * Reports whether the browser believes it is offline.
 *
 * Firo v1 is local-first with no server, so this is the browser's own
 * `navigator.onLine` signal rather than a socket state. The distinction matters
 * for honesty rather than behaviour: local-first means the board is fully
 * functional either way, and the flag only drives a UI hint.
 *
 * Upstream derived this from its collaboration WebSocket. With no socket there
 * is nothing to disconnect, so this is the honest equivalent.
 *
 * `navigator.onLine` is famously only "the browser thinks there is a network
 * interface", so this is a hint, not a reachability test. That is why it is
 * named `useIsOfflineHint` at the call sites in spirit — do not use it to decide
 * whether a network request will succeed.
 */
import { useEffect, useState } from "react";

export const useIsOffline = (): boolean => {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" && navigator.onLine === false,
  );

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // re-sync in case connectivity changed between render and effect
    setIsOffline(navigator.onLine === false);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOffline;
};
