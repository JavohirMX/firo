# Acceptance criteria

Verifiable definitions of done for version 1. Each criterion is stated so that it
can be **checked**, not judged.

These are the tests that decide whether Firo is a real Miro replacement or another
whiteboard that is free but worse.

---

## AC-1 — A workshop can be run offline with no account

> A tester with no network access, no account, and no server opens Firo, creates a
> board, and completes every action in this list: create 50 sticky notes, group them
> into 5 frames, draw 20 connectors between them, run a 5-minute dot vote with
> anonymous voting, run a timer, hide the board and reveal it, present the 5 frames
> as slides, and export a PNG. **No step requires a network, an account, or a
> prompt.**

**Pass:** all 50+ steps complete offline.
**Fail:** any modal, any spinner that never resolves, any feature that silently
requires a server.

---

## AC-2 — No limits

| Limit | Firo | Miro free | Miro paid |
| --- | --- | --- | --- |
| Boards | **Unlimited** | 3 | Unlimited |
| Elements per board | **Unlimited** | Unpublished | Unpublished |
| Sticky notes per board | **Unlimited** | None published | None published |
| People | **Unlimited, free** | Unlimited | Per seat |
| Private boards | **Yes, free** | No | Starter+ |
| Export watermark | **Never** | Yes | No |
| Facilitating (vote, timer, private mode) | **Free** | No | Starter+ |
| Minimum seats | **None** | — | 30 (Enterprise) |

**Acceptance:** no code path anywhere in the application contains a board count, a
seat count, an element cap, or a watermark renderer. This is testable by grep.

---

## AC-3 — Records are one data set

> A tester creates a collection with columns `Title` (text), `Status` (single
> select: Todo / Doing / Done), and `Due` (date), containing five records. They view
> it as a **table**, reorder the records, and switch to **board** projection. They
> drag the "Write the RFC" card from Todo to Done, then switch back to the **table**.
> **The Status cell reads Done, with no reload and no manual sync step.**

Repeat with the grid projection. Repeat after a page reload. Repeat after exporting
to `.firo`, reloading the file, and switching projections.

**Pass:** the record has one identity in every view and across every persistence
boundary.

---

## AC-4 — Arbitrary nesting

> A tester creates a card, drags a second card into it, then a third into the
> second, three levels deep. They collapse the outermost and expand it again. They
> move the outermost card and the two nested cards move with it. They undo and redo
> the move and the tree is correct at each step.

Then: put a list inside a frame inside a section. There is no combination of
container types that produces an error.

---

## AC-5 — Performance

| Scenario | Budget |
| --- | --- |
| Pan a board with 10,000 elements | **60 fps** sustained |
| Zoom from 10% to 400% | No frame over 100 ms |
| Open a board with 5,000 elements | Under 2 s to interactive |
| Move one element in a 10,000-element board | Under 16 ms |
| Text edit round-trip in a table cell | Under 50 ms |
| Idle memory on a 10,000-element board | Under 500 MB |
| Save a board with 10,000 elements and 50 images | Under 1 s, no UI freeze |

Measured on a five-year-old laptop, which is the honest baseline for a self-hosted
audience. Budgets are specified in
[`05-non-functional-requirements.md`](05-non-functional-requirements.md).

---

## AC-6 — The file survives

> A tester creates a board with every element type, 50 images, a record collection
> with four columns and 20 records, tags, votes, and a timer state. They export a
> `.firo` archive. They `cat` it and read the board document as text. They commit it
> to git, change two things, and `git diff` shows the change. They delete the app's
> storage entirely, re-import the file, and every element, record, tag, and vote is
> present.

**Additional:** a `.firo` file written by the previous minor version loads with no
data loss, verified by a fixture test per released version.

---

## AC-7 — Local-first is real

| Check | Expected |
| --- | --- |
| Block all network at the OS level | App is fully functional |
| Open DevTools → Network | No requests, ever |
| Clear all site data, re-import a `.firo` file | Full recovery |
| Read IndexedDB contents | Board documents and assets are legible, not opaque |
| Storage used by a 10,000-element board | Under 50 MB, and it grows with content, not with edits |

**No telemetry, no analytics, no error reporting to a third party, no font or asset
CDN.** This is testable and it is absolute.

---

## AC-8 — Accessibility

> A tester completes a full workshop using **only the keyboard**. They create a
> sticky note, type into it, format the text bold, resize it, group it into a frame,
> connect two notes, open the command palette, export, and undo — without touching a
> pointing device.

Then, with VoiceOver or NVDA: navigate between elements, read an element's type and
content, open its context menu, and activate an action.

**Conformance target:** WCAG 2.2 AA for all non-canvas UI, plus the canvas
requirements in
[`trd/09-accessibility.md`](../trd/09-accessibility.md).
**Deliverable:** a published VPAT.

---

## AC-9 — Migration in

> A tester takes an `.excalidraw` file containing shapes, arrows, text, images,
> freedraw strokes, frames and a sticky note, imports it, and gets a board where
> every element is **editable and correctly positioned** — not a flattened image.

---

## AC-10 — Losing work is not possible by accident

| Action | Required behaviour |
| --- | --- |
| Browser tab closed mid-edit | No data loss; last committed state is on disk |
| `localStorage` and IndexedDB full | Explicit error, no silent data loss |
| Import a file from a newer version | **Loud failure** with a clear message, not silent data loss |
| Import a file that fails validation | Nothing is written; the existing board is untouched |
| Delete a container with children | Explicit choice: delete children, or re-parent |
| Corrupt the IndexedDB store | Recoverable from the last good `.firo` export |

---

## AC-11 — The renderer rewrite succeeded (Phase 2 gate)

The project's riskiest phase has a hard gate:

1. 10,000-element board at 60 fps, per AC-5.
2. Rendering output is **visually equivalent** to Excalidraw's for the inherited
   element types. Reference images are compared in tests.
3. A scene of 10,000 elements can be created, saved, and loaded within the AC-5
   budgets.
4. Rotation, resizing, arrow binding, and hit testing are correct at all zoom levels.

**If the gate is not met by the end of the phase timebox**, the fallback is
triggered: revert to a thinner fork of Excalidraw's renderer, ship a smaller
product, and record the outcome as a superseding ADR. This is a scheduled
decision point, not a failure.

---

## AC-12 — Self-hosting works (v2 gate)

> A tester on a clean Linux box runs the documented install command. Within five
> minutes, two browsers on the same network are editing the same board, seeing each
> other's cursors, and a third with commenter rights can add comments but cannot
> move anything. The tester restarts the server and no work is lost.

**Single container. No external database. No Redis. No message queue.**
