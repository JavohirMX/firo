/**
 * Does what `0c85ad3` claims actually happen in the app?
 *
 * ## The problem this exists for
 *
 * `frame` and `image` reached `@firo/schema` and both directions of the fold, and
 * the commit is covered by unit tests. That is not sufficient, and this repository
 * has been bitten five times in a row by the same class of failure: the canvas
 * draws the element perfectly, Excalidraw's own `LocalData` keeps a redundant copy
 * so the board survives a reload, and the document was never asked. Nothing looks
 * wrong. The element is simply absent from the autosave, from every sync update
 * and from every `.firo` file.
 *
 * A unit test cannot see that, because it never runs the canvas. Every check here
 * therefore ends in `window.__firoBoard.read()` — the document's own answer — and
 * never in a screenshot or a length.
 *
 * ## Prerequisites
 *
 * ```sh
 * yarn build:packages   # REQUIRED. The app consumes @firo/* as dist/dev build
 *                       # output, not source. A stale bundle makes a working
 *                       # change look completely inert — measured twice in this
 *                       # repo, and it is the most expensive trap here.
 * yarn start            # dev server on :3000
 * node scripts/verify/framesImages.mjs
 * ```
 *
 * Launched **windowed**, deliberately. Headless Chromium rasterises in software on
 * macOS (`WEBGL_debug_renderer_info` reports SwiftShader), which changes every
 * timing number. The run prints what it actually got so nobody has to assume.
 *
 * This machine is shared. `uptime` is printed at three points; a failure count
 * here means nothing without it.
 *
 * ## What it proves
 *
 * 1. a frame drawn with the frame tool reaches the document, and its name survives
 * 2. an image pasted from the clipboard reaches the document *and its asset store*,
 *    and its pixels are still drawn after a reload
 * 3. both survive a reload (the 400ms debounced autosave plus the `pagehide` flush)
 * 4. a board of frames exports to `.firo` and re-imports into an empty board;
 *    a board with a live image is refused, and the refusal says why
 * 5. `containerId` survives as the document *field* — the bug this commit fixed
 * 6. `frameId` on an element inside a frame round-trips
 * 7. undo tombstones rather than removes, so `live()` drops while `.length` holds
 *
 * ## What it does NOT prove
 *
 * - **The image tool was not driven.** It opens a native file picker, which
 *   Playwright cannot drive through a synthetic click. This drives the *paste*
 *   path instead, with a real `paste` ClipboardEvent carrying a real `File`. Both
 *   land in `app.insertImages` (`App.clipboard.ts:171`), so the asset path is
 *   genuinely exercised — but the toolbar button itself is untouched.
 * - Nothing about sync, multiple clients, or merging. One tab, one writer.
 * - No timing or performance claim. The load average is recorded for
 *   reproducibility, not as a measurement.
 * - It covers exactly the two new types and the `containerId` fix. It is not a
 *   general persistence suite.
 *
 * ## Two traps this script exists because of
 *
 * - **Tombstones.** `doc.read()` returns deleted elements, so `.length` across an
 *   undo reports a no-op. Count `__firoBoard.live()`.
 * - **The styles panel.** See `assertOverCanvas` below. A drag that starts inside
 *   the left island never reaches the app, and reads as a persistence failure.
 *
 * Falsifiability: this script was run against a deliberately broken `splitCustomData`
 * and the containerId checks went red. See the "negative test" note on `check`.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";

const BASE = process.env.FIRO_URL ?? "http://localhost:3000";
const OUT = join(tmpdir(), "firo-verify");
mkdirSync(OUT, { recursive: true });

/*
 * `console.log` is the point of a script like this: its output *is* the result,
 * read by a person or captured to a file. `no-console` is silenced once here
 * rather than on every call site.
 */
/* eslint-disable no-console */
const log = (...args) => console.log(...args);
/* eslint-enable no-console */
const hr = (title) => log(`\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}`);

const failures = [];
const passes = [];

/**
 * Record one assertion.
 *
 * Every one of these is observed from the app or its storage. None is inferred
 * from a passing unit test. Returns the boolean so a stage can branch on it.
 */
const check = (name, ok, detail) => {
  log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (detail !== undefined) {
    log(`      ${JSON.stringify(detail)}`);
  }
  (ok ? passes : failures).push(name);
  return ok;
};

const loadAverage = () => {
  try {
    return execSync("uptime").toString().trim();
  } catch {
    return "(unavailable)";
  }
};

/* -------------------------------------------------------------------------- */
/* Page helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Open the app on a board.
 *
 * A board is empty because every stage gets its own Playwright context, which is
 * an isolated storage partition — the app's `firo` IndexedDB database does not
 * cross contexts. Stage 4 asserts that rather than assuming it.
 */
const boot = async (page) => {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => Boolean(window.__firoBoard?.read),
    undefined,
    {
      timeout: 90_000,
    },
  );
  await page.waitForTimeout(1200);
  const welcome = page.locator(".welcome-screen");
  if (await welcome.count()) {
    await welcome
      .first()
      .click({ position: { x: 10, y: 10 } })
      .catch(() => {});
  }
  await page.waitForTimeout(700);
  await page.mouse.move(640, 560);
  await page.waitForTimeout(250);
};

const read = (page) => page.evaluate(() => window.__firoBoard.read());
const live = (page) => page.evaluate(() => window.__firoBoard.live());
const editorElements = (page) =>
  page.evaluate(() => window.__firoBoard.editorElements());
