---
status: proposed
date: 2026-10-02
deciders: maintainer
supersedes: the single-file `.firo` container stated in `docs/trd/07-persistence-and-formats.md` and `docs/prd/03-feature-specifications.md` FR-33
---

# A `.firo` is a directory: `board.json`, a manifest, and content-addressed assets beside it

## Context and Problem Statement

Today a `.firo` file is **a single JSON document**, written by `serializeBoardFile`
in `packages/schema/src/fixtures.ts` via `canonicalJson`, which sorts keys so that
exporting an unchanged board twice produces byte-identical output and `git diff`
shows nothing. Round-trip identity is tested hard, in
`packages/schema/tests/fileFormat.test.ts` and in
`apps/web/board/tests/files.test.ts`.

The `image` element type, added two days ago, changed the picture. An image element
holds `fileId`, `status`, `scale`, `crop` and **never bytes** — its content lives in
the content-addressed asset store in `packages/doc/src/library.ts`, which is a
separate IndexedDB database from the document because a 2 MB image inside a CRDT
update is broadcast on every sync. A single JSON document can therefore carry the
reference and not the picture.

So `exportBoard` **refuses** any board with a non-tombstoned image, via the
`uncarriedAssetTypes` helper in `apps/web/board/files.ts`. That is a deliberate
interim position: a visible "this board cannot be exported yet" is a limitation
somebody can report, where a file that imports cleanly and draws a broken image is a
trap laid for whoever opens it in six months. A tombstoned image does not count —
it is not in the exported file either.

That refusal cannot stand. **AC-6 names 50 images** and is a v1 gate: "a tester
creates a board with every element type, 50 images, a record collection with four
columns and 20 records, tags, votes, and a timer state. They export a `.firo`
archive." A format that cannot carry an image cannot pass it, and v1 is not allowed
to slip the criterion.

Two documents already describe the fix and they contradict each other:

- `docs/plans/phase-7-persistence-and-formats.md` §7.3 draws a **directory**
  (`manifest.json`, `board.json`, `assets/<sha256>.<ext>`) and says assets are
  "files beside the document, never base64 inlined".
- `docs/trd/07-persistence-and-formats.md` says "A **single file** containing
  everything" and then draws the same directory tree underneath it.
  `docs/prd/03-feature-specifications.md` FR-33 repeats "A single file containing
  the board document, assets, and a manifest", as does AC-6's `cat` it.

Both properties are load-bearing and they are mutually exclusive. A single file
downloads in one click, opens in any text editor and produces a clean `git diff`; it
cannot carry image bytes. A directory carries the bytes, deduplicates identical
images by content hash, and still works with git; it is no longer one file to
download or email, and "open this board" becomes "open this folder".

### Two facts that make this more than "add an `assets/` folder"

Both are found in the code today and neither is a one-line change:

1. **`FiroDoc.read()` returns a `BoardSnapshot` with no `assets`.** The document
   *does* hold an assets map — `setAsset` writes `{ hash, mimeType, bytes }` keyed
   by an element-facing id — but it is not on the snapshot, so an exporter cannot
   enumerate which assets a board needs.
2. **`SerializedBoard` has no assets key.** The document half of the format is what
   `loadBoard`, `migrate.ts` and every committed fixture are written against.

## Decision Drivers

- **AC-6 names 50 images and is a v1 gate.** A format that cannot carry an image
  fails the criterion. Deferring is not on the table without slipping v1.
- **A committed `.firo` must produce a *readable* diff.** AC-6, `trd/07`, the
  "Why text-based matters" section, `vision.md` and persona 3 (Mira, who keeps his
  notes as text files in git) all say so. It is the differentiator against Miro,
  whose `.rtb` cannot be re-imported by Miro.
- **Determinism is tested, not assumed.** Export twice → identical bytes;
  export/import/export → identical bytes. A container must preserve that, and a
  directory preserves it more cheaply than an archive does.
- **Content addressing.** Which bytes an element needs is a fact in the file rather
  than an inference, and the same image on 50 cards is stored once.
- **Silent loss is what this phase exists to prevent** (AC-10). An archive that
  references bytes it does not contain must be refused, not written.
- **No new dependencies** ([ADR-0005](0005-indexeddb-via-idb-keyval.md) driver 4).
  A directory is written with what the browser already has.
