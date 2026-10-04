/**
 * The board document.
 *
 * ## The one rule
 *
 * `commit()` is the only thing that writes to the Yjs document, and it is
 * enforced rather than documented. A `beforeTransaction` hook inspects the origin
 * of every transaction and throws on one this package did not start.
 *
 * Enforcement rather than convention is the point. The rule is invisible when
 * broken -- the code still works, the tests still pass, and the damage is a
 * document that is 300x larger than its content and an undo stack with 300 steps
 * in it. A convention would be followed until the first hot-path change, and
 * there is no hot path more reliably rewritten than a pointer-move handler.
 */
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness.js";

import type { Collection, FiroElement, FiroRecord } from "@firo/schema";

import { LOAD_ORIGIN, LOCAL_ORIGIN } from "./origin.js";
import { guardedDoc, WriteGuard } from "./guard.js";

import { isMutation } from "./mutations.js";
import {
  applyEphemeralPatch,
  AWARENESS_KEY,
  EMPTY_EPHEMERAL_STATE,
} from "./ephemeral.js";

import {
  fromYMap,
  isPlainObject,
  readAllAssets,
  readAllCollections,
  readAllElements,
  readAllRecords,
  structure,
  toYMap,
} from "./structure.js";

import type { EphemeralPatch, EphemeralState } from "./ephemeral.js";
import type { AssetReference, Mutation } from "./mutations.js";
import type { DocStructure, ElementNode } from "./structure.js";

/** A snapshot of everything durable in the document. */
export type BoardSnapshot = {
  /** In z-order, front to back. */
  elements: FiroElement[];
  /** The same order, as ids. Carried explicitly so a serialiser never has to
      re-derive it -- and re-deriving it from `elements` would be correct only by
      coincidence, since that is how this package happens to read them. */
  elementOrder: string[];
  collections: Collection[];
  records: FiroRecord[];
  meta: Record<string, unknown>;
  /**
   * Every asset reference, keyed by the id an element faces it as (`fileId`).
   *
   * Read on first access rather than with the rest of the snapshot, and read only
   * once per snapshot. See `read()` for why; the short version is that a board
   * with 50 images pays nothing for them on the 5,000 transactions that did not
   * touch one.
   *
   * The bytes are not here. This is the reference half of a store that lives in a
   * separate IndexedDB database.
   */
  assets: Record<string, AssetReference>;
};

export type CommitResult = {
  /** Whether the document actually changed. */
  changed: boolean;
  /** Mutations that were applied. */
  applied: number;
  /**
   * A monotonically increasing count of this client's durable commits.
   *
   * This is a *local* counter, not a Yjs state vector, and the difference
   * matters: two clients both at commit 40 are not in agreement, so the number
   * cannot be used to compare documents. What it is for is narrower and real --
   * telling a persisted blob from a stale one, and giving a test something exact
   * to assert on. A true state vector would answer "have these converged?", and
   * nothing in v1 needs that.
   */
  localRevision: number;
};

/**
 * A single board's document.
 *
 * Construct with `openBoard` or `openBoardMemory` rather than `new` -- both set
 * up the write guard, and a guard installed after the first write has already
 * missed it.
 */
/**
 * A document, for callers that should not know Yjs exists.
 *
 * ## Why this exists
 *
 * Importing `yjs` at the call site loads a *second* copy of the module alongside
 * the one inside this package, and Yjs says so loudly:
 *
 *     Yjs was already imported. This breaks constructor checks and will lead to
 *     issues! -- https://github.com/yjs/yjs/issues/438
 *
 * That is not cosmetic. Yjs identifies values with `instanceof` in its own
 * internals, so two copies means a `Y.Doc` from one is not a `Y.Doc` to the
 * other, and the failures surface far from the cause — as a document that
 * silently stops applying updates.
 *
 * The app is the caller that would otherwise do this: it needs a document and
 * nothing else. Making it import Yjs to get one puts a transport detail in the
 * app's hands for no benefit, and puts the two-copies hazard one careless import
 * away.
 */
export const createFiroDoc = (): FiroDoc => new FiroDoc(new Y.Doc());

/**
 * Freeze an array and each object in it, one level deep.
 *
 * ## Why this is here at all
 *
 * Because `read()` is memoised, every caller now shares the same element objects
 * rather than receiving fresh ones. That is the whole point -- it is where the 16 ms
 * went -- and it introduces a class of bug that was previously impossible: a caller
 * that mutates a snapshot would silently poison the cache for everybody, and the
 * poison would persist until the next transaction.
 *
 * `fromYMap` returns `Object.create(null)` objects, so nothing *prevents* a write.
 * Without this, "I mutated a snapshot" becomes silent corruption rather than a
 * `TypeError` in strict mode -- which is a strictly worse trade than the one this
 * function is optimising for.
 *
 * ## Shallow on purpose
 *
 * Deep-freezing 10,000 elements means walking into every nested plain object on every
 * rebuild, which is the same order of work as the walk being optimised. Shallow is
 * O(n) with no allocation and no recursion, and it closes the hole where it opens: the
 * top-level element object and the arrays. Nested plain objects stay writable, which is
 * a smaller hole than the whole object -- and it is one the existing callers do not go
 * near, because the nested values are `boundElements`, `groupIds` and similar, all of
 * which are read-only in practice.
 *
 * `Object.freeze` on a null-prototype object is safe: freezing does not add a
 * prototype.
 */
