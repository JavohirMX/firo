# Phase 10 §10.3a — Accessibility foundation, completion

> **For an agentic worker:** execute this task-by-task, in order. Steps use
> checkbox (`- [ ]`) syntax. Every task ends in a verification command and a
> commit. Do not batch tasks.

**Goal:** finish the accessibility foundation that §10.3a started, so the
Phase 10 VPAT (`§10.3b`) has something true to certify.

**Architecture:** three independent slices against the tree shipped in
`08c0987` — a focus trap for every dialog and the command palette, virtualised
rendering so a 10,000-element board does not build a 10,000-node tree, and
measurement rather than assertion for contrast. Each slice is a self-contained
deliverable with its own tests.

**Tech Stack:** TypeScript strict, React 19, vitest + jsdom +
`vitest-canvas-mock`, SCSS, Playwright (already a root devDependency) for
anything requiring real pixels or real focus.

## Global Constraints

- **No `any` in our own packages.** `packages/editor` is inherited code; match
  its local style there and do not widen it.
- **browser globals in library code:** `app.ownerWindow` / `app.ownerDocument`,
  never bare `document` / `window`. `apps/web/**` is the app and may use them.
- **Tests are the definition of done.** vitest, jsdom, `vitest-canvas-mock`.
  Match the assertion style of the file being edited.
- **Run `yarn test:update` before any commit that changes rendering.**
- **Never weaken an existing test to make a new one pass.**
- **Commands:** `yarn test:typecheck`, `yarn vitest run <path>`, `yarn test`,
  `yarn fix`. A change is not done until `yarn fix` reports no changes.
- **The app consumes `@firo/*` as `dist/dev` build output, not source.**
  `yarn build:packages` is REQUIRED before any browser script run. A stale
  bundle makes a working change look inert. This has cost this repo two
  measured debugging sessions (`scripts/verify/framesImages.mjs`).
- **Browser verification is launched windowed, deliberately.** Headless
  Chromium rasterises in software on macOS, which changes every pixel
  measurement. Print what was actually measured; never assert silently.
- **Docs move with the code.** `docs/trd/09-accessibility.md` is the spec for
  this work; update its "Definition of done per phase" status note when a
  requirement becomes true.
- **A claim you cannot verify is not a claim.** This whole §10.3a slice exists
  because §3.7 was recorded complete without being built.

---

## Task 1: A focus trap, and the editor's Modal uses it

**Status: done in `c8bd644`.** This document is left uncommitted for review.

**Files:**
- Create: `packages/editor/hooks/useFocusTrap.ts`
- Create: `packages/editor/tests/useFocusTrap.test.tsx`
- Modify: `packages/editor/index.tsx` (export the hook)
- Modify: `packages/editor/components/Modal.tsx`
- Test: `packages/editor/tests/modalFocus.test.tsx`

**Interfaces:**
- Produces:
  `useFocusTrap<T extends HTMLElement = HTMLDivElement>(active: boolean): React.RefCallback<T>`
  — attach the returned **callback ref** to the dialog's outermost node. It is
  generic because React 19's `RefObject<T | null>` is not covariant in `T`: a
  `RefObject<HTMLElement | null>` cannot be attached to a `div`, so the element
  type has to come from the call site. While `active` is true it (a) moves
  focus inside on mount, (b) moves it onto the container itself when the dialog
  holds nothing focusable, (c) wraps `Tab`/`Shift+Tab` at the ends, and
  (d) restores focus to whatever was focused before, on unmount.
- Consumes: nothing from earlier tasks.

**Shipped as.** Four things in the draft below changed on contact with the code.
The committed files, not this document, are the source of truth.

1. **The ref is a callback and the node is state.** Dialogs here are portalled,
   and `useCreatePortalContainer` returns `null` until its layout effect has
   created the container — so `Modal` renders nothing on its first pass and the
   dialog node attaches on a *later* render. A `RefObject` would give the
   effect nothing to depend on: it would run once, see `current === null`, and
   never move focus in. The hook returns a memoised `React.RefCallback<T>`,
   memoised because React detaches and reattaches the node whenever a ref
   callback's identity changes.
2. **`checkVisibility()` replaces `getClientRects()`.** jsdom has no layout
   engine and reports an empty rect list for every element, so the draft's
   filter leaves every dialog with *no* focusable content and the test would
   have been measuring jsdom rather than the behaviour. Where `checkVisibility`
   does not exist the element is included rather than excluded — the failure
   mode that keeps what is tested the same as what ships.