const appState = (page) => page.evaluate(() => window.__firoBoard.appState());

/** Past the 400ms autosave debounce, with room to spare. */
const afterAutosave = async (page, ms = 1200) => {
  await page.waitForTimeout(ms);
};

/** Let the canvas actually repaint, rather than trusting a timeout alone. */
const settlePaint = async (page, frames = 24) => {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let remaining = n;
        const step = () =>
          remaining-- > 0 ? requestAnimationFrame(step) : resolve();
        requestAnimationFrame(step);
      }),
    frames,
  );
};

/**
 * Refuse to drag over anything that is not the canvas.
 *
 * ## The trap, measured
 *
 * Selecting a shape tool opens the styles panel; selecting the frame tool opens a
 * smaller one. Both are `Island`s floating over the canvas with
 * `pointer-events: all`, so their boxes are not canvas:
 *
 * - rectangle: island `[16, 76, 195, 551]` — pointerdown at (100, 300) hits the island
 * - frame:     island `[16, 76, 176, 163]` — pointerdown at (100, 150) hits the island
 * - selection: no island; the canvas is reachable everywhere
 *
 * A drag starting inside one of those boxes never reaches the app: `pointerdown`
 * targets the island, no element is created, and the tool stays active. A driver
 * that draws in the top-left therefore reports "shapes do not reach the document" —
 * a false negative produced entirely by the panel, and invisible unless you
 * instrument where `pointerdown` went. It cost two runs here before it was measured.
 *
 * The panel is *visible* UI, so this is a harness trap and **not** an app defect.
 * It is also pre-existing and orthogonal to `0c85ad3`, which touched no CSS.
 * Kept as a guard so it cannot come back silently.
 */
const assertOverCanvas = async (page, points) => {
  const bad = [];
  for (const [x, y] of points) {
    const found = await page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px, py);
        if (!el) {
          return { canvas: false, what: "null" };
        }
        const r = el.getBoundingClientRect();
        const cls = el.className?.toString() ?? "";
        return {
          canvas: cls.includes("excalidraw__canvas"),
          what: `${el.tagName}.${cls.slice(0, 50)} [${Math.round(
            r.x,
          )},${Math.round(r.y)},${Math.round(r.width)},${Math.round(
            r.height,
          )}]`,
        };
      },
      [x, y],
    );
    if (!found.canvas) {
      bad.push(`(${x},${y}) -> ${found.what}`);
    }
  }
  if (bad.length) {
    throw new Error(
      `gesture would land on UI, not the canvas:\n    ${bad.join("\n    ")}`,
    );
  }
};

const dragOnCanvas = async (page, x1, y1, x2, y2, steps = 12) => {
  await assertOverCanvas(page, [
    [x1, y1],
    [x2, y2],
  ]);
  await page.mouse.move(x1, y1);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(60);
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      x1 + ((x2 - x1) * i) / steps,
      y1 + ((y2 - y1) * i) / steps,
    );
    await page.waitForTimeout(8);
  }
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(300);
};

const pickTool = async (page, key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(350);
  log(
    `      tool after ${key}: ${JSON.stringify(
      (await appState(page))?.activeTool?.type,
    )}`,
  );
};

const drawFrame = async (page, box) => {
  await pickTool(page, "f");
  await dragOnCanvas(page, box[0], box[1], box[2], box[3]);
};

const drawShape = async (page, key, box) => {
  await pickTool(page, key);
  await dragOnCanvas(page, box[0], box[1], box[2], box[3]);
};

/**
 * Rename a frame, the way a person does.
 *
 * Double-clicking the `.frame-name` label is the real gesture (`App.tsx` wires
 * `onDoubleClick` to `editingFrame`). Enter also opens the input, but only when
 * exactly one element is selected, which is less reliable straight after a drag.
 */
const frameLabelIndex = (page, frameId) =>
  page.evaluate(
    (id) =>
      Array.from(document.querySelectorAll(".frame-name")).findIndex((n) =>
        n.id.endsWith(`frame-name-${id}`),
      ),
    frameId,
  );

