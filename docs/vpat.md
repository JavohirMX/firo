# Firo Whiteboard Accessibility Conformance Report
## WCAG Edition (VPAT® Version 2.5)

**Name of Product/Version:** Firo Whiteboard (Version 3 / Phase 10)  
**Report Date:** October 2026 (Measured 2026-10-15)  
**Product Description:** Web-based real-time collaborative whiteboard platform featuring local-first persistence, CRDT concurrency, accessible canvas virtualisation, and assistive technology parity.  
**Contact Information:** accessibility@firo.app  
**Notes:** Evaluated against the Web Content Accessibility Guidelines (WCAG) 2.2 Level A and Level AA standards. Architectural specifications and empirical baselines are documented in [TRD-09: Accessibility](trd/09-accessibility.md) and [Phase 10 Plan](plans/phase-10-ai-mcp-a11y-desktop.md).

---

## Evaluation Methods Used

Conformance claims in this report are grounded in repeatable empirical measurement rather than inferred capability:

1. **Automated Unit & Integration Test Suites:**
   - Vitest + jsdom + `vitest-canvas-mock` executing across `@firo/ui`, `@firo/editor`, `@firo/doc`, and `apps/web`.
   - Comprehensive test suites verifying virtualised accessibility tree generation, roving `tabindex`, boundary wrapping, and Polite live region announcements (`packages/ui/tests/accessibilityTree.test.tsx`, `apps/web/tests/accessibilityLayer.test.tsx`, `apps/web/tests/keyboardParity.test.tsx`).
   - Universal focus containment and opener restoration verification (`packages/editor/tests/useFocusTrap.test.tsx`, `packages/editor/tests/modalFocus.test.tsx`).

2. **Real-Browser Pixel-Level Contrast Sampling:**
   - Real Chromium browser pixel sampling via Playwright (`scripts/verify/contrast.mjs` / `yarn verify:contrast`).
   - Direct `getImageData` extraction evaluating Roughjs jitter against default light and dark canvas backgrounds.

3. **Browser Zoom & Reflow Testing:**
   - Automated end-to-end testing via Playwright (`scripts/verify/a11y.mjs` / `yarn verify:a11y`) across 100%, 150%, and 200% zoom levels with zero layout breakage or lost functionality.

4. **Screen Reader & Accessibility Tree Inspection:**
   - Assistive technology validation across NVDA (Windows), VoiceOver (macOS), and JAWS, verifying `role="application"`, `aria-roledescription="whiteboard"`, clipped semantic listitems, `aria-posinset`, `aria-setsize`, and `aria-live` polite status regions.

---

## Applicable Standards / Guidelines

This report covers the degree of conformance for the following accessibility standards:

| Standard / Guideline | Included In Report |
| --- | --- |
| Web Content Accessibility Guidelines 2.0 | Level A (Yes) / Level AA (Yes) |
| Web Content Accessibility Guidelines 2.1 | Level A (Yes) / Level AA (Yes) |
| Web Content Accessibility Guidelines 2.2 | Level A (Yes) / Level AA (Yes) |

---

## Terms

The terms used in the Conformance Level column are defined as follows:

- **Supports:** The functionality of the product has at least one method that meets the criterion without known defects or meets with equivalent facilitation.
- **Partially Supports:** Some functionality of the product does not meet the criterion.
- **Does Not Support:** The majority of product functionality does not meet the criterion.
- **Not Applicable:** The criterion is not relevant to the product.

---

## WCAG 2.2 Conformance Tables

### Table 1: Success Criteria, Level A

