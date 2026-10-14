/**
 * Ambient declarations for this package's type build.
 *
 * `tsconfig.json` sets `rootDir: "../"`, so tsc follows imports *out* of
 * `include` and the moment a transitive import touches a file with ambient
 * declarations, the build fails without them. This package imports nothing from
 * `@firo/editor`, so the file is deliberately small — but it is not empty, and
 * deleting it would be silently wrong rather than harmless.
 *
 * `*.scss` is declared because the shell components style themselves with SCSS
 * co-located beside the component (`AGENTS.md`) and import it directly. The
 * declaration has to live here rather than being inherited from the editor's
 * `global.d.ts`, which this package deliberately does not reach into.
 *
 * There is no `/// <reference types="vite/client" />` here. Nothing in this
 * package reads `import.meta.env` yet; add it when something does, not before.
 */
declare module "*.scss";
