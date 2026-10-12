import path from "path";

import { defineConfig, type Plugin } from "vitest/config";

/**
 * Refuse to load anything out of a workspace package's `dist/`.
 *
 * A relative import that lands on a package root — `"../.."` from a
 * nested directory — resolves through that package's `package.json`
 * `main`, which points at `dist/`. The test then binds to the built
 * bundle instead of the source: silently, only when a build happens
 * to exist, and against a second, independently instantiated copy of
 * the package (its own module singletons, its own context defaults).
 * That is the root cause of the ten sidebar-docking failures that
 * survived from before the fork; see docs/plans/phase-0-foundation.md,
 * "Two findings, both attributed". The `import/no-relative-packages`
 * lint rule does not catch it — a workspace package reached by a
 * relative path looks like an ordinary deep relative import to it.
 */
const noDistImports: Plugin = {
  name: "firo:no-dist-imports",
  load(id) {
    if (/(^|\/)(packages|apps)\/[^/]+\/dist\//.test(id)) {
      throw new Error(
        `${id} resolves into a workspace package's dist/ build output. ` +
          `A test bound to dist tests the build, not the source — and it ` +
          `passes or fails on whether yarn build:packages has been run. ` +
          `Import the source instead (for example "../../index" rather ` +
          `than "../..").`,
      );
    }
  },
};

export default defineConfig({
  plugins: [noDistImports],
  resolve: {
    alias: [
      {
        find: /^@firo\/common$/,
        replacement: path.resolve(__dirname, "./packages/common/src/index.ts"),
      },
      {
        find: /^@firo\/common\/(.*?)/,
        replacement: path.resolve(__dirname, "./packages/common/src/$1"),
      },
      {
        find: /^@firo\/element$/,
        replacement: path.resolve(__dirname, "./packages/element/src/index.ts"),
      },
      {
        find: /^@firo\/element\/(.*?)/,
        replacement: path.resolve(__dirname, "./packages/element/src/$1"),
      },
      {
        find: /^@firo\/editor$/,
        replacement: path.resolve(__dirname, "./packages/editor/index.tsx"),
      },
      {
        find: /^@firo\/editor\/(.*?)/,
        replacement: path.resolve(__dirname, "./packages/editor/$1"),
      },
      {
        find: /^@firo\/math$/,
        replacement: path.resolve(__dirname, "./packages/math/src/index.ts"),
      },
      {
        find: /^@firo\/math\/(.*?)/,
        replacement: path.resolve(__dirname, "./packages/math/src/$1"),
      },
      {
        find: /^@firo\/utils$/,
        replacement: path.resolve(__dirname, "./packages/utils/src/index.ts"),
      },
      {
        find: /^@firo\/utils\/(.*?)/,
        replacement: path.resolve(__dirname, "./packages/utils/src/$1"),
      },
      {
        find: /^@firo\/fractional-indexing$/,
        replacement: path.resolve(
          __dirname,
          "./packages/fractional-indexing/src/index.ts",
        ),
      },
      {
        find: /^@firo\/fractional-indexing\/(.*?)/,
        replacement: path.resolve(
          __dirname,
          "./packages/fractional-indexing/src/$1",
        ),
      },
      {
        find: /^@firo\/laser-pointer$/,
        replacement: path.resolve(
          __dirname,
          "./packages/laser-pointer/src/index.ts",
        ),
      },
      {
        find: /^@firo\/laser-pointer\/(.*?)/,
        replacement: path.resolve(__dirname, "./packages/laser-pointer/src/$1"),
      },
      {
        find: /^@firo\/records$/,
        replacement: path.resolve(__dirname, "./packages/records/src/index.ts"),
      },
      {
        find: /^@firo\/records\/(.*?)/,
        replacement: path.resolve(__dirname, "./packages/records/src/$1"),
      },
      {
        find: /^@firo\/schema$/,
        replacement: path.resolve(__dirname, "./packages/schema/src/index.ts"),
      },
      {
        find: /^@firo\/schema\/(.*?)/,
        replacement: path.resolve(__dirname, "./packages/schema/src/$1"),
      },
      {
        find: /^@firo\/board$/,
        replacement: path.resolve(__dirname, "./packages/board/src/index.ts"),
      },
      {
        find: /^@firo\/board\/(.*?)/,
        replacement: path.resolve(__dirname, "./packages/board/src/$1"),
      },
      {
        find: /^@firo\/doc$/,
        replacement: path.resolve(__dirname, "./packages/doc/src/index.ts"),
      },
      {
        find: /^@firo\/doc\/(.*?)/,
        replacement: path.resolve(__dirname, "./packages/doc/src/$1"),
      },
      {
        find: /^@firo\/facilitation$/,
        replacement: path.resolve(
          __dirname,
          "./packages/facilitation/src/index.ts",
        ),
      },
      {
        find: /^@firo\/facilitation\/(.*?)/,
        replacement: path.resolve(
          __dirname,
          "./packages/facilitation/src/$1",
        ),
      },
    ],
  },
  //@ts-ignore
  test: {
    // Since hooks are running in stack in v2, which means all hooks run serially whereas
    // we need to run them in parallel
    sequence: {
      hooks: "parallel",
    },
    setupFiles: ["./setupTests.ts"],
    globals: true,
    environment: "jsdom",
    // don't list skipped tests in the failure tree — keeps output readable
    hideSkippedTests: true,
    /**
     * Generous, and deliberately so.
     *
     * Vitest's defaults (5s test, 10s hook) were tuned for tests that do
     * arithmetic. Ours mount the entire editor — a 12,946-line `App` — inside
     * jsdom, and the run executes 175 files with eight or more of those
     * mounts competing for the same cores at once.
     *
     * The symptom was not a slow suite but an unreliable one: nine tests
     * across eight files failed with `Error: still loading` on one run and
     * all 175 files passed on the next, with no code change in between. Two
     * separate budgets were too tight — this one, and the `waitFor` inside
     * `renderApp` (see `APP_READY_TIMEOUT_MS`). Both were environment waits
     * being held to assertion-sized limits.
     *
     * `testTimeout` must stay >= `APP_READY_TIMEOUT_MS`, or a slow-but-healthy
     * mount would be killed by the test timeout before its own wait could
     * resolve, and the failure would move rather than disappear.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
    teardownTimeout: 30_000,
    coverage: {
      reporter: ["text", "json-summary", "json", "html", "lcovonly"],
      // Since v2, it ignores empty lines by default and we need to disable it as it affects the coverage
      // Additionally the thresholds also needs to be updated slightly as a result of this change
      ignoreEmptyLines: false,
      thresholds: {
        lines: 60,
        branches: 70,
        functions: 63,
        statements: 60,
      },
    },
  },
});
