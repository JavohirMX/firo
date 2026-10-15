const path = require("path");

const { build } = require("esbuild");

const { sassPlugin } = require("esbuild-sass-plugin");

// contains all dependencies bundled inside
const getConfig = (outdir) => ({
  outdir,
  bundle: true,
  format: "esm",
  entryPoints: ["src/index.ts"],
  entryNames: "[name]",
  assetNames: "[dir]/[name]",
  plugins: [sassPlugin()],
  /*
   * `@firo/ui` imports the chrome typeface's woff2 subsets so that a bundler
   * emits them at all — a font referenced by `url()` in a stylesheet is not
   * copied, and the CSS then points at nothing (ADR-0024). `file` emits the
   * binary beside the bundle and rewrites the import to that path.
   *
   * `scripts/buildPackage.js` — `@firo/editor`'s build, which imports the canvas
   * faces the same way — already had this line. Every other package that uses
   * this config imports no fonts, so the rule is inert for them.
   */
  loader: {
    ".woff2": "file",
  },
  alias: {
    "@firo/utils": path.resolve(__dirname, "../packages/utils/src"),
  },
  external: [
    "@firo/common",
    "@firo/element",
    "@firo/math",
    "@firo/schema",
    "@firo/doc",
    "@firo/records",
    "@firo/mcp",
    "@firo/ai",
    "@firo/facilitation",
    "@firo/fractional-indexing",
    "@firo/editor",
    "react",
    "react-dom",
  ],
});

function buildDev(config) {
  return build({
    ...config,
    sourcemap: true,
    define: {
      "import.meta.env": JSON.stringify({ DEV: true }),
    },
  });
}

function buildProd(config) {
  return build({
    ...config,
    minify: true,
    define: {
      "import.meta.env": JSON.stringify({ PROD: true }),
    },
  });
}

const createESMRawBuild = async () => {
  // development unminified build with source maps
  await buildDev(getConfig("dist/dev"));

  // production minified build without sourcemaps
  await buildProd(getConfig("dist/prod"));
};

(async () => {
  await createESMRawBuild();
})();
