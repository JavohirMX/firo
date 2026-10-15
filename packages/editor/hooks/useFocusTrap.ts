import * as React from "react";

/**
 * Focus containment for dialogs and palettes.
 *
 * [`docs/trd/09-accessibility.md`](../../../docs/trd/09-accessibility.md)
 * requires that "any modal, dialog, or palette must trap focus correctly and
 * restore it on close", and that "focus must never be lost to `<body>`". Nothing
 * in the repository did either: `focus-trap` had zero matches, and `Modal`
 * declared `aria-modal="true"` while containing no focus — which made the
 * attribute a false statement and let a keyboard user tab out of a dialog and
 * land behind it.
 *
 * ## Why the ref is a callback and the node is state
 *
 * Dialogs here are portalled, and `useCreatePortalContainer` returns `null`
 * until a layout effect has created the container — so `Modal` renders nothing
 * on its first pass and the element this hook attaches to appears on a *later*
 * render. A `RefObject` would give the effect nothing to depend on: it would run
 * once, find `current === null`, and never move focus in. Holding the node in
 * state makes the effect re-run when the element actually attaches.
 *
 * The returned callback is memoised for the same reason: React detaches and
 * reattaches the node whenever a ref callback's identity changes, which would
 * re-run the whole trap on every render.
 *
 * ## Why visibility uses `checkVisibility`
 *
 * The usual "is it visible" trick — `offsetParent !== null` — is wrong for
 * anything `position: fixed`, because a fixed element has no offset parent and
 * reads as hidden; dialogs are frequently fixed. `getClientRects()` is the other
 * common answer, but jsdom has no layout engine and reports an empty list for
 * every element, so a test would see a dialog with no focusable content at all.
 * `checkVisibility()` is accurate where it exists (Chromium, current Firefox and
 * Safari) and jsdom cannot answer, so there the element is included rather than
 * excluded — the failure mode that keeps the behaviour under test the same as
 * the behaviour shipped.
 *
 * ## Why the container takes focus when it holds nothing focusable
 *
 * A dialog made only of text still has to take focus, or `aria-modal="true"`
 * stays a lie and the user keeps reading the page behind it. The container gets
 * `tabindex="-1"` for the life of the trap and is put back exactly as it was on
 * teardown.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const isVisible = (element: HTMLElement): boolean =>
  typeof element.checkVisibility === "function"
    ? element.checkVisibility()
    : true;

/**
 * Contain focus inside `ref` while `active` is true, and restore it after.
 *
 * Attach the returned callback to the dialog's outermost node. While active it
 * (a) moves focus inside — onto the container itself if the dialog holds
 * nothing focusable — (b) wraps `Tab` and `Shift+Tab` at the ends, and (c) on
 * teardown returns focus to whatever had it before.
 *
 * Generic over the element type because React 19's `RefObject<T | null>` is not
 * covariant in `T`: a ref typed for `HTMLElement` cannot be attached to a `div`,
 * so the element type has to come from the call site.
 */
export const useFocusTrap = <T extends HTMLElement = HTMLDivElement>(
  active: boolean,
): React.RefCallback<T> => {
  const [node, setNode] = React.useState<T | null>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);

  /*
   * Capture the opener as early as possible (during render when becoming active),
   * before children mount, autofocus, or run layout effects (like TextField's
   * selectOnRender). If we wait until useEffect, an autofocused input inside the
   * dialog has already taken activeElement and the true opener is forgotten.
   */
  if (active && !openerRef.current) {
    const doc =
      node?.ownerDocument ??
      (typeof document !== "undefined" ? document : null);
    const currentActive = doc?.activeElement as HTMLElement | null;
    if (currentActive && (!node || !node.contains(currentActive))) {
      openerRef.current = currentActive;
    }
  }
  if (!active) {
    openerRef.current = null;
  }

  React.useEffect(() => {
    if (!active || !node) {
      return;
    }

    const ownerDocument = node.ownerDocument;
    if (!openerRef.current) {
      const candidate = ownerDocument.activeElement as HTMLElement | null;
      if (candidate && !node.contains(candidate)) {
        openerRef.current = candidate;
      }
    }
    const previouslyFocused = openerRef.current;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        isVisible,
      );

    /*
     * Move focus in, so the next thing a screen reader reads is the dialog
     * rather than whatever was behind it.
     *
     * A dialog with nothing focusable inside still has to take focus, or
     * `aria-modal="true"` is a lie and the user is quietly reading the page
     * behind it. A `div` is not focusable by default, so the container is made
     * programmatically focusable for as long as the trap lives and put back the
     * way it was afterwards.
     */
    const hadTabIndex = node.hasAttribute("tabindex");
    const initialFocus = focusables()[0];
    if (initialFocus) {
      initialFocus.focus();
    } else {
      if (!hadTabIndex) {
        node.setAttribute("tabindex", "-1");
      }
      node.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.defaultPrevented) {
        return;
      }

      const items = focusables();
      if (items.length === 0) {
        // Nothing to move between: hold focus on the container instead of
        // letting the browser walk it out to the document.
        event.preventDefault();
        node.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = ownerDocument.activeElement;

      if (event.shiftKey && (current === first || current === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);

    return () => {
      node.removeEventListener("keydown", onKeyDown);
      if (!hadTabIndex) {
        node.removeAttribute("tabindex");
      }
      /*
       * Restore the opener.
       *
       * This is the half that `Modal`'s existing per-dialog handling cannot do:
       * `Dialog` restores focus in its own `onClose`, which never runs when the
       * dialog is closed by the `openDialog` state changing under it. `trd/09`
       * says focus must never be lost to `<body>`, and that path dropped it
       * there. The opener can also be gone by now — a dialog may be closed by
       * navigating away — so a missing opener must not throw on the way out.
       */
      previouslyFocused?.focus?.();
    };
  }, [active, node]);

  return React.useCallback((element: T | null) => {
    setNode(element);
  }, []);
};