3. **The container takes focus when it holds nothing focusable.** A dialog made
   only of text still has to take focus, or `aria-modal="true"` stays a lie and
   the user keeps reading the page behind it. It gets `tabindex="-1"` for the
   life of the trap and is put back as it was on teardown.
4. **The Modal test is app-level, and only half of it is this task's red test.**
   The draft's standalone `render(<Modal>)` renders nothing — there is no
   container context — so it would fail on a missing dialog rather than on
   missing focus. `packages/editor/tests/modalFocus.test.tsx` instead drives the
   app the way it is used: `render(<Excalidraw />)`, `openDialog` in, then out
   again. Its first test fails without the trap (`Dialog` restores focus only in
   its own `onClose`, which does not run when the dialog is dismissed by state,
   so focus went to `<body>` — the exact clause `trd/09` forbids); the second is
   a guard against `Dialog`'s own island wrap being dropped.

Verified while building it: `yarn test:typecheck`, the full suite
(`yarn test:app --watch=false`, 248 files / 4003 tests), `yarn test:update` (no
snapshot changed) and `yarn fix` (no changes).

**Where this lives, and why not `@firo/ui`.** The layer diagram in
[`../architecture/overview.md`](../architecture/overview.md) puts `@firo/ui`
*above* `@firo/editor`, and dependencies point downward only — so the editor
cannot import the chrome package. Verified: `packages/editor` has **zero**
imports from `@firo/ui` today, and `@firo/ui`'s `dependencies` is `{}`
deliberately. The hook therefore lives in the editor, which is where both of its
eventual consumers (`Modal`, the palette) already are, alongside the existing
`packages/editor/hooks/` files. `apps/web` sits above both and imports it from
`@firo/editor` in Task 2; `@firo/ui` stays dependency-free and takes the trap
from its host instead.

**Why this is first:** `focus-trap` has **zero** matches in the repository. The
editor's `Modal` declares `role="dialog" aria-modal="true"` and handles
`Escape`, but nothing contains focus and nothing restores it — so
`aria-modal="true"` is currently a false statement, and a keyboard user who
tabs out of a dialog lands behind it. `trd/09`: "Any modal, dialog, or palette
must trap focus correctly and restore it on close. Focus must never be lost to
`<body>`…".

- [x] **Step 1: Write the failing test**

`packages/editor/tests/useFocusTrap.test.tsx` — the draft below; the shipped
file adds two cases (a node that attaches on a later render, and a dialog with
nothing focusable) and ends on six tests.

```tsx
import { describe, expect, it } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { useFocusTrap } from "../hooks/useFocusTrap";

const Dialog: React.FC<{ open: boolean }> = ({ open }) => {
  const ref = useFocusTrap<HTMLDivElement>(open);
  if (!open) {
    return null;
  }
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Test dialog">
      <button type="button">first</button>
      <button type="button">last</button>
    </div>
  );
};

describe("useFocusTrap", () => {
  it("moves focus inside on mount", () => {
    render(<Dialog open />);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "first" }),
    );
  });

  it("wraps Tab at the end and Shift+Tab at the start", () => {
    render(<Dialog open />);
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("restores focus to the opener on unmount", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<Dialog open />);
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `yarn vitest run packages/editor/tests/useFocusTrap.test.tsx`
Expected: FAIL — `../hooks/useFocusTrap` does not exist.

- [x] **Step 3: Write the hook**

`packages/editor/hooks/useFocusTrap.ts`

```ts
import * as React from "react";