const nameFrame = async (page, frameId, name) => {
  const index = await frameLabelIndex(page, frameId);
  if (index < 0) {
    throw new Error(
      `no .frame-name label for frame ${frameId}; labels: ${JSON.stringify(
        await page.evaluate(() =>
          Array.from(document.querySelectorAll(".frame-name")).map((n) => n.id),
        ),
      )}`,
    );
  }
  const label = page.locator(".frame-name").nth(index);
  await label.waitFor({ state: "visible", timeout: 10_000 });
  await label.dblclick();
  const input = page.locator(".frame-name input");
  await input.waitFor({ state: "visible", timeout: 8000 });
  await input.click();
  await input.fill("");
  await input.type(name, { delay: 15 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
};

/* -------------------------------------------------------------------------- */
/* Image paste and pixel-level verification                                    */
/* -------------------------------------------------------------------------- */

/**
 * Paste an image through a real `paste` ClipboardEvent carrying a real `File`.
 *
 * The image tool opens a native file picker, which Playwright cannot drive through
 * a synthetic click; the clipboard is the other half of the same code path and
 * reaches the same `app.insertImages`. See the header for what that does and does
 * not prove.
 *
 * The PNG is generated in the page rather than pasted from a constant for two
 * reasons. It is large enough to occupy a real region, so it can be compared
 * pixel-for-pixel across a reload; and it carries four quadrants plus a diagonal,
 * so a placeholder box drawn in its place is visibly different from the picture.
 * A 2x2 image would pass a reference-only check while saying nothing about whether
 * the bytes came back — which is the caveat that motivated this function.
 */
const pasteImage = async (page, { name = "probe.png", size = 120 } = {}) => {
  // Focus the canvas and set the viewport's last pointer position, which
  // `pasteFromClipboard` reads to decide whether the canvas is under the cursor.
  await page.mouse.move(700, 420);
  await assertOverCanvas(page, [[700, 420]]);
  await page.mouse.click(700, 420);
  await page.waitForTimeout(250);

  return page.evaluate(
    async ({ fileName, px }) => {
      const canvas = document.createElement("canvas");
      canvas.width = px;
      canvas.height = px;
      const g = canvas.getContext("2d");
      g.fillStyle = "#ff0000";
      g.fillRect(0, 0, px / 2, px / 2);
      g.fillStyle = "#00ff00";
      g.fillRect(px / 2, 0, px / 2, px / 2);
      g.fillStyle = "#0000ff";
      g.fillRect(0, px / 2, px / 2, px / 2);
      g.fillStyle = "#ffffff";
      g.fillRect(px / 2, px / 2, px / 2, px / 2);
      g.strokeStyle = "#000000";
      g.lineWidth = Math.max(2, px / 12);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(px, px);
      g.stroke();

      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      const file = new File([blob], fileName, { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      document.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      );
      return { dispatched: true, fileSize: file.size, fileType: file.type };
    },
    { fileName: name, px: size },
  );
};

/**
 * Screen rect of a document element, computed rather than guessed.
 *
 * `appState` is the editor's own internal state (`App.tsx:809` returns `this.state`),
 * so this is the renderer's own transform. Guessing the placement instead — assuming
 * the paste lands top-left at the cursor — is exactly the kind of thing that makes a
 * pixel check pass while sampling the wrong region.
 */
const screenRectOf = async (page, element, inset = 12) => {
  const s = await appState(page);
  const zoom = s.zoom.value;
  return {
    x: Math.round((element.x - s.scrollX) * zoom + s.offsetLeft + inset),
    y: Math.round((element.y - s.scrollY) * zoom + s.offsetTop + inset),
    width: Math.round(element.width * zoom - inset * 2),
    height: Math.round(element.height * zoom - inset * 2),
  };
};

/** A hash of the rendered pixels in a screen region. */
const pixelsOf = async (page, rect) => {
  if (rect.width < 8 || rect.height < 8) {
    throw new Error(`pixel rect too small to sample: ${JSON.stringify(rect)}`);
  }
  const buf = await page.screenshot({ clip: rect });
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
};

/**
 * Prove the picture is actually drawn, and that the comparison is sensitive to it.
 *
 * Three hashes of the *same* screen region:
 *
 *   withImage   the picture is on the canvas
 *   noImage     the paste has been undone, so the region is bare canvas
 *   afterReload the picture again, after a reload from the autosave
 *
 * `withImage !== noImage` is the negative control: it proves the region really
 * contains the picture and that the hash can tell the difference. Without it, an
 * assertion of `afterReload === withImage` would be satisfied by two identical
 * pictures *or* by two identical blank regions, and would prove nothing.
 *
 * A stability pair is also taken before the reload, so a canvas that is still
 * animating is reported as such instead of quietly producing a mismatch.
 */
const verifyImagePixels = async (page, imageElement, log2 = log) => {
  const rect = await screenRectOf(page, imageElement);
  log2(`      pixel rect: ${JSON.stringify(rect)}`);

  await settlePaint(page);
  const withImage = await pixelsOf(page, rect);
  const withImageAgain = await pixelsOf(page, rect);

  await page.keyboard.press("Meta+z");
  await afterAutosave(page, 900);
  await settlePaint(page);
  const noImage = await pixelsOf(page, rect);
  const liveAfterUndo = (await live(page)).editor;

  await page.keyboard.press("Meta+Shift+z");
  await afterAutosave(page, 900);
  await settlePaint(page);
  const afterRedo = await pixelsOf(page, rect);

  return {
    rect,
    withImage,
    withImageAgain,
    noImage,
    afterRedo,
    liveAfterUndo,
    stable: withImage === withImageAgain,
    /** the negative control: the hash must distinguish picture from bare canvas */
    controlPassed: withImage !== noImage,
    redoRestored: afterRedo === withImage,
  };
};

/* -------------------------------------------------------------------------- */
/* File actions through the real menu                                          */
/* -------------------------------------------------------------------------- */

const openMainMenu = async (page) => {
  await page.locator('[data-testid="main-menu-trigger"]').click();
  await page.waitForTimeout(500);
};

const clickMenuItem = async (page, label) => {
  const item = page
    .locator(".dropdown-menu-item, .App-menu__item, [role='menuitem']")
    .filter({ hasText: label })
    .first();
  await item.waitFor({ state: "visible", timeout: 8000 });
  await item.click();
};

/** The refusal toast, or null. `.Toast__message` is the editor's own class. */
const readToast = async (page) => {
  const toast = page.locator(".Toast__message");
  try {
    await toast.first().waitFor({ state: "visible", timeout: 6000 });
    return (await toast.first().innerText()).trim();
  } catch {
    return null;
  }
};

const importInto = async (page, path) => {
  await openMainMenu(page);
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 15_000 });
  await clickMenuItem(page, "Import board from .firo file");
  const chooser = await chooserPromise;
  await chooser.setFiles(path);
};

/* ========================================================================== */
/* 0. Environment                                                             */
/* ========================================================================== */
hr("0. ENVIRONMENT");
log(`load before: ${loadAverage()}`);

const browser = await chromium.launch({ headless: false });
const consoleLog = [];
const attachLogging = (page, tag) => {
  page.on("pageerror", (e) =>
    consoleLog.push(`[${tag}] pageerror: ${String(e)}`),
  );
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      consoleLog.push(`[${tag}] ${m.type()}: ${m.text()}`);
    }
  });
};

