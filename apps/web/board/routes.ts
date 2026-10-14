/**
 * Where the app is, in the URL.
 *
 * ## Why the route is the URL and not React state
 *
 * Opening a board is a full reload (`?board=<id>`), and the reason is in
 * `../board/board.ts`: the document is built once at module scope, so a tab
 * holds *one* board, and swapping it in place would mean tearing the editor
 * down and rebuilding a document the editor has already subscribed to. A
 * reload gets a fresh module, a fresh document and a fresh restore for free,
 * and the autosave keys on the id in the URL. The cost is a page load; the
 * benefit is that "which board is open" is one value with one source.
 *
 * ## The three states
 *
 * - `?board=<id>` — open that board.
 * - `?home=1` — show the board home even if a last board exists. This is what
 *   makes the home reachable: without it, a returning user is always resumed
 *   into their last board and could never get back to the list.
 * - neither — undecided. The app resumes the most recently opened board, or
 *   shows the home when there is none. `readRoute` returns `null` for this
 *   rather than guessing, because the answer needs storage.
 */

export const BOARD_PARAM = "board";
export const HOME_PARAM = "home";

export type AppRoute = { kind: "home" } | { kind: "board"; id: string };

/**
 * The route named by a search string, or `null` when it names none.
 *
 * Takes the search string rather than reading `location` so it is a pure
 * function with an obvious test: the branch that decides home from board should
 * not need a browser to check.
 */
export const readRoute = (search: string): AppRoute | null => {
  const params = new URLSearchParams(search);
  if (params.has(HOME_PARAM)) {
    return { kind: "home" };
  }
  const id = params.get(BOARD_PARAM);
  if (id) {
    return { kind: "board", id };
  }
  return null;
};

const withQuery = (base: string, param: string, value: string): string =>
  `${base}?${param}=${encodeURIComponent(value)}`;

/** The URL that opens a board. */
export const boardUrl = (id: string, base = window.location.pathname): string =>
  withQuery(base, BOARD_PARAM, id);

/** The URL that shows the board home regardless of the last board. */
export const homeUrl = (base = window.location.pathname): string =>
  withQuery(base, HOME_PARAM, "1");