- **One download and one email attachment are conveniences. A readable diff is a
  promise.** We keep the promise.

## Considered Options

1. Stay single-file JSON; images deferred to a v2 format or never exported.
2. Single-file JSON with base64 assets inlined.
3. **Directory archive** — `manifest.json`, `board.json`, `assets/<sha256>.<ext>`.
4. A single container file (zip or tar) holding the same three things.
5. A single JSON `.firo` beside a sibling `<board>.firo.assets/` directory.
6. Two containers for ever: `.firo` stays a file that loses pictures, and a new
   extension is the one that carries them.

## Decision Outcome

**Option 3.**

1. **A `.firo` is a directory.** The layout is §7.3's, unchanged:

   ```
   board.firo/
   ├── manifest.json        version, id, created, generator, checksums
   ├── board.json           elements, containers, collections, columns, records
   └── assets/
       └── <sha256>.<ext>   content-addressed, deduplicated
   ```

2. **`board.json` is byte-for-byte the file that ships today.** Same
   `compactBoard(serializeBoard(board))`, same canonical key order, same two-space
   indent, same trailing newline, same function. This is the load-bearing bet of the
   whole decision: **the document half of the format does not change, only what
   surrounds it.** `packages/schema/tests/fileFormat.test.ts` needs no change, and
   if it ever needs one, the container has leaked into the document and this
   decision has been broken.

3. **`manifest.json` is canonical JSON too**, and is the only new file:

   ```json
   {
     "assets": {
       "file-1": {
         "bytes": 241172,
         "mimeType": "image/png",
         "path": "assets/6f1e….png",
         "sha256": "6f1e…"
       }
     },
     "board": {
       "created": 1759250000000,
       "generator": "firo/0.1.0",
       "id": "board-1"
     },
     "boardJson": { "bytes": 41234, "sha256": "9ab2…" },
     "format": "firo",
     "formatVersion": 2
   }
   ```

   Four details in it are load-bearing rather than incidental:

   - **`created` is the board's creation time, never the export time.** Otherwise
     every re-export dirties the manifest and AC-6's "`git diff` shows the change"
     becomes "`git diff` always shows a change".
   - **`generator` records the writing version and *is* expected to change on
     upgrade.** That is a one-line diff, which is what the field is for.
   - **`assets` is keyed by `fileId`** — the element-facing id — and carries the
     hash and the path. Two `fileId`s with the same hash resolve to the same path.
     That is where deduplication happens, and it keeps working even if `fileId` is
     not itself the hash.
   - **`boardJson.sha256` makes a truncated or hand-edited `board.json`
     detectable** rather than silently partial.

4. **The asset filename is the SHA-256**, with the extension derived from the
   `mimeType` already on the `AssetReference`. The extension is not a second source
   of truth; the bytes decide it.

5. **A missing asset still fails the export, loudly.** The refusal is **kept and
   narrowed**, not deleted: it now fires when the store holds no bytes for a hash
   the board references (`hasAsset(hash)` false), or when an image is `pending`
   with no `fileId` at all. It no longer fires merely because the board has an
   image. Say this out loud, because deleting `uncarriedAssetTypes` wholesale is the
   obvious wrong move and it would restore the silent-loss failure.

6. **Format version 2. Format version 1 is the single JSON file, and loads for
   ever.** Dispatch on shape, not extension: a directory → read `manifest.json`; a
   single JSON file carrying `elementSchemaVersion` → format v1, straight into
   today's `loadBoard`.

   **No element or record schema migration is required.**
   `CURRENT_ELEMENT_VERSION` and `CURRENT_RECORD_VERSION` both stay at 1. This is a
   container change and it is the reason the cost is small. Note also that the
   format version is *not* the schema version and the two can never be unified: a
   board's document can be at element v3 / record v1 while its container is at
   format v2, and the loader needs both facts.

7. **A zip is a transport, not the format.** It may be offered beside the directory
   for browsers with no directory writer and for email. It must never be the thing a
   test round-trips, and it must never be the thing committed to git. Import accepts
   both. This is the direct answer to the uneven browser support named under
   Consequences, and it is load-bearing rather than cosmetic.