const context0 = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const probe = await context0.newPage();
await probe.goto(BASE, { waitUntil: "domcontentloaded" });
await probe.waitForFunction(
  () => Boolean(window.__firoBoard?.read),
  undefined,
  {
    timeout: 90_000,
  },
);
log(
  `canvas renderer: ${await probe.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl");
    if (!gl) {
      return "(no webgl)";
    }
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : "(no ext)";
  })}`,
);
log(`user agent: ${await probe.evaluate(() => navigator.userAgent)}`);
log(`headless: false — headless Chromium rasterises in software on macOS`);
await context0.close();

/* ========================================================================== */
/* 1 + 2. Frame and image reach the document                                  */
/* ========================================================================== */
hr(
  "1 + 2. DRAW A FRAME, NAME IT, PASTE AN IMAGE — WHAT DOES THE DOCUMENT HOLD?",
);

const ctxA = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const pageA = await ctxA.newPage();
attachLogging(pageA, "A");
await boot(pageA);

log("\n-- draw a frame --");
await drawFrame(pageA, [300, 210, 820, 520]);
await afterAutosave(pageA);
const afterFrame = await read(pageA);
log(
  `document: ${JSON.stringify(
    afterFrame.elements?.map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
      w: e.width,
      h: e.height,
    })),
  )}`,
);
log(
  `editor:    ${JSON.stringify(
    (await editorElements(pageA)).map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
    })),
  )}`,
);
check(
  "1a. a frame reaches the document",
  Boolean(afterFrame.elements?.some((e) => e.type === "frame")),
  {
    doc: afterFrame.elements?.map((e) => e.type),
    live: await live(pageA),
  },
);

const frameEl = afterFrame.elements.find((e) => e.type === "frame");
log(`frame as stored: ${JSON.stringify(frameEl, null, 2)}`);

log("\n-- name the frame --");
await nameFrame(pageA, frameEl.id, "Checkout flow");
await afterAutosave(pageA);
const namedFrame = (await read(pageA)).elements.find((e) => e.type === "frame");
check("1b. the frame's name survives", namedFrame?.name === "Checkout flow", {
  name: namedFrame?.name,
});

log("\n-- drag a rectangle into the frame --");
await drawShape(pageA, "r", [900, 600, 1120, 690]);
await afterAutosave(pageA, 700);
await dragOnCanvas(pageA, 1010, 645, 480, 330, 20);
await afterAutosave(pageA);
const afterNest = await read(pageA);
const shape = afterNest.elements.find((e) => e.type === "rectangle");
log(
  `document: ${JSON.stringify(
    afterNest.elements?.map((e) => ({
      id: e.id,
      type: e.type,
      frameId: e.frameId,
      containerId: e.containerId,
      customData: e.customData,
    })),
  )}`,
);
check(
  "6. frameId on an element inside a frame reaches the document",
  shape?.frameId === namedFrame?.id,
  { frameId: shape?.frameId, frame: namedFrame?.id },
);

log("\n-- paste an image --");
log(`paste: ${JSON.stringify(await pasteImage(pageA))}`);
await afterAutosave(pageA, 2500);
await settlePaint(pageA);
const imageEl = (await read(pageA)).elements.find((e) => e.type === "image");
const editorImage = (await editorElements(pageA)).find(
  (e) => e.type === "image",
);
log(`image as stored: ${JSON.stringify(imageEl, null, 2)}`);
log(
  `editor image:   ${JSON.stringify(
    editorImage && {
      fileId: editorImage.fileId,
      status: editorImage.status,
      scale: editorImage.scale,
      crop: editorImage.crop,
    },
  )}`,
);
check("2. an image reaches the document", Boolean(imageEl), {
  types: (await read(pageA)).elements?.map((e) => e.type),
});
check(
  "2b. the image carries a fileId reference and is not merely pending",
  typeof imageEl?.fileId === "string" &&
    imageEl.fileId.length > 0 &&
    imageEl?.status === "saved",
  { fileId: imageEl?.fileId, status: imageEl?.status },
);
check(
  "2c. the editor's copy of the image agrees with the document's",
  editorImage?.fileId === imageEl?.fileId,
  { document: imageEl?.fileId, editor: editorImage?.fileId },
);

/* ========================================================================== */
/* 3. Reload, and the pixels                                                  */
/* ========================================================================== */
hr("3. RELOAD — DO BOTH SURVIVE, AND IS THE PICTURE STILL DRAWN?");

