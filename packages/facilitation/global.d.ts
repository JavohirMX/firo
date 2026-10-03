/**
 * Ambient declarations for this package's type build.
 *
 * ## Why this file exists, and why it is not boilerplate
 *
 * `tsconfig.json` sets `rootDir: "../"`, and tsc follows imports *out* of
 * `include`. So compiling `@firo/facilitation` reaches `@firo/doc`, then
 * `@firo/schema` and `@firo/element`, and through them `@firo/editor` -- whose
 * files use ambient declarations that live in `packages/editor/global.d.ts`:
 *
 * - `import.meta.env` (from `vite/client`)
 * - `window.FIRO_*` debug flags
 * - `*.woff2` module declarations
 * - `CanvasRenderingContext2D.roundRect`
 *
 * None of that is in scope unless this file pulls it in. Without it, `tsc`
 * reports errors in `../element` and `../editor` -- files this package has
 * nothing to do with, and which compile cleanly on their own. The first build
 * of this package failed on exactly that, with errors about `import.meta.env` and
 * `window.FIRO_THROTTLE_RENDER` in code it never touches.
 *
 * The reason it reaches editor code at all is `src/voting.ts`, which imports
 * `Collection`, `FieldValue` and `FiroRecord` from `@firo/schema` -- and schema's
 * element types are declared against `@firo/element/types`.
 *
 * A package that does *not* reach editor code has an *empty* `global.d.ts`
 * (`fractional-indexing`, `laser-pointer`), which is the same statement: this
 * file states what a package's compilation needs, and an empty one says "nothing
 * ambient". Deleting it would be silently wrong, not harmless.
 */
/// <reference types="vite/client" />
import "@firo/editor/global";
import "@firo/editor/css";