8. **Import writes assets before it writes references:** `putAsset` → verify
   `hasAsset` → `setAsset` mutations → `doc.load(...)`. That order is not new;
   [ADR-0005](0005-indexeddb-via-idb-keyval.md) already decided it — "atomicity
   across the document and its assets must be handled by writing assets first, then
   the document reference". A failed import writes nothing (AC-10).

9. **The autosave does not become a directory.** It stays the single canonical JSON
   it is today, because a CRDT autosave record plus a separate asset store is what
   IndexedDB already holds and a directory has no meaning for it. The claim in
   `apps/web/board/files.ts` that there is "one format, two directions, no second
   store" is therefore **false as written** and must be restated: one *document*
   format, two *containers* — the autosave record and the `.firo` directory. The
   property that actually matters survives intact: the autosave and `board.json`
   are the same bytes, so the autosave still exercises the document format
   continuously.

### What needs the maintainer's signature

Two items, deliberately not buried. The call above is the decision; these are the
parts of it that are judgement rather than measurement, and that the owner
delegated the writing of but not necessarily the ratification of.

**(a) That "one file to download" ranks below "a committed archive whose diff you
can read".** This is a product judgement about the persona, not a fact. The
technical case against a container is below and it is solid; the trade is whether
emailing a board in one attachment is worth that. *If it is overruled, the
reversal is cheap and localised:* emit `board.firo` as a zip container, accept the
loss of `cat`, and add a `.gitattributes` textconv. That costs one export writer
and one import reader, and it makes the manifest's checksums load-bearing rather
than advisory. Nothing structural has to move.

**(b) The wording of AC-6 and FR-33.** AC-6 says "They `cat` it"; FR-33 says "A
single file". With this decision `cat board.firo` does not work and
`cat board.firo/board.json` does. This ADR does not amend the PRD — a criterion
belongs to its own rationale — so the maintainer should either amend the two
sentences or record the deviation as accepted, rather than have a tester discover
it. This is a documentation decision, not a design one.

## Consequences

- (+) **AC-6 becomes reachable.** 50 images travel with the board, and the same logo
  on 50 cards is stored once.
- (+) **The document format is untouched.** `loadBoard`, `migrate.ts`,
  `canonicalJson`, `fileFormat.test.ts` and every committed fixture keep working. No
  schema migration, no version bump, no new validation path.
- (+) **Determinism gets cheaper, not dearer.** A directory's bytes are a pure
  function of the board. An archive has to add a second requirement on top — that
  its own byte layout be a pure function of its members' bytes — which no
  mainstream archive format gives for free.
- (+) **An archive becomes self-describing and self-verifying.** A reader can check
  `board.json` against the manifest before trusting it.
- (+) **The asset store's shape becomes visible in a file**, which is the first time
  anyone can `grep` for a hash and see what it is.
- (-) **`.firo` is no longer one file.** "Email this board" means zipping it;
  "open this board" means "open this folder". Accepted in exchange for the diff.
- (-) **Import ergonomics get worse, and are unevenly supported.** An
  `<input type="file">` cannot open a folder. Directory import needs
  `showDirectoryPicker()` — Chromium and Edge, **not Safari**, and
  [ADR-0005](0005-indexeddb-via-idb-keyval.md) already rejected this API for the
  autosave for exactly that reason — or a dropped folder
  (`DataTransferItem.getAsFileSystemHandle()`; Firefox via `webkitGetAsEntry`). So
  on some browsers the zip transport is the only reliable way to import a full
  board, which is why outcome 7 is load-bearing. This is the cost most likely to be
  underestimated and it is stated here rather than discovered.
- (-) **Two containers exist** (the directory and the zip). Mitigated by testing
  only the directory and by the zip having one test asserting it contains what the
  directory contains — but it is a real second path.
- (-) **`git diff` is readable for `board.json` and `manifest.json`.**
  `assets/*.png` show as binary, which is correct and which is also the point of
  content addressing: an asset that did not change does not even appear in
  `git status`.
- (-) **A folder in a git repo is more error surface than a file.** Renaming is
  `git mv old.firo/ new.firo/`, and a half-copied board directory is a broken board
  rather than an incomplete file.
- (-) **The manifest is a second file that can disagree with `board.json`.** When it
  does, the loader must say which one it believed.
- (-) **Two real gaps stand between this ADR and working code**, and both are in
  packages another change owns: `BoardSnapshot` exposes no `assets`, and
  `SerializedBoard` has no assets key. Until both close, an exporter cannot
  enumerate what a board needs.