log("\n-- pixel baseline before the reload (includes the negative control) --");
const pixelsBefore = await verifyImagePixels(pageA, imageEl);
log(`      hashes: ${JSON.stringify(pixelsBefore)}`);
check(
  "3a. the pixel hash can tell the picture from bare canvas (negative control)",
  pixelsBefore.controlPassed,
  { withImage: pixelsBefore.withImage, noImage: pixelsBefore.noImage },
);
check(
  "3b. the canvas is stable between two consecutive samples (repaint settled)",
  pixelsBefore.stable,
  { a: pixelsBefore.withImage, b: pixelsBefore.withImageAgain },
);
check(
  "3c. undo removes the pasted image and redo puts it back",
  pixelsBefore.liveAfterUndo === 2 && pixelsBefore.redoRestored,
  {
    liveAfterUndo: pixelsBefore.liveAfterUndo,
    afterRedo: pixelsBefore.afterRedo,
  },
);

log(`\nload before reload: ${loadAverage()}`);
await pageA.waitForTimeout(2000);
await pageA.reload({ waitUntil: "domcontentloaded" });
await pageA.waitForFunction(
  () => Boolean(window.__firoBoard?.read),
  undefined,
  {
    timeout: 90_000,
  },
);
await pageA.waitForTimeout(3000);
await settlePaint(pageA);

const afterReload = await read(pageA);
const reloadTypes = afterReload.elements?.map((e) => e.type) ?? [];
log(
  `document after reload: ${JSON.stringify(
    afterReload.elements?.map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
      fileId: e.fileId,
      frameId: e.frameId,
    })),
  )}`,
);
log(
  `editor after reload:   ${JSON.stringify(
    (await editorElements(pageA)).map((e) => ({ id: e.id, type: e.type })),
  )}`,
);
check("3d. the frame survives a reload", reloadTypes.includes("frame"), {
  types: reloadTypes,
});
check("3e. the image survives a reload", reloadTypes.includes("image"), {
  types: reloadTypes,
});
check(
  "3f. the frame keeps its name across a reload",
  afterReload.elements.find((e) => e.type === "frame")?.name ===
    "Checkout flow",
  { name: afterReload.elements.find((e) => e.type === "frame")?.name },
);
check(
  "3g. the image keeps its fileId across a reload",
  afterReload.elements.find((e) => e.type === "image")?.fileId ===
    imageEl?.fileId,
  {
    before: imageEl?.fileId,
    after: afterReload.elements.find((e) => e.type === "image")?.fileId,
  },
);

log("\n-- the pixels after the reload --");
const pixelsAfter = await pixelsOf(pageA, pixelsBefore.rect);
const pixelsAfterAgain = await pixelsOf(pageA, pixelsBefore.rect);
log(
  `      before=${pixelsBefore.withImage} after=${pixelsAfter} (repeat=${pixelsAfterAgain})`,
);
check(
  "3h. the image is still DRAWN after a reload, byte-for-byte in that region",
  pixelsAfter === pixelsBefore.withImage,
  { before: pixelsBefore.withImage, after: pixelsAfter },
);
check(
  "3i. the post-reload sample is stable too",
  pixelsAfter === pixelsAfterAgain,
  { a: pixelsAfter, b: pixelsAfterAgain },
);
check(
  "3j. and it is not merely the blank canvas it replaced",
  pixelsAfter !== pixelsBefore.noImage,
  { after: pixelsAfter, blank: pixelsBefore.noImage },
);

writeFileSync(
  join(OUT, "boardA-before-reload.json"),
  JSON.stringify(afterReload, null, 2),
);

/* ========================================================================== */
/* 4. Export refusal with an image, and a frame-only file round trip          */
/* ========================================================================== */
hr("4a. EXPORT A BOARD CONTAINING AN IMAGE — DOES THE REFUSAL FIRE?");
let downloadSeen = null;
pageA.on("download", (d) => {
  downloadSeen = d.suggestedFilename();
});
await openMainMenu(pageA);
log(
  `menu: ${await pageA.evaluate(() =>
    (document.querySelector(".dropdown-menu")?.textContent ?? "")
      .replace(/\s+/g, " ")
      .slice(0, 200),
  )}`,
);
await clickMenuItem(pageA, "Export board as .firo file");
const refusalToast = await readToast(pageA);
log(`toast: ${JSON.stringify(refusalToast)}`);
check(
  "4a. export refuses a board with a non-tombstoned image",
  typeof refusalToast === "string" &&
    /cannot be exported yet/i.test(refusalToast),
  { toast: refusalToast },
);
check(
  "4b. the refusal says the format carries the reference and not the bytes",
  typeof refusalToast === "string" &&
    /reference but not its bytes/i.test(refusalToast),
  { toast: refusalToast },
);
check(
  "4c. the refusal says the autosave is unaffected — and it is (see 3d-3j)",
  typeof refusalToast === "string" &&
    /autosave is unaffected/i.test(refusalToast),
  { toast: refusalToast },
);
check("4d. no file was downloaded", downloadSeen === null, { downloadSeen });

hr("4e. A BOARD OF FRAMES: EXPORT → IMPORT INTO AN EMPTY BOARD");

const ctxB = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  acceptDownloads: true,
});
const pageB = await ctxB.newPage();
attachLogging(pageB, "B");
await boot(pageB);

