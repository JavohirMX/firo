import { URL } from "node:url";

/** Parse a request target without treating the client Host header as a base. */
export function parseRequestUrl(target: string | undefined): URL | null {
  try {
    const url = new URL(target || "/", "http://localhost");
    if (decodeURIComponent(url.pathname).includes("\0")) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