const freezeEach = <T>(items: T[]): T[] => {
  for (const item of items) {
    Object.freeze(item);
  }
  // Frozen in place and handed back, rather than returned from `Object.freeze` --
  // which types as `readonly T[]` and would mean changing `BoardSnapshot`'s arrays to
  // readonly, rippling through every caller for no gain. The array is the same one;
  // a caller who tries to push to it now gets a `TypeError`, which is the point.
  Object.freeze(items);
  return items;
};

/** Freeze a plain object in place and hand it back, same reasoning as `freezeEach`. */
const frozen = <T extends object>(value: T): T => {
  Object.freeze(value);
  return value;
};

export class FiroDoc {
  /**
   * The guarded document.
   *
   * Readable and observable, and it will refuse to start a transaction or mutate
   * a shared type. `openBoard` and `createUndoManager` need the raw `Y.Doc`, and
   * both are inside this package, so both are given it deliberately.
   */
  readonly ydoc: Y.Doc;

  /** @internal The unguarded document. Never handed outside this package. */
  readonly rawYdoc: Y.Doc;

  readonly awareness: Awareness;
  private readonly nodes: DocStructure;
  private readonly guard = new WriteGuard();

  /**
   * Monotonic count of durable updates this client has produced.
   *
   * Exists so the ephemeral/durable split is *observable* rather than asserted.
   * The drag test reads it; a debugger reads it; and when someone asks "why is
   * this board 40 MB", it is the number that answers.
   */
  private durableUpdateCount = 0;
  private localRevision = 0;

  private ephemeralState: EphemeralState = EMPTY_EPHEMERAL_STATE;

  private readonly listeners = new Set<(snapshot: BoardSnapshot) => void>();
  private readonly updateListeners = new Set<() => void>();

  /** @internal Use `openBoard` / `openBoardMemory`. */
  constructor(ydoc: Y.Doc) {
    this.rawYdoc = ydoc;
    this.awareness = new Awareness(ydoc);
    this.awareness.setLocalState({ [AWARENESS_KEY]: EMPTY_EPHEMERAL_STATE });
    this.nodes = structure(ydoc);
    // Built eagerly rather than on first access, so the first `ydoc` read cannot
    // hand out the raw document by accident.
    this.ydoc = guardedDoc(ydoc, this.guard);

    this.observeDurableUpdates();
  }

  /**
   * Count local updates, and notify subscribers on *any* durable change.
   *
   * @internal
   *
   * ## Why notification lives here and not in `commit()`
   *
   * A durable change reaches this document from three places: a local `commit`,
   * a restore from IndexedDB, and a remote update. Notifying only from `commit`
   * means subscribers never hear about the other two -- so a view that rendered
   * from `read()` and re-rendered on `subscribe` would show an empty board
   * forever after a reload, and would silently ignore every collaborator's edit.
   *
   * That is why `openBoard` can hand back a document before the stored state has
   * loaded: the arrival of that state is an update like any other.
   *
   * The *count* is still local-only, so a test asserting "the drag produced no
   * updates" cannot be satisfied by somebody else's traffic.
   */
  /**
   * Bumped on **every** durable transaction — local, remote, or `load()`.
   *
   * Distinct from `localRevision`, which counts this client's own commits and is part
   * of the public surface. This one exists only to invalidate a cached snapshot, so it
   * has to move for writes this client did not make: a remote update that lands while
   * nobody is typing would otherwise leave a stale snapshot in place, and the next
   * `read()` would hand back a board that is missing somebody's note.
   *
   * Bumped at the top of the update handler rather than at the end, so that
   * `notify()` — which runs inside the same handler — already sees the new value and
   * rebuilds. Bumping it afterwards would mean every subscriber was handed a snapshot
   * of the *previous* state, which is a bug that only appears under collaboration.
   */
  private documentRevision = 0;

  /**
   * The memoised snapshot, and the revision it describes.
   *
   * `-1` rather than `undefined` so the very first read cannot match a stale cache
   * with no snapshot behind it.
   */
  private cachedRevision = -1;
  private cachedSnapshot: BoardSnapshot | undefined;

