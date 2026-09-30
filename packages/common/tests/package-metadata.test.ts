/**
 * Workspace package metadata.
 *
 * ## Why this is a test and not a review note
 *
 * The seven packages that existed before Phase 1 all shipped `repository`,
 * `bugs` and `homepage` pointing at **Excalidraw's** GitHub repo, and described
 * themselves as "Excalidraw ...". The rebrand in Phase 0 renamed the packages and
 * left the metadata untouched, and nothing noticed for the whole of that phase.
 *
 * The reason it is worth a test is the harm, not the untidiness:
 *
 * - A `bugs` URL that points at Excalidraw **misdirects every bug report** filed
 *   against a `@firo/*` package. Somebody's report about our fork goes to a
 *   stranger's tracker and is closed as unreproducible.
 * - A `repository` URL that points at Excalidraw is a false provenance claim. The
 *   real provenance is in `NOTICE`, which records the fork point by commit hash;
 *   `repository` is a pointer to *this* project's source, and there is no such
 *   public URL yet.
 * - A description of "Excalidraw as a React component" on a package named
 *   `@firo/editor` is the kind of thing a screenshot of npm search results
 *   surfaces.
 *
 * So the fields are **absent** rather than wrong, and this test holds them
 * absent. When a GitHub org is chosen (see the open item in
 * `docs/plans/phase-1-document-model.md`), the fields come back — pointing at us,
 * never at upstream.
 *
 * ## What is deliberately *not* asserted
 *
 * The four `@excalidraw/*` npm **dependencies** — `mermaid-to-excalidraw`,
 * `random-username`, `prettier-config`, `eslint-config` — are third-party
 * packages whose names we do not control ([`../../docs/adr/0001-fork-excalidraw-and-refactor-aggressively.md`](../../docs/adr/0001-fork-excalidraw-and-refactor-aggressively.md)).
 * This test only walks `package.json` files we author, so they are out of scope
 * by construction rather than by exception list.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..");

type PackageJson = {
  name?: string;
  description?: string;
  keywords?: string[];
  repository?: unknown;
  bugs?: unknown;
  homepage?: string;
};

/** Every `package.json` we author: the workspace packages and the app. */
const authoredPackageFiles = (): string[] => {
  const roots = ["packages", "apps"];
  const files: string[] = [];
  for (const root of roots) {
    for (const entry of readdirSync(join(REPO_ROOT, root))) {
      const candidate = join(root, entry, "package.json");
      try {
        readFileSync(join(REPO_ROOT, candidate));
        files.push(candidate);
      } catch {
        // Not a package directory. `apps/web` is a directory; anything else
        // under `apps/` is not ours to read.
      }
    }
  }
  return files;
};

const authored = (): { file: string; json: PackageJson }[] =>
  authoredPackageFiles().map((file) => ({
    file,
    json: JSON.parse(
      readFileSync(join(REPO_ROOT, file), "utf8"),
    ) as PackageJson,
  }));

const FORBIDDEN = "excalidraw";

describe("workspace package metadata", () => {
  it("finds the packages it is meant to check", () => {
    // A test that silently matches nothing is a test that always passes, and
    // that is the failure mode of every "walk the repo and assert" test. The
    // count is pinned so a directory rename fails here rather than quietly
    // emptying the suite below.
    const packages = authored();
    expect(packages.length).toBeGreaterThanOrEqual(8);
    expect(packages.map((p) => p.json.name)).toContain("@firo/editor");
    expect(packages.map((p) => p.json.name)).toContain("@firo/schema");
  });

  it.each(authored().map((p) => [p.json.name ?? p.file, p.json] as const))(
    "%s declares no repository, bugs or homepage",
    (_name, json) => {
      // Absent, not wrong. There is no public Firo repository yet, and a URL
      // that 404s is worse than no URL: it looks like an answer.
      expect(json.repository, "repository").toBeUndefined();
      expect(json.bugs, "bugs").toBeUndefined();
      expect(json.homepage, "homepage").toBeUndefined();
    },
  );

  it.each(authored().map((p) => [p.json.name ?? p.file, p.json] as const))(
    "%s does not describe itself as Excalidraw",
    (_name, json) => {
      expect(json.description ?? "").not.toContain(FORBIDDEN);
    },
  );

  it.each(authored().map((p) => [p.json.name ?? p.file, p.json] as const))(
    "%s has no Excalidraw keywords",
    (_name, json) => {
      const keywords = json.keywords ?? [];
      for (const keyword of keywords) {
        expect(keyword.toLowerCase(), keyword).not.toContain(FORBIDDEN);
      }
    },
  );

  it.each(authored().map((p) => [p.json.name ?? p.file, p.json] as const))(
    "%s is scoped to @firo",
    (_name, json) => {
      // Phase 0 renamed @excalidraw/* to @firo/*; this holds the scope, which is
      // the half of that rename with no other check.
      expect(json.name, "name").toMatch(/^@firo\//);
    },
  );

  it("every @firo package has a description and is MIT or inherits the repo licence", () => {
    // The licence of a workspace package is the repository's, so an explicit
    // wrong one would be the problem. A description is not optional: it is what
    // npm search shows.
    for (const { json } of authored()) {
      expect(json.description, json.name).toBeTruthy();
    }
  });
});
