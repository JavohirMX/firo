/**
 * The write guard.
 *
 * ## Why this is a Proxy and not a `beforeTransaction` listener
 *
 * The obvious implementation is a `beforeTransaction` hook that throws when the
 * origin is unrecognised. **It does not work, and it fails open.** Yjs emits
 * `beforeTransaction` *outside* the `try` in `transact()`:
 *
 * ```js
 * if (doc._transaction === null) {
 *   doc._transaction = new Transaction(doc, origin, local)
 *   doc.emit('beforeTransaction', [...])   // <- throws here
 * }
 * try { result = f(doc._transaction) } finally { doc._transaction = null }
 * ```
 *
 * A throw at that emit skips the `finally`, so `doc._transaction` stays set. The
 * next `transact` sees a non-null `_transaction`, takes the `initialCall ===
 * false` path, and **never emits the event again**. One violation permanently
 * disables the guard, and every subsequent write goes through unchecked. That is
 * verified in `guard.test.ts`, because it is the kind of thing that looks like
 * enforcement and is the opposite.
 *
 * A Proxy refuses *before* the write, so a violation leaves the document both
 * untouched and usable -- and the next violation is caught too.
 *
 * ## Why the deny-list is deny-by-default
 *
 * `checkTypeMethod` refuses a method that is not on the read allowlist, rather
 * than allowing a method that is not on a mutation deny-list. A Yjs upgrade that
 * adds `Y.Map.prototype.merge` must therefore fail the test that walks the
 * prototypes, instead of quietly becoming a hole. A missing read entry breaks a
 * build; a missing deny entry silently loses the protection.
 */
import * as Y from "yjs";

import { isKnownOrigin } from "./origin.js";

/** Thrown when something other than the write path mutates the document. */
export class UnauthoredWriteError extends Error {
  constructor(readonly detail: string) {
    super(
      `Unauthored write: ${detail}. ` +
        `\`doc.commit()\` is the only write path; ephemeral state goes to ` +
        `\`doc.setEphemeral()\`, and reads go to \`doc.read()\`. ` +
        `Nothing was written and the document is still usable.`,
    );
    this.name = "UnauthoredWriteError";
  }
}

/**
 * Methods that only read.
 *
 * A method absent from this list and absent from `MUTATING` is refused, and the
 * test that walks Yjs's prototypes fails -- so an upgrade cannot add a mutator
 * without being noticed.
 */
const READ_ONLY: ReadonlySet<string> = new Set([
  // shared by Map / Array / Text
  "clone",
  "toJSON",
  "forEach",
  "observe",
  "observeDeep",
  "unobserve",
  "unobserveDeep",
  // Map
  "get",
  "has",
  "size",
  "keys",
  "values",
  "entries",
  // Array. `map` is here *and* in ENUMERATORS: being a read is what lets it past
  // `checkTypeMethod`, and being an enumerator is what makes its callback's
  // argument wrapped. The two lists answer different questions and both apply.
  // `filter`, `some`, `find`, `indexOf` and `includes` are deliberately absent --
  // this Yjs version's `Y.Array` has none of them, and listing methods that do
  // not exist is how a list stops being trustworthy. If an upgrade adds one, the
  // exhaustiveness test in `guard.test.ts` fails and it is added here on purpose.
  "map",
  "toArray",
  "slice",
  "length",
  // Text
  "toString",
  "toDelta",
  "getAttribute",
  "getAttributes",
  // parent link. `doc` is not listed: it is a getter on `AbstractType` that
  // `publicMethods` reports as an instance member of a shared type, and the proxy
  // returns non-function property reads without consulting this list at all.
  "parent",
  // Doc
  "get",
  "getArray",
  "getText",
  "getMap",
  "getXmlElement",
  "getXmlFragment",
  "getSubdocs",
  "getSubdocGuids",
  "subdocs",
  "load",
  "whenLoaded",
  "isLoaded",
  "store",
  "gc",
  "on",
  "once",
  "off",
  "emit",
  "toJSON",
]);

/**
 * Methods that mutate.
 *
 * Listed for two reasons: to make the intent legible, and so the prototype-walking
 * test can assert this set and `READ_ONLY` are *both* exhaustive rather than
 * either one alone being trusted.
 */
