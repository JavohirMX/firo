/*
 * How expensive is reading a board?
 *
 * Run with `yarn bench:read` after `yarn build:packages`. The figures it prints are
 * the ones in [ADR-0020](../../docs/adr/0020-stop-walking-the-whole-document-to-read-it.md)
 * and in the roadmap's risk table, so a reader can check them rather than trust them.
 *
 * ## Two harness traps, both of which cost real time
 *
 * **It must run against the built packages, not a source bundle.** the built `dist` output
 * inlines its own copy of Yjs, so a `Y.Doc` created by this script is a *foreign type*
 * and every write fails with `Unexpected content type`. That is also why this uses
 * `openBoardMemory()` rather than `new FiroDoc(new Y.Doc())`: it lets the package
 * construct its own document, so there is exactly one Yjs. Vite shares one copy in the
 * real build, so this is a measurement artefact and not a product bug.
 *
 * **`--expose-gc` is needed for the memory figure**, or the retained-per-snapshot
 * number is whatever the collector felt like doing.
 *
 * ## The control row
 *
 * A transaction with no `subscribe()` listener costs ~0.5 ms, because `notify()`
 * returns before it reads. Without that row the 14.6 ms looks like transaction cost
 * rather than read cost, and the whole finding is attributed to the wrong thing.
 */

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

const time = (label, fn) => {
  fn(); // warm, so the first run's JIT is not in the average
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < RUNS; i++) {
    fn();
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / RUNS;
  console.log(`  ${label.padEnd(40)} ${ms.toFixed(3)} ms`);
  return ms;
};

console.log(`elements: ${doc.read().elements.length}\n`);

const full = time("read() full snapshot", () => doc.read());

// These four are all within a millisecond of each other, and that is the finding:
// only `assets` is lazy, so every one of them walks all 10,000 elements.
time("read().elements", () => doc.read().elements);
time("read().collections (wants none)", () => doc.read().collections);
time("read().meta (a handful of keys)", () => doc.read().meta);
time("read().elementOrder", () => doc.read().elementOrder);
time("elementOrder() — the cheap path", () => doc.elementOrder());

if (global.gc) {
  global.gc();
}
const before = process.memoryUsage().heapUsed;
const held = [];
for (let i = 0; i < RUNS; i++) {
  held.push(doc.read());
}
const after = process.memoryUsage().heapUsed;
console.log(
  `\n  retained per snapshot${global.gc ? "" : "  (run with --expose-gc)"}` +
    `                        ${(((after - before) / RUNS) / 1e6).toFixed(2)} MB`,
);
held.length = 0;

console.log("\n  one keystroke:");
let n = 0;
const idle = time("transaction, no subscriber", () => {
  doc.commit([{ kind: "setMeta", entries: { touched: n++ } }]);
});

// The control. `notify()` returns before it reads when nothing is subscribed, so this
// is the transaction's own cost and the difference from `full` is all reader.
doc.subscribe(() => {});
const busy = time("transaction, one subscriber", () => {
  doc.commit([{ kind: "setMeta", entries: { touched: n++ } }]);
});

console.log(`\n  read cost per keystroke (2 reads)         ${(full * 2).toFixed(1)} ms = ${((full * 2) / 16.67).toFixed(1)} frame budgets`);
console.log(`  measured, no subscriber                   ${idle.toFixed(3)} ms`);
console.log(`  measured, one subscriber                  ${busy.toFixed(3)} ms`);
