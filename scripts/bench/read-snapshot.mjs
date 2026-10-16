/*
 * How expensive is reading a board?
 *
 * Run with `yarn bench:read` after `yarn build:packages`. The figures it prints are
 * the ones in [ADR-0020](../../docs/adr/0020-stop-walking-the-whole-document-to-read-it.md)
 * and in the roadmap's risk table, so a reader can check them rather than trust them.
 *
 * ## Two harness traps, both of which cost real time
 *
 * **It must run against the built packages, not a source bundle.** The built `dist`
 * inlines its own copy of Yjs, so a `Y.Doc` created by this script is a *foreign type*
 * and every write fails with `Unexpected content type`. That is also why this uses
 * `openBoardMemory()` rather than `new FiroDoc(new Y.Doc())`: it lets the package
 * construct its own document, so there is exactly one Yjs. Vite shares one copy in the
 * real build, so this is a measurement artefact and not a product bug.
 *
 * **`--expose-gc` is needed for the memory figure**, or the retained-per-snapshot
 * number is whatever the collector felt like doing.
 *
 * ## Why every measurement here commits something first
 *
 * `read()` is memoised against the document's revision, so a second read with no
 * transaction between costs nothing — correctly, and uselessly as a measurement. The
 * first version of this script read in a loop and reported `0.000 ms`, which looked
 * like a triumph and was in fact a bench that had stopped measuring anything.
 *
 * So each row that means "what does reading cost" commits first, to force a cache
 * miss, and the cached path is reported separately and labelled as such. Both numbers
 * matter: one is what a cold read costs, the other is what the other three reads in a
 * keystroke now cost.
 */

import "fake-indexeddb/auto.js";
import { openBoardMemory } from "@firo/doc";
import {
  CURRENT_ELEMENT_VERSION,
  CURRENT_RECORD_VERSION,
  loadBoard,
} from "@firo/schema";

const N = Number(process.argv[2] ?? 10000);
const RUNS = 20;

/** A plain element. Shaped like the real ones but not one of any particular type. */
const element = (i) => ({
  id: `el-${i}`,
  type: i % 3 === 0 ? "stickynote" : "rectangle",
  x: i % 100,
  y: (i / 100) | 0,
  width: 120,
  height: 80,
  angle: 0,
  name: `n${i}`,
  strokeColor: "#1e1e1e",
  backgroundColor: "#ffffff",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roundness: null,
  roughness: 1,
  opacity: 100,
  seed: 1,
  version: 1,
  versionNonce: 1,
  index: null,
  isDeleted: false,
  groupIds: [],
  frameId: null,
  containerId: null,
  bindings: [],
  link: null,
  locked: false,
  created: 1000,
  updated: 2000,
});

const all = Array.from({ length: N }, (_, i) => element(i));
const doc = openBoardMemory();

// Through `loadBoard`, not hand-built mutations. An element committed straight into a
// `FiroDoc` has not been through the loader's validation, so it lacks fields the
// loader adds — and a board built that way is not shaped like a real one.
doc.load(
  loadBoard({
    elementSchemaVersion: CURRENT_ELEMENT_VERSION,
    recordSchemaVersion: CURRENT_RECORD_VERSION,
    elementOrder: all.map((e) => e.id),
    elements: all,
    collections: [],
    records: [],
    meta: {},
  }),
);

let tick = 0;

/** A durable no-op that invalidates the snapshot, exactly as a keystroke would. */
const commit = () => {
  doc.commit([{ kind: "setMeta", entries: { touched: tick++ } }]);
};

const time = (label, fn) => {
  fn(); // warm, so the first run's JIT is not in the average
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < RUNS; i++) {
    fn();
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / RUNS;
  console.log(`  ${label.padEnd(44)} ${ms.toFixed(3)} ms`);
  return ms;
};

/** Time `fn` with a transaction before each call, so every read is a cache miss. */
const timeCold = (label, fn) =>
  time(label, () => {
    commit();
    return fn();
  });

console.log(`elements: ${doc.read().elements.length}\n`);

console.log("  cold read — one transaction, then one read:");
const coldFull = timeCold("read() full snapshot", () => doc.read());
timeCold("read().elements", () => doc.read().elements);
timeCold("read().collections (wants none)", () => doc.read().collections);
timeCold("read().meta (a handful of keys)", () => doc.read().meta);
timeCold("read().elementOrder", () => doc.read().elementOrder);
timeCold("elementOrder() — the same ids, no walk", () => doc.elementOrder());

console.log("\n  warm read — no transaction, so the memoised snapshot:");
const warm = time("read() again, cached", () => doc.read());
console.log(
  `  ${"cold ÷ warm".padEnd(44)} ${
    warm < 0.0005 ? ">1000x" : `${(coldFull / warm).toFixed(0)}x`
  }`,
);

if (global.gc) {
  global.gc();
}
const before = process.memoryUsage().heapUsed;
const held = [];
for (let i = 0; i < RUNS; i++) {
  commit(); // a fresh snapshot each time, or this measures the same one
  const snapshot = doc.read();
  // Touch `elements`, or this measures a snapshot holding nothing but `meta`. The
  // first version of this row reported 1.87 MB against a real 17.2 MB for exactly
  // that reason, and a memory figure that understates by 9x is worse than none.
  snapshot.elements.length;
  held.push(snapshot);
}
const after = process.memoryUsage().heapUsed;
console.log(
  `\n  retained per snapshot${global.gc ? "" : "  (run with --expose-gc)"}` +
    `                        ${(((after - before) / RUNS) / 1e6).toFixed(2)} MB`,
);
held.length = 0;

console.log("\n  one keystroke — a transaction plus whatever the subscriber does:");
const quiet = time("no subscriber (notify returns before reading)", commit);

/*
 * The control that carries the argument, and the one that has to be right.
 *
 * `notify()` returns before it reads when no listener is registered, so the difference
 * between these two rows is the read and nothing else. The first version subscribed a
 * no-op and reported a subscriber costing 0.004 ms -- which was true, and useless:
 * laziness means a subscriber that reads nothing walks nothing, and the real
 * subscriber is `BoardSync.onDocumentChanged`, whose echo guard reads `elements` on
 * every notification.
 *
 * So this subscriber reads `elements`, as the real one does. Without that, the row
 * reports a saving the product does not get.
 */
let walked = 0;
doc.subscribe((snapshot) => {
  walked += snapshot.elements.length;
});
const noisy = time("one subscriber that reads elements", commit);
void walked;

console.log(
  `\n  read cost per keystroke` +
    `                        ${(noisy - quiet).toFixed(3)} ms = ${(
      (noisy - quiet) /
      16.67
    ).toFixed(2)} frame budgets`,
);
console.log(`  of which the transaction itself` +
  `                  ${quiet.toFixed(3)} ms`);
