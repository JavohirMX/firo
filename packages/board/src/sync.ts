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
 *
 * ## What `pull()` withholds, and why `diff()` has to protect it
 *
 * Private mode keeps some elements out of the editor entirely, and that breaks
 * an assumption baked into `diff()`: *an id the editor no longer has was deleted
 * there*. `gone` is computed from the document's ids minus the scene's, and it
 * is the only thing standing between a real deletion and a permanent tombstone.
 *
 * So the moment `pull()` filters, every hidden note reads as "the editor lost
 * this" and gets deleted on the next push. Not on the next reload, not on the
 * next session — the next *keystroke*, because that is when a push happens. And
 * it is silent and permanent: a tombstone in a CRDT is not a deleted row, it is
 * a deleted row that can no longer be resurrected by a stale write. The feature
 * whose entire purpose is protecting those notes would destroy them, and the
 * facilitator would find out when they revealed the board.
 *
 * So the two halves have to agree, and they agree by construction rather than by
 * discipline: `pull()` records the ids it withheld, and `diff()` refuses to read
 * those ids as deletions. It is a tracked set rather than a re-derived one, and
 * that matters — re-deriving it in `diff` would silently diverge the moment the
 * mode and the scene disagreed, which is the ordinary state between a toggle and
 * the pull that follows it. See `withheldIds`.
 *
 * Z-order has the same shape of problem one level down, and `orderFor` exists for
 * it: a scene that is missing elements cannot express the board's z-order, so a
 * reorder that names only what the editor holds would quietly relocate every
 * withheld element to the back of the document's order — corrupt the stacking of
 * precisely the notes being protected, and never settle.
 */

import {
  DEFAULT_PRESENTATION,
  DEFAULT_REVEAL_STATE,
  elementsForPresentation,
} from "@firo/facilitation";

import type { ElementId, FiroElement, StickyNoteElement } from "@firo/schema";
import type { EphemeralPresentation, Mutation } from "@firo/doc";
import type { PresentationState, RevealState } from "@firo/facilitation";

