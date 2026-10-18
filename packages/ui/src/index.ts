/**
 * `@firo/ui` — the Firo chrome.
 *
 * Phase 7.5 builds the Miro-style shell here
 * ([`docs/adr/0022`](../../../docs/adr/0022-ui-package-owns-the-chrome.md)).
 * This first slice is the foundation the shell is drawn from: the design tokens
 * in `./tokens` and the chrome typeface in `./fonts`. The shell components
 * (`CreationRail`, `BoardMenu`, `CollabBar`, `NavToolbar`, `Inspector`,
 * `SelectionToolbar`) land on top of it in tasks 7.5.3 and 7.5.4, and the board
 * home (`BoardHome`) in 7.5.5.
 *
 * `src/theme.scss` is not imported here on purpose. The chrome's styles are
 * loaded by the host app, which owns the document, rather than as a side effect
 * of importing a token module — a package that writes CSS into `:root` merely
 * because something imported a constant is a package that is hard to embed. The
 * same reasoning applies to the font: `loadChromeFonts` is called by the host
 * rather than run on import.
 */
export * from "./fonts";
export * from "./tokens";
export * from "./icons";
export * from "./accessibility";
export * from "./components/CreationRail";
export * from "./components/NavToolbar";
export * from "./components/BoardMenu";
export * from "./components/CollabBar";
export * from "./components/Inspector";
export * from "./components/SelectionToolbar";
export * from "./components/BoardHome";
export * from "./components/ActivityFeed";
export * from "./components/AccessibilityTree";
export * from "./components/ExportModal";
export * from "./components/ImportModal";
