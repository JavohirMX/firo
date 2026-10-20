import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgrPlugin from "vite-plugin-svgr";
import { ViteEjsPlugin } from "vite-plugin-ejs";
import { VitePWA } from "vite-plugin-pwa";
import checker from "vite-plugin-checker";
import { createHtmlPlugin } from "vite-plugin-html";
import { woff2BrowserPlugin } from "../../scripts/woff2/woff2-vite-plugins";
export default defineConfig(({ mode }) => {
  // To load .env variables
  const envVars = loadEnv(mode, `../`);
  // https://vitejs.dev/config/
  return {
    server: {
      port: Number(envVars.VITE_APP_PORT || 3000),
      // open the browser
      open: true,
    },
    // We need to specify the envDir since now there are no
    //more located in parallel with the vite.config.ts file but in parent dir
    envDir: "../../",
    resolve: {
      alias: [
        {
          find: /^@firo\/common$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/common/src/index.ts",
          ),
        },
        {
          find: /^@firo\/common\/(.*?)/,
          replacement: path.resolve(__dirname, "../../packages/common/src/$1"),
        },
        {
          find: /^@firo\/element$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/element/src/index.ts",
          ),
        },
        {
          find: /^@firo\/element\/(.*?)/,
          replacement: path.resolve(__dirname, "../../packages/element/src/$1"),
        },
        {
          find: /^@firo\/editor$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/editor/index.tsx",
          ),
        },
        {
          find: /^@firo\/editor\/(.*?)/,
          replacement: path.resolve(__dirname, "../../packages/editor/$1"),
        },
        {
          find: /^@firo\/math$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/math/src/index.ts",
          ),
        },
        {
          find: /^@firo\/math\/(.*?)/,
          replacement: path.resolve(__dirname, "../../packages/math/src/$1"),
        },
        {
          find: /^@firo\/utils$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/utils/src/index.ts",
          ),
        },
        {
          find: /^@firo\/utils\/(.*?)/,
          replacement: path.resolve(__dirname, "../../packages/utils/src/$1"),
        },
        {
          find: /^@firo\/fractional-indexing$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/fractional-indexing/src/index.ts",
          ),
        },
        {
          find: /^@firo\/laser-pointer$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/laser-pointer/src/index.ts",
          ),
        },
        {
          find: /^@firo\/records$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/records/src/index.ts",
          ),
        },
        {
          find: /^@firo\/records\/(.*?)/,
          replacement: path.resolve(__dirname, "../../packages/records/src/$1"),
        },
        {
          find: /^@firo\/schema$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/schema/src/index.ts",
          ),
        },
        {
          find: /^@firo\/schema\/(.*?)/,
          replacement: path.resolve(__dirname, "../../packages/schema/src/$1"),
        },
        {
          find: /^@firo\/board$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/board/src/index.ts",
          ),
        },
        {
          find: /^@firo\/board\/(.*?)/,
          replacement: path.resolve(__dirname, "../../packages/board/src/$1"),
        },
        {
          find: /^@firo\/doc$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/doc/src/index.ts",
          ),
        },
        {
          find: /^@firo\/doc\/(.*?)/,
          replacement: path.resolve(__dirname, "../../packages/doc/src/$1"),
        },
        {
          find: /^@firo\/facilitation$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/facilitation/src/index.ts",
          ),
        },
        {
          find: /^@firo\/facilitation\/(.*?)/,
          replacement: path.resolve(
            __dirname,
            "../../packages/facilitation/src/$1",
          ),
        },
        {
          find: /^@firo\/ai$/,
          replacement: path.resolve(__dirname, "../../packages/ai/src/index.ts"),
        },
        {
          find: /^@firo\/ai\/(.*?)/,
          replacement: path.resolve(__dirname, "../../packages/ai/src/$1"),
        },
        {
          find: /^@firo\/ui$/,
          replacement: path.resolve(
            __dirname,
            "../../packages/ui/src/index.ts",
          ),
        },
        {
          find: /^@firo\/ui\/(.*?)/,
          replacement: path.resolve(__dirname, "../../packages/ui/src/$1"),
        },
      ],
    },
    build: {
      outDir: "build",
      rollupOptions: {
        output: {
          assetFileNames(chunkInfo) {
            if (chunkInfo?.name?.endsWith(".woff2")) {
              const family = chunkInfo.name.split("-")[0];
              return `fonts/${family}/[name][extname]`;
            }

            return "assets/[name]-[hash][extname]";
          },
          // Creating separate chunk for locales except for en and percentages.json so they
          // can be cached at runtime and not merged with
          // app precache. en.json and percentages.json are needed for first load
          // or fallback hence not clubbing with locales so first load followed by offline mode works fine. This is how CRA used to work too.
          manualChunks(id) {
            if (
              id.includes("packages/editor/locales") &&
              id.match(/en.json|percentages.json/) === null
            ) {
              const index = id.indexOf("locales/");
              // Taking the substring after "locales/"
              return `locales/${id.substring(index + 8)}`;
            }

            if (id.includes("@excalidraw/mermaid-to-excalidraw")) {
              return "mermaid-to-excalidraw";
            }

            if (id.includes("@codemirror/") || id.includes("@lezer/")) {
              return "codemirror.chunk";
            }
          },
        },
      },
      sourcemap: true,
      // don't auto-inline small assets (i.e. fonts hosted on CDN)
      assetsInlineLimit: 0,
    },
    plugins: [
      // The upstream Sitemap plugin generated excalidraw.com's public SEO
      // surface. Firo is self-hosted and has no public site, so there is
      // nothing to index. Reintroduce a sitemap only once a domain exists.
      woff2BrowserPlugin(),
      react(),
      checker({
        typescript: true,
        eslint:
          envVars.VITE_APP_ENABLE_ESLINT === "false"
            ? undefined
            : {
                // `--ignore-path` is required, not optional. ESLint 7 looks for
                // `.eslintignore` in the *current working directory*, and this
                // command runs from `apps/web/`, where there is none. Without
                // the explicit path it lints `apps/web/build/` — the output
                // the build just wrote — and fails with ENOENT when the asset
                // hashes change between glob and read. That made
                // `yarn build:app` fail intermittently, for a reason that had
                // nothing to do with the source.
                lintCommand:
                  'eslint --ignore-path ../../.eslintignore "./**/*.{js,ts,tsx}"',
              },
        overlay: {
          initialIsOpen: envVars.VITE_APP_COLLAPSE_OVERLAY === "false",
          badgeStyle: "margin-bottom: 4rem; margin-left: 1rem",
        },
      }),
      svgrPlugin(),
      ViteEjsPlugin(),
      VitePWA({
        registerType: "autoUpdate",
        devOptions: {
          /* set this flag to true to enable in Development mode */
          enabled: envVars.VITE_APP_ENABLE_PWA === "true",
        },

        workbox: {
          // don't precache fonts, locales and separate chunks
          globIgnores: [
            "fonts.css",
            "**/locales/**",
            "service-worker.js",
            "**/*.chunk-*.js",
            // CodeMirrorEditor can't be assigned a `.chunk` name via
            // manualChunks because Rollup would hoist shared deps (React)
            // via a static import from the main bundle, defeating lazy
            // loading. So we exclude it by name instead.
            "**/CodeMirrorEditor-*.js",
          ],
          runtimeCaching: [
            {
              urlPattern: new RegExp(".+.woff2"),
              handler: "CacheFirst",
              options: {
                cacheName: "fonts",
                expiration: {
                  maxEntries: 1000,
                  maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
                },
                cacheableResponse: {
                  // 0 to cache "opaque" responses from cross-origin requests (i.e. CDN)
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: new RegExp("fonts.css"),
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "fonts",
                expiration: {
                  maxEntries: 50,
                },
              },
            },
            {
              urlPattern: new RegExp("locales/[^/]+.js"),
              handler: "CacheFirst",
              options: {
                cacheName: "locales",
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // <== 30 days
                },
              },
            },
            {
              urlPattern: new RegExp("(.chunk-.+|CodeMirrorEditor-.+)\\.js"),
              handler: "CacheFirst",
              options: {
                cacheName: "chunk",
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 90, // <== 90 days
                },
              },
            },
          ],
          maximumFileSizeToCacheInBytes: 2.3 * 1024 ** 2, // 2.3MB
        },
        manifest: {
          short_name: "Excalidraw",
          name: "Excalidraw",
          description:
            "Excalidraw is a whiteboard tool that lets you easily sketch diagrams that have a hand-drawn feel to them.",
          icons: [
            {
              src: "android-chrome-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "apple-touch-icon.png",
              type: "image/png",
              sizes: "180x180",
            },
            {
              src: "favicon-32x32.png",
              sizes: "32x32",
              type: "image/png",
            },
            {
              src: "favicon-16x16.png",
              sizes: "16x16",
              type: "image/png",
            },
          ],
          start_url: "/",
          id: "excalidraw",
          display: "standalone",
          theme_color: "#121212",
          background_color: "#ffffff",
          file_handlers: [
            {
              action: "/",
              accept: {
                "application/vnd.excalidraw+json": [".excalidraw"],
              },
            },
          ],
          share_target: {
            action: "/web-share-target",
            method: "POST",
            enctype: "multipart/form-data",
            params: {
              files: [
                {
                  name: "file",
                  accept: [
                    "application/vnd.excalidraw+json",
                    "application/json",
                    ".excalidraw",
                  ],
                },
              ],
            },
          },
          screenshots: [
            {
              src: "/screenshots/virtual-whiteboard.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/wireframe.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/illustration.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/shapes.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/collaboration.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/export.png",
              type: "image/png",
              sizes: "462x945",
            },
          ],
        },
      }),
      createHtmlPlugin({
        minify: true,
      }),
    ],
    publicDir: "../../public",
  };
});
