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
 * `vite/client` is referenced for `*.woff2`: `src/fonts.ts` imports the chrome's
 * four subsets so the bundler emits them (a `url()` in a stylesheet is not
 * emitted at all — see that file). It also brings `import.meta.env`, which
 * nothing here reads yet.
 */

/// <reference types="vite/client" />

declare module "*.scss";