- (~) **FR-33, AC-6 and `trd/07` still say "a single file".** Corrected as part of the
  implementation change, not here.

### Is `git diff` on a zip a real loss or a theoretical one?

**Real, and bigger than the usual argument.** The usual argument is that a zip is
binary so `git diff` prints `Binary files differ`. That is true and it is fixable in
principle — git's binary heuristic is a NUL byte in the first 8000 bytes, and a zip
opens `PK\x03\x04` followed by a filename, so it may instead be treated as text and
rendered as garbage; either way a `.gitattributes` `textconv` or `-X diff` per
repository fixes the rendering.

The part that configuration does not fix is this: **the change is not readable.**
One character edited in a note rewrites that member's compressed bytes, shifts every
subsequent member's local-header offset, and rewrites the entire central directory
and end-of-central-directory record. The diff is then either "Binary files differ"
or a few hundred lines of offsets and sizes. To find out what changed you have to
`unzip -p` and diff something else. AC-6 has a tester change two things and read
`git diff`; with a zip the artefact they committed is not the artefact they read.

And the argument people miss: **`deflate` output is not specified by the zip
format.** Two implementations at the same compression level may legitimately produce
different bytes for the same input, so two Firo builds on two runtimes can emit
different zips for the same board. That is pinnable — zeroed mtimes, sorted entries,
fixed level, `STORE` instead of `DEFLATE` — and it works until someone changes the
zip writer, the platform, or the level. The directory has no equivalent hazard:
determinism reduces to `canonicalJson`, which is already tested.

### Why base64 inlining is still rejected

§7.3 rejects it and the rejection still holds, on three counts:

- **The diff breaks.** A 2 MB image becomes a single 2.7-million-character line.
  git will print both whole lines for a one-byte change inside it, and every diff
  renderer in the path — terminal, GitHub, a PR view — either truncates that or
  gives up. The binary heuristic does not rescue it, because base64 contains no NUL
  bytes: the file is treated as text and the enormous diff is generated anyway.
- **Deduplication is lost.** The same image on 50 cards is inlined 50 times. Base64
  also inflates by a third, so a board with 50 distinct 2 MB images is ~135 MB of
  JSON against ~100 MB of asset files, before deduplication.
- **It makes the reader worse and the writer no better.** `cat` and `grep` still
  find a note's text; a person still cannot read the file.

Stated honestly, because it is the strongest thing to say for the option: **base64
is not a determinism problem and it is not a correctness problem.** It would be
perfectly acceptable for a format that is never committed and never read. This one is
both, which is the only reason it loses. The plan's existing mitigation stands — a
test asserting no base64 data URLs in `board.json`.

### Migration cost, named

**No `.firo` files exist in the wild.** Pre-alpha, no release, nothing to migrate for
a user. Stated plainly so nobody stages a back-compat project.

The code around the format does depend on the current shape, and the work is:

1. **`apps/web/board/files.ts` is string-shaped throughout.**
   `parseBoard(text: string)`, `importBoard(doc, text: string)`,
   `downloadBoard(result: { bytes: string })` and `ExportResult`'s `bytes: string`.
   All four need a directory-shaped sibling. `downloadBoard` is the awkward one: one
   `Blob` today, a directory handle or N files tomorrow.
2. **`apps/web/board/tests/files.test.ts` (530 lines) asserts on `result.bytes` as
   a string throughout.** Its `describe("refuses a board it cannot export without
   losing something")` block is replaced by the narrower missing-bytes refusal, and
   four of that block's six assertions stop applying.
3. **The fixture harness needs a second key.** `tests/fixtures/v1/board.json` stays
   exactly as it is, as a format-v1 fixture, and must keep loading for ever.
   `fixturesAreComplete()` keys on *schema* versions and does not change — but a new
   completeness check keyed on *format* versions is needed, or a directory format can
   ship with no committed fixture at all.
4. **`packages/schema/tests/fileFormat.test.ts` is unchanged, and that is the
   point.**
5. **Two gaps in packages this change does not touch:** `BoardSnapshot` needs an
   `assets` map (the document already holds one, written by `setAsset`), and the
   per-`fileId` metadata travels through the manifest rather than through
   `board.json`, so `SerializedBoard` does not grow.