export const MUTATING: ReadonlySet<string> = new Set([
  "set",
  "delete",
  "clear",
  "insert",
  "insertEmbed",
  "push",
  "unshift",
  "applyDelta",
  "format",
  "setAttribute",
  "removeAttribute",
]);

/** `transact` is special-cased: it is legal, but only with a known origin. */
const TRANSACT = "transact";

/**
 * Per-document write authorisation.
 *
 * Holds the nesting depth of an in-progress authorised write, plus any extra
 * origins registered for this document. The second list exists for exactly one
 * caller -- `Y.UndoManager`, which starts its own transactions when it applies an
 * undo and passes *itself* as the origin. Without this, undo would be unusable,
 * and the obvious "fix" of widening the guard to allow any origin would remove
 * the only thing it protects.
 */
export class WriteGuard {
  private depth = 0;
  private readonly extraOrigins = new Set<object>();

  /**
   * Authorise one additional origin object for this document.
   *
   * Registration is by identity and only reachable from `createUndoManager`, so
   * it cannot be used to open the door from outside: a caller cannot pass a
   * guessed string, only an object this document handed out.
   */
  authoriseOrigin(origin: object): void {
    this.extraOrigins.add(origin);
  }

  /** Whether an origin is permitted to start a transaction. */
  isAuthorisedOrigin(origin: unknown): boolean {
    return isKnownOrigin(origin) || this.extraOrigins.has(origin as object);
  }

  /** Run `body` as an authorised write. */
  run<T>(body: () => T): T {
    this.depth += 1;
    try {
      return body();
    } finally {
      this.depth -= 1;
    }
  }

  /** Whether we are inside an authorised write. */
  get writing(): boolean {
    return this.depth > 0;
  }

  /** Refuse an unauthorised write to a shared type. */
  checkTypeMethod(typeName: string, method: string): void {
    if (this.writing) {
      return;
    }
    if (READ_ONLY.has(method)) {
      return;
    }
    if (MUTATING.has(method)) {
      throw new UnauthoredWriteError(
        `\`${typeName}.${method}()\` mutates the document`,
      );
    }
    // Deny by default. An unrecognised method on a Yjs shared type is treated
    // as a mutator until someone adds it to the read list and the prototype test
    // is satisfied.
    throw new UnauthoredWriteError(
      `\`${typeName}.${method}()\` is not a known read method, so it is refused ` +
        `rather than assumed safe. Add it to READ_ONLY in guard.ts if it is one.`,
    );
  }

  /** Refuse a transaction with an unrecognised origin. */
  checkTransactionOrigin(origin: unknown): void {
    if (this.writing && this.isAuthorisedOrigin(origin)) {
      return;
    }
    if (this.isAuthorisedOrigin(origin)) {
      return;
    }
    throw new UnauthoredWriteError(
      `a Yjs transaction was started with origin ${describeOrigin(origin)}`,
    );
  }
}

const describeOrigin = (origin: unknown): string => {
  if (origin === null) {
    return "null -- the Yjs default, which means an untagged write";
  }
  if (origin === undefined) {
    return "undefined";
  }
  if (typeof origin === "string") {
    return `"${origin}"`;
  }
  if (typeof origin === "symbol") {
    return "a symbol this package did not issue";
  }
  return `an object (${(origin as object).constructor?.name ?? "unknown"})`;
};

const isYType = (value: unknown): value is Y.AbstractType<unknown> =>
  value instanceof Y.AbstractType;

/**
 * Methods that hand shared types to a callback.
 *
 * `forEach` and `map` are how a renderer enumerates, so they are exactly how a
 * bug obtains a live node to mutate. Wrapping the *return* value of `forEach`
 * does nothing here, because `forEach` returns undefined -- the type comes back
 * through the callback. So the callback's own arguments have to be wrapped, and
 * a guard that claimed otherwise would leave the most likely hole open.
 */
const ENUMERATORS: ReadonlySet<string> = new Set(["forEach", "map", "filter"]);

type AnyFn = (...args: unknown[]) => unknown;

const wrapEnumerator = (
  member: AnyFn,
  typeName: string,
  property: string,
  guard: WriteGuard,
): AnyFn =>
  function wrapped(this: unknown, ...args: unknown[]) {
    guard.checkTypeMethod(typeName, property);
    const [callback, ...rest] = args;
    if (typeof callback !== "function") {
      // No callback: nothing to wrap, so call through unchanged rather than
      // inventing a wrapper that would change the return type.
      return member.apply(this, args);
    }
    const wrappedCallback = (value: unknown, ...restArgs: unknown[]) =>
      (callback as AnyFn)(wrapValue(value, guard), ...restArgs);
    return member.apply(this, [wrappedCallback, ...rest]);
  };

