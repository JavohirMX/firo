/**
 * Keeping the document and the editor in step, without a loop.
 *
 * ## The loop
 *
 * Two one-way syncs make a circle the moment both are live:
 *
 * 1. the editor changes, so we fold it and commit to the document
 * 2. the document changes, so we project it and push into the editor
 * 3. pushing into the editor fires the editor's change event
 * 4. which is step 1 again
 *
 * Step 3 is the problem, and it is worse than it looks: the editor's change
 * event is asynchronous, so a flag set around the push is cleared before the
 * event arrives. A flag does not work. Neither does comparing "did anything
 * change", because the editor rewrites `version` and `versionNonce` on elements
 * it did not semantically change.
 *
 * So the guard is identity, not timing: remember exactly what was pushed, and
 * treat an incoming change as an echo when it matches. An echo carries the
 * values we sent, so it is recognised; a real edit does not, so it is not.
 *
 * ## What this does not do
 *
 * It does not merge. If the document and the editor disagree about a field the
 * editor does not own — `focus` and `gap` on a binding, say — the document's
 * value wins, because the editor never had it. That is the whole reason the
 * projection is lossy and the document is authoritative.
 */

import type { FiroElement, StickyNoteElement } from "@firo/schema";
import type { Mutation } from "@firo/doc";

import {
  EDITOR_OWNED_FIELDS,
  fromEditorElements,
  toEditorScene,
} from "./elements.js";

/**
 * Whether a folded element still says what we last sent it.
 *
 * Compares the fields the editor owns, and deliberately **not** `version` or
 * `versionNonce`: the editor rewrites those when it installs elements, and the
 * document assigns them anyway. Including them would mean no echo ever matched
 * and the loop would run.
 *
 * Comparing the folded form on both sides rather than editor-against-document
 * matters too. A note's `text` lives on the editor's *label*, not on the note,
 * so a note-to-note comparison would find `text` missing on one side and call
 * every echo an edit.
 *
 * ## The comparison has to be by value, not by reference
 *
 * This used to compare each field with `===`, which is right for the scalars that
 * made up the original field list and wrong for everything added since. A fold
 * builds fresh arrays and objects on every pass -- `points: [...stroke.points]`,
 * `strokeOptions: {...}` -- so `===` is never true for them, and:
 *
 * - if the field is *absent* from the list, the change is invisible and the push
 *   is misread as an echo. That is what left a stroke's `points` frozen one point
 *   behind the canvas: the geometry fields matched, the differing `points` was not
 *   in the list, so every push after the first was discarded as an echo.
 * - if the field *is* in the list, `===` is never true and no push is ever an
 *   echo, so the guard does nothing and the loop this exists to stop can run.
 *
 * Both failures are silent, and they are opposite. `sameValue` recurses, so the
 * comparison means what it says for a scalar, an array of pairs, or a nested
 * object.
 */
const isEcho = (
  candidate: FiroElement,
  pushed: FiroElement | undefined,
): boolean => {
  if (!pushed) {
    return false;
  }
  return (
    EDITOR_OWNED_FIELDS.every((field) =>
      sameValue(
        (candidate as unknown as Record<string, unknown>)[field],
        (pushed as unknown as Record<string, unknown>)[field],
      ),
    ) && candidate.isDeleted === pushed.isDeleted
  );
};

/** What the sync needs from the editor, and the one way it touches it. */
export type EditorBridge = {
  /** Every element the editor holds, deleted ones included. */
  read: () => readonly Record<string, unknown>[];
  /**
   * Replace the editor's elements.
   *
   * Implementations must not commit anything to the document from inside this,
   * or the loop is structural rather than a matter of timing.
   */
  write: (elements: readonly Record<string, unknown>[]) => void;
};

/**
 * Drives a `FiroDoc` and an editor towards each other.
 *
 * Single-writer by design. In v1 one person edits one board, so "the document is
 * authoritative" resolves to "the editor is authoritative, and the document
 * remembers". A second writer makes the merge question real, and it is not
 * answered here.
 */
export class BoardSync {
  /** What we last handed the editor, folded into document form. */
  private pushedElements: readonly FiroElement[] = [];

  private lastDocElements: readonly FiroElement[] = [];

  private suspended = false;

  /**
   * True while this class is inside its own `commit`.
   *
   * Needed because the content check below compares against `lastDocElements`,
   * which is only updated *after* the commit returns -- so a notification that
   * arrives during the commit would find the old state and decide it was someone
   * else's change. A flag is the only thing that can answer that question at the
   * moment it is asked.
   */
  private committing = false;

  constructor(
    private readonly doc: {
      read: () => { elements: FiroElement[] };
      commit: (mutations: readonly Mutation[]) => { changed: boolean };
      subscribe: (
        listener: (snapshot: { elements: FiroElement[] }) => void,
      ) => () => void;
    },
    private readonly editor: EditorBridge,
  ) {}