### What this does not decide

So that the next person does not reopen it by accident:

- **Merge-on-import.** Import still refuses a non-empty board. That reasoning — a
  tombstone against a reused id, and no "replace this element" mutation — is
  untouched and still correct.
- **Tombstone policy.** Kept in the autosave, dropped from the file. Assets
  referenced only by tombstoned images are not written, on the same grounds: they
  are not in the file either.
- **Document-level compaction and orphan-asset collection** (§7.2). Content
  addressing makes an unused asset *provably* unused; it does not collect anything.
- **Whether the sync server sends assets over the wire, and how.** That is Phase 9
  and a different question. This is about the file.
- **`history/` inside the archive.** `trd/07` lists it as optional and omitted for
  a clean export. It stays omitted; if it is ever added it is a new directory
  member, not a schema change.
- **The board library file** (`.firolib`, Phase 4). A different container question
  with a different answer: it holds a *set* of boards, so it is a candidate for the
  same container or for none.
- **Whether the format version and the two schema version counters can ever be
  unified.** They cannot, and this ADR is why.
- **What a future asset-bearing element type does** — an embedded file, a font, a 3D
  model. Content addressing already generalises and `assets/` is already the right
  home; the naming rule would need revisiting only for bytes that are not
  independently hashable.
- **The zip's file extension, and whether the zip ships in v1 at all.**

## Confirmation

Facts this decision rests on, verified today:

- [x] The asset store is content-addressed by SHA-256 via WebCrypto in a database
      separate from the document, with `putAsset` / `getAssetBytes` / `getAsset` /
      `getAssetMimeType` / `hasAsset` / `clearAssets`. `packages/doc/src/library.ts`,
      covered by `packages/doc/tests/persistence.test.ts`.
- [x] `ImageElement` carries `fileId`, `status`, `scale`, `crop` and never bytes.
      `packages/schema/src/types.ts`, `packages/schema/src/types/image.ts`.
- [x] The single-file writer is `serializeBoardFile`, and it is the same function the
      round-trip tests use.
- [x] Export → import → export is byte-identical today for the single-file format.
      `apps/web/board/tests/files.test.ts`, "survives being exported again, unchanged".
- [x] Export refuses a board with a non-tombstoned image, with a reason and a
      message naming the count. `uncarriedAssetTypes`, `apps/web/board/files.ts`.
- [x] `CURRENT_ELEMENT_VERSION` and `CURRENT_RECORD_VERSION` are both 1, and this
      ADR requires no schema migration. `packages/schema/src/version.ts`.

What is **not** true yet, and this ADR is a decision rather than an implementation:

- [ ] A `.firo` **directory** exports at all. Open — no code implements this, and
      this change deliberately touches no code.
- [ ] `board.json` inside the directory is byte-identical to the bytes the current
      export writes, and `fileFormat.test.ts` passes unmodified. Open — the design
      intends this; nothing asserts it yet.
- [ ] 50 images on a board survive export → delete all site data → re-import. Open.
      This is AC-6, and it is the reason option 1 was rejected.
- [ ] A `.firo` in git produces a readable diff. Open. `cat` works on `board.json`;
      `cat board.firo` does not, and AC-6's letter says it should.
- [ ] **`FiroDoc.read()` exposes the document's `assets` map**, so an exporter can
      enumerate what a board needs. **Open, and a hard blocker** — `BoardSnapshot`
      has no `assets` and `SerializedBoard` has no assets key today.
- [ ] Export refuses when the store holds no bytes for a referenced hash, and the
      `pending` (`fileId: null`) case still fails. Open — the mechanism exists; the
      trigger condition narrows.
- [ ] A committed format-v2 fixture exists and loads, and the format-v1 fixture still
      loads. Open — the harness keys on schema versions only.
- [ ] Import writes assets before references, and a failed import writes nothing.
      Open — the order is already ADR-0005's; nothing enforces it on the import path.
- [ ] AC-6's `cat` and FR-33's "a single file" are amended, or the deviation is
      recorded as accepted. **Open — needs the maintainer.**
- [ ] Folder import works on Safari, or the zip transport ships and is the documented
      Safari path. Open.
- [ ] A committed `.firo` directory is not accidentally re-exported as a zip, or vice
      versa. Open, and it is the test that keeps the two containers honest.

