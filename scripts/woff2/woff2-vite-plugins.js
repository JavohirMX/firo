import fs from "node:fs";
import path from "node:path";

// Font asset base URL.
//
// Upstream hard-coded Excalidraw's own CDN
// (`https://excalidraw.nyc3.cdn.digitaloceanspaces.com/oss/`), which meant a
// self-hosted Excalidraw fetched every font from a third party's bucket. That
// is wrong for Firo on two counts:
//
//   1. NFR-3 requires zero network traffic in the single-player path. A phone
//      home to fetch a font is network traffic, and it leaks the fact that a
//      board is being opened.
//   2. An air-gapped or intranet install would render with no fonts at all.
//
// So the default is same-origin, and a self-hoster who *wants* a CDN can set
// FIRO_ASSET_CDN. Note this is the build-time variable read by Node; the
// runtime `window.FIRO_ASSET_PATH` is set from the same value below.
const ASSET_CDN = (process.env.FIRO_ASSET_CDN || "/").replace(/\/?$/, "/");

/**
 * Fonts preloaded before the editor initialises, to avoid a flash of fallback
 * text. Kept deliberately short: every preload is a blocking request on first
 * paint, so this lists only what is on screen at first render.
 *
 * Nunito is first because it is the default body face
 * (`DEFAULT_FONT_FAMILY`). Assistant is the UI face, needed by the shell
 * before the scene mounts. Excalifont used to be preloaded here; it was a
 * modified Virgil and was removed — see FONT-LICENSES.md.
 */
const PRELOAD_FONTS = [
  "fonts/Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTQ3j6zbXWjgeg.woff2",
  "fonts/Assistant/Assistant-SemiBold.woff2",
];

/**
 * Custom vite plugin that points `FIRO_ASSET_PATH` at the font CDN and inlines
 * the `@font-face` rules that must be prefixed with it.
 *
 * The `fonts.css` in the package cannot simply be prefixed, because the same
 * stylesheet is consumed by the library outside a browser server context.
 *
 * @returns {import("vite").PluginOption}
 */
export const woff2BrowserPlugin = () => {
  let isDev;

  return {
    name: "woff2BrowserPlugin",
    enforce: "pre",
    config(_, { command }) {
      isDev = command === "serve";
    },
    generateBundle() {
      // The transform below points the prod `fonts.css` (and the preloads) at
      // `fonts/Assistant/*.woff2`, but Assistant is registered only through
      // that stylesheet — it is never imported as a module, so rollup never
      // emits the binaries and every one of those URLs 404'd in production
      // builds. Emit them here, from the same directory the stylesheet lives
      // beside, so the referenced URLs exist by construction. OFL.txt ships
      // alongside the binaries, as its licence requires.
      if (isDev) {
        return;
      }
      const assistantDir = path.resolve(
        import.meta.dirname,
        "../../packages/editor/fonts/Assistant",
      );
      for (const file of fs.readdirSync(assistantDir)) {
        this.emitFile({
          type: "asset",
          fileName: `fonts/Assistant/${file}`,
          source: fs.readFileSync(path.join(assistantDir, file)),
        });
      }
    },
    transform(code, id) {
      // Copy/replace, rather than rely on vite/rollup: fonts declared in the
      // `.css` cannot be automatically prefixed with `FIRO_ASSET_PATH`, which
      // only applies to `apps/web`.
      if (!isDev && id.endsWith("/editor/fonts/fonts.css")) {
        return `/* WARN: The following content is generated during apps/web build */

      ${[400, 500, 600, 700]
        .map(
          (weight, i) => `@font-face {
        font-family: "Assistant";
        src: url(${ASSET_CDN}fonts/Assistant/Assistant-${
            ["Regular", "Medium", "SemiBold", "Bold"][i]
          }.woff2)
            format("woff2"),
          url(./Assistant-${
            ["Regular", "Medium", "SemiBold", "Bold"][i]
          }.woff2) format("woff2");
        font-weight: ${weight};
        style: normal;
        display: swap;
      }`,
        )
        .join("\n\n")}`;
      }

      if (!isDev && id.endsWith("apps/web/index.html")) {
        return code.replace(
          "<!-- PLACEHOLDER:FIRO_APP_FONTS -->",
          `<script>
        // Same-origin by default. Set FIRO_ASSET_CDN at build time to serve
        // fonts from a CDN you control.
        window.FIRO_ASSET_PATH = "${ASSET_CDN}";
      </script>

      ${PRELOAD_FONTS.map(
        (
          font,
        ) => `<!-- Preloaded to avoid a flash of fallback text on first paint -->
      <link
        rel="preload"
        href="${ASSET_CDN}${font}"
        as="font"
        type="font/woff2"
        crossorigin="anonymous"
      />`,
      ).join("\n      ")}
    `,
        );
      }
    },
  };
};
