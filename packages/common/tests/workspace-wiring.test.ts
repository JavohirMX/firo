import fs from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

/*
 * Every `@firo/*` package is wired into five places, and it is easy to remember
 * four of them.
 *
 * The failure this prevents is not a crash. A package aliased in `vitest.config.mts`
 * but missing from `tsconfig.json` passes every test -- because the tests import
 * through relative paths -- and then the *first real consumer* fails, with an
 * error pointing at `tsconfig.json` rather than at the missing alias. That is
 * what happened to `@firo/facilitation` when it was added: the vitest alias
 * made it look fully wired.
 *
 * So the invariant is asserted rather than remembered. A new package that names
 * itself in one of these files and not the others fails here, by name.
 */

const ROOT = path.resolve(__dirname, "../../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), "utf8");

/** Every workspace package directory, by its directory name. */
const workspacePackages = (): string[] =>
  fs
    .readdirSync(path.join(ROOT, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

const declaredPackages = (): string[] => workspacePackages();

const ALL_PACKAGES = declaredPackages();

describe("workspace packages are wired everywhere", () => {
  const packages = ALL_PACKAGES;

  it("finds the workspace packages at all", () => {
    // A guard that silently matches nothing is a comment. If the packages
    // directory moved, this fails rather than passing vacuously.
    expect(packages.length).toBeGreaterThan(5);
    expect(packages).toContain("doc");
    expect(packages).toContain("facilitation");
  });

  it("declares every package in tsconfig.json paths", () => {
    const tsconfig = read("tsconfig.json");
    const missing = packages.filter(
      (name) => !tsconfig.includes(`"@firo/${name}"`),
    );
    expect(missing).toEqual([]);
  });

  it("declares every package in the vitest aliases", () => {
    const vitest = read("vitest.config.mts");
    const missing = packages.filter(
      (name) =>
        !vitest.includes(`@firo\\/${name}`) &&
        !vitest.includes(`@firo/${name}`),
    );
    expect(missing).toEqual([]);
  });

  it("runs every build:<package> script that exists from build:packages", () => {
    /*
     * The precise invariant, and it is deliberately not "every package is
     * built": `@firo/utils` has no build step and never has, because Vite bundles
     * it from source. Demanding one would be inventing work.
     *
     * What must hold is the other direction -- a build script that exists but is
     * not in the chain is dead configuration, and the package's `dist/` is then
     * whatever the last successful build left behind.
     */
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const chain = pkg.scripts["build:packages"];

    const orphaned = packages.filter(
      (name) =>
        pkg.scripts[`build:${name}`] !== undefined &&
        !chain.includes(`build:${name}`),
    );
    expect(orphaned).toEqual([]);
  });

  it("names every package in yarn workspaces", () => {
    // `packages/*` covers this by glob, so this asserts the intent rather than
    // the mechanism -- but it fails loudly if someone narrows the glob.
    const pkg = JSON.parse(read("package.json")) as { workspaces: string[] };
    expect(pkg.workspaces).toContain("packages/*");
  });
});

describe("a package's declared types resolve to its own build output", () => {
  /*
   * `@firo/board` declared its types at `./dist/types/doc/src/index.d.ts`,
   * copied from `@firo/doc`. Because every package's tsconfig sets
   * `rootDir: "../"`, tsc emits *every* package's declarations into *every*
   * package's output -- so the wrong path resolved, to the wrong package's
   * types. A consumer importing `BoardSync` from `@firo/board` was handed a
   * package exporting `FiroDoc` and `commit()`.
   *
   * It type-checked, because a copy of a declaration file is still a valid one.
   *
   * The invariant asserted is not "the path contains your own name". `@firo/editor`
   * emits to `dist/types/excalidraw/` -- inherited from upstream's build, and
   * correct -- so that check would flag a healthy package. The invariant is the
   * one that was actually broken: **a package's types must not point into
   * another package's output directory.**
   */

  const packagesWithManifests = ALL_PACKAGES.filter((name) =>
    fs.existsSync(path.join(ROOT, "packages", name, "package.json")),
  );

  /**
   * The types a package declares for **its own entry points**.
   *
   * Deliberately excludes subpath exports that re-export a sibling: `@firo/editor`
   * publishes `./common/*`, `./element/*`, `./math/*` and `./utils/*`, and each of
   * those correctly points into that package's own output. Those are pass-through
   * aliases, not the package declaring someone else's types as its own.
   *
   * What must be checked is `.` and `./*`, plus the top-level `types` field --
   * the paths a consumer reaches by importing the package by name, which is
   * exactly where `@firo/board` pointed at `@firo/doc`.
   */
  const ownEntryTypesOf = (name: string): string[] => {
    const pkg = JSON.parse(
      read(path.join("packages", name, "package.json")),
    ) as {
      types?: string;
      exports?: Record<string, { types?: string } | string>;
    };

    const fromExports = [".", "./*"]
      .map((key) => pkg.exports?.[key])
      .filter((entry): entry is { types?: string } => typeof entry === "object")
      .map((entry) => entry.types);

    return [pkg.types, ...fromExports].filter(
      (value): value is string => typeof value === "string",
    );
  };

  it.each(packagesWithManifests)(
    "%s does not declare another package's types",
    (name) => {
      const declared = ownEntryTypesOf(name);
      expect(declared.length).toBeGreaterThan(0);

      const foreign = packagesWithManifests.filter((other) => other !== name);

      for (const types of declared) {
        for (const other of foreign) {
          expect(types).not.toContain(`dist/types/${other}/`);
        }
      }
    },
  );

  it("catches the bug this was written for", () => {
    // A control, so the assertions above cannot pass for the wrong reason. This
    // is the exact mistake `@firo/board` had.
    expect("./dist/types/doc/src/index.d.ts").toContain("dist/types/doc/");
    expect(
      ownEntryTypesOf("board").some((t) => t.includes("dist/types/doc/")),
    ).toBe(false);
  });
});