/**
 * Wrap a shared type so mutations are checked.
 *
 * Returned values are wrapped too, and that is not tidiness: a nested `Y.Map` is
 * where the interesting data lives (an element is a nested map), and Yjs starts
 * an implicit transaction for a mutation on an integrated type. Without wrapping
 * returns, `doc.ydoc.getMap("elements").get("el-1").set("x", 1)` would walk
 * straight past the guard.
 */
const wrapType = (
  value: Y.AbstractType<unknown>,
  guard: WriteGuard,
): unknown => {
  const typeName =
    value instanceof Y.Map
      ? "Y.Map"
      : value instanceof Y.Array
      ? "Y.Array"
      : value instanceof Y.Text
      ? "Y.Text"
      : "Y.AbstractType";

  return new Proxy(value, {
    get(target, property, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }

      if (property === TRANSACT) {
        return (body: () => unknown, origin?: unknown) =>
          guard.run(() =>
            (target as unknown as Y.Doc).transact(
              () => wrapReturns(body, guard),
              origin,
            ),
          );
      }

      const member = Reflect.get(target, property, receiver);

      if (typeof member !== "function") {
        // A property read: `size`, `length`, `parent`, `doc`. Safe by
        // construction -- none of them can change the document.
        return wrapValue(member, guard);
      }

      if (ENUMERATORS.has(property)) {
        return wrapEnumerator(member, typeName, property, guard);
      }

      return (...args: unknown[]) => {
        guard.checkTypeMethod(typeName, property);
        return wrapValue(member.apply(target, args), guard);
      };
    },
  });
};

/**
 * Wrap a method's arguments and its result.
 *
 * Arguments matter because `forEach` hands the callback a nested type, and that
 * type is the one the caller will then try to mutate.
 */
const wrapReturns = <T>(result: T, guard: WriteGuard): T =>
  wrapValue(result, guard) as T;

const wrapValue = (value: unknown, guard: WriteGuard): unknown => {
  if (isYType(value)) {
    return wrapType(value, guard);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => wrapValue(entry, guard));
  }
  if (value instanceof Map) {
    const out = new Map<unknown, unknown>();
    for (const [key, entry] of value) {
      out.set(key, wrapValue(entry, guard));
    }
    return out;
  }
  /*
   * A lazy iterator, wrapped lazily.
   *
   * `values()` and `entries()` return iterators over what can be a large
   * collection, so materialising them would be a real cost on a hot path. The
   * wrapper is a generator: nothing is read until the caller asks for it, and
   * each yielded value is wrapped on the way out.
   */
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Iterable<unknown>)[Symbol.iterator] === "function" &&
    !Array.isArray(value)
  ) {
    return (function* () {
      for (const entry of value as Iterable<unknown>) {
        yield wrapValue(entry, guard);
      }
    })();
  }
  return value;
};

/**
 * The guarded view of a `Y.Doc`.
 *
 * This is what `FiroDoc.ydoc` hands out. It reads and observes exactly like the
 * real document, refuses to mutate, and refuses to start a transaction without a
 * known origin.
 */
export const guardedDoc = (ydoc: Y.Doc, guard: WriteGuard): Y.Doc =>
  new Proxy(ydoc, {
    get(target, property, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }

      if (property === TRANSACT) {
        return (body: () => unknown, origin?: unknown) => {
          guard.checkTransactionOrigin(origin);
          return guard.run(() =>
            target.transact(() => wrapReturns(body(), guard), origin),
          );
        };
      }

      const member = Reflect.get(target, property, receiver);

      if (typeof member !== "function") {
        return member;
      }

      return (...args: unknown[]) => {
        // `destroy` is teardown, not mutation, and `FiroDoc.destroy` needs it.
        if (property !== "destroy") {
          guard.checkTypeMethod("Y.Doc", property);
        }
        return wrapValue(member.apply(target, args), guard);
      };
    },
  });

/** Exported for the prototype-walking test. */
export const knownReadMethods = (): ReadonlySet<string> => READ_ONLY;