await drawFrame(pageB, [300, 210, 620, 400]);
await afterAutosave(pageB, 800);
const b1 = await read(pageB);
await nameFrame(
  pageB,
  b1.elements.find((e) => e.type === "frame").id,
  "Discovery",
);
await afterAutosave(pageB, 800);
await drawFrame(pageB, [700, 210, 1020, 400]);
await afterAutosave(pageB, 800);
const b2 = await read(pageB);
await nameFrame(
  pageB,
  b2.elements.filter((e) => e.type === "frame").at(-1).id,
  "Build",
);
await afterAutosave(pageB, 800);
await drawShape(pageB, "r", [760, 270, 900, 340]);
await afterAutosave(pageB, 700);
await dragOnCanvas(pageB, 830, 305, 845, 312, 6); // nudge so membership is re-evaluated
await afterAutosave(pageB, 1500);

const boardB = await read(pageB);
log(
  `source document: ${JSON.stringify(
    boardB.elements?.map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
      frameId: e.frameId,
    })),
  )}`,
);

const downloadPromise = pageB.waitForEvent("download", { timeout: 20_000 });
await openMainMenu(pageB);
await clickMenuItem(pageB, "Export board as .firo file");
let download = null;
try {
  download = await downloadPromise;
} catch {
  /* reported by the check below */
}
let exportedPath = null;
if (download) {
  exportedPath = join(OUT, download.suggestedFilename());
  await download.saveAs(exportedPath);
}
check(
  "4e-i. exporting a board of frames produces a .firo download",
  download !== null && exportedPath !== null,
  {
    suggested: download?.suggestedFilename(),
    exportedPath,
  },
);

let parsedExport = null;
if (exportedPath) {
  parsedExport = JSON.parse(readFileSync(exportedPath, "utf8"));
  log(
    `exported file: ${JSON.stringify(
      parsedExport.elements?.map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name,
        frameId: e.frameId,
      })),
    )}`,
  );
}
check(
  "4e-ii. the exported file carries both frames, named",
  parsedExport?.elements?.filter((e) => e.type === "frame").length === 2 &&
    parsedExport.elements.some((e) => e.name === "Discovery") &&
    parsedExport.elements.some((e) => e.name === "Build"),
  { names: parsedExport?.elements?.map((e) => e.name) },
);
await ctxB.close();

const ctxC = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  acceptDownloads: true,
});
const pageC = await ctxC.newPage();
attachLogging(pageC, "C");
await boot(pageC);
const emptyBefore = await read(pageC);
check(
  "4f-i. the import target really is empty",
  emptyBefore.elements.length === 0,
  {
    elements: emptyBefore.elements.length,
  },
);

await importInto(pageC, exportedPath);
await pageC.waitForTimeout(3000);
await settlePaint(pageC);
const imported = await read(pageC);
const importedEditor = await editorElements(pageC);
log(
  `document after import: ${JSON.stringify(
    imported.elements?.map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
      frameId: e.frameId,
    })),
  )}`,
);
log(
  `editor after import:   ${JSON.stringify(
    importedEditor?.map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
      frameId: e.frameId,
    })),
  )}`,
);
check(
  "4f-ii. the imported board holds both frames",
  imported.elements?.filter((e) => e.type === "frame").length === 2,
  {
    types: imported.elements?.map((e) => e.type),
  },
);
check(
  "4f-iii. the imported frames keep their names",
  imported.elements?.some((e) => e.name === "Discovery") &&
    imported.elements?.some((e) => e.name === "Build"),
  { names: imported.elements?.map((e) => e.name) },
);
check(
  "4f-iv. the imported frames are on the canvas, not only in the document",
  (importedEditor ?? []).filter((e) => e.type === "frame").length === 2,
  { editor: (importedEditor ?? []).map((e) => e.type) },
);
check(
  "4f-v. frameId crosses the file",
  imported.elements?.some((e) => e.type === "rectangle" && e.frameId),
  {
    elements: imported.elements?.map((e) => ({
      type: e.type,
      frameId: e.frameId,
    })),
  },
);

hr("4g. IMPORT INTO A NON-EMPTY BOARD MUST REFUSE");
await importInto(pageC, exportedPath);
await pageC.waitForTimeout(1500);
const refusedToast = await readToast(pageC);
check(
  "4g. importing into a board that already has content is refused",
  typeof refusedToast === "string" && /not imported/i.test(refusedToast),
  {
    toast: refusedToast,
  },
);
await ctxC.close();

/* ========================================================================== */
/* 5. containerId — the bug this commit fixed                                  */
/* ========================================================================== */
hr("5. containerId — THE BUG THIS COMMIT FIXED");

/**
 * The editor never writes Firo's `containerId`: `addElementsToFrame`
 * (`packages/element/src/frame.ts`) sets `frameId` and nothing else. So the only
 * way a browser ever holds one is from a document that already has it, and an
 * import is the honest way to set that up. Everything after the import is the
 * app's own doing.
 */
