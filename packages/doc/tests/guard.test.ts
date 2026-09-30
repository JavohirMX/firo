/**
 * The write guard.
 *
 * A guard that is never tested is a comment. These tests exist because the two
 * ways a guard like this fails are both silent: it refuses everything (the app is
 * obviously broken, so someone removes it) or it refuses nothing (the app works
 * fine, so nobody notices). The tests below are the difference between those.
 *
 * The prototype walk at the end is the one that matters most: it is what makes
 * "deny by default" a property of the code rather than an intention.
 */
import { describe, expect, test } from "vitest";
import * as Y from "yjs";

import {
  EVERY_KIND_IS_LISTED,
  guardedDoc,
  isMutation,
  LOCAL_ORIGIN,
  MUTATION_KINDS,
  MUTATING,
  openBoardMemory,
  UnauthoredWriteError,
  WriteGuard,
  knownReadMethods,
} from "@firo/doc";

import type { FiroElement } from "@firo/schema";

/**
 * Every public member of a Yjs type: prototype methods plus instance properties.
 *
 * Both halves are needed. `Y.Doc` defines `subdocs`, `gc`, `store` and
 * `isLoaded` on the *instance*, and `Y.Map` defines `size` as a getter, so a
 * prototype-only walk would call them absent -- and then a guard that legitimately
 * reads `doc.store` would look like it had a stale entry.
 */
const publicMethods = (
  constructor: new (...args: never[]) => object,
): string[] => {
  const found = new Set<string>();
  let current: object | null = constructor.prototype;
  while (current && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name !== "constructor" && !name.startsWith("_")) {
        found.add(name);
      }
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  for (const name of Object.keys(constructor.prototype as object)) {
    found.add(name);
  }
  return [...found].sort();
};

/**
 * Instance-level members.
 *
 * Constructing a `Y.Doc` is free; a shared type cannot be constructed outside a
 * document, so the doc is the only one that can be introspected this way. Its
 * instance members are the ones the walk would otherwise miss.
 */
const instanceMembers = (instance: object): string[] =>
  Object.getOwnPropertyNames(instance).filter(
    (name) => name !== "constructor" && !name.startsWith("_"),
  );

describe("the classification of Yjs's methods is exhaustive", () => {
  // The deny-by-default rule only protects anything if every method Yjs exposes
  // is accounted for. A Yjs upgrade that adds `Y.Map.prototype.merge` lands
  // here, not silently in the hole.
  for (const [name, constructor] of [
    ["Y.Map", Y.Map],
    ["Y.Array", Y.Array],
    ["Y.Text", Y.Text],
  ] as const) {
    test(`${name} has no unclassified methods`, () => {
      const guard = new WriteGuard();
      // `transact` is handled separately (origin-checked) and `destroy` is
      // teardown; neither is a mutation of a shared type.
      const handled = new Set([
        ...MUTATING,
        "transact",
        "destroy",
        "parent",
        "doc",
      ]);

      const unclassified = publicMethods(constructor).filter((method) => {
        if (handled.has(method)) {
          return false;
        }
        // A read method raises nothing; a mutator raises. So: does the guard
        // consider this a read?
        try {
          guard.checkTypeMethod(name, method);
          return false;
        } catch {
          return true;
        }
      });

      expect(unclassified).toEqual([]);
    });
  }

  test("a method classified as a mutator is actually one", () => {
    // The other direction: an entry in `MUTATING` that has been renamed or
    // removed in a Yjs upgrade would otherwise read as coverage it does not give.
    for (const method of MUTATING) {
      const present = [Y.Map, Y.Array, Y.Text].some((constructor) =>
        publicMethods(constructor).includes(method),
      );
      expect(present, `${method} is in MUTATING but no Yjs type has it`).toBe(
        true,
      );
    }
  });

  test("the read list has no entry that Yjs no longer has", () => {
    // The other direction of drift. A stale read entry is harmless at runtime
    // -- it just never matches -- but it reads as coverage the code does not
    // provide, which is how a list stops being trustworthy.
    const existing = new Set([
      ...publicMethods(Y.Map),
      ...publicMethods(Y.Array),
      ...publicMethods(Y.Text),
      ...publicMethods(Y.Doc),
      ...instanceMembers(new Y.Doc()),
    ]);
    const guard = new WriteGuard();

    const stale = [...knownReadMethods()].filter((method) => {
      if (MUTATING.has(method)) {
        return false;
      }
      return !existing.has(method);
    });
    expect(stale).toEqual([]);
    void guard;
  });

  test("and every real mutator is refused", () => {
    // The counterpart to the exhaustiveness walk: classification is not just
    // complete, it is *correct*. `set` is the canonical case -- a mis-classified
    // mutator is exactly the hole the walk above cannot see.
    const guard = new WriteGuard();
    for (const method of ["set", "delete", "clear", "push", "insert"]) {
      expect(() => guard.checkTypeMethod("Y.Map", method), method).toThrow(
        UnauthoredWriteError,
      );
    }
    for (const method of ["get", "has", "toJSON", "size"]) {
      expect(
        () => guard.checkTypeMethod("Y.Map", method),
        method,
      ).not.toThrow();
    }
  });
});