/**
 * Focus containment for dialogs and palettes.
 *
 * `trd/09` requires that every modal, dialog and palette traps focus and
 * restores it on close, and that focus is never lost to `<body>`. Nothing in
 * the repository did this: the editor's `Modal` declared `aria-modal="true"`
 * without containing focus, which made the attribute a false statement and let
 * a keyboard user tab out of a dialog and land behind it.
 *
 * ## Why `checkVisibility()` and not `offsetParent` or `getClientRects()`
 *
 * The usual "is it visible" trick — `el.offsetParent !== null` — is wrong for
 * anything with `position: fixed`, because a fixed element has no offset
 * parent and reads as hidden. Dialogs are frequently fixed. `getClientRects()`
 * is the other common answer, and it cannot be used here: jsdom has no layout
 * engine and reports an empty list for every element, so a test would see a
 * dialog with no focusable content at all. `checkVisibility()` is accurate
 * where it exists, and where it does not the element is included rather than
 * excluded.
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

export const useFocusTrap = <T extends HTMLElement = HTMLDivElement>(
  active: boolean,
): React.RefCallback<T> => {
  const [node, setNode] = React.useState<T | null>(null);

  React.useEffect(() => {
    if (!active || !node) {
      return;
    }
    const ownerDocument = node.ownerDocument;
    const previouslyFocused = ownerDocument.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        isVisible,
      );

    // Move focus in, so a screen reader's next read is the dialog, not
    // whatever was behind it. A dialog holding nothing focusable takes focus
    // itself, or `aria-modal="true"` stays a lie.
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
        // Nothing focusable: keep focus on the container rather than letting
        // the browser move it out to the document.
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
      // The opener may be gone (a dialog was closed by navigating away); a
      // missing opener must not throw on the way out.
      previouslyFocused?.focus?.();
    };
  }, [active, node]);

  return React.useCallback((element: T | null) => {
    setNode(element);
  }, []);
};
```

- [x] **Step 4: Export it from the editor's public entry**

`packages/editor/index.tsx` — add beside the existing hook re-exports (it
already re-exports `useApp` and `useExcalidrawSetAppState` from
`./components/App`):

```ts
export { useFocusTrap } from "./hooks/useFocusTrap";
```

- [x] **Step 5: Run the test to verify it passes**

Run: `yarn vitest run packages/editor/tests/useFocusTrap.test.tsx`
Expected: PASS — 6 tests.

- [x] **Step 6: Write the failing Modal test**

`packages/editor/tests/modalFocus.test.tsx`

**Superseded — see "Shipped as", above.** The draft below mounts `Modal` on
its own, which renders nothing: `useCreatePortalContainer` returns `null`
without the editor's container context, so it would fail on a missing dialog
rather than on missing focus. The shipped file drives the real app instead.

```tsx
import { describe, expect, it } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { Modal } from "../components/Modal";

describe("Modal focus containment", () => {
  it("contains Tab inside the dialog and restores the opener on close", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "open";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <Modal onCloseRequest={() => {}} labelledBy="title">
        <h1 id="title">Properties</h1>
        <button type="button">only action</button>
      </Modal>,
    );

    // Focus moved into the dialog, not left on the opener behind it.
    expect(document.activeElement).not.toBe(trigger);

    const action = screen.getByRole("button", { name: "only action" });
    action.focus();
    fireEvent.keyDown(action, { key: "Tab" });
    // Wrapped, rather than leaving the dialog.
    expect(document.activeElement).not.toBe(trigger);
    expect(
      screen.getByRole("dialog").contains(document.activeElement),
    ).toBe(true);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
```

- [x] **Step 7: Run it to verify it fails**

Run: `yarn vitest run packages/editor/tests/modalFocus.test.tsx`
Expected: FAIL — focus is never moved into the dialog.

- [x] **Step 8: Wire the trap into Modal**

`packages/editor/components/Modal.tsx` — add the import and apply the ref to
the outermost dialog node. Change only these lines:

```tsx
import { useFocusTrap } from "../hooks/useFocusTrap";
```

Inside the component, before the early return (the hook must run
unconditionally, so it goes above `if (!modalRoot)`):

```tsx
const focusTrapRef = useFocusTrap<HTMLDivElement>(true);
```

Then on the outer dialog element:

```tsx
<div
  ref={focusTrapRef}
  className={clsx("Modal", props.className, {
    "animations-disabled": animationsDisabled,
  })}
  role="dialog"
  aria-modal="true"
  onKeyDown={handleKeydown}
  aria-labelledby={props.labelledBy}
>
```

**Do not reach for `@firo/ui` here**, for the layering reason in Interfaces
above. Import from `../hooks/useFocusTrap` and confirm the graph is unchanged:
`yarn build:excalidraw` must still succeed and `packages/editor/package.json`
must gain no new dependency.

- [x] **Step 9: Run both test files**

Run: `yarn vitest run packages/editor/tests/useFocusTrap.test.tsx packages/editor/tests/modalFocus.test.tsx`
Expected: PASS.

- [x] **Step 10: Verify nothing regressed, then commit**

Run: `yarn test:typecheck && yarn vitest run packages/editor/tests packages/ui/tests && yarn fix`

```bash
git add packages/editor/hooks/useFocusTrap.ts \
  packages/editor/tests/useFocusTrap.test.tsx packages/editor/index.tsx \
  packages/editor/components/Modal.tsx packages/editor/tests/modalFocus.test.tsx
git commit -m "feat(a11y): trap and restore focus in the editor's dialogs"
```

---

## Task 2: The command palette guard and the host dialogs

**Status: done in `7e0de96`.**

**Files:**
- Modify: `apps/web/components/ShareModal.tsx`
- Modify: `apps/web/App.tsx` (supplies the trap ref to `ActivityFeed`)
- Modify: `packages/ui/src/components/ActivityFeed.tsx` (accept a `dialogRef`)
- Test: `packages/editor/tests/commandPaletteFocus.test.tsx`
- Test: `packages/ui/tests/activityFeed.test.tsx` (extend)

**Interfaces:**
- Consumes: `useFocusTrap` from Task 1, imported as `@firo/editor` from
  `apps/web` and as a relative path from inside the editor.
- Produces: `ActivityFeedProps.dialogRef?: React.Ref<HTMLDivElement>` — the
  host owns the trap, because the host owns `isOpen`, and `@firo/ui` must not
  grow a dependency to own one.

**Correction, verified against the code.** The draft of this task claimed the
palette "lets Tab escape to the page behind it". It does not, and it needs no
new trap: `CommandPalette` renders `<Dialog>` (`CommandPalette.tsx`), which
wraps Tab across the island it owns, and Task 1 put that whole dialog inside
`Modal`'s trap. The palette's input focus and `Esc` are already the `Dialog`
path. What this task therefore does is (a) **guard** the palette — its being the
`trd/09` accessibility backstop makes a regression there expensive, and nothing
tested it — and (b) add the trap to the two dialogs that are *not* the editor's
and so never went through `Modal` at all: `ShareModal` and `ActivityFeed`. Both
declare `role="dialog"` in markup and neither contained or restored focus.

- [x] **Step 1: Write the failing palette test**

`packages/editor/tests/commandPaletteFocus.test.tsx` — mount the app, open the
palette the way the app does (`h.app.setState({ openDialog: { name:
"commandPalette" } })`), and assert its input has focus, `Tab` stays inside the
dialog, and closing returns focus to the opener. Copy the shape of
`modalFocus.test.tsx` from Task 1.

- [x] **Step 2: Run it**

Run: `yarn vitest run packages/editor/tests/commandPaletteFocus.test.tsx`
Expected: **PASS already** — this is a guard, not a red test. Per the correction
above the palette is already inside Task 1's trap. If it fails, that is the
finding, and the trap goes on the palette's own dialog node instead.

- [x] **Step 3: Apply the trap to both host dialogs**

`ShareModal`: `import { useFocusTrap } from "@firo/editor"` and put the ref on
its dialog node, with `isOpen` as the `active` argument — the component returns
`null` while closed, but the hook still has to be called unconditionally.

`ActivityFeed`: add an optional `dialogRef` prop and attach it to the existing
`role="dialog"` node beside `data-testid`. In `apps/web/App.tsx`, create
`const activityFeedDialogRef = useFocusTrap<HTMLDivElement>(activityFeedOpen)`
and pass it —
the trap then lives with the state that opens the dialog, and `@firo/ui` stays
dependency-free.

- [x] **Step 4: Run the palette test and the ActivityFeed suite**

Run: `yarn vitest run packages/editor/tests/commandPaletteFocus.test.tsx packages/ui/tests/activityFeed.test.tsx apps/web/tests`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/editor/tests/commandPaletteFocus.test.tsx \
  apps/web/components/ShareModal.tsx apps/web/App.tsx \
  packages/ui/src/components/ActivityFeed.tsx packages/ui/tests/activityFeed.test.tsx
git commit -m "feat(a11y): each host dialog traps its own focus"
```

---

## Task 3: Virtualise the accessibility tree

**Status: done in `015b32c`.**

**Files:**
- Modify: `packages/ui/src/components/AccessibilityTree.tsx`
- Modify: `packages/ui/src/accessibility.ts` (add `DEFAULT_TREE_WINDOW`, export it)
- Test: `packages/ui/tests/accessibilityTree.test.tsx` (extend)

**Interfaces:**
- Adds to `AccessibilityTreeProps`:
  `windowSize?: number` (default `DEFAULT_TREE_WINDOW = 100`).
- Adds to `accessibility.ts`:
  `export const DEFAULT_TREE_WINDOW = 100;`
  and
  `export const treeWindowStart = (activeIndex: number, length: number, windowSize: number): number`
  — pure, so the window maths is testable without a DOM.
- Behaviour is unchanged for boards smaller than the window.

**Why:** `trd/09`: "A 10,000-element board produces a large tree. Virtualise it,
and keep the full tree available for search." Today the tree maps every item to
a node, so a large board builds a large DOM on every debounced refresh. The
full item list is still passed in — that is what keeps the tree available for
search — only the *render* is windowed.

- [x] **Step 1: Write the failing tests**

Add to `packages/ui/tests/accessibilityTree.test.tsx`:

```tsx
import { treeWindowStart, DEFAULT_TREE_WINDOW } from "../src";

describe("treeWindowStart", () => {
  it("keeps the active element inside the window", () => {
    // 10 of 500, centred where possible.
    const start = treeWindowStart(250, 500, 10);
    expect(start).toBeLessThanOrEqual(250);
    expect(start + 10).toBeGreaterThan(250);
  });

  it("clamps at both ends", () => {
    expect(treeWindowStart(0, 500, 10)).toBe(0);
    expect(treeWindowStart(499, 500, 10)).toBe(490);
  });

  it("never starts below zero on a board smaller than the window", () => {
    expect(treeWindowStart(3, 5, DEFAULT_TREE_WINDOW)).toBe(0);
  });
});

describe("AccessibilityTree virtualisation", () => {
  const many = Array.from({ length: 500 }, (_, i) => ({
    id: `n${i}`,
    kind: "Rectangle",
  }));

  it("renders only a window, while still reporting the true set size", () => {
    render(<AccessibilityTree items={many} windowSize={10} onActivate={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    // The position is the position in the board, not in the window.
    const firstRendered = screen.getByRole("button", { name: /Position 1 of 500/ });
    expect(firstRendered.closest("li")!.getAttribute("aria-setsize")).toBe("500");
  });

  it("shifts the window when focus moves past its end", () => {
    render(<AccessibilityTree items={many} windowSize={10} onActivate={vi.fn()} />);

    const buttons = screen.getAllByRole("button");
    buttons[9].focus();
    fireEvent.keyDown(buttons[9], { key: "ArrowDown" });

    // Focused element is now 11 of 500, and it is rendered.
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Rectangle. Position 11 of 500.",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `yarn vitest run packages/ui/tests/accessibilityTree.test.tsx`
Expected: FAIL — `treeWindowStart` is not exported; 500 list items render.

- [x] **Step 3: Add the pure window maths**

`packages/ui/src/accessibility.ts`

```ts
/**
 * How many tree nodes are rendered at once.
 *
 * Large enough that a screen reader user navigates without the window chasing
 * them on every arrow key, small enough that a 10,000-element board does not
 * build a 10,000-node DOM on every debounced refresh. The full item list is
 * always held by the component: this bounds the *render*, not the data.
 */