  /**
   * Push the document into the editor. Call once after both exist.
   *
   * The elements written here are remembered as the echo baseline.
   */
  start = (): void => {
    this.pull();
    this.unsubscribe = this.doc.subscribe(this.onDocumentChanged);
  };

  stop = (): void => {
    this.unsubscribe?.();
    this.unsubscribe = null;
  };

  private unsubscribe: (() => void) | null = null;

  /**
   * The editor changed. Fold it into the document, unless it is an echo.
   *
   * @returns the mutations committed, for tests and for an undo label
   */
  push = (): readonly Mutation[] => {
    if (this.suspended) {
      return [];
    }

    const incoming = this.editor.read();
    const folded = fromEditorElements(incoming as never[]);

    /*
     * Every incoming element is folded, echoes included -- dropping the echoes
     * instead would make the diff read as "the document has notes the editor
     * does not" and delete them. An echo is instead replaced by the baseline it
     * matches, so the diff sees no change and the loop closes.
     */
    const baseline = new Map(
      this.pushedElements.map((element) => [element.id, element]),
    );
    const normalised = folded.map((element) => {
      const previous = baseline.get(element.id);
      return previous && isEcho(element, previous) ? previous : element;
    });

    const mutations = this.diff(this.lastDocElements, normalised);
    if (!mutations.length) {
      return [];
    }

    this.committing = true;
    try {
      this.doc.commit(mutations);
    } finally {
      this.committing = false;
    }
    // Re-read rather than assuming: the document stamps `updated` and assigns
    // the fractional index, so the committed state is not what we sent. Setting
    // it after the commit is also what lets the content guard catch a
    // notification that arrives asynchronously rather than during the call.
    this.lastDocElements = this.doc.read().elements;
    this.pushedElements = this.lastDocElements;
    return mutations;
  };

  /**
   * Mutations that turn the document's elements into the editor's.
   *
   * Field-level for updates, never whole-element replacement: the editor cannot
   * represent everything the document holds, so replacing an element wholesale
   * would quietly reset it. See `./elements.ts` for which fields those are.
   */
  private diff(
    before: readonly FiroElement[],
    after: readonly FiroElement[],
  ): Mutation[] {
    const mutations: Mutation[] = [];
    const beforeById = new Map(before.map((element) => [element.id, element]));

    // `after` is already folded. Folding it again here silently blanked every
    // note's text: a note's words live on its editor-side label, so folding a
    // lone note element finds no label and yields `text: ""`. Nothing failed
    // loudly -- the note was committed, just empty.
    for (const folded of after) {
      const existing = beforeById.get(folded.id);
      beforeById.delete(folded.id);

      if (!existing) {
        mutations.push({ kind: "createElement", element: folded });
        continue;
      }

      if (existing.isDeleted && !folded.isDeleted) {
        // Un-done in the editor. The tombstone has to be cleared or the document
        // would keep treating the note as deleted.
        mutations.push({ kind: "restoreElements", ids: [folded.id] });
      }

      const changes = changedFields(existing, folded);
      if (Object.keys(changes).length) {
        mutations.push({
          kind: "updateElements",
          updates: [{ id: folded.id, changes }],
        });
      }
    }

    // Anything left in the document that the editor no longer has was deleted
    // there. The document keeps a tombstone rather than dropping the key, so
    // undo can bring it back and a concurrent edit cannot resurrect it silently.
    const gone = [...beforeById.keys()];
    if (gone.length) {
      mutations.push({ kind: "deleteElements", ids: gone });
    }

    // Z-order is the scene's, not an element's, so it is compared across the
    // whole array rather than per element. `after` arrives in the editor's
    // z-order, front to back -- the same order `toEditorScene` projects in, and
    // the same order `elementOrder` stores.
    //
    // This is what "send to back" and "bring to front" were missing. Both
    // reorder the scene without changing any element's fields, so the loop
    // guard classified the push as an echo and `diff` was handed an array in
    // the document's own order: nothing to see, nothing to do. `reorderElements`
    // was already implemented and tested in `@firo/doc` and had no caller.
    //
    // A separate mutation from the field updates above on purpose. Writing
    // `index` per element through `updateElements` would restate a fractional
    // index in a loop, and a reorder of one element would become a burst of
    // writes rather than one undo step.
    //
    // Every id, tombstones included -- and this is the whole subtlety.
    //
    // An earlier version compared the full order but emitted only the live ids.
    // The two sets then disagree permanently: `reorderElements` appends any id it
    // was not given to the *end* of the order, so a tombstone that sat in the
    // middle moved to the end, `sameOrder` was false on the very next push, and
    // every idle push after a delete-plus-reorder wrote to the document forever.
    // Measured on a two-note board with one deleted: five idle pushes, five
    // durable writes, `durableUpdates` climbing.
    //
    // It was worse than a loop. The reorder was *lost*: asking for the deleted
    // note to come to the front left the document's order untouched, because
    // the only id emitted was the live one and the tombstone's old position was
    // preserved. So the file disagreed with the canvas permanently, with no
    // error -- the exact failure mode this class exists to prevent, reintroduced
    // by the fix for it.
    //
    // Emitting every id makes the comparison and the mutation speak about the
    // same set, which is the only way the two can agree. `reorderElements`
    // already drops ids it does not recognise, so a stale id costs nothing.
    //
    // Only emitted when the *set* is unchanged, i.e. when the deletions above
    // did not fire. Reordering and deleting in the same commit is expressed by
    // the deletions; the surviving elements keep the relative order the
    // document already has, and the next push settles it.
    if (!gone.length && !sameOrder(before, after)) {
      mutations.push({
        kind: "reorderElements",
        ids: after.map((element) => element.id),
      });
    }

    return mutations;
  }

