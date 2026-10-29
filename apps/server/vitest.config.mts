import { defineConfig } from "vitest/config";

/*
 * Lets `yarn --cwd apps/server test` work. The repo-root config references
 * ./setupTests.ts relative to the config file, so running vitest from inside
 * this package used to resolve a nonexistent apps/server/setupTests.ts and
 * fail every suite before a single test ran. The server suite needs none of
 * the root editor mocks: it runs on node builtins, better-sqlite3 and ws.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