export const DEFAULT_TREE_WINDOW = 100;

/**
 * The first index to render, such that `activeIndex` is inside the window.
 *
 * Clamped at both ends so the window does not start before the first element or
 * run past the last, which would leave blank space at the end of a list a
 * screen reader is reading linearly.
 */
export const treeWindowStart = (
  activeIndex: number,
  length: number,
  windowSize: number,
): number => {
  if (length <= windowSize) {
    return 0;
  }
  const centred = activeIndex - Math.floor(windowSize / 2);
  return Math.max(0, Math.min(centred, length - windowSize));
};
```

- [x] **Step 4: Window the render**

In `AccessibilityTree.tsx`:

1. Add `windowSize = DEFAULT_TREE_WINDOW` to the destructured props and to
   `AccessibilityTreeProps`.
2. Replace the render with a windowed slice, keeping **absolute** indices for
   the refs and the roving compare:

```tsx
  const nodes = React.useMemo(() => buildAccessibilityNodes(items), [items]);
  const windowStart = treeWindowStart(activeIndex, nodes.length, windowSize);
  const visible = React.useMemo(
    () => nodes.slice(windowStart, windowStart + windowSize),
    [nodes, windowStart, windowSize],
  );

  const pendingFocusRef = React.useRef<number | null>(null);

  // `focusIndex` changes the active index, which can move the window, so the
  // node to focus may not exist until after this render.
  React.useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null) {
      return;
    }
    const element = itemRefs.current[pending];
    if (element) {
      element.focus();
      pendingFocusRef.current = null;
    }
  }, [windowStart, activeIndex]);