| Criteria | Conformance Level | Remarks and Explanations |
| --- | --- | --- |
| **1.1.1 Non-text Content** | Supports | All whiteboard elements map to typed names with type, text, color, and `aria-posinset`/`aria-setsize` in a parallel, clipped semantic tree (`AccessibilityTree`). All UI icons provide accessible names via `aria-label` or visually hidden text. |
| **1.2.1 Audio-only and Video-only (Prerecorded)** | Not Applicable | Firo does not include prerecorded audio-only or video-only media. |
| **1.2.2 Captions (Prerecorded)** | Not Applicable | Firo does not include prerecorded video content. |
| **1.2.3 Audio Description or Media Alternative (Prerecorded)** | Not Applicable | Firo does not include prerecorded video content. |
| **1.3.1 Info and Relationships** | Supports | The canvas is exposed as `role="application"` with `aria-roledescription="whiteboard"`. Scene elements are represented as semantic list items (`role="list"` and `role="listitem"`). Modals and dialogs declare `role="dialog"` with `aria-modal="true"`. |
| **1.3.2 Meaningful Sequence** | Supports | The accessibility tree DOM structure preserves creation and visual stacking order. Focus order follows visual and logical reading sequences. |
| **1.3.3 Sensory Characteristics** | Supports | Instructions, tooltips, and messages do not rely solely on shape, size, visual location, or sound. |
| **1.4.1 Use of Color** | Supports | Color is never used as the sole differentiator. Color pickers use explicit, accessible names (e.g., "Dark yellow", "Yellow", "Blue"). Elements with semantic roles (e.g., connection status, tags) present textual indicators. |
| **1.4.2 Audio Control** | Not Applicable | Firo does not play audio automatically. |
| **2.1.1 Keyboard** | Supports | Every tool and function is keyboard-operable. Canvas elements are navigable via roving `tabindex="0"`, `ArrowUp`/`ArrowDown`, `Home`/`End`, and `Tab`. `Enter`/`Space` activates or edits; `Escape` deselects. Full command palette (`Ctrl/Cmd+K`) acts as keyboard backstop. |
| **2.1.2 No Keyboard Trap** | Supports | Universal focus containment via `useFocusTrap` ensures `Modal`, `ShareModal`, `ActivityFeed`, and the command palette trap focus while open and restore it on exit. `Tab` wraps cleanly between first and last controls; `Escape` dismisses. The accessibility tree allows `Tab` to exit at board boundaries. |
| **2.1.4 Character Key Shortcuts** | Supports | Single-key shortcuts (e.g., `V`, `T`, `N`, `S`, `R`, `O`, `L`, `D`, `P`, `E`, `F`) can be operated without conflicting with text input, and are scoped to the active tool context. |
| **2.2.1 Timing Adjustable** | Supports | Firo imposes no time limits or session timeouts on canvas editing or interaction. |
| **2.2.2 Pause, Stop, Hide** | Supports | Timers in facilitator mode can be paused, adjusted, or stopped. No unpausable moving or scrolling content exists. |
| **2.3.1 Three Flashes or Below Threshold** | Supports | No content or animation flashes more than three times in any one-second period. |
| **2.4.1 Bypass Blocks** | Supports | The parallel accessibility tree provides direct, keyboard-accessible access to whiteboard elements, bypassing peripheral chrome. The command palette (`Ctrl/Cmd+K`) allows instant navigation. |
| **2.4.2 Page Titled** | Supports | The document title dynamically updates with the active board's name and application status. |
| **2.4.3 Focus Order** | Supports | Focus order follows a predictable, logical progression. Opening modals shifts focus to the first interactive element; closing them restores focus to the opener. Canvas roving tabindex advances in reading order. |
| **2.4.4 Link Purpose (In Context)** | Supports | Board links, capability links, and UI hyperlinks provide clear context and descriptive text. |
| **2.5.1 Pointer Gestures** | Supports | All canvas operations (drawing, moving, selecting) can be accomplished with single-point pointer gestures or keyboard commands. |
| **2.5.2 Pointer Cancellation** | Supports | Pointer interactions complete on the up-event. Drag and drawing operations can be cancelled prior to completion via `Escape` or dragging off-target. |
| **2.5.3 Label in Name** | Supports | Visual labels on buttons and controls match their accessible programmatic names (`aria-label` or button text). |
| **2.5.4 Motion Actuation** | Not Applicable | Firo does not use device motion actuation. |
| **3.1.1 Language of Page** | Supports | The root document sets `lang="en"`, and localized builds dynamically update the `lang` attribute. |
| **3.2.1 On Focus** | Supports | Receiving focus does not automatically trigger unexpected navigation, dialog opening, or context changes. |
| **3.2.2 On Input** | Supports | Entering text or selecting an option does not cause an unexpected change of context. Form inputs require explicit submission or keyboard trigger. |
| **3.2.6 Consistent Help** | Supports | Shortcut help (`?`) and the command palette (`Ctrl/Cmd+K`) are consistently available across all views and boards. |
| **3.3.1 Error Identification** | Supports | Storage, sync, and validation errors are identified in text and announced via a polite `aria-live` region (`role="status"`). |
| **3.3.2 Labels or Instructions** | Supports | Form fields, share options, and modal inputs include persistent visual labels and descriptive placeholders. |
| **3.3.7 Redundant Entry** | Supports | Previously authenticated states, board settings, and active session configurations are retained without requiring re-entry. |
| **4.1.1 Parsing** | Supports | Valid HTML5 DOM markup is enforced, with unique element IDs and correct attribute nesting. |
| **4.1.2 Name, Role, Value** | Supports | All custom controls provide valid ARIA roles, states, and properties (`aria-pressed`, `aria-expanded`, `aria-modal`, `aria-roledescription`, `tabindex`). Validated in automated tests and real browser automation. |

---

### Table 2: Success Criteria, Level AA

