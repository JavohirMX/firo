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
 */
const isEcho = (
  candidate: FiroElement,
  pushed: FiroElement | undefined,
): boolean => {
  if (!pushed) {
    return false;
  }
  return (
    EDITOR_OWNED_FIELDS.every(
      (field) =>
        (candidate as unknown as Record<string, unknown>)[field] ===
        (pushed as unknown as Record<string, unknown>)[field],
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

    this.doc.commit(mutations);
    // Re-read rather than assuming: the document stamps `updated` and assigns
    // the fractional index, so the committed state is not what we sent.
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
    if (this.suspended) {
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