```

```tsx
  const focusIndex = (index: number) => {
    setActiveIndex(index);
    pendingFocusRef.current = index;
  };
```

3. In the `.map`, iterate `visible` but carry the absolute index:

```tsx
        {visible.map((node, offset) => {
          const index = windowStart + offset;
          return (
            <li
              key={node.id}
              aria-posinset={node.posinset}
              aria-setsize={node.setsize}
            >
              <div
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                className="firo-a11y__item"
                role="button"
                tabIndex={index === activeIndex ? 0 : -1}
                aria-label={node.label}
                aria-pressed={node.id === selectedId ? true : undefined}
                onClick={() => onActivate(node.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onFocus={() => {
                  setActiveIndex(index);
                  onFocusElement?.(node.id);
                }}
              />
            </li>
          );
        })}
```

4. Add `windowStart` to the deps of the clamp effect that follows an external
   selection, and keep the existing `activeIndex > nodes.length - 1` clamp.

- [x] **Step 5: Run the full tree suite**

Run: `yarn vitest run packages/ui/tests/accessibilityTree.test.tsx`
Expected: PASS — the original 18 plus the new cases.

- [x] **Step 6: Confirm the app still builds and the layer still works**

Run: `yarn vitest run apps/web/tests/accessibilityLayer.test.tsx && yarn test:typecheck`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add packages/ui/src/accessibility.ts \
  packages/ui/src/components/AccessibilityTree.tsx \
  packages/ui/tests/accessibilityTree.test.tsx
git commit -m "perf(a11y): render the tree through a window, not in full"
```

---

## Task 4: Announce errors and mode changes, politely

**Status: done in `ff8491e`.**

**Files:**
- Modify: `apps/web/App.tsx` (compute and pass `liveMessage`)
- Modify: `docs/trd/09-accessibility.md` (status note)
- Test: `apps/web/tests/accessibilityLayer.test.tsx` (extend)

**Interfaces:**
- Consumes: `AccessibilityTree`'s existing `liveMessage` prop (already wired
  through `AccessibilityLayer`).
- Produces: nothing new.

**Why:** `trd/09`'s live-region row names three things — "Save state, errors,
mode changes". Save state is `SaveStatusIndicator` (`aria-live="polite"`,
`apps/web/components/SaveStatusIndicator.tsx:33`). Errors and mode changes are
silent today. Do **not** add a second region for save state: two polite regions
speaking about the same event is two announcements.

