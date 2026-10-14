import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { loadChromeFonts } from "@firo/ui";

import { Root } from "./Root";

window.__FIRO_SHA__ = import.meta.env.VITE_APP_GIT_SHA;
const rootElement = document.getElementById("root")!;

/*
 * Register the chrome typeface before the first paint.
 *
 * The faces are the chrome's, so they are declared and bundled by `@firo/ui`
 * (ADR-0022, ADR-0024); the app is what owns a document and therefore what
 * registers them. Not awaited: `display: "swap"` means the board renders
 * immediately in the fallback face and swaps when the subsets arrive, which is
 * better than holding the first paint on a font download. A failure is logged
 * rather than thrown for the same reason — no chrome text is worth a blank
 * board.
 */
void loadChromeFonts(document).catch((error) => {
  console.warn("Failed to load the chrome typeface", error);
});

/*
 * The renderer benchmark, behind `?bench=1`.
 *
 * Not a separate HTML file: vite's dev server rewrites any HTML-accepting
 * request it does not recognise through its SPA fallback, so `/bench.html`
 * resolved to `/index.html` and the benchmark quietly measured the app
 * instead. `curl` asked for any content type rather than HTML, so it got the
 * real file and the bug survived being checked from a terminal.
 * being checked from a terminal.
 *
 * `import.meta.env.DEV` is replaced at build time, so this whole branch -- and
 * the dynamic import with it -- is dead in a production build. Nothing of the
 * benchmark reaches the bundle.
 */
if (
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("bench") === "1"
) {
  void import("./bench").then(({ mountBench }) => mountBench(rootElement));
} else {
  registerSW();
  createRoot(rootElement).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