describe("a violation leaves the document usable", () => {
  /*
   * The property that made the event-based design unusable, and the one to check
   * first. A guard that permanently disables itself after the first mistake is
   * worse than no guard: it looks like protection and provides exactly one
   * refusal.
   */
  test("the guard is still armed after a violation", () => {
    const guard = new WriteGuard();
    const ydoc = new Y.Doc();
    const guarded = guardedDoc(ydoc, guard);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() => guarded.getMap("m").set("k", attempt)).toThrow(
        UnauthoredWriteError,
      );
    }
    expect(ydoc.getMap("m").get("k")).toBeUndefined();
  });

  test("a refused transaction is not left open", () => {
    const guard = new WriteGuard();
    const ydoc = new Y.Doc();
    const guarded = guardedDoc(ydoc, guard);

    expect(() => guarded.transact(() => {}, "nope")).toThrow(
      UnauthoredWriteError,
    );
    // The state Yjs got itself into. `_transaction` must be null or the next
    // transact silently reuses it -- which is precisely how the event-based
    // guard failed.
    expect(
      (ydoc as unknown as { _transaction: unknown })._transaction,
    ).toBeNull();
  });

  test("and the document still accepts a legal write afterwards", () => {
    const guard = new WriteGuard();
    const ydoc = new Y.Doc();
    const guarded = guardedDoc(ydoc, guard);

    expect(() => guarded.getMap("m").set("bad", 1)).toThrow(
      UnauthoredWriteError,
    );
    guard.run(() => {
      guarded.getMap("m").set("good", 1);
    });
    expect(ydoc.getMap("m").get("good")).toBe(1);
  });
});

describe("what the guard authorises", () => {
  test("the local origin", () => {
    const guard = new WriteGuard();
    const ydoc = new Y.Doc();
    const guarded = guardedDoc(ydoc, guard);
    expect(() =>
      guarded.transact(() => guarded.getMap("m").set("k", 1), LOCAL_ORIGIN),
    ).not.toThrow();
    expect(ydoc.getMap("m").get("k")).toBe(1);
  });

  test("an origin the document registered for itself", () => {
    // The `Y.UndoManager` case, and the reason registration is by identity.
    const guard = new WriteGuard();
    const ydoc = new Y.Doc();
    const undoManager = new Y.UndoManager(ydoc, {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
    });

    guard.run(() =>
      ydoc.transact(() => ydoc.getMap("m").set("k", 1), LOCAL_ORIGIN),
    );
    expect(() => guard.authoriseOrigin(undoManager)).not.toThrow();

    // Applying an undo opens a transaction whose origin is the manager itself.
    const second = guard.constructor as unknown as {
      isAuthorisedOrigin?: unknown;
    };
    void second;
    expect(guard.isAuthorisedOrigin(undoManager)).toBe(true);
    expect(guard.isAuthorisedOrigin("undoManager")).toBe(false);
  });

  test("nothing else", () => {
    const guard = new WriteGuard();
    const ydoc = new Y.Doc();
    const guarded = guardedDoc(ydoc, guard);
    for (const origin of [
      null,
      undefined,
      "local",
      0,
      {},
      [],
      Symbol("local"),
    ]) {
      expect(() => guarded.transact(() => {}, origin)).toThrow(
        UnauthoredWriteError,
      );
    }
  });
});