  /**
   * The document changed. Push it into the editor.
   *
   * Ignores changes this class made itself, which is the other half of the loop
   * guard: the document fires on every commit, including the one `push` just
   * performed, and re-projecting that would replace the editor's elements with
   * fresh copies mid-gesture.
   */
  private onDocumentChanged = (): void => {
    if (this.suspended || this.committing) {
      return;
    }

    /*
     * Ignore a change this class made.
     *
     * Every `push` commits, and committing notifies subscribers -- including this
     * one. Without this check the sync reacts to its own write by pushing the
     * document back into the editor, in the middle of whatever the user was doing.
     *
     * The symptom is not a crash and not a loop. It is text loss: the editor
     * holds a sticky note's label in two fields, a commit rewrites the elements
     * the label lives in, and a note being typed into comes back empty. The
     * keystrokes were in the textarea; they were gone by the time it closed.
     *
     * Compared by content rather than flagged with a boolean, because a commit
     * can be observed before or after `push` updates its baseline depending on
     * whether the document notifies synchronously -- and a flag that is only right
     * for one of those orders is worse than no flag.
     */
    const current = this.doc.read().elements;
    if (sameElements(current, this.lastDocElements)) {
      return;
    }

    this.pull();
  };

  /** Replace the editor's contents with the document's, remembering the echo. */
  pull = (): void => {
    this.suspended = true;
    try {
      const docElements = this.doc.read().elements;
      const elements = toEditorScene(
        docElements as FiroElement[],
      ) as unknown as Record<string, unknown>[];

      this.lastDocElements = docElements;
      // The echo baseline is the *folded* form of what we are about to send, not
      // the editor elements themselves, so that comparisons are like-for-like.
      this.pushedElements = fromEditorElements(elements as never[]);
      this.editor.write(elements);
    } finally {
      // Cleared in a `finally` because an exception here would otherwise leave
      // the sync permanently deaf, with no symptom other than a board that
      // silently stops saving.
      this.suspended = false;
    }
  };
}

/**
 * Which fields an edit actually changed.
 *
 * Compares by value and returns only the differences, so an update carries the
 * fields the user touched and nothing else. That matters for merge: a
 * concurrent edit to a different field of the same element survives, because
 * this key was never written.
 */
/**
 * Whether two element lists carry the same ids in the same order.
 *
 * Z-order is a property of the scene rather than of any element, so it cannot
 * be compared with `changedFields` -- which is per element and would compare
 * `index` without knowing that a swap moved two elements at once.
 *
 * Compares ids only. Value equality is `changedFields`' job, and a reorder that
 * also changed a field should produce both mutations, not one confused one.
 */
const sameOrder = (
  a: readonly FiroElement[],
  b: readonly FiroElement[],
): boolean =>
  a.length === b.length && a.every((element, i) => element.id === b[i]?.id);

const changedFields = (
  before: FiroElement,
  after: FiroElement,
): Record<string, unknown> => {
  const changes: Record<string, unknown> = {};
  for (const [key, next] of Object.entries(after)) {
    if (key === "id" || key === "type") {
      continue;
    }
    const previous = (before as unknown as Record<string, unknown>)[key];
    if (!sameValue(previous, next)) {
      changes[key] = next;
    }
  }
  return changes;
};

/**
 * Whether two document states are the same set of elements, in the same order.
 *
 * Identity by `id` and value by everything else. A Yjs read allocates fresh
 * objects each time, so reference equality would never hold and the guard above
 * would never fire.
 */
const sameElements = (
  a: readonly FiroElement[],
  b: readonly FiroElement[],
): boolean =>
  a.length === b.length &&
  a.every((element, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      element.id === other.id &&
      sameValue(
        { ...element, version: 0, versionNonce: 0 },
        { ...other, version: 0, versionNonce: 0 },
      )
    );
  });

const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key) =>
        sameValue(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        ),
      )
    );
  }
  return false;
};

/** Re-exported so callers can build a note without importing two packages. */
export type { StickyNoteElement };