## Pros and Cons of the Options

### 1. Stay single-file JSON, defer images

- (+) Nothing changes. Every existing test keeps passing, byte-identity needs no
  thought, `cat board.firo` works.
- (+) It is the option a reasonable person picks if v1 scope were allowed to slip.
- (-) **AC-6 names 50 images and is a v1 exit criterion.** This option cannot pass
  it, so its real content is "ship v1 without AC-6".
- (-) It makes "you own your board" conditional on the board having no pictures,
  which is not a property anyone wants to advertise.

### 2. Base64 assets inlined

- (+) One file, self-contained, opens anywhere, no directory, no browser API
  needed. Genuinely the simplest thing that works.
- (+) Deterministic, and correct. Nothing about base64 breaks round-tripping.
- (-) A 2.7-million-character line per image. `git diff` on a board with 50 images
  prints megabytes per changed line and every renderer in the path gives up.
- (-) No deduplication: 50 copies of the same logo, plus a third more bytes for the
  encoding.
- (-) Directly contradicts §7.3, `trd/07`, and the plan's own risk table, which
  already carries a test for base64 creeping back in.

### 3. Directory archive — **chosen**

- (+) Carries the bytes, deduplicates them, and keeps `board.json` a plain text file
  that git, `grep`, an editor and a person all handle.
- (+) The document format does not change, so the cost lands entirely in
  `apps/web/board/files.ts` and in two gaps in `@firo/doc` and `@firo/schema`.
- (+) Determinism is a property of `canonicalJson` alone.
- (-) Not one file to download or email, and import needs a browser API that Safari
  does not have. Accepted, and answered by the zip transport.

### 4. Single container file (zip or tar)

- (+) One click, one attachment, and a manifest with checksums is easy to verify.
- (-) `git diff` on it does not show what changed, only that something did. The
  reason is not that it is binary — that is configurable — but that editing one note
  rewrites every subsequent offset and the whole central directory.
- (-) `deflate` output is not specified by the format, so byte-identity across
  builds needs pinning that a directory does not need.
- (-) Needs a zip or tar dependency, which [ADR-0005](0005-indexeddb-via-idb-keyval.md)
  driver 4 weighs against every addition. None is in the tree today.
- (+) Not worthless: it is the right *transport*, which is why option 3 keeps it for
  that purpose.

### 5. Single file beside a sibling `.firo.assets/` directory

- (+) The strongest form of "keep one file". `board.firo` stays a one-click download
  and stays diffable as text, and the bytes travel beside it.
- (-) Two things must move together forever. Copy the JSON, forget the folder, and
  the board is broken in a way that looks fine.
- (-) There is nowhere for a manifest to live without either being fused into
  `board.json` — which grows `SerializedBoard` and breaks the "unchanged document
  format" property that makes option 3 cheap — or being a third sibling.
- (-) git tracks them as two unrelated paths, so a rename does not carry the assets
  and a partial commit is possible.
- (-) `.firo.assets` is a naming convention no operating system, archive tool or file
  manager understands.

### 6. Two containers for ever

- (+) Nothing existing breaks.
- (-) `.firo` would permanently mean "the one that loses pictures", and the losing
  one is the one people keep discovering first.
- (-) Two import paths, one of which is only ever exercised by whoever needed it.

## More Information

- [`../plans/phase-7-persistence-and-formats.md`](../plans/phase-7-persistence-and-formats.md)
  — §7.1a's refusal this decision replaces, and §7.3's layout this decision adopts
- [`../trd/07-persistence-and-formats.md`](../trd/07-persistence-and-formats.md) —
  the design, whose "single file" wording this supersedes
- [`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) — AC-6 and
  AC-7, the criteria the decision has to satisfy
- [`../../packages/doc/src/library.ts`](../../packages/doc/src/library.ts) — the asset
  store, and why it is a separate database
- [`../../apps/web/board/files.ts`](../../apps/web/board/files.ts) — the export and
  import path, and the refusal this narrows
- [ADR-0005](0005-indexeddb-via-idb-keyval.md) — IndexedDB, the asset-store
  separation, and the "write assets first" ordering that import now follows
- [ADR-0017](0017-do-not-rewrite-the-renderer.md) — the format the inherited
  document↔canvas bridge depends on, and the newest decision in the log