const containerBoard = {
  version: 1,
  meta: { id: "verify-container", created: 1, updated: 1 },
  elements: [
    {
      id: "sec0000001",
      type: "frame",
      name: "Section one",
      x: 0,
      y: 0,
      width: 600,
      height: 400,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "#ffffff",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roundness: null,
      roughness: 1,
      opacity: 100,
      version: 1,
      versionNonce: 1,
      index: "a0",
      created: 1,
      updated: 1,
      isDeleted: false,
      deletedAt: null,
      groupIds: [],
      frameId: null,
      containerId: null,
      bindings: [],
      link: null,
      locked: false,
    },
    {
      id: "shape00001",
      type: "rectangle",
      x: 100,
      y: 120,
      width: 200,
      height: 120,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "#ffffff",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roundness: null,
      roughness: 1,
      opacity: 100,
      version: 1,
      versionNonce: 1,
      index: "a1",
      created: 1,
      updated: 1,
      isDeleted: false,
      deletedAt: null,
      groupIds: [],
      frameId: "sec0000001",
      // The field under test.
      containerId: "sec0000001",
      bindings: [],
      link: null,
      locked: false,
      // A host application's own key, to prove the split does not eat it either.
      customData: { "vendor.example": "kept" },
    },
  ],
  collections: [],
  records: [],
};
containerBoard.elementOrder = containerBoard.elements.map((e) => e.id);
const containerPath = join(OUT, "container-board.firo");
writeFileSync(containerPath, JSON.stringify(containerBoard, null, 2));

const ctxD = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const pageD = await ctxD.newPage();
attachLogging(pageD, "D");
await boot(pageD);
await importInto(pageD, containerPath);
await pageD.waitForTimeout(2500);

const importedD = await read(pageD);
const importedShape = importedD.elements.find((e) => e.id === "shape00001");
log(
  `just imported: ${JSON.stringify({
    containerId: importedShape?.containerId,
    customData: importedShape?.customData,
    frameId: importedShape?.frameId,
  })}`,
);
check(
  "5a. containerId is in the document straight after import",
  importedShape?.containerId === "sec0000001",
  {
    containerId: importedShape?.containerId,
    customData: importedShape?.customData,
  },
);
check(
  "5b. customData survives and carries no duplicate firo.containerId",
  importedShape?.customData?.["vendor.example"] === "kept" &&
    importedShape?.customData?.["firo.containerId"] === undefined,
  { customData: importedShape?.customData },
);

log(
  "\n-- force a fold: the fold runs over the whole scene on every editor change --",
);
await drawShape(pageD, "d", [820, 580, 1000, 670]);
await pageD.waitForTimeout(1800);
const foldedShape = (await read(pageD)).elements.find(
  (e) => e.id === "shape00001",
);
log(
  `after one editor change: ${JSON.stringify({
    containerId: foldedShape?.containerId,
    customData: foldedShape?.customData,
  })}`,
);
check(
  "5c. containerId survives the fold AS THE FIELD, not only inside customData",
  foldedShape?.containerId === "sec0000001" &&
    foldedShape?.customData?.["firo.containerId"] === undefined,
  {
    containerId: foldedShape?.containerId,
    customData: foldedShape?.customData,
  },
);

log("\n-- reload, which re-projects and re-folds from storage --");
await pageD.waitForTimeout(1500);
await pageD.reload({ waitUntil: "domcontentloaded" });
await pageD.waitForFunction(
  () => Boolean(window.__firoBoard?.read),
  undefined,
  { timeout: 90_000 },
);
await pageD.waitForTimeout(3000);
const reloadedShape = (await read(pageD)).elements.find(
  (e) => e.id === "shape00001",
);
log(
  `after reload: ${JSON.stringify({
    containerId: reloadedShape?.containerId,
    customData: reloadedShape?.customData,
    frameId: reloadedShape?.frameId,
  })}`,
);
check(
  "5d. containerId survives a reload as the field",
  reloadedShape?.containerId === "sec0000001" &&
    reloadedShape?.customData?.["firo.containerId"] === undefined,
  {
    containerId: reloadedShape?.containerId,
    customData: reloadedShape?.customData,
  },
);
check(
  "5e. frameId survives a reload",
  reloadedShape?.frameId === "sec0000001",
  { frameId: reloadedShape?.frameId },
);

log("\n-- a frame inside a frame, which is the containerId case proper --");
const nestedBoard = JSON.parse(JSON.stringify(containerBoard));
nestedBoard.elements[0].containerId = "outer00001";
nestedBoard.elements.push({
  ...JSON.parse(JSON.stringify(containerBoard.elements[0])),
  id: "outer00001",
  name: "Outer",
  index: "a0",
});
nestedBoard.elements.push({
  ...JSON.parse(JSON.stringify(containerBoard.elements[0])),
  id: "inner00001",
  name: "Inner",
  index: "a2",
  containerId: "outer00001",
});
nestedBoard.elementOrder = nestedBoard.elements.map((e) => e.id);
const nestedPath = join(OUT, "nested-board.firo");
writeFileSync(nestedPath, JSON.stringify(nestedBoard, null, 2));

const ctxE = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const pageE = await ctxE.newPage();
attachLogging(pageE, "E");
await boot(pageE);
await importInto(pageE, nestedPath);
await pageE.waitForTimeout(2500);
await drawShape(pageE, "o", [900, 580, 1080, 680]);
await pageE.waitForTimeout(1800);
const nested = await read(pageE);
const inner = nested.elements.find((e) => e.id === "inner00001");
log(
  `nested: ${JSON.stringify(
    nested.elements.map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
      containerId: e.containerId,
      customData: e.customData,
    })),
  )}`,
);
/*
 * The `customData` half is load-bearing, and was not in the first version of this
 * check. Asserting only that `containerId` equals `"outer00001"` passes with the
 * fold broken, because a fold that finds nothing to lift simply emits nothing and
 * `changedFields` only sends differences — so the field keeps the value it was
 * loaded with while a duplicate accumulates in `customData` beside it. That is the
 * same shape as the original unit test this commit corrected: asserting the value
 * was "preserved" while the field was not being maintained. Verified by running
 * this file against a deliberately broken `splitCustomData`, where this assertion
 * passed and the three below it failed.
 */