- [x] **Step 1: Write the failing test**

Extend `apps/web/tests/accessibilityLayer.test.tsx`:

```tsx
  it("announces a message in the tree's polite live region", () => {
    render(
      <AccessibilityLayer items={items} liveMessage="Could not save: storage is full" />,
    );

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Could not save: storage is full");
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `yarn vitest run apps/web/tests/accessibilityLayer.test.tsx`
Expected: FAIL — `AccessibilityLayer` does not accept or forward `liveMessage`.

- [x] **Step 3: Forward the prop, then derive it in the app**

`AccessibilityLayer.tsx`: add `liveMessage?: string` to the props and pass it to
`<AccessibilityTree … liveMessage={liveMessage} />`.

`apps/web/App.tsx`, in `ExcalidrawWrapper`, derive it from state the component
already holds — `errorMessage`, `localStorageQuotaExceeded`, `isCollaborating &&
isOffline`, and `appState.viewModeEnabled` — into one string (priority order:
error, quota, offline, then mode), and pass it to `<AccessibilityLayer />`
alongside `items` and `boardLabel`.

- [x] **Step 4: Run the tests**

Run: `yarn vitest run apps/web/tests/accessibilityLayer.test.tsx apps/web/tests/facilitatorBar.test.tsx`
Expected: PASS — including the existing save-status assertion, unchanged.

- [x] **Step 5: Update the spec's status**

In `docs/trd/09-accessibility.md`, extend the Phase 10 status note to say the
live region now carries errors and mode changes, and that save state remains
`SaveStatusIndicator`'s so the two do not double-announce.

- [x] **Step 6: Commit**

```bash
git add apps/web/App.tsx apps/web/components/AccessibilityLayer.tsx \
  apps/web/tests/accessibilityLayer.test.tsx docs/trd/09-accessibility.md
