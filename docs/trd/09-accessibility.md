# Accessibility

**Target: WCAG 2.2 AA, with a published VPAT as a deliverable.**

This is not a compliance exercise. It is one of the nine wedges in
[`../competitive.md`](../competitive.md), and it is a real differentiator: Miro
renders text to a canvas and bolts an accessibility tree over the result. Miro's own
accessibility checker reports issues on ordinary boards.

Doing this properly is a differentiator precisely because almost nobody does it.

## The core problem

A canvas application is a bitmap with a hit-test layer. A screen reader sees a
`<canvas>` element and nothing else. Everything below follows from fixing that.

## The accessibility tree

**A parallel DOM tree mirroring the scene, kept in sync with it, visually hidden but
not `display: none`.**

```html
<div role="application" aria-label="Board" aria-roledescription="whiteboard">
  <ul role="list" aria-label="Board contents">
    <li role="listitem">
      <div role="button" tabindex="-1"
           aria-label="Sticky note: Write the RFC. Yellow. Position 4 of 12.">
      </div>
    </li>
  </ul>
</div>
```

| Requirement | Detail |
| --- | --- |
| Visibility | Clipped, not hidden. `display:none` and `visibility:hidden` both remove it from the accessibility tree. |
| Sync | Rebuilt on document change, debounced to ~200 ms. Not per frame. |
| Size | A 10,000-element board produces a large tree. Virtualise it, and keep the full tree available for search. |
| Position | `aria-posinset` and `aria-setsize` from the element's order, so a screen reader announces "4 of 12". |
| Live region | Separate, polite. Save state, errors, mode changes. Never assertive on every keystroke. |

**A screen reader user must be able to do everything a mouse user can do.** Not a
subset. This is the acceptance test in
[`../prd/04-acceptance-criteria.md`](../prd/04-acceptance-criteria.md) AC-8.

## Keyboard model

**Every function is reachable by keyboard alone.** This is the hardest requirement in
the project and the one most likely to be quietly skipped.

| Key | Action |
| --- | --- |
| `Tab` / `Shift+Tab` | Move between elements |
| `Enter` | Edit a text-bearing element, or activate |
| `Escape` | Exit editing, deselect, or close a dialog |
| `Delete` | Delete selection |
| Arrows | Nudge (1 px), `Shift` for 10 px |
| `Ctrl/Cmd+A` | Select all |
| `Ctrl/Cmd+G` | Group into a container |
| `Ctrl/Cmd+K` | **Command palette — full function access** |
| `Ctrl/Cmd+Z` / `Shift+Z` | Undo / redo |
| `V` `T` `N` `S` `R` `O` `L` `D` `P` `E` `F` | Select tool, as in Miro |
| `?` | Shortcut reference |

**The command palette is the accessibility backstop.** Any function that has no
keyboard shortcut must be in the palette, and the palette must be fully keyboard
navigable. If a feature cannot be reached from the palette, it is not accessible.

**Single-key shortcuts must be individually disableable**, following Miro's pattern.
Users of voice control and screen readers need single keys to do other things.

**The `AGENTS.md` barrier applies here.** Any modal, dialog, or palette must trap
focus correctly and restore it on close. Focus must never be lost to `<body>` or to a
removed element — a screen reader user who loses focus has lost their place on the
board.

## ProseMirror and assistive technology

**The riskiest interaction in the whole project.** A ProseMirror `contenteditable`
overlay positioned over a canvas element is exactly the pattern that breaks screen
reader behaviour, because the caret is in DOM text while the visual position is
canvas.

Mitigations, in order:

1. **The overlay is real DOM with real text.** A screen reader sees the text, not an
   image of it. This is the whole reason the overlay exists rather than canvas-native
   editing.
2. **`aria-multiline="true"` and a label** on the editing region.
3. **Announce the context on entry** — "Editing sticky note, Write the RFC, 3 lines"
   — so the user knows what they are in.
4. **Announce on exit** — "Saved" or "Not saved".
5. **Never move focus on a timer.** Only on an explicit action.

**Test this with VoiceOver on macOS and NVDA on Windows before Phase 4 is called
done.** Not simulated, not inferred. Two of the three ATs we target are free.

## Visual requirements

| Requirement | Target |
| --- | --- |
| Text contrast | 4.5:1 minimum, both themes. 7:1 preferred for the hand-drawn default stroke. |
| Focus indicator | Visible, 2 px, 3:1 against the background. Never removed. |
| Non-colour encoding | Never encode state in colour alone. Miro's *named* colours in the picker ("Dark Green") are a good pattern and we adopt it. |
| Target size | 24×24 CSS px minimum. |
| Browser zoom | 200% with no loss of function. |
| Reduced motion | A **setting**, not only a `prefers-reduced-motion` media query. Users need it per-session, not per-OS. |
| Text scaling | Works with the OS text size setting, not just browser zoom. |

**The hand-drawn aesthetic works against contrast.** Roughjs jitter means an edge is
never exactly where the colour says it is. Measured on **2026-10-15** at default stroke width
using Playwright pixel sampling across light and dark themes (`yarn verify:contrast`):
default stroke shape achieves **16.67:1** (light) and **18.73:1** (dark), exceeding the 7:1
preferred target; sticky note body text achieves **11.24:1** in both themes, exceeding the 4.5:1 target.

## Specific gaps in what we inherited

Excalidraw's accessibility position is not strong, and the fork gives us room:

| Inherited | Problem | Fix |
| --- | --- | --- |
| Toolbar buttons are icon-only | No accessible name | Every control gets a name and a shortcut hint |
| The canvas has no role | Screen readers see nothing | `role="application"` with a managed tree |
| Dialogs may not trap focus | Keyboard users get lost | Audit every dialog; the palette pattern is the reference |
| No reduced-motion setting | Animations cannot be disabled per-session | Add it |
| Text is a canvas bitmap | Unreadable to AT | ProseMirror overlay even in read-only contexts, for screen reader users |

## Definition of done per phase

> **Status note (Phase 10 §10.3a complete).** The Phase 2 and Phase 3 accessibility
> foundation was completed and verified in Phase 10 (§10.3a): `role="application"`
> with `aria-roledescription="whiteboard"`, the parallel virtualised accessibility
> tree (`AccessibilityTree`), roving `tabindex="0"`, `aria-posinset`/`aria-setsize`,
> universal focus trapping (`useFocusTrap`) across all dialogs and palette, polite live
> region announcements for errors/quota/offline/mode changes, measured canvas contrast
> (16.67:1 light / 18.73:1 dark), and 200% zoom verification in real Chromium.
> Phase 10 §10.3b (audit and VPAT publication) follows over this verified foundation.

| Phase | Accessibility requirement |
| --- | --- |
| 2 | Canvas has `role`, a label, and a focusable element list |
| 3 | Full keyboard operation of every tool. Command palette works. |
| 4 | Sticky note and card text editable and announced by a screen reader |
| 5 | Presentation mode navigable by keyboard. Voting keyboard-operable. |
| 6 | Table cells fully keyboard-editable without capturing canvas shortcuts |
| 9 | All board roles operable by keyboard |
| 10 | **VPAT published. Third-party audit. Claims verified, not assumed.** |

**A VPAT is a legal document with accuracy obligations.** We publish one when it is
true, not before. Claiming conformance we have not tested is worse than claiming
none.
