import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import ExcalidrawApp from "./App";

window.__FIRO_SHA__ = import.meta.env.VITE_APP_GIT_SHA;
const rootElement = document.getElementById("root")!;

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
      <ExcalidrawApp />
    </StrictMode>,
  );
}