git commit -m "feat(a11y): announce errors and mode changes in the polite live region"
```

---

## Task 5: Measure the rendered contrast instead of asserting it

**Status: done in `306d90a`.**

**Files:**
- Create: `scripts/verify/contrast.mjs`
- Modify: `package.json` (add `"verify:contrast": "node scripts/verify/contrast.mjs"`)
- Modify: `docs/trd/09-accessibility.md` (record the measurement)

**Interfaces:**
- Produces: a script that exits non-zero when a measured ratio is below target,
  and prints every ratio it measured.
- Consumes: the app's default element styling; no code change to the app is
  expected unless a ratio fails.

**Why:** `trd/09`: "The hand-drawn aesthetic works against contrast. Roughjs
jitter means an edge is never exactly where the colour says it is. This needs
measurement, not eyeballing: render at the default stroke width and measure
actual rendered contrast." A jsdom test cannot see a pixel, so this is a
browser script, and the repository already has the pattern
(`scripts/verify/framesImages.mjs`).

**Targets** (`trd/09`): text 4.5:1 minimum; non-text 3:1; 7:1 preferred for the
default stroke. Fail under 4.5:1, warn between 4.5:1 and 7:1 for the stroke.

- [x] **Step 1: Write the script**

`scripts/verify/contrast.mjs`. Follow `framesImages.mjs`'s conventions exactly:
a header comment stating what it proves and what it does NOT prove, `BASE` from
`process.env.FIRO_URL ?? "http://localhost:3000"`, `chromium.launch()` windowed,
and a final summary that prints every number.

```js
import { chromium } from "playwright";

const BASE = process.env.FIRO_URL ?? "http://localhost:3000";

/** WCAG 2.x relative luminance for an sRGB channel value in 0..255. */
const channel = (value) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast ratio between two [r,g,b] triples. 1..21. */
export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * The worst (lowest) contrast between the darkest stroke pixels and the
 * background, which is the number that decides pass or fail. Sampling the
 * *average* would hide exactly the antialiased edge the hand-drawn stroke makes
 * the risk.
 */
export const worstContrast = (samples, background) =>
  samples.reduce(
    (worst, sample) => Math.min(worst, contrastRatio(sample, background)),
    Infinity,
  );

const CHECKS = [
  // Filled by Step 2 from the app's own defaults.
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const results = [];
for (const check of CHECKS) {
  await check.draw(page);
  const { pixels, background } = await check.sample(page);
  const ratio = worstContrast(pixels, background);
  results.push({ name: check.name, ratio, target: check.target });
}

await browser.close();

let failed = false;
for (const { name, ratio, target } of results) {
  const ok = ratio >= target;
  failed ||= !ok;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}: ${ratio.toFixed(2)}:1 (target ${target}:1)`,
  );
}
process.exit(failed ? 1 : 0);
```

- [x] **Step 2: Fill in `CHECKS` from the app's real defaults**

Two checks, minimum: the default stroke shape (`#1e1e1e` per
`COLOR_PALETTE.black`) and a sticky note's body text (`#FFF9B1` per
`MIRO_STICKY_NOTE_COLORS.yellow`), each in the light and the dark theme. Drive
each by selecting the tool, clicking the canvas, and reading pixels back with
`page.evaluate` and the canvas's own `getImageData` — that needs no new
dependency. **Do not add a dependency for this without checking with the human
first.**

Targets: stroke `3` (non-text; warn under `7`), body text `4.5`.

- [x] **Step 3: Run it and record what it actually measured**

```bash
yarn build:packages
yarn start &
node scripts/verify/contrast.mjs
```

Expected: it prints every ratio. **Whatever it prints is the result** — if the
stroke measures below 7:1, that is a finding to record in `trd/09`, not a
number to tune the script around. If it fails at 4.5:1, raise it with the human
before changing any colour: a visual change here re-baselines the reference
image snapshots.

- [x] **Step 4: Record the measurement in the spec**