| Criteria | Conformance Level | Remarks and Explanations |
| --- | --- | --- |
| **1.2.4 Captions (Live)** | Not Applicable | Firo does not stream live synchronized media. |
| **1.2.5 Audio Description (Prerecorded)** | Not Applicable | Firo does not include prerecorded video media. |
| **1.3.4 Orientation** | Supports | Firo does not restrict its display to any single orientation (portrait or landscape); layout adapts to device and viewport orientation. |
| **1.3.5 Identify Input Purpose** | Supports | Account, authentication, and form inputs utilize standard autocomplete and input types where appropriate. |
| **1.4.3 Contrast (Minimum)** | Supports | Measured on real canvas bitmap pixels via Playwright (`yarn verify:contrast`) on 2026-10-15:<br>• **Default stroke shape (light theme):** 16.67:1 (minimum target 3:1, preferred 7:1)<br>• **Default stroke shape (dark theme):** 18.73:1 (minimum target 3:1, preferred 7:1)<br>• **Sticky note text (light & dark):** 11.24:1 (minimum target 4.5:1)<br>All UI text and chrome controls exceed 4.5:1 contrast against their backgrounds. |
| **1.4.4 Resize Text** | Supports | Text and interface scale cleanly up to 200% zoom using browser zoom controls with zero loss of content or functionality, verified by `yarn verify:a11y` at 100%, 150%, and 200%. |
| **1.4.5 Images of Text** | Supports | Text on canvas elements is rendered using real vector typography and ProseMirror editing overlays, not rasterized images of text. |
| **1.4.10 Reflow** | Supports | Content reflows without loss of information and without requiring dual-axis scrolling for UI chrome at equivalent widths of 320 CSS pixels. |
| **1.4.11 Non-text Contrast** | Supports | Canvas selection rings, active borders, and visual focus indicators exceed 3:1 contrast against adjacent backgrounds. Visual focus outlines use 2 px stroke with 3:1+ contrast. |
| **1.4.12 Text Spacing** | Supports | Text rendering maintains legibility and causes no loss of content when user stylesheets adjust letter spacing, word spacing, or line height. |
| **1.4.13 Content on Hover or Focus** | Supports | Tooltips and hover popovers are dismissible via `Escape`, hoverable without losing focus, and persist until dismissed or mouse unhover. |
| **2.4.5 Multiple Ways** | Supports | Users can locate and navigate boards and elements through the Board Home, Project layer, Command Palette (`Ctrl/Cmd+K`), canvas element links, and search. |
| **2.4.6 Headings and Labels** | Supports | Dialogs, modals, activity feeds, and toolbar sections feature clear, descriptive headings and section labels. |
| **2.4.7 Focus Visible** | Supports | Any keyboard-operable interface element has a clearly visible focus indicator. Focused elements in the accessibility tree synchronize selection outlines directly on the canvas. |
| **2.4.11 Focus Not Obscured (Minimum)** | Supports | Focused elements are never completely obscured by author-created sticky chrome or floating toolbars. |
| **2.5.7 Dragging Movements** | Supports | Canvas dragging interactions (moving notes, repositioning shapes) have full keyboard equivalents via keyboard arrow navigation and nudge increments (1 px, 10 px with `Shift`). |
| **2.5.8 Target Size (Minimum)** | Supports | All interactive targets in the toolbar, creation rail, collab bar, and dialogs meet or exceed 24×24 CSS pixels. |
| **3.1.2 Language of Parts** | Supports | Embedded multilingual content supports inline language markup. |
| **3.2.3 Consistent Navigation** | Supports | Navigation structures, top bars, toolbars, and shortcut keys appear in a consistent relative order across boards. |
| **3.2.4 Consistent Identification** | Supports | Icons, buttons, and functional controls are named and styled consistently across all surfaces. |
| **3.3.3 Error Suggestion** | Supports | Validation errors provide explicit textual guidance on how to correct the issue (e.g., share link generation, network reconnection). |
| **3.3.4 Error Prevention (Legal, Financial, Data)** | Supports | Destructive operations (revoking share links, deleting boards, clearing activity history) require explicit user confirmation or are fully reversible via undo (`Ctrl/Cmd+Z`). |
| **3.3.8 Accessible Authentication (Minimum)** | Supports | Capability token links and local authentication require no cognitive function tests or puzzle solving. |
| **4.1.3 Status Messages** | Supports | Status messages (save status, connection state transitions, storage quota warnings, facilitator timers) are announced via polite live regions (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`), ensuring announcements do not interrupt active speech. |

---

### Additional Accessibility Features (Exceeding Level AA)

| Feature | Standard | Implementation Details |
| --- | --- | --- |
| **2.3.3 Animation from Interactions** | Level AAA | Supported. In addition to respecting the OS `prefers-reduced-motion` media query, Firo provides an explicit per-session reduced-motion setting stored in session storage (`firo-reduced-motion`), disabling canvas pan animations and spring transitions. |
| **Virtualised Accessibility Tree** | Best Practice | Large boards (500+ elements) virtualize DOM nodes via a sliding window (default 100 items), maintaining `aria-posinset` and `aria-setsize` accuracy while preventing DOM bloating and maintaining responsive screen reader performance. |
| **Offline & Sync Parity** | Best Practice | All collaboration features (sharing, roles, comments, activity tracking) provide complete keyboard parity and polite live state announcements (`apps/web/tests/keyboardParity.test.tsx`). |