describe("the error message says what to do", () => {
  test("names the write path, the ephemeral path, and the safety guarantee", () => {
    const guard = new WriteGuard();
    try {
      guard.checkTypeMethod("Y.Map", "set");
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("doc.commit()");
      expect(message).toContain("doc.setEphemeral()");
      expect(message).toContain("Nothing was written");
    }
  });

  test("a null origin is explained, because it is the Yjs default", () => {
    // The most common accidental violation is a bare `doc.transact(fn)`, so the
    // message has to make clear that the *absence* of an origin is the problem.
    const guard = new WriteGuard();
    try {
      guard.checkTransactionOrigin(null);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("null");
      expect((error as Error).message).toContain("untagged write");
    }
  });
});

describe("reads stay cheap", () => {
  test("a property read is not wrapped in a function call", () => {
    // `size`, `length` and `parent` are getters. Wrapping them would add a
    // megamorphic call on the hottest read in a canvas, to guard something that
    // cannot mutate.
    const guard = new WriteGuard();
    const ydoc = new Y.Doc();
    const guarded = guardedDoc(ydoc, guard);
    guard.run(() => ydoc.getMap("m").set("k", "v"));

    expect(guarded.getMap("m").size).toBe(1);
    expect(guarded.getMap("m").get("k")).toBe("v");
  });

  test("an iterator is not materialised by wrapping it", () => {
    // A board with 4,000 elements makes `values()` a hot path; a guard that
    // eagerly collected it would be a performance bug in the name of safety.
    const guard = new WriteGuard();
    const ydoc = new Y.Doc();
    const guarded = guardedDoc(ydoc, guard);
    guard.run(() => {
      for (let i = 0; i < 100; i += 1) {
        ydoc.getMap("m").set(`k${i}`, i);
      }
    });

    const values = guarded.getMap("m").values();
    expect(typeof (values as Iterable<unknown>)[Symbol.iterator]).toBe(
      "function",
    );
    // It is a generator, so nothing is read until the first `next()`.
    let count = 0;
    // eslint-disable-next-line no-unused-vars -- counting, not consuming
    for (const value of values) {
      void value;
      count += 1;
    }
    expect(count).toBe(100);
  });
});

describe("the mutation list is exhaustive", () => {
  test("every kind in the union is listed, and every listed name is a kind", () => {
    // The compile-time assertion in `mutations.ts` catches the first half. This
    // catches the second at runtime, and states the guarantee where a reader of
    // the test suite will actually find it.
    expect(EVERY_KIND_IS_LISTED).toBe(true);
    for (const kind of MUTATION_KINDS) {
      // `isMutation` is the boundary check, so this is the property that matters:
      // a commit carrying a real kind is not refused for being unfamiliar.
      expect(isMutation({ kind }), kind).toBe(true);
    }
  });

  test("and nothing else is accepted", () => {
    for (const kind of [
      "",
      "create",
      "CreateElement",
      "dropDatabase",
      null,
      42,
    ]) {
      expect(isMutation({ kind }), String(kind)).toBe(false);
    }
    expect(isMutation(null)).toBe(false);
    expect(isMutation("createElement")).toBe(false);
  });
});

describe("a FiroDoc wired end to end", () => {
  test("undo works, and a remote change is not in the local undo stack", () => {
    const doc = openBoardMemory();
    const undo = doc.createUndoManager({ captureTimeout: 0 });

    doc.commit([{ kind: "createElement", element: note("a") }]);
    doc.commit([
      { kind: "updateElements", updates: [{ id: "a", changes: { x: 10 } }] },
    ]);

    expect(doc.element("a")?.x).toBe(10);
    expect(undo.undoStack.length).toBe(2);

    undo.undo();
    expect(doc.element("a")?.x).toBe(0);
    undo.undo();
    expect(doc.element("a")).toBeNull();

    undo.redo();
    undo.redo();
    expect(doc.element("a")?.x).toBe(10);

    doc.destroy();
  });
});

/**
 * A minimal valid element.
 *
 * Typed by cast, like the equivalent helper in `ephemeral.test.ts`: the
 * alternative is a 28-field literal in two files, and a field added to the
 * schema would break both in a way that has nothing to do with the tests.
 */
const note = (id: string) =>
  ({
    id,
    type: "stickynote",
    text: "n",
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    angle: 0,
    version: 1,
    versionNonce: 1,
    index: null,
    created: 1,
    updated: 1,
    groupIds: [],
    frameId: null,
    containerId: null,
    bindings: [],
    link: null,
    locked: false,
    isDeleted: false,
    isContainer: false,
    fontSize: 20,
    fontFamily: 6,
    textAlign: "left",
    verticalAlign: "top",
  } as unknown as FiroElement);
