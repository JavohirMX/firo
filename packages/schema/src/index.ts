/**
 * `@firo/schema` — the board's types, validation and migrations.
 *
 * This package has no UI, no canvas, and no knowledge of Yjs. It is pure data:
 * a set of types, a registry, a migration chain, and a fixture harness. That
 * separation is what makes the data model testable exhaustively without a
 * browser, and it is why the plan builds it before the renderer.
 *
 * Import order matters for one thing only: the element type modules must be
 * imported for their registration side effect before anything reads the
 * registry. `./types/index.js` does that, and it is re-exported here so a
 * consumer cannot accidentally get an empty registry.
 */
import "./types/index.js";

export * from "./version.js";
export * from "./types.js";
export * from "./validate.js";
export * from "./prosemirror.js";
export * from "./facilitation.js";
export * from "./tags.js";
export * from "./registry.js";
export * from "./migrate.js";
export * from "./fixtures.js";
export * from "./records.js";
export * from "./migrations.js";