`docs/trd/09-accessibility.md`: replace the "needs measurement" sentence's
status with the measured values, dated, and note that
`yarn verify:contrast` reproduces them.

- [x] **Step 5: Commit**

```bash
git add scripts/verify/contrast.mjs package.json docs/trd/09-accessibility.md
git commit -m "test(a11y): measure rendered contrast rather than assert it"
```

---

## Task 6: Prove the contract in a real browser at 200% zoom

**Status: done in `7ef9d82`.**

**Files:**
- Create: `scripts/verify/a11y.mjs`
- Modify: `package.json` (`"verify:a11y": "node scripts/verify/a11y.mjs"`)

**Interfaces:**
- Consumes: the tree shipped in `08c0987`; nothing from Tasks 1–5 is required,
  but the focus checks are only meaningful after Tasks 1 and 2.
- Produces: an end-to-end check of the accessibility contract.

**Why:** every unit test above runs in jsdom, which has no layout, no zoom and
no real focus. `trd/09` requires testing "at 200% browser zoom and with OS text
scaling", and the previous slice's browser run already caught two defects jsdom
could not (sticky-note colours, and the tree blanking while typing). This
script is that run, made repeatable.

- [x] **Step 1: Write the script**

Use the same conventions as `scripts/verify/framesImages.mjs` (windowed launch,
`__firoBoard` available for document assertions, print what it got). Assert:

1. `role="application"` exists, is named for the board, and has
   `aria-roledescription="whiteboard"`.
2. Placing three sticky notes yields exactly three list items, each labelled
   `Sticky note. <colour>. Position N of 3.` with matching
   `aria-posinset`/`aria-setsize`.
3. `ArrowDown` moves focus, the focused node's `aria-label` matches the node the
   canvas has selected, and the roving `tabindex="0"` follows.
4. With a dialog open, `Tab` from the last control keeps
   `document.activeElement` inside the dialog; closing restores the opener.
5. Re-run assertions 1–3 with `document.documentElement.style.zoom = "2"` and
   again at `"1.5"`, to prove zoom does not break navigation.
6. `page.on("pageerror")` collected nothing.

- [x] **Step 2: Run it**

```bash
yarn build:packages
yarn start &
node scripts/verify/a11y.mjs
```

Expected: every line `PASS`, and a printed summary of the zoom levels actually
tested. A `FAIL` here is a real defect, not a flaky check: jsdom cannot produce
it, so nothing else was covering it.

- [x] **Step 3: Commit**

```bash
git add scripts/verify/a11y.mjs package.json
git commit -m "test(a11y): verify the board contract in a browser, including at 200% zoom"
```

---

## Verification — the phase's exit for §10.3a

- `yarn test:typecheck` passes
- `yarn test` passes, with the new tests for every task above
- `yarn fix` reports no changes
- `yarn verify:a11y` passes at 100%, 150% and 200% zoom
- `yarn verify:contrast` passes, and the measured ratios are recorded in
  `trd/09-accessibility.md`
- `focus-trap` is no longer a zero-match search: every dialog and the palette
  contain focus and restore it
- Search `packages/` for `role="dialog"` and confirm each one is either wrapped
  in a trap or has a comment saying why it does not need one

**Not in this plan, and still outstanding for the VPAT:** virtualised *search*
over the tree (`trd/09` keeps the full tree available for search; Task 3 keeps
the data but adds no search UI), OS text-scaling emulation as distinct from
browser zoom, and the third-party audit itself (`§10.3b`).

## Risks

| Risk | Mitigation |
| --- | --- |
| The focus primitive lands in the wrong package and inverts the layering | **Resolved, not deferred:** it lives in `@firo/editor`. `@firo/ui` sits above the editor and the editor has no `@firo/ui` import today, so the chrome package cannot be its home; `@firo/ui`'s own dialog takes the ref from its host |
| The focus trap steals focus from a palette input that wants it | The hook only moves focus when nothing inside is focused; Task 2 Step 3 makes that explicit |
| A contrast failure tempts a colour change that re-baselines snapshots | Task 5 Step 3 requires raising it with the human first, and `yarn test:update` is a separate, deliberate step |
| Windowed rendering breaks `aria-posinset`, quietly | Task 3 asserts the true set size on a 500-item board, not the window size |
| The browser scripts drift from the app | Both scripts live in `scripts/verify/` beside `framesImages.mjs` and follow its prerequisites block verbatim |
