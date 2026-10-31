// Regression coverage for the Docker build context.
//
// The web Docker build runs vite-plugin-checker, whose eslint child is
// invoked with `--ignore-path ../../.eslintignore` (see
// apps/web/vite.config.mts). .dockerignore uses whitelist style (`*`
// followed by `!` re-includes); when `.eslintignore` was missing from the
// include list, the file never reached the build context, eslint exited 2
// on ENOENT, and checker propagated that exit code onto the vite process
// after an otherwise clean build. This script fails if a file the Docker
// build requires is not re-included by .dockerignore.

import { readFileSync } from "node:fs";

const REQUIRED_CONTEXT_FILES = [".eslintignore"];

const lines = readFileSync(new URL("../../.dockerignore", import.meta.url), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const whitelistStyle = lines[0] === "*";
if (!whitelistStyle) {
  // Only the current whitelist layout is understood; if the file is
  // restructured, this check must be revisited rather than silently pass.
  console.error(
    "dockerContext: .dockerignore no longer starts with '*'; update scripts/verify/dockerContext.mjs",
  );
  process.exit(1);
}

const includes = lines
  .filter((l) => l.startsWith("!"))
  .map((l) => l.slice(1).replace(/\/$/, ""));

const missing = REQUIRED_CONTEXT_FILES.filter(
  (file) =>
    !includes.some(
      (inc) => inc === file || file === inc || file.startsWith(inc + "/"),
    ),
);

if (missing.length > 0) {
  console.error(
    `dockerContext: required by the Docker build but excluded by .dockerignore: ${missing.join(", ")}`,
  );
  process.exit(1);
}

console.log("dockerContext: OK");
