# Enforce the write path with a Proxy, not a `beforeTransaction` listener

Status: accepted · Date: 2026-09-30

## Context

`@firo/doc` (`packages/doc/src/doc.ts`) has one invariant that everything
else leans on:
**`commit()` is the only thing that writes to the Yjs document.** Ephemeral
state goes to awareness via `setEphemeral()`; everything else reads.

Two things depend on that being true rather than merely intended:

- **Undo locality.** `Y.UndoManager` tracks one origin, so a collaborator's
  change never lands in your undo stack.
- **The ephemeral/durable split** (rule 1 in
  [`../../AGENTS.md`](../../AGENTS.md)). A `pointermove` handler that reaches the
  document turns a five-second drag into hundreds of persisted, broadcast,
  undoable updates.

The obvious way to enforce it is a Yjs event listener:

```ts
ydoc.on("beforeTransaction", (tx) => {
  if (!isKnownOrigin(tx.origin)) throw new UnauthoredWriteError(tx.origin);
});
```

It reads like the right answer. It is not, and the reason is a property of
Yjs's own `transact()`:

```js
const transact = (doc, f, origin = null, local = true) => {
  let initialCall = false
  if (doc._transaction === null) {
    initialCall = true
    doc._transaction = new Transaction(doc, origin, local)
    doc.emit('beforeTransaction', [doc._transaction, doc])   // <-- outside the try
  }
  try {
    result = f(doc._transaction)
  } finally {
    if (initialCall) { doc._transaction = null; /* ... */ }
  }
  return result
}
```

`beforeTransaction` is emitted **before** the `try`. A throw there skips the
`finally`, so `doc._transaction` is left set. The next `transact` sees a
non-null `_transaction`, takes the `initialCall === false` path, and **never
emits the event again**.

Measured, in `packages/doc/tests/guard.test.ts`
("a violation leaves the document usable"):

```
_transaction still set?           true
_transactionCleanups length:      1
write after violation went through? true
```

One violation permanently disables the guard. Every subsequent write goes
through unchecked. That is worse than no guard, because it looks like protection
and provides exactly one refusal.

## Decision

**Enforce with a `Proxy` around the `Y.Doc` and the shared types, refusing the
write before it happens.**

`FiroDoc.ydoc` is a proxy. Reads, `toJSON`, observers and iteration pass through.
`transact` is refused unless the origin is known. Every mutator on a shared type
— `set`, `delete`, `clear`, `push`, `insert`, `applyDelta`, `format`, … — is
refused. `Y.UndoManager` is the single exception: it starts its own transactions
when it applies an undo, passing *itself* as the origin, so
`createUndoManager()` registers that one instance by identity.

Three details that are load-bearing rather than incidental:

- **Returned values are wrapped, not just the top level.** A nested `Y.Map` is
  where the interesting data lives (an element is a nested map), and Yjs opens an
  implicit untagged transaction the moment one is mutated. `get`, `forEach`,
  `map`, `values()` and `entries()` all hand out types, so all of them wrap.
- **`forEach`/`map` wrap their callback's argument.** `forEach` returns
  `undefined`, so wrapping its return value protects nothing — the type arrives
  through the callback. This was the most likely hole and it was open in the
  first implementation.
- **Deny by default.** A method that is on neither the read list nor the mutator
  list is refused, and a test walks Yjs's prototypes to assert the two lists are
  exhaustive. A Yjs upgrade that adds `Y.Map.prototype.merge` fails the build
  rather than quietly becoming a hole. A missing *read* entry also breaks the
  build, which is the right direction: too strict is obvious and gets fixed,
  too lax is invisible and does not.

The in-package callers that legitimately need the raw document — `openBoard`'s
`IndexeddbPersistence` (which opens untagged transactions), `createUndoManager`,
and `applyRemoteUpdate` — are given `rawYdoc` deliberately, and that is the
whole trust boundary. It is four call sites in one package.

## Consequences

- A violation throws **before** anything is written, so the document is untouched
  *and still armed*. The test asserts three consecutive violations are all caught,
  which is the assertion the event-based design could not make.
- The guard cannot be forged from outside. Origins are `unique symbol`s rather
  than strings, so a guessed `"local"` does not work, and `Y.UndoManager` is
  authorised by object identity rather than by name.
- There is a per-call cost on reads: a `Proxy` `get` trap and a
  `READ_ONLY.has()` lookup. Measured as irrelevant next to the canvas's own
  render cost, and it is on the read path only — `size`, `length` and `parent`
  are property reads that do not consult the list at all.
- The `Y.Array` iterator from `values()` is wrapped **lazily** as a generator.
  Materialising it would have been a real cost on a 4,000-element board, in the
  name of safety.
- The read/mutator classification is a maintenance obligation. It is a test
  (`guard.test.ts`, "the classification of Yjs's methods is exhaustive"), not a
  comment, so a Yjs upgrade surfaces it.
- Anything that needs the raw document outside this package will have to ask.
  That is the correct friction: the second raw-document caller is the second
  chance at a write that bypasses `commit()`.

## Alternatives considered

- **`beforeTransaction` listener** — fails open after one violation, as measured
  above. Rejected.
- **Throwing from `afterTransaction`** — fires after cleanup, so the document
  stays usable, but the write has already been applied. The caller sees an error
  *and* a mutated board, and the first of the two is the one they act on.
- **Not exposing `Y.Doc` at all** — cleaner in principle, and it fails: Yjs
  requires the document object itself for `applyUpdate`, `encodeStateAsUpdate`,
  and provider construction. There is no wrapper that does not need the real
  `Y.Doc` somewhere inside it.
- **Freezing the shared types** — Yjs has no such API, and freezing a `Y.Map`
  would break its own internal state.
- **A lint rule / code-review convention** — the failure mode it prevents is
  silent. Nothing says "wrong" at the time; the board is just 300× its content
  size six months later.