check(
  "5f. a frame inside a frame keeps containerId as the field, with no duplicate",
  inner?.containerId === "outer00001" &&
    inner?.customData?.["firo.containerId"] === undefined,
  { containerId: inner?.containerId, customData: inner?.customData },
);
await ctxE.close();
await ctxD.close();

/* ========================================================================== */
/* 7. Undo / redo                                                             */
/* ========================================================================== */
hr("7. UNDO / REDO — COUNTING LIVE ELEMENTS, NOT .length");

const ctxF = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const pageF = await ctxF.newPage();
attachLogging(pageF, "F");
await boot(pageF);

const snapshot = async (label) => {
  const l = await live(pageF);
  const r = await read(pageF);
  const ed = (await editorElements(pageF)) ?? [];
  const types = r.elements.map((e) => `${e.type}${e.isDeleted ? "(x)" : ""}`);
  log(
    `  ${label}: live=${JSON.stringify(l)} raw.length=${r.elements.length}/${
      ed.length
    } types=${JSON.stringify(types)}`,
  );
  return { live: l, raw: r.elements.length, types };
};

await snapshot("start");
await drawShape(pageF, "r", [300, 300, 400, 380]);
await drawShape(pageF, "d", [460, 300, 560, 380]);
await drawShape(pageF, "o", [620, 300, 720, 380]);
await pageF.waitForTimeout(1800);
const s3 = await snapshot("3 drawn");
check(
  "7a. three shapes drawn are three live elements",
  s3.live.document === 3 && s3.live.editor === 3,
  s3,
);

await pageF.keyboard.press("Meta+z");
await pageF.waitForTimeout(1200);
const s2 = await snapshot("after 1 undo");
check(
  "7b. undo tombstones rather than removes: raw length holds, live drops",
  s2.live.document === 2 && s2.raw === s3.raw,
  s2,
);

await pageF.keyboard.press("Meta+z");
await pageF.waitForTimeout(1200);
const s1 = await snapshot("after 2 undo");
check(
  "7c. second undo leaves one live element",
  s1.live.document === 1 && s1.live.editor === 1,
  s1,
);

await pageF.keyboard.press("Meta+Shift+z");
await pageF.waitForTimeout(1200);
const r2 = await snapshot("after redo 1");
check("7d. redo restores the second shape", r2.live.document === 2, r2);

await pageF.keyboard.press("Meta+Shift+z");
await pageF.waitForTimeout(1200);
const r3 = await snapshot("after redo 2");
check("7e. redo restores the third shape", r3.live.document === 3, r3);

log("\n  frame undo/redo:");
await drawFrame(pageF, [800, 430, 1120, 620]);
await pageF.waitForTimeout(1500);
const f1 = await snapshot("frame drawn");
check(
  "7f. a drawn frame is one live element in both document and editor",
  f1.live.document === 4 && f1.live.editor === 4,
  f1,
);

await pageF.keyboard.press("Meta+z");
await pageF.waitForTimeout(1200);
const f0 = await snapshot("frame undone");
check(
  "7g. undoing a frame draw leaves 3 live, 1 tombstone, raw length unchanged",
  f0.live.document === 3 && f0.live.editor === 3 && f0.raw === 4,
  f0,
);

await pageF.keyboard.press("Meta+Shift+z");
await pageF.waitForTimeout(1200);
const f2 = await snapshot("frame redone");
check(
  "7h. redoing the frame brings it back",
  f2.live.document === 4 && f2.live.editor === 4,
  f2,
);

log("\n  undo survives a reload (the autosave keeps tombstones):");
await pageF.keyboard.press("Meta+z");
await pageF.waitForTimeout(2500);
await pageF.reload({ waitUntil: "domcontentloaded" });
await pageF.waitForFunction(
  () => Boolean(window.__firoBoard?.read),
  undefined,
  { timeout: 90_000 },
);
await pageF.waitForTimeout(3000);
const afterUndoReload = await read(pageF);
log(
  `  after reload following undo: ${JSON.stringify(
    afterUndoReload.elements.map((e) => `${e.type}${e.isDeleted ? "(x)" : ""}`),
  )}`,
);
const liveAfterUndoReload = afterUndoReload.elements.filter(
  (e) => e.isDeleted !== true,
).length;
check(
  "7i. the undone frame is still a tombstone after a reload",
  liveAfterUndoReload === 3 &&
    afterUndoReload.elements.some(
      (e) => e.type === "frame" && e.isDeleted === true,
    ),
  {
    live: liveAfterUndoReload,
    elements: afterUndoReload.elements.map(
      (e) => `${e.type}${e.isDeleted ? "(x)" : ""}`,
    ),
  },
);
await ctxF.close();
await ctxA.close();

/* ========================================================================== */
hr("CONSOLE ERRORS AND WARNINGS");
const unique = [...new Set(consoleLog)];
for (const line of unique.slice(0, 40)) {
  log(line);
}
log(`(${unique.length} unique)`);

log(`\nload after: ${loadAverage()}`);
hr("SUMMARY");
log(`${passes.length} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) {
    log(`  FAILED: ${f}`);
  }
}

await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