  private observeDurableUpdates(): void {
    this.rawYdoc.on("update", (_update: Uint8Array, origin: unknown) => {
      // First, so `notify()` below rebuilds rather than re-serving the previous state.
      this.documentRevision += 1;
      if (origin === LOCAL_ORIGIN) {
        this.durableUpdateCount += 1;
      }
      this.notify();
      for (const listener of this.updateListeners) {
        listener();
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Reading                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * A consistent snapshot of the durable board.
   *
   * Read-only by construction: the objects are fresh plain objects built by
   * `fromYMap`, so a caller cannot reach through them to a live Yjs value and
   * mutate it. That is the same reason `structure.ts` converts on the way out.
   *
   * ## Why `assets` is a getter and not a fifth walk
   *
   * `read()` is on the hot path, and the argument for that is not a hunch.
   * `notify()` calls it on *every* durable transaction, and
   * `apps/web/board/board.ts` attaches a debounced autosave to `doc.onUpdate`, so
   * a keystroke in a text note reaches this function once per subscriber.
   *
   * An O(assets) walk in here would therefore be charged to a board with 50
   * images for 50 references that almost no transaction touches. The cost is not
   * dramatic -- an asset node is three to five primitives -- which is exactly why
   * it is worth being deliberate: a cost that small is the kind that lands as an
   * unexplained 3% on a profile rather than as a bug somebody can point at, and
   * it would grow with the one collection on a board that never shrinks. The
   * assets map is also the only part of the document that a *renderer* never
   * looks at, so it is the worst possible thing to make unconditional in the one
   * call every renderer makes.
   *
   * So the trade is: give up "this field was read at the instant `read()`
   * returned" for `assets` alone, and get a constant-cost `read()` for every
   * consumer that does not export.
   *
   * What that costs, stated plainly rather than waved at:
   *
   * - The window is one synchronous access. Every real consumer -- an exporter
   *   building a manifest, a test asserting on a board -- reads `assets` before
   *   yielding, and in a single-threaded runtime nothing can commit in between,
   *   so the value is the document as of the `read()`. A consumer that holds a
   *   snapshot across an `await` and *then* reads `assets` can see an asset added
   *   in the gap. The failure is a manifest naming an asset whose element is not
   *   in `board.json`; it is untidy, not lossy, and content addressing means the
   *   bytes it names are bytes the store already holds.
   * - Memoised, so a second read is the same object rather than a second walk, and
   *   so the window cannot be re-entered by a consumer that probes twice.
   * - `assets` is a plain enumerable getter, which means `JSON.stringify` and
   *   `toEqual` on a snapshot *will* walk it. That is intentional -- a snapshot
   *   that hid a field from a deep comparison would be a worse trap than the cost
   *   -- and `serializeBoard` builds a fresh five-field object, so the autosave
   *   and `board.json` never touch it (ADR-0018 outcome 2 depends on that, and
   *   `assets.test.ts` asserts it).
   */
  read(): BoardSnapshot {
    /*
     * Memoised against the document revision.
     *
     * ## The measurement this is for
     *
     * `yarn bench:read`, 10,000 elements: `read()` cost **16.0 ms** and retained
     * **17.2 MB**, and there are two of them per keystroke — `notify()` builds one for
     * its subscribers and `push()` builds another to see what the document committed.
     * Two frame budgets before the renderer draws anything. Meanwhile
     * `elementOrder()` answers the same question in **0.097 ms**, because it does not
     * walk the elements. See [ADR-0020](../../../docs/adr/0020-stop-walking-the-whole-document-to-read-it.md).
     *
     * The single sharpest way to see it: the same transaction costs **0.48 ms with no
     * subscriber and 16.1 ms with one**. `notify()` returns before it reads when nothing
     * is listening, so that 15.6 ms delta is entirely this function.
     *
     * Four callers read per transaction — `notify()`, `push()`'s re-read,
     * `onDocumentChanged()`'s echo guard, and the debounced autosave — and with the
     * cache they share one walk. Nothing at any call site changes.
     *
     * ## Why the revision rather than a dirty flag
     *
     * A boolean would need every write path to set it, and the write paths are the
     * thing rule 1 and [ADR-0016](0016-enforce-the-write-path-with-a-proxy.md) exist
     * to protect. A counter in the one place every durable transaction already passes
     * through cannot be forgotten, including by the remote-apply path nobody remembers
     * to instrument.
     *
     * ## Why each field is a memoised getter
     *
     * `assets` already was one, and the reason generalises: most callers want one
     * field. `this.publishRecords(this.doc.read().collections)` exists solely to hand
     * a collections array to a function that ignores everything else on the snapshot,
     * and it was paying for every element on the board. Measured before this change,
     * `read().collections` on an empty board cost 19.7 ms.
     *
     * The consequence, stated plainly because it is a real semantic change: **a
     * snapshot is no longer a point-in-time view.** Every field in one `read()` used
     * to describe the same instant; now `read().elements` can describe a slightly
     * later one than `read().meta` if a transaction lands in between. Each field is
     * individually consistent and each is memoised, so no caller can see a torn value
     * *within* a field — and a caller asking a question later arguably wants the
     * later answer. `assets` has behaved this way since it was added.
     */
    if (this.cachedSnapshot && this.cachedRevision === this.documentRevision) {
      return this.cachedSnapshot;
    }

    const nodes = this.nodes;

    // One slot per field, assigned on first access. See the note above on why this is
    // a single window rather than a re-read: a snapshot that changed under a caller
    // holding it would be worse than one that was merely stale on arrival.
    let elements: FiroElement[] | undefined;
    let elementOrder: string[] | undefined;
    let collections: Collection[] | undefined;
    let records: FiroRecord[] | undefined;
    let meta: Record<string, unknown> | undefined;
    let assets: Record<string, AssetReference> | undefined;

    /*
     * Bound here rather than as `this.readAssets()` in the getter, because `this`
     * inside an object-literal getter is the *snapshot*, not the document -- so the
     * obvious spelling is a `TypeError: this.readAssets is not a function` the first
     * time anything reads the field. That was noted on the original `assets` getter
     * and reintroduced verbatim while making the other five fields lazy, which is
     * what a comment that only explains the code rather than the trap invites.
     */
    const readAssets = (): Record<string, AssetReference> => this.readAssets();

    const snapshot: BoardSnapshot = {
      get elements(): FiroElement[] {
        elements ??= freezeEach(readAllElements(nodes));
        return elements;
      },
      get elementOrder(): string[] {
        elementOrder ??= frozen(nodes.elementOrder.toArray());
        return elementOrder;
      },
      get collections(): Collection[] {
        collections ??= freezeEach(readAllCollections(nodes));
        return collections;
      },
      get records(): FiroRecord[] {
        records ??= freezeEach(readAllRecords(nodes));
        return records;
      },
      get meta(): Record<string, unknown> {
        meta ??= frozen(fromYMap(nodes.meta));
        return meta;
      },
      get assets(): Record<string, AssetReference> {
        assets ??= frozen(readAssets());
        return assets;
      },
    };

    this.cachedSnapshot = snapshot;
    this.cachedRevision = this.documentRevision;
    return snapshot;
  }

  /**
   * Every asset reference this board holds, keyed by `fileId`.
   *
   * The explicit reader, and what an exporter should call: it says plainly that
   * walking the assets is a thing the caller decided to do, rather than something
   * that happened as a side effect of asking for a snapshot.
   *
   * Distinct from `read()` on purpose -- see the note there -- and also distinct
   * from the asset *store*, which holds the bytes and is reachable only through
   * `getAssetBytes` / `hasAsset` in `library.ts`.
   */
  readAssets(): Record<string, AssetReference> {
    return readAllAssets(this.nodes);
  }

  /** The z-order, as element ids. */
  elementOrder(): string[] {
    return this.nodes.elementOrder.toArray();
  }

  /** One element by id, or null. */
  element(id: string): FiroElement | null {
    const node = this.nodes.elements.get(id);
    return node ? (fromYMap(node) as unknown as FiroElement) : null;
  }

  /** One record by id, or null. */
  record(id: string): FiroRecord | null {
    const node = this.nodes.records.get(id);
    return node ? (fromYMap(node) as unknown as FiroRecord) : null;
  }

  /**
   * Subscribe to durable changes.
   *
   * Fires on transactions, not on elements, so a commit touching four elements
   * fires once. A per-element subscription would be more convenient and would
   * make it possible to write a renderer that reacts to elements but forgets to
   * react to order changes -- which is the bug where a board reorders visually
   * but hit-testing still uses the old order.
   */
  subscribe(listener: (snapshot: BoardSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** @internal Called by the write path after a transaction lands. */
  private notify(): void {
    if (!this.listeners.size) {
      return;
    }
    const snapshot = this.read();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  /** Subscribe to "the document changed at all", without the snapshot. */
  onUpdate(listener: () => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  /**
   * How many durable updates this client has produced.
   *
   * The number the ephemeral/durable test asserts on. Remote applies and the
   * initial load are excluded on purpose: they are not this client's writes, and
   * counting them would let a bug hide behind a peer's traffic.
   */
  get durableUpdates(): number {
    return this.durableUpdateCount;
  }

  /* ---------------------------------------------------------------------- */
  /* The ephemeral side                                                      */
  /* ---------------------------------------------------------------------- */

  /**
   * Update ephemeral state. Never touches the document.
   *
   * This is what a pointer-move handler calls, and it is deliberately the
   * cheapest thing in the package: no transaction, no history entry, no
   * persistence write. Everything that makes a CRDT unusable under a drag is
   * absent from it by construction rather than by discipline.
   */
  setEphemeral(patch: EphemeralPatch): void {
    this.ephemeralState = applyEphemeralPatch(this.ephemeralState, patch);
    // Awareness, not the document. This single line is the whole of rule 1's
    // implementation; the test in `ephemeral.test.ts` is what proves it holds.
    this.awareness.setLocalStateField(AWARENESS_KEY, this.ephemeralState);
  }

  /** This client's ephemeral state. */
  getEphemeral(): EphemeralState {
    return this.ephemeralState;
  }

  /**
   * Every collaborator's ephemeral state, keyed by client id.
   *
   * A collaborator that has disconnected is absent, which is the behaviour that
   * makes cursors self-cleaning: awareness drops a peer's state when the
   * connection closes, so there is nothing to garbage-collect on our side.
   */
  peersEphemeral(): Map<number, EphemeralState> {
    const out = new Map<number, EphemeralState>();
    this.awareness.getStates().forEach((state, clientId) => {
      const value = (state as Record<string, unknown>)[AWARENESS_KEY];
      if (value !== undefined) {
        out.set(clientId, value as EphemeralState);
      }
    });
    return out;
  }

  /* ---------------------------------------------------------------------- */
  /* The durable side                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Apply mutations. The only write path.
   *
   * Every mutation in one call is one transaction and therefore one undo step --
   * which is why a multi-element paste, a group move and a delete-selection are
   * each a single call rather than a loop.
   *
   * A no-op commit (nothing to change, or every target already in the requested
   * state) still opens a transaction, because Yjs cannot know that in advance.
   * It is worth knowing when comparing `durableUpdates` to a number you expected.
   */
  /**
   * Check a whole commit is applicable before any of it is applied.
   *
   * Only the *referential* checks live here -- a mutation naming something that
   * does not exist. Field-level coercion belongs to `@firo/schema` and already
   * happened on load, and re-validating it on every commit would cost a
   * ProseMirror parse per keystroke-sized edit.
   *
   * ## The pass has to be sequential, and the first version was not
   *
   * A single commit routinely creates and then updates: paste a note, group it,
   * style it, all in one call so it is one undo step. A validator that only asked
   * "is this in the document?" would refuse the update, because at *validation*
   * time the element is created three mutations later -- the document has not
   * been written to yet, and will not be until every check has passed.
   *
   * So this walks the mutations in order, carrying a set of ids the earlier ones
   * will have created. It mirrors what `applyMutation` will do, which is the only
   * way the two can agree.
   */
  private validate(mutations: readonly Mutation[]): void {
    const willHaveElements = new Set(this.nodes.elements.keys());
    const willHaveRecords = new Set(this.nodes.records.keys());
    const willHaveCollections = new Set(this.nodes.collections.keys());

    const absent = (present: ReadonlySet<string>, id: string, what: string) => {
      if (!present.has(id)) {
        throw new Error(
          `${what} names "${id}", which is not in the document. ` +
            `A concurrent delete may have removed it; re-read before committing.`,
        );
      }
    };

    for (const mutation of mutations) {
      switch (mutation.kind) {
        case "createElement":
          willHaveElements.add(mutation.element.id);
          break;
        case "createElements":
          for (const element of mutation.elements) {
            willHaveElements.add(element.id);
          }
          break;
        case "deleteElements":
        case "restoreElements":
          // A delete leaves a tombstone, so the id still resolves afterwards.
          break;
        case "updateElements":
          for (const update of mutation.updates) {
            absent(willHaveElements, update.id, "updateElements");
          }
          break;
        case "createRecord":
          willHaveRecords.add(mutation.record.id);
          break;
        case "createRecords":
          for (const record of mutation.records) {
            willHaveRecords.add(record.id);
          }
          break;
        case "archiveRecords":
        case "unarchiveRecords":
          break;
        case "updateRecords":
          for (const update of mutation.updates) {
            absent(willHaveRecords, update.id, "updateRecords");
          }
          break;
        case "createCollection":
          willHaveCollections.add(mutation.collection.id);
          break;
        case "updateCollection":
          absent(willHaveCollections, mutation.id, "updateCollection");
          break;
        case "deleteCollection":
          break;
        case "setMeta":
        case "setAsset":
        case "removeAsset":
          break;
      }
    }
  }

  commit(mutations: readonly Mutation[]): CommitResult {
    if (!Array.isArray(mutations)) {
      throw new TypeError(
        `commit() takes an array of mutations, got ${typeof mutations}.`,
      );
    }
    for (const mutation of mutations) {
      if (!isMutation(mutation)) {
        throw new TypeError(
          `Not a mutation: ${JSON.stringify(
            (mutation as { kind?: unknown })?.kind ?? mutation,
          )}. Mutations are untrusted input; commit() validates them.`,
        );
      }
    }

    /*
     * Validate everything *before* opening a transaction.
     *
     * Yjs does not roll back: a throw inside `transact`'s callback still leaves
     * every write that ran before it in the document. So a commit of
     * [create "ok", update "ghost"] that validated lazily would persist "ok" and
     * then throw -- the caller sees a failure and a document that is neither the
     * old state nor the new one. Checking first is the only way a rejected
     * commit leaves nothing behind.
     */
    this.validate(mutations);

    // The origin is what marks this transaction as ours, for the undo manager and
    // for the write guard. Both depend on it being here and nowhere else.
    this.guard.run(() =>
      this.rawYdoc.transact(() => {
        for (const mutation of mutations) {
          applyMutation(this.nodes, mutation);
        }
      }, LOCAL_ORIGIN),
    );

    this.localRevision += 1;
    // `notify()` is not called here: the transaction's own `update` event does it,
    // which is also what makes a restore and a remote apply notify their
    // subscribers. Calling it in both places would double every notification.

    return {
      changed: true,
      applied: mutations.length,
      localRevision: this.localRevision,
    };
  }

  /** The local commit counter. See `CommitResult.localRevision`. */
  get revision(): number {
    return this.localRevision;
  }

  /**
   * Load a serialised board into this document.
   *
   * ## Why this is tagged `LOAD_ORIGIN` and not `LOCAL_ORIGIN`
   *
   * The contents arrive with the board. They are not something the user did, so
   * they must not be an undo step -- otherwise the first Ctrl-Z after opening a
   * board empties it, which is the single most alarming thing a local-first app
   * can do on first use. It is also not `REMOTE_ORIGIN`, because a load is not a
   * peer's change and must not be excluded from a sync provider as one.
   *
   * ## What it does *not* do
   *
   * It does not validate. That is `@firo/schema`'s job and it must happen before
   * anything reaches the document: a file from a newer version has to be refused
   * with nothing written, and a validation failure has to leave the document
   * untouched. So the caller runs `loadBoard` and passes the result here, and
   * this method's only job is to put a validated board into Yjs.
   */
  load(board: BoardImport): void {
    const mutations: Mutation[] = [];

    for (const element of board.elements) {
      mutations.push({
        kind: "createElement",
        element: element as FiroElement,
      });
    }
    for (const collection of board.collections) {
      mutations.push({
        kind: "createCollection",
        collection: collection as Collection,
      });
    }
    for (const record of board.records) {
      mutations.push({
        kind: "createRecord",
        record: record as FiroRecord,
      });
    }
    if (board.meta && Object.keys(board.meta).length) {
      mutations.push({ kind: "setMeta", entries: board.meta });
    }

    this.guard.run(() =>
      this.rawYdoc.transact(() => {
        for (const mutation of mutations) {
          applyMutation(this.nodes, mutation);
        }
        if (board.elementOrder?.length) {
          // The file's z-order, applied last. Everything above appends in array
          // order, which is only correct when the file had no order to give.
          this.nodes.elementOrder.delete(0, this.nodes.elementOrder.length);
          this.nodes.elementOrder.insert(
            0,
            [
              ...board.elementOrder,
              // Anything the file listed in `elements` but not in `elementOrder`,
              // so a malformed file cannot hide an element by omitting it here.
              ...this.nodes.elements.keys(),
            ].filter((id, index, all) => all.indexOf(id) === index),
          );
        }
      }, LOAD_ORIGIN),
    );

    // Not counted in `durableUpdates`: a load is not this client's work. It does
    // notify, once, via the transaction's `update` event -- so a view that
    // subscribed before the load completed redraws, which is the whole reason
    // `openBoard` does not make callers wait for the stored state.
  }

  /* ---------------------------------------------------------------------- */
  /* Undo                                                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * An undo manager scoped to this client.
   *
   * Built here rather than exported as a raw `Y.UndoManager` so the origin tag
   * cannot be forgotten at the call site. `trackedOrigins` is the local tag and
   * nothing else, which is the mechanism behind "a collaborator's change never
   * appears in your undo stack".
   */
  createUndoManager(options?: { captureTimeout?: number }): Y.UndoManager {
    /*
     * The UndoManager starts its own transactions when it applies an undo, and
     * passes *itself* as the origin. So it has to be authorised -- but
     * authorised by identity, registered here, so nothing outside this module can
     * pass an arbitrary object and get past the guard.
     */
    const undoManager = new Y.UndoManager(this.rawYdoc, {
      // Yjs types this as `Set<any>`, so a `Set<unique symbol>` needs the cast.
      // The cast is safe in the sense that matters: the set is built here from
      // module-private symbols, so nothing outside this module can widen it.
      trackedOrigins: new Set<unknown>([LOCAL_ORIGIN]),
      // Yjs's default is 500 ms. A drag commits on pointer-up and must be one
      // step, not one per frame, so this is set per tool by the caller rather
      // than globally -- see docs/trd/03-crdt-and-sync.md "Undo".
      captureTimeout: options?.captureTimeout ?? 500,
    });
    this.guard.authoriseOrigin(undoManager);
    return undoManager;
  }

  /** Destroy the document and its awareness. Call before dropping the reference. */
  destroy(): void {
    this.awareness.destroy();
    this.listeners.clear();
    this.updateListeners.clear();
    // Authorised explicitly: `destroy` is teardown rather than mutation, and
    // letting anyone call it through `ydoc` would let them close the document
    // out from under a live board.
    this.guard.run(() => this.rawYdoc.destroy());
  }
}

/* -------------------------------------------------------------------------- */
/* Mutation application                                                        */
/* -------------------------------------------------------------------------- */

const now = (): number => Date.now();

/**
 * A fresh per-change `versionNonce`.
 *
 * `Math.random` rather than a counter: the field exists to break ties when two
 * clients produce the same `version`, and a counter is per-client by construction,
 * so it would collide exactly when it is needed.
 */
const freshNonce = (): number => Math.floor(Math.random() * 2 ** 31);

/**
 * Which changes count as "the element moved".
 *
 * `version` and `versionNonce` only need to differ for a *change*; bumping them
 * when a comment is added would make a text edit lose a concurrent move, because
 * the whole element is replaced and last-writer-wins would then pick the text
 * edit. So the fields that describe merge priority are only bumped when something
 * merge-relevant actually changed.
 */
const MERGE_RELEVANT: ReadonlySet<string> = new Set([
  "x",
  "y",
  "width",
  "height",
  "angle",
  "containerId",
  "frameId",
  "index",
  "groupIds",
]);

const writeElementFields = (
  node: ElementNode,
  changes: Record<string, unknown>,
  timestamp: number,
  bumpMergeFields: boolean,
): void => {
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) {
      // An explicit `undefined` means "remove this key", which is a real
      // operation -- optional fields are removed, not set to null. Distinct
      // because `null` is a meaningful value for several of them.
      node.delete(key);
    } else {
      node.set(key, isPlainObject(value) ? toYMap(value) : (value as never));
    }
  }

  if (bumpMergeFields) {
    const current = node.get("version");
    node.set("version", (typeof current === "number" ? current : 0) + 1);
    node.set("versionNonce", freshNonce());
  }
  node.set("updated", timestamp);
};

const applyMutation = (nodes: DocStructure, mutation: Mutation): void => {
  const timestamp = now();

  switch (mutation.kind) {
    case "createElement":
    case "createElements": {
      const incoming =
        mutation.kind === "createElement"
          ? [mutation.element]
          : mutation.elements;
      // `Y.Array` has no `includes`, and calling `toArray()` inside the loop
      // would make a 200-element paste quadratic. Two passes over the order
      // instead: the set for membership, the loop for the writes.
      const alreadyOrdered = new Set(nodes.elementOrder.toArray());

      for (const element of incoming) {
        /*
         * The defaults are read from the *input object*, never from the built
         * Y.Map. `toYMap` produces a *detached* map -- it is only integrated when
         * the `set` three lines below attaches it to a document -- and a detached
         * Y.Map answers `get` with `undefined` for everything. Reading defaults
         * from it therefore looks like "the caller supplied nothing" for every
         * field, silently overwriting a `created` timestamp the caller did
         * supply. An import would have re-stamped the whole board with today's
         * date, which is both wrong and invisible.
         */
        const incoming = element as unknown as Record<string, unknown>;
        const node = toYMap(incoming);
        /*
         * `created`, `updated` and `version` are stamped only when the caller did
         * not supply them.
         *
         * A caller that omits them is drawing a note *now*, and `now` is right.
         * A caller that supplies them is loading a board, and re-stamping would
         * mean every import reset the whole board's history to the moment it was
         * imported -- data loss wearing the costume of a default. The round-trip
         * criterion is why this is conditional.
         */
        if (incoming.created === undefined) {
          node.set("created", timestamp);
        }
        if (incoming.updated === undefined) {
          node.set("updated", timestamp);
        }
        if (incoming.version === undefined) {
          node.set("version", 1);
        }
        nodes.elements.set(element.id, node);
        if (
          mutation.kind === "createElement" ||
          !alreadyOrdered.has(element.id)
        ) {
          nodes.elementOrder.push([element.id]);
          alreadyOrdered.add(element.id);
        }
      }
      return;
    }

    case "updateElements": {
      for (const update of mutation.updates) {
        const node = nodes.elements.get(update.id);
        if (!node) {
          // Unreachable: `validate()` runs first, and Yjs applies a transaction
          // synchronously, so nothing can remove the element in between. Kept
          // because a silent skip here would be a data-loss bug if that ever
          // stopped being true.
          throw new Error(
            `updateElements names "${update.id}", which vanished mid-commit.`,
          );
        }
        const changes = update.changes as Record<string, unknown>;
        const bump = Object.keys(changes).some((key) =>
          MERGE_RELEVANT.has(key),
        );
        writeElementFields(node, changes, timestamp, bump);
      }
      return;
    }

    case "deleteElements": {
      for (const id of mutation.ids) {
        const node = nodes.elements.get(id);
        if (!node) {
          continue;
        }
        node.set("isDeleted", true);
        node.set("deletedAt", timestamp);
        node.set("updated", timestamp);
        // Removed from the order array as well as tombstoned. The tombstone is
        // what makes it restorable; the array entry is what makes it invisible
        // to the renderer, which would otherwise have to filter every frame.
        const position = nodes.elementOrder.toArray().indexOf(id);
        if (position !== -1) {
          nodes.elementOrder.delete(position, 1);
        }
      }
      return;
    }

    case "restoreElements": {
      for (const id of mutation.ids) {
        const node = nodes.elements.get(id);
        if (!node) {
          continue;
        }
        node.set("isDeleted", false);
        node.delete("deletedAt");
        node.set("updated", timestamp);
        if (!nodes.elementOrder.toArray().includes(id)) {
          nodes.elementOrder.push([id]);
        }
      }
      return;
    }

    case "reorderElements": {
      const present = new Set(nodes.elements.keys());
      // Unknown ids are dropped rather than inserted: an order array containing
      // an id with no element is a corrupt z-order that every reader then has
      // to defend against.
      const order = mutation.ids.filter((id) => present.has(id));
      if (order.length !== nodes.elementOrder.length) {
        // Anything the caller did not mention keeps its relative position at the
        // end, so a partial reorder does not silently drop elements.
        for (const id of nodes.elementOrder.toArray()) {
          if (!order.includes(id)) {
            order.push(id);
          }
        }
      }
      nodes.elementOrder.delete(0, nodes.elementOrder.length);
      nodes.elementOrder.insert(0, order);
      return;
    }

    case "createCollection": {
      nodes.collections.set(
        mutation.collection.id,
        toYMap(mutation.collection as unknown as Record<string, unknown>),
      );
      return;
    }

    case "updateCollection": {
      const node = nodes.collections.get(mutation.id);
      if (!node) {
        // Unreachable; see the note in `updateElements`.
        throw new Error(
          `updateCollection names "${mutation.id}", which vanished mid-commit.`,
        );
      }
      const changes = mutation.changes as Record<string, unknown>;
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined) {
          node.delete(key);
        } else {
          node.set(
            key,
            isPlainObject(value) ? toYMap(value) : (value as never),
          );
        }
      }
      const current = node.get("version");
      node.set("version", (typeof current === "number" ? current : 0) + 1);
      return;
    }

    case "deleteCollection": {
      // The records that referenced it are deliberately left alone. Their values
      // are keyed by `Column.key`, so restoring the collection brings the data
      // back; cascading would be the one place the model could not undo a
      // decision it did not make.
      nodes.collections.delete(mutation.id);
      return;
    }

    case "createRecord":
    case "createRecords": {
      const incoming =
        mutation.kind === "createRecord" ? [mutation.record] : mutation.records;
      for (const record of incoming) {
        // Same reason as `createElement`: read the default from the input, not
        // from the detached map.
        const incoming = record as unknown as Record<string, unknown>;
        const node = toYMap(incoming);
        // Same rule as `createElement`: stamp only what the caller left out.
        if (incoming.created === undefined) {
          node.set("created", timestamp);
        }
        if (incoming.updated === undefined) {
          node.set("updated", timestamp);
        }
        nodes.records.set(record.id, node);
        if (!nodes.recordOrder.toArray().includes(record.id)) {
          nodes.recordOrder.push([record.id]);
        }
      }
      return;
    }

    case "updateRecords": {
      for (const update of mutation.updates) {
        const node = nodes.records.get(update.id);
        if (!node) {
          // Unreachable; see the note in `updateElements`.
          throw new Error(
            `updateRecords names "${update.id}", which vanished mid-commit.`,
          );
        }
        const changes = update.changes as Record<string, unknown>;
        for (const [key, value] of Object.entries(changes)) {
          if (value === undefined) {
            node.delete(key);
          } else {
            node.set(
              key,
              isPlainObject(value) ? toYMap(value) : (value as never),
            );
          }
        }
        node.set("updated", timestamp);
      }
      return;
    }

    case "archiveRecords":
    case "unarchiveRecords": {
      const archived = mutation.kind === "archiveRecords";
      for (const id of mutation.ids) {
        const node = nodes.records.get(id);
        if (node) {
          node.set("archived", archived);
          node.set("updated", timestamp);
        }
      }
      return;
    }

    case "setMeta": {
      for (const [key, value] of Object.entries(mutation.entries)) {
        if (value === undefined) {
          nodes.meta.delete(key);
        } else {
          nodes.meta.set(
            key,
            isPlainObject(value) ? toYMap(value) : (value as never),
          );
        }
      }
      return;
    }

    case "setAsset": {
      // A reference, never the bytes. See `AssetReference`.
      const existing = nodes.assets.get(mutation.id);
      const node = existing ?? new Y.Map<unknown>();
      const reference: AssetReference = mutation.reference;
      node.set("hash", reference.hash);
      node.set("mimeType", reference.mimeType);
      node.set("bytes", reference.bytes);
      if (reference.width !== undefined) {
        node.set("width", reference.width);
      }
      if (reference.height !== undefined) {
        node.set("height", reference.height);
      }
      if (!existing) {
        nodes.assets.set(mutation.id, node);
      }
      return;
    }

    case "removeAsset": {
      // The reference is removed. The blob in IndexedDB is not -- it is
      // content-addressed, so another element or another board may reference it,
      // and garbage collection is a separate decision with its own evidence
      // about what is still reachable.
      nodes.assets.delete(mutation.id);
    }
  }
};

/** The serialised form `FiroDoc.load` accepts. Mirrors `serializeBoard`. */
export type BoardImport = {
  elements: readonly unknown[];
  collections: readonly unknown[];
  records: readonly unknown[];
  /** z-order, front to back. Optional for a bare paste; required in a file. */
  elementOrder?: readonly string[];
  meta?: Record<string, unknown>;
};

export { LOCAL_ORIGIN, REMOTE_ORIGIN, LOAD_ORIGIN } from "./origin.js";
export {
  UnauthoredWriteError,
  WriteGuard,
  guardedDoc,
  MUTATING,
} from "./guard.js";
export { Awareness } from "y-protocols/awareness.js";