import {
  EDITOR_OWNED_FIELDS,
  editorLabelsByContainer,
  foldEditorElement,
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

/**
 * Whether a raw editor element still folds to the baseline `push()` holds,
 * judged by the fields the editor owns.
 *
 * This is how `push()` decides *whether to fold an element at all*, and it is
 * `isEcho` run on the raw element rather than a copy of the fold. The field list
 * is the same `EDITOR_OWNED_FIELDS` the echo check has always used, so it draws
 * the line in exactly the same place, and draws it no wider: a field outside the
 * list is already one whose change the push treats as invisible once the fold
 * comes back unchanged, and the list's own comment already makes maintaining it
 * part of adding an element field.
 *
 * ## By value, not by `versionNonce`
 *
 * `mutateElement` bumps `versionNonce` on every edit, so a counter looks like it
 * would do. It is deliberately not the test. The bridge is a plain `read`/`write`
 * seam (see `EditorBridge`) and says nothing about *how* a host edits an element;
 * an in-place edit that bumps no counter -- the shape the tests use, and a host
 * could use -- has to be seen too, or the edit is silently frozen in the
 * document. Comparing values is the same choice `isEcho` makes and for the same
 * reason.
 *
 * ## Raw against folded is safe here
 *
 * `isEcho` runs folded-against-folded because a note's `text` lives on the
 * editor's label, not on the note, so a raw note has no `text` and would read as
 * changed every time. That is harmless for *this* test: reading a note as changed
 * costs one fold, the fold reads the label, and the fold equals the baseline, so
 * `diff` still commits nothing. Erring toward "changed" is the only safe
 * direction for a test whose failure mode is a dropped edit.
 *
 * ## Arrays by length and endpoints
 *
 * Comparing a stroke's `points` element by element would walk every vertex on
 * every push, which is the cost this whole path exists to avoid. Arrays are
 * compared by length and two endpoints instead, enough to see the two shapes they
 * take in practice -- a stroke's points only ever grow, a binding list only ever
 * gains or loses an entry -- and no worse than the echo test, which is allowed to
 * be conservative.
 */
const sameTrackedElement = (
  raw: Record<string, unknown>,
  baseline: Record<string, unknown>,
): boolean => {
  for (const field of EDITOR_OWNED_FIELDS) {
    const next = raw[field];
    const previous = baseline[field];
    if (next === previous) {
      continue;
    }
    if (Array.isArray(next) && Array.isArray(previous)) {
      if (
        next.length !== previous.length ||
        !sameValue(next[0], previous[0]) ||
        (next.length > 1 &&
          !sameValue(next[next.length - 1], previous[previous.length - 1]))
      ) {
        return false;
      }
      continue;
    }
    if (!sameValue(next, previous)) {
      return false;
    }
  }
  return raw.isDeleted === baseline.isDeleted;
};

/**
 * Fold only the elements `push()` found changed, reusing the baseline copy for
 * the rest.
 *
 * The result has the scene's order and the scene's complete set of document
 * elements, so `diff` sees what a full fold would have shown it. Compositional
 * changes -- an element added, deleted, or reordered -- are not handled here;
 * they take the full fold.
 *
 * A clean element reuses the exact baseline object. That is the point (no fold,
 * no deep compare) and it is also the echo: the copy *is* the baseline, so the
 * `isEcho` comparison in `push` short-circuits on identity.
 *
 * A label is the one element that can change without folding: it has no document
 * form of its own, but a note reads its text from it. So the caller adds the
 * label's container to the dirty set before calling this, and a dirty label is
 * folded here only to be dropped again -- correctly, since it is not an element.
 */
const foldDirtyElements = (
  incoming: readonly Record<string, unknown>[],
  baseline: ReadonlyMap<string, FiroElement>,
  dirty: ReadonlySet<string>,
): FiroElement[] => {
  const labelByContainer = editorLabelsByContainer(incoming as never[]);
  const folded: FiroElement[] = [];

  for (const raw of incoming) {
    const id = raw.id as string;
    if (!dirty.has(id)) {
      // A clean label, or any clean element with no document form, is simply
      // absent from the baseline; nothing to reuse and nothing to emit.
      const previous = baseline.get(id as ElementId);
      if (previous) {
        folded.push(previous);
      }
      continue;
    }
    const one = foldEditorElement(raw as never, labelByContainer);
    if (one) {
      folded.push(one);
    }
  }

  return folded;
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
  /**
   * Called when the document's *records* change, and never otherwise.
   *
   * ## Why this is separate from `write`
   *
   * A record is not an element. It has no position, no size, and nothing to draw,
   * so it cannot be projected into the editor's scene -- and it must not be, or
   * `diff` would read every record as an element the editor has lost and delete
   * it. That is the same class of bug as the note whose text vanished because a
   * lone label was folded without its note.
   *
   * The two are therefore different channels with different vocabularies, and the
   * seam has to say so. Before this existed, a vote committed straight into the
   * document produced **zero** editor writes and no error: `read()` returned only
   * `elements`, so `sameElements` reported "nothing changed" and the sync stood
   * down. A record store that silently never reaches the client is worse than no
   * record store, because the data layer tests all pass.
   *
   * Optional so an editor with no record UI keeps working unchanged. When absent,
   * record changes are still read correctly and simply not surfaced.
   */
  onRecordsChanged?: (collections: readonly unknown[]) => void;
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

  /**
   * `pushedElements` indexed by id, and the array it was built from.
   *
   * The dirty walk in `push()` needs an id lookup for every element in the scene,
   * and `push()` runs at input frequency -- on every wheel event, every pointer
   * move over the canvas. Building that lookup allocates one `[id, element]` pair
   * per element, per event: on a board with thousands of strokes that is the fast
   * path's most expensive step, and every event that does not commit throws the
   * whole thing away unread, because `pushedElements` is unchanged and the next
   * lookup is built identically to the one just discarded.
   *
   * So it is built once per version of `pushedElements`, keyed on the array's
   * identity. Identity is a sound key here because `pushedElements` is only ever
   * *replaced*, never mutated: it is either a frozen `read()` snapshot or a fresh
   * fold this class owns.
   */
  private pushedById: Map<ElementId, FiroElement> | null = null;
  private pushedByIdFor: readonly FiroElement[] | null = null;

  private baselineForPush = (): Map<ElementId, FiroElement> => {
    if (
      this.pushedById !== null &&
      this.pushedByIdFor === this.pushedElements
    ) {
      return this.pushedById;
    }
    const rebuilt = new Map<ElementId, FiroElement>(
      this.pushedElements.map((element) => [element.id, element]),
    );
    this.pushedById = rebuilt;
    this.pushedByIdFor = this.pushedElements;
    return rebuilt;
  };

  private lastDocElements: readonly FiroElement[] = [];

  /**
   * The ids of the editor's scene, in scene order, as of the last time a push or
   * pull looked at it.
   *
   * `push()` compares the incoming scene's ids against this order and each
   * element's tracked fields against the `pushedElements` baseline. When neither
   * moved, the scene cannot fold differently than it did last time, so `push()`
   * returns without folding or diffing anything. That is the whole of the
   * pan/zoom/hover fix: those interactions fire the editor's change event without
   * touching an element, and the old path paid a full fold and a full deep
   * compare on every one of them.
   *
   * The ids are kept for their *order*, which the field comparison cannot see:
   * scene order is z-order, so a reorder changes the scene while every element's
   * fields stay equal. Refreshed on *every* observed push, not only the ones that
   * commit -- the question is "have I looked at this scene before", not "did I
   * commit it", and a scene the editor hands back unchanged must read as
   * unchanged on every push, forever.
   */
  private lastIds: readonly string[] | null = null;

  private suspended = false;

  /**
   * The ids `pull()` deliberately left out of the editor's scene.
   *
   * Set by `pull()`, read by `diff()`. Nothing else writes it and nothing else
   * reads it, which is deliberate: it is the record of *what was actually
   * withheld from this editor*, not a second opinion about what should be.
   *
   * Derived inside `pull()` by set difference against the exact array handed to
   * the editor, so it cannot disagree with the scene even if someone later adds
   * another reason to withhold something. A second filter — one in `pull()` and
   * one in `diff()` — is how the two would come to disagree, and the symptom of
   * that disagreement is a facilitator's hidden notes deleted from the file with
   * nothing in the log.
   *
   * Empty whenever nothing is hidden, which is every board nobody has used
   * private mode on. Every use below is behind that, so the ordinary path is
   * the old code path.
   */
  private withheldIds: ReadonlySet<string> = new Set<string>();

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
      read: () => { elements: FiroElement[]; collections?: readonly unknown[] };
      commit: (mutations: readonly Mutation[]) => { changed: boolean };
      subscribe: (
        listener: (snapshot: {
          elements: FiroElement[];
          collections?: readonly unknown[];
        }) => void,
      ) => () => void;

      /**
       * This client's ephemeral state, which is where the private/revealed
       * toggle lives — see `EphemeralReveal` in `@firo/doc`.
       *
       * ## Why this is read from the document and not injected separately
       *
       * The toggle is ephemeral (rule 1 in `AGENTS.md`): it is awareness, not a
       * document field, and it is discarded when the peer disconnects. That is
       * the *right* place for it and it is not negotiable — but it means the
       * board-level mode already has exactly one home, and a second one handed
       * to this constructor would be a second source of truth that disagrees
       * with the document the moment a facilitator's toggle arrives from
       * anywhere else. So the document is asked, every time, and the answer is
       * not cached: a cached mode would hide notes after a reveal, or draw them
       * after a hide, for as long as the board stayed open.
       *
       * ## Why it is optional rather than required
       *
       * The port is structural and pre-dates private mode. Making this member
       * required would break every existing caller — `apps/web/board/board.ts`
       * casts a real `FiroDoc` in, which has the method, but tests and any other
       * host build their own port — for a feature they did not ask for. An
       * optional member with a `revealed` fallback means "a port that does not
       * know about private mode hides nothing", which is both the safe answer
       * and the honest one: a board is never private by accident.
       *
       * `presentation` is optional for the same reason and with the same fallback:
       * a port that has never heard of presentation mode is not presenting. Both
       * are read through this one member because both are ephemeral state on the
       * document, and a second injected source for either would be a second truth
       * that disagrees with the document the moment a facilitator's toggle arrives
       * from anywhere else.
       */
      getEphemeral?: () => {
        readonly reveal: RevealState;
        readonly presentation?: EphemeralPresentation;
      };
    },
    private readonly editor: EditorBridge,
  ) {}

  /**
   * The reveal toggle, as the document holds it right now.
   *
   * Read on every `pull()` rather than remembered. The toggle never reaches the
   * document's *history* — that is the point of it being ephemeral — so there is
   * no notification for a mode change to arrive on, and a cached copy would only
   * ever be stale. The cost is one property read per pull.
   */
  private revealState = (): RevealState =>
    this.doc.getEphemeral?.().reveal ?? DEFAULT_REVEAL_STATE;

  /**
   * The presentation state, as the document holds it right now.
   *
   * Read per `pull()` for the reason `revealState` is. Presentation is ephemeral
   * (rule 1), so it produces no document update and therefore no notification to
   * arrive on -- which is exactly why a caller that changes it must call `pull()`.
   *
   * ## Why `frameOf` is supplied here rather than travelled
   *
   * The ephemeral half carries `active`, `slideIds` and `index` and nothing else.
   * `PresentationState` also has an optional `frameOf` **function**, for answering
   * "is this element's frame an ancestor of the current one" once frames nest. A
   * function cannot cross awareness, so the lookup is rebuilt from the element list
   * on the way past -- which is the only place the element list is in hand anyway.
   *
   * The lookup is derived rather than cached, because a stale parent map would hide
   * a nested slide's contents or show another slide's, and neither failure announces
   * itself: the canvas simply draws the wrong notes. Building it is one pass over
   * the frames, against a document read that is already O(elements).
   *
   * An element with no `frameId` has no parent, which is the honest answer and the
   * one that degrades to single-level slides.
   */
  private presentationState = (
    elements: readonly FiroElement[],
  ): PresentationState => {
    const stored = this.doc.getEphemeral?.().presentation;
    const presentation: PresentationState = stored ?? DEFAULT_PRESENTATION;

    if (!presentation.active || !presentation.slideIds.length) {
      return presentation;
    }

    const parents = new Map<string, string | null>();
    for (const element of elements) {
      if (!parents.has(element.id)) {
        parents.set(element.id, element.frameId ?? null);
      }
    }

    return { ...presentation, frameOf: (id) => parents.get(id) ?? null };
  };

  /**
   * Push the document into the editor. Call once after both exist.
   *
   * The elements written here are remembered as the echo baseline.
   */
  start = (): void => {
    this.pull();
    // Published on start as well as on change. A client that attaches after the
    // board already holds collections would otherwise wait for the next change
    // to learn they exist -- and a board nobody edits again would never send one.
    this.publishRecords(this.doc.read().collections);
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

    /*
     * ## Compare before folding: the fast path and the dirty set
     *
     * Pan, zoom, hover and selection changes all fire the editor's change event
     * without touching an element, and `push()` runs at input frequency -- on
     * every wheel event, every pointer move over the canvas. On a board holding
     * a handful of long strokes the old path paid for a full fold and a full
     * deep compare on every one of those events: `fromEditorElements` copied
     * every stroke's `points`, and `isEcho`/`changedFields` walked every point of
     * every stroke. All of it to commit nothing.
     *
     * So the scene is walked once *before* folding, each element against the
     * baseline copy it last folded to and its id against the order last seen.
     * Nothing tracked moved and the order held -> the scene folds exactly as it
     * did last time, so there is nothing to fold and nothing to diff and the push
     * returns. Something moved -> the same walk has already named the elements to
     * fold, so a stroke being drawn costs one walk of *fields* plus one fold,
     * instead of a walk of every point in the scene.
     *
     * The walk compares values, not `version`/`versionNonce`; see
     * `sameTrackedElement` for why, and for why arrays are read only at their
     * ends.
     */
    const baseline = this.baselineForPush();

    const dirty = new Set<string>();
    for (const raw of incoming) {
      const id = raw.id as string;
      const previous = baseline.get(id as ElementId);
      if (
        !previous ||
        !sameTrackedElement(raw, previous as unknown as Record<string, unknown>)
      ) {
        dirty.add(id);
      }
    }

    /*
     * Scene order is z-order, and no element's *fields* move when the order does,
     * so the order is compared on its own -- against the order last pushed, which
     * is the order the document holds. A reorder is the one change the field walk
     * is blind to, and the one the fast path would otherwise swallow as "nothing
     * moved".
     */
    let orderChanged =
      this.lastIds === null || this.lastIds.length !== incoming.length;
    if (!orderChanged && this.lastIds) {
      for (let i = 0; i < incoming.length; i += 1) {
        if (incoming[i].id !== this.lastIds[i]) {
          orderChanged = true;
          break;
        }
      }
    }

    /*
     * Remember the scene we just looked at. This is what makes the fast path
     * *stay* fast: an editor that hands the scene back with fresh
     * `version`/`versionNonce` but nothing else moved must still read as
     * unchanged on the next push.
     *
     * Only when the order actually moved. Ids in the same order are the ids
     * already in `lastIds`, so re-deriving them on every pan and zoom would
     * allocate a whole id array, once per input event, to store exactly what is
     * already there.
     */
    if (orderChanged) {
      this.lastIds = incoming.map((raw) => raw.id as string);
    }

    if (!orderChanged && dirty.size === 0) {
      return [];
    }

    /*
     * A note is two editor elements, and the text lives on the label. Folding
     * the note reads the label, so a dirty label has to drag its note along;
     * otherwise the note would be reused from the baseline and the typed text
     * would never reach the document. Every other type's fields are entirely its
     * own.
     */
    for (const raw of incoming) {
      if (
        raw.type === "text" &&
        typeof raw.containerId === "string" &&
        dirty.has(raw.id as string)
      ) {
        dirty.add(raw.containerId);
      }
    }

    const folded = orderChanged
      ? fromEditorElements(incoming as never[])
      : foldDirtyElements(incoming, baseline, dirty);

    /*
     * Every incoming element is folded, echoes included -- dropping the echoes
     * instead would make the diff read as "the document has notes the editor
     * does not" and delete them. An echo is instead replaced by the baseline it
     * matches, so the diff sees no change and the loop closes.
     *
     * A reused baseline copy compares by identity, so `isEcho` short-circuits:
     * an element that came from the baseline *is* the baseline.
     */
    const normalised = folded.map((element) => {
      const previous = baseline.get(element.id);
      return previous && isEcho(element, previous) ? previous : element;
    });

    /*
     * The withheld set is passed, not re-derived.
     *
     * `diff` has no business forming its own opinion about what should be
     * hidden: the only authority on that is the array `pull()` actually handed
     * the editor, and anything else is a second filter that can disagree with
     * the first. The disagreement is silent and it is fatal — the document has
     * an element, the scene does not, `gone` says the editor deleted it, and
     * `deleteElements` tombstones a facilitator's hidden note because of a
     * predicate that happened to read the mode a moment later.
     */
    const mutations = this.diff(
      this.lastDocElements,
      normalised,
      this.withheldIds,
    );

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
   *
   * ## `withheld` is the third argument because two of the three answers below
   * are wrong without it
   *
   * `gone`, the z-order comparison, and the z-order mutation all read "the ids
   * the document has that the editor does not". While private mode is on, that
   * set contains every hidden note — for reasons that have nothing to do with the
   * user deleting anything. Each of the three is therefore wrong in a different,
   * silent way:
   *
   * - `gone` would tombstone them. Permanent, and caused by the feature meant to
   *   protect them.
   * - the comparison would report the order changed on every push, because the
   *   scene is shorter than the board by construction, so every keystroke would
   *   write to the document.
   * - the mutation would name only the ids the editor holds, and
   *   `reorderElements` appends everything it was not given to the *end* — so
   *   every hidden note would slide to the back of the board's z-order, once, on
   *   the first genuine reorder, and stay there after the reveal.
   */
  private diff(
    before: readonly FiroElement[],
    after: readonly FiroElement[],
    withheld: ReadonlySet<string>,
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
    //
    // `-- except the ids `pull()` withheld`.
    //
    // This is the line the whole private-mode feature lives or dies on. Without
    // the filter, an element the editor never had *because it is hidden* reads
    // as an element the user deleted, and the very next push — a keystroke on any
    // other note — writes a tombstone over a facilitator's private brainstorm.
    // Nothing throws, nothing is logged, and the note is not merely hidden: a
    // tombstone in a CRDT is not a row to come back from, which is what
    // `compactBoard` and the CRDT's own id-reuse rules are built around.
    //
    // Tracked rather than re-derived, because re-deriving means asking the reveal
    // mode again and the scene is what is authoritative about what the editor
    // lacks. They disagree in the ordinary case: a toggle that has not been
    // followed by a `pull()` is a mode change the scene has not caught up with
    // yet, and a `diff` that read the mode would protect ids that are sitting
    // right there on the canvas — which means a real deletion would be swallowed.
    //
    // The set is empty on every board nobody has made private, so this costs a
    // `Set.has` per candidate and changes nothing for them.
    const gone = [...beforeById.keys()].filter((id) => !withheld.has(id));
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
    // middle moved to the end, `sameIds` was false on the very next push, and
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
    // Which brings us to the withheld ids, which are a *third* reason an element
    // may be absent from the scene and which must be named here for the same
    // reason tombstones are: not naming them is not a no-op, it is a silent
    // relocation to the back of the board. `orderFor` puts each one back where
    // the document has it, and the comparison is made against that same
    // completed list -- so a scene that is merely *missing* elements does not
    // read as a scene that *moved* them.
    //
    // Only emitted when the *set* is unchanged, i.e. when the deletions above
    // did not fire. Reordering and deleting in the same commit is expressed by
    // the deletions; the surviving elements keep the relative order the
    // document already has, and the next push settles it.
    const order = orderFor(before, after, withheld);
    if (!gone.length && !sameIds(before, order)) {
      mutations.push({ kind: "reorderElements", ids: order });
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
  private onDocumentChanged = (snapshot?: {
    elements: FiroElement[];
    collections?: readonly unknown[];
  }): void => {
    if (this.suspended || this.committing) {
      return;
    }

    /*
     * Records are published before anything else, and before the element guards.
     *
     * The `committing` flag cannot cover this channel the way it covers the
     * element one. `BoardSync` only ever commits *element* mutations, so a record
     * change is by definition not its own write and must be surfaced even when
     * `committing` is set. Suppressing it here would mean a facilitator's own
     * action silently failing to update the vote count -- and the symptom would
     * be "the number did not go up", with nothing in the log.
     *
     * Republishing costs one comparison against the last published value, which
     * is a no-op for a board with no record UI.
     *
     * Read from the snapshot `notify()` already built. `subscribe()` hands its
     * listener one; this listener used to take no argument and read the document
     * again, which is one of the two provable wastes named in `docs/adr/0019`.
     *
     * That ADR declined to fix the waste on the *element* path, because there the
     * snapshot's freshness decides what the echo guard compares against. For this
     * call the question does not arise: a collection list is compared only against
     * the last value published, so no baseline's timing matters. The first version
     * of this method called `read()` unconditionally, which would have made the
     * ADR's numbers worse while shipping as a small feature.
     *
     * Optional parameter, because a test may call this with no argument; `read()`
     * is then the honest answer rather than a stale one.
     */
    this.publishRecords(
      snapshot ? snapshot.collections : this.doc.read().collections,
    );

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
    /*
     * This is the *second* `read()` in one notification: `notify()` already built
     * a snapshot and handed it over, and the element guard below reads again.
     * That is one of the two provable wastes in `docs/adr/0019`, and the ADR
     * declined to fix it here because on this path the snapshot's freshness is
     * what the echo guard compares against.
     */
    const current = this.doc.read();

    if (sameElements(current.elements, this.lastDocElements)) {
      return;
    }

    this.pull();
  };

  /**
   * Hand the editor the document's collections, if they have changed.
   *
   * Compared by identity against the last published value, because a Yjs read
   * allocates fresh arrays every time and reference equality would report a
   * change on every transaction. A structural comparison would be correct and
   * expensive; collections change on a human timescale, so remembering the last
   * array and comparing lengths is not enough on its own -- hence the cheap
   * `sameCollections` walk, which is only reached when the length moved.
   */
  private publishRecords = (
    collections: readonly unknown[] | undefined,
  ): void => {
    const sink = this.editor.onRecordsChanged;
    if (!sink) {
      return;
    }
    if (
      this.lastPublishedCollections &&
      sameCollections(this.lastPublishedCollections, collections ?? [])
    ) {
      return;
    }
    this.lastPublishedCollections = collections ? [...collections] : [];
    sink(this.lastPublishedCollections);
  };

  /** What `onRecordsChanged` was last handed, so equal values are not re-sent. */
  private lastPublishedCollections: readonly unknown[] | null = null;

  /**
   * Replace the editor's contents with the document's, remembering the echo.
   *
   * ## Withholding happens here, and nowhere else
   *
   * `elementsForPresentation` — the same function the exporter uses — decides what
   * the editor is told about, and that is the whole of the leak fix. The exporter
   * walks the scene (`LayerUI` is handed `scene.getNonDeletedElements()`, and
   * `prepareElementsForRender` only narrows by frame and by tombstone), so an
   * element that never reaches the scene cannot reach a PNG or an SVG. Filtering
   * at the render layer instead would leave every export path — there are five,
   * and each walks the scene on its own — as a separate chance to forget.
   *
   * It also means a hidden element cannot be *edited*, because editing needs it
   * in the scene: there is no gesture that reaches an element the canvas does
   * not have. Which is the correct answer, and the reason `withheldIds` exists
   * rather than a per-push repair of some kind.
   *
   * ## What is withheld is recorded, not re-derived
   *
   * `withheldIds` is the set difference against the array just handed over,
   * never a second pass with the same predicate. Two filters that agree today
   * are one filter that will disagree after the next change, and the
   * disagreement is silent and irreversible — `diff` reads a missing element as
   * a deletion.
   *
   * Note that `lastDocElements` stays the *whole* document, withheld included.
   * That is deliberate and it is what makes the exclusion in `diff` necessary
   * rather than belt-and-braces: the sync has to keep remembering what the board
   * holds, or a later push would have no way to tell "withheld" from "deleted".
   *
   * ## A mode change does not arrive here by itself
   *
   * The reveal toggle is ephemeral, so flipping it does not commit and does not
   * notify `subscribe` — deliberately, per rule 1. Nothing in this class can
   * observe a flip. A caller that changes the mode must call `pull()`; that is
   * the refresh point, and it is public for exactly that reason. Until it is
   * called the scene still shows what it showed, which is also why `diff` trusts
   * the recorded set rather than the live mode.
   */
  pull = (): void => {
    this.suspended = true;
    try {
      const docElements = this.doc.read().elements;
      const shown = elementsForPresentation(
        docElements,
        this.revealState(),
        this.presentationState(docElements),
      );

      const shownIds = new Set(shown.map((element) => element.id));
      this.withheldIds = new Set(
        docElements
          .filter((element) => !shownIds.has(element.id))
          .map((element) => element.id),
      );

      const elements = toEditorScene(
        shown as FiroElement[],
      ) as unknown as Record<string, unknown>[];

      this.lastDocElements = docElements;
      // The echo baseline is the *folded* form of what we are about to send, not
      // the editor elements themselves, so that comparisons are like-for-like.
      // It covers the visible scene only, which is right: an element the editor
      // was never given cannot come back as an echo, and there is nothing for it
      // to be compared against.
      this.pushedElements = fromEditorElements(elements as never[]);
      this.lastIds = elements.map((element) => element.id as string);
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
 * The z-order to ask the document for, with the withheld ids put back.
 *
 * ## Why this exists
 *
 * A scene that is missing elements cannot speak about the whole board's z-order,
 * and `reorderElements` resolves the silence by appending every id it was not
 * given to the end. So the obvious implementation — hand it `after.map(id)` —
 * is not "leave the hidden ones alone", it is "move every hidden note to the
 * back of the board", executed silently on the first genuine reorder while the
 * session is private and still true when it is revealed. Corrupting the stacking
 * of the content the feature exists to protect, from a change that has nothing
 * to do with it.
 *
 * ## What it does
 *
 * **A withheld element keeps its slot; only the elements the editor can see
 * move.** That is the rule, and it is stated as a rule because the alternative is
 * a choice nobody has made deliberately: there is no information about where a
 * hidden note *should* go, so the only answer that cannot be wrong is the one it
 * already has.
 *
 * Concretely: walk the document's order, and at each element take the editor's
 * *next* id if the scene can speak for that slot, or the withheld id if it cannot.
 * The visible ids end up in the editor's order, interleaved with the withheld
 * ones in the document's, each in the position the document had it.
 *
 * A withheld note can therefore still change who it sits above — when the notes
 * around it are moved, something has to give, and the notes a person actually
 * moved are the ones that yield. But it is never moved *to* a position the
 * document did not already have it in, and in particular it never travels to the
 * end.
 *
 * With nothing withheld this returns `after`'s ids unchanged, which is what
 * keeps the ordinary path byte-identical to what it was before private mode.
 *
 * Ids the document has never seen — drawn in the editor, not yet committed — are
 * left in for the trailing slice. They cannot be positioned against a document
 * that does not know them, and `reorderElements` drops ids it does not
 * recognise, so nothing here depends on getting that case exactly right.
 */
const orderFor = (
  before: readonly FiroElement[],
  after: readonly FiroElement[],
  withheld: ReadonlySet<string>,
): string[] => {
  const editorOrder = after.map((element) => element.id);
  if (withheld.size === 0) {
    return editorOrder;
  }

  const ids: string[] = [];
  let next = 0;
  for (const element of before) {
    if (withheld.has(element.id)) {
      ids.push(element.id);
    } else if (next < editorOrder.length) {
      ids.push(editorOrder[next++]);
    }
  }
  return next < editorOrder.length ? [...ids, ...editorOrder.slice(next)] : ids;
};

/**
 * Whether the document's elements are already in a given id order.
 *
 * Z-order is a property of the scene rather than of any element, so it cannot
 * be compared with `changedFields` -- which is per element and would compare
 * `index` without knowing that a swap moved two elements at once.
 *
 * Compares ids only. Value equality is `changedFields`' job, and a reorder that
 * also changed a field should produce both mutations, not one confused one.
 *
 * Takes plain ids rather than elements because the comparison is against the
 * *completed* order from `orderFor` -- the editor's order with the withheld ids
 * back in their document slots. Comparing against the raw scene instead would
 * report a change on every single push while private mode is on, because the
 * scene is shorter than the board by exactly the number of hidden notes, and
 * each of those pushes would write to the document.
 */
const sameIds = (a: readonly FiroElement[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((element, i) => element.id === b[i]);

/**
 * Whether two collection lists are the same set, in the same order.
 *
 * Same problem as `sameElements` and for the same reason: a Yjs read allocates
 * fresh objects, so reference equality never holds. `sameValue` rather than
 * `===`, because a collection carries `columns` and a column carries `options`,
 * and both are arrays -- comparing those by identity would report a change on
 * every transaction and republish forever.
 */
const sameCollections = (
  a: readonly unknown[],
  b: readonly unknown[],
): boolean => a.length === b.length && a.every((c, i) => sameValue(c, b[i]));

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
