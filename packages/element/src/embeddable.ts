import {
  FONT_FAMILY,
  VERTICAL_ALIGN,
  escapeDoubleQuotes,
  getFontString,
} from "@firo/common";

import type { ExcalidrawProps } from "@firo/editor/types";
import type { MarkRequired } from "@firo/common/utility-types";

import { newTextElement } from "./newElement";
import { wrapText } from "./textWrapping";
import { isIframeElement } from "./typeChecks";

import type {
  ExcalidrawIframeLikeElement,
  IframeData,
  NonDeletedExcalidrawElement,
} from "./types";

type IframeDataWithSandbox = MarkRequired<IframeData, "sandbox">;

const embeddedLinkCache = new Map<string, IframeDataWithSandbox>();

const RE_YOUTUBE =
  /^(?:http(?:s)?:\/\/)?(?:www\.)?youtu(?:be\.com|\.be)\/(embed\/|watch\?v=|shorts\/|live\/|playlist\?list=|embed\/videoseries\?list=)?([a-zA-Z0-9_-]+)/;

const RE_VIMEO =
  /^(?:http(?:s)?:\/\/)?(?:(?:w){3}\.)?(?:player\.)?vimeo\.com\/(?:video\/)?([^?\s]+)(?:\?.*)?$/;
const RE_FIGMA = /^https:\/\/(?:www\.)?figma\.com/;

const RE_GH_GIST = /^https:\/\/gist\.github\.com\/([\w_-]+)\/([\w_-]+)/;
const RE_GH_GIST_EMBED =
  /^<script[\s\S]*?\ssrc=["'](https:\/\/gist\.github\.com\/.*?)\.js["']/i;

const RE_MSFORMS = /^(?:https?:\/\/)?forms\.microsoft\.com\//;

// not anchored to start to allow <blockquote> twitter embeds
const RE_TWITTER =
  /(?:https?:\/\/)?(?:(?:w){3}\.)?(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/;
const RE_TWITTER_EMBED =
  /^<blockquote[\s\S]*?\shref=["'](https?:\/\/(?:twitter|x)\.com\/[^"']*)/i;

const RE_VALTOWN =
  /^https:\/\/(?:www\.)?val\.town\/(v|embed)\/[a-zA-Z_$][0-9a-zA-Z_$]+\.[a-zA-Z_$][0-9a-zA-Z_$]+/;

const RE_GENERIC_EMBED =
  /^<(?:iframe|blockquote)[\s\S]*?\s(?:src|href)=["']([^"']*)["'][\s\S]*?>$/i;

const RE_GIPHY =
  /giphy.com\/(?:clips|embed|gifs)\/[a-zA-Z0-9]*?-?([a-zA-Z0-9]+)(?:[^a-zA-Z0-9]|$)/;

const RE_REDDIT =
  /^(?:http(?:s)?:\/\/)?(?:www\.)?reddit\.com\/r\/([a-zA-Z0-9_]+)\/comments\/([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)\/?(?:\?[^#\s]*)?(?:#[^\s]*)?$/;

const RE_REDDIT_EMBED =
  /^<blockquote[\s\S]*?\shref=["'](https?:\/\/(?:www\.)?reddit\.com\/[^"']*)/i;

const parseYouTubeLikeTimestamp = (url: string): number => {
  let timeParam: string | null | undefined;

  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    timeParam =
      urlObj.searchParams.get("t") || urlObj.searchParams.get("start");
  } catch (error) {
    const timeMatch = url.match(/[?&#](?:t|start)=([^&#\s]+)/);
    timeParam = timeMatch?.[1];
  }

  if (!timeParam) {
    return 0;
  }

  if (/^\d+$/.test(timeParam)) {
    return parseInt(timeParam, 10);
  }

  const timeMatch = timeParam.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!timeMatch) {
    return 0;
  }

  const [, hours = "0", minutes = "0", seconds = "0"] = timeMatch;
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
};

const parseGoogleDriveVideoLink = (
  url: string,
): { fileId: string; resourceKey?: string; timestamp?: number } | null => {
  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    const hostname = urlObj.hostname.replace(/^www\./, "");
    if (hostname !== "drive.google.com") {
      return null;
    }

    let fileId: string | null = null;
    const pathMatch = urlObj.pathname.match(/^\/file\/d\/([^/]+)(?:\/|$)/);
    if (pathMatch?.[1]) {
      fileId = pathMatch[1];
    } else if (urlObj.pathname === "/open" || urlObj.pathname === "/uc") {
      // Shared Drive links can be emitted as:
      // - /open?id=<fileId> (common "open in Drive" format)
      // - /uc?...&id=<fileId> (download/export endpoint often seen in copied links)
      fileId = urlObj.searchParams.get("id");
    }

    if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      return null;
    }

    // Some Drive share links include `resourcekey` for access to link-shared
    // files; preserve it in the preview URL so embeds keep working.
    const resourceKey = urlObj.searchParams.get("resourcekey");
    const timestamp = parseYouTubeLikeTimestamp(urlObj.toString());

    return {
      fileId,
      resourceKey:
        resourceKey && /^[a-zA-Z0-9_-]+$/.test(resourceKey)
          ? resourceKey
          : undefined,
      // Drive accepts YouTube-like `t` formats (e.g. `t=90`, `t=1m30s`);
      // normalize to seconds for a stable preview URL.
      timestamp: timestamp > 0 ? timestamp : undefined,
    };
  } catch (error) {
    return null;
  }
};

const ALLOWED_DOMAINS = new Set([
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "drive.google.com",
  "figma.com",
  // "link.excalidraw.com" was here upstream: it is Excalidraw's own share
  // domain. Firo is self-hosted, so a board's links point at the team's own
  // origin and there is no vendor domain to allow. Anything genuinely
  // embeddable is a third-party site, listed above.
  "gist.github.com",
  "twitter.com",
  "x.com",
  "*.simplepdf.eu",
  "stackblitz.com",
  "val.town",
  "giphy.com",
  "reddit.com",
  "forms.microsoft.com",
]);

const ALLOW_SAME_ORIGIN = new Set([
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "drive.google.com",
  "figma.com",
  "twitter.com",
  "x.com",
  "*.simplepdf.eu",
  "stackblitz.com",
  "reddit.com",
  "forms.microsoft.com",
]);

export const createSrcDoc = (body: string) => {
  return `<html><body>${body}</body></html>`;
};

export const getEmbedLink = (
  link: string | null | undefined,
): IframeDataWithSandbox | null => {
  if (!link) {
    return null;
  }

  if (embeddedLinkCache.has(link)) {
    return embeddedLinkCache.get(link)!;
  }

  const originalLink = link;

  const allowSameOrigin = ALLOW_SAME_ORIGIN.has(
    matchHostname(link, ALLOW_SAME_ORIGIN) || "",
  );

  let type: "video" | "generic" = "generic";
  let aspectRatio = { w: 560, h: 840 };
  const ytLink = link.match(RE_YOUTUBE);
  if (ytLink?.[2]) {
    const startTime = parseYouTubeLikeTimestamp(originalLink);
    const time = startTime > 0 ? `&start=${startTime}` : ``;
    const isPortrait = link.includes("shorts");
    type = "video";
    switch (ytLink[1]) {
      case "embed/":
      case "watch?v=":
      case "shorts/":
        link = `https://www.youtube.com/embed/${ytLink[2]}?enablejsapi=1${time}`;
        break;
      case "playlist?list=":
      case "embed/videoseries?list=":
        link = `https://www.youtube.com/embed/videoseries?list=${ytLink[2]}&enablejsapi=1${time}`;
        break;
      default:
        link = `https://www.youtube.com/embed/${ytLink[2]}?enablejsapi=1${time}`;
        break;
    }
    aspectRatio = isPortrait ? { w: 315, h: 560 } : { w: 560, h: 315 };
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  const vimeoLink = link.match(RE_VIMEO);
  if (vimeoLink?.[1]) {
    const target = vimeoLink?.[1];
    const error = !/^\d+$/.test(target)
      ? new URIError("Invalid embed link format")
      : undefined;
    type = "video";
    link = `https://player.vimeo.com/video/${target}?api=1`;
    aspectRatio = { w: 560, h: 315 };
    //warning deliberately ommited so it is displayed only once per link
    //same link next time will be served from cache
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      error,
      sandbox: { allowSameOrigin },
    };
  }

  const googleDriveVideo = parseGoogleDriveVideoLink(link);
  if (googleDriveVideo) {
    type = "video";
    const searchParams = new URLSearchParams();
    if (googleDriveVideo.resourceKey) {
      searchParams.set("resourcekey", googleDriveVideo.resourceKey);
    }
    if (googleDriveVideo.timestamp) {
      searchParams.set("t", `${googleDriveVideo.timestamp}`);
    }

    const search = searchParams.toString();
    link = `https://drive.google.com/file/d/${googleDriveVideo.fileId}/preview${
      search ? `?${search}` : ""
    }`;
    aspectRatio = { w: 560, h: 315 };
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  const figmaLink = link.match(RE_FIGMA);
  if (figmaLink) {
    type = "generic";
    link = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(
      link,
    )}`;
    aspectRatio = { w: 550, h: 550 };
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  const valLink = link.match(RE_VALTOWN);
  if (valLink) {
    link =
      valLink[1] === "embed" ? valLink[0] : valLink[0].replace("/v", "/embed");
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  if (RE_MSFORMS.test(link) && !link.includes("embed=true")) {
    link += link.includes("?") ? "&embed=true" : "?embed=true";
  }

  if (RE_TWITTER.test(link)) {
    const postId = link.match(RE_TWITTER)![1];
    // We don't parse the username: it can consist of non-latin1 characters
    // and can be set to anything without affecting the embed - the post id
    // is all the URL-embed endpoint needs.
    // ADR-0036 §4: the srcdoc widget form needs same-origin to reach the
    // tweet-result API, and no srcdoc frame may keep same-origin, so the
    // tweet renders through Twitter's own URL embed endpoint instead - a
    // cross-origin frame, which allow-same-origin cannot expose Firo to.
    const ret: IframeDataWithSandbox = {
      type: "generic",
      link: `https://platform.twitter.com/embed/Tweet.html?id=${postId}`,
      intrinsicSize: { w: 480, h: 480 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  if (RE_REDDIT.test(link)) {
    const [, page, postId, title] = link.match(RE_REDDIT)!;
    // ADR-0036 §4: same trade as Twitter above - the srcdoc widget form
    // breaks in an opaque origin, so the post renders through Reddit's
    // official URL embed endpoint instead.
    const ret: IframeDataWithSandbox = {
      type: "generic",
      link: `https://www.redditmedia.com/r/${page}/comments/${postId}/${title}/?embed=true`,
      intrinsicSize: { w: 480, h: 480 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  if (RE_GH_GIST.test(link)) {
    const [, user, gistId] = link.match(RE_GH_GIST)!;
    const safeURL = escapeDoubleQuotes(
      `https://gist.github.com/${user}/${gistId}`,
    );
    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: () =>
        createSrcDoc(`
          <script src="${safeURL}.js"></script>
          <style type="text/css">
            * { margin: 0px; }
            table, .gist { height: 100%; }
            .gist .gist-file { height: calc(100vh - 2px); padding: 0px; display: grid; grid-template-rows: 1fr auto; }
          </style>
        `),
      intrinsicSize: { w: 550, h: 720 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(link, ret);
    return ret;
  }

  embeddedLinkCache.set(link, {
    link,
    intrinsicSize: aspectRatio,
    type,
    sandbox: { allowSameOrigin },
  });
  return {
    link,
    intrinsicSize: aspectRatio,
    type,
    sandbox: { allowSameOrigin },
  };
};

export const createPlaceholderEmbeddableLabel = (
  element: ExcalidrawIframeLikeElement,
): NonDeletedExcalidrawElement => {
  let text: string;
  if (isIframeElement(element)) {
    text = "IFrame element";
  } else {
    text =
      !element.link || element?.link === "" ? "Empty Web-Embed" : element.link;
  }

  const fontSize = Math.max(
    Math.min(element.width / 2, element.width / text.length),
    element.width / 30,
  );
  const fontFamily = FONT_FAMILY.Helvetica;

  const fontString = getFontString({
    fontSize,
    fontFamily,
  });

  return newTextElement({
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
    strokeColor:
      element.strokeColor !== "transparent" ? element.strokeColor : "black",
    backgroundColor: "transparent",
    fontFamily,
    fontSize,
    text: wrapText(text, fontString, element.width - 20),
    textAlign: "center",
    verticalAlign: VERTICAL_ALIGN.MIDDLE,
    angle: element.angle ?? 0,
  });
};

const matchHostname = (
  url: string,
  /** using a Set assumes it already contains normalized bare domains */
  allowedHostnames: Set<string> | string,
): string | null => {
  try {
    const { hostname } = new URL(url);

    const bareDomain = hostname.replace(/^www\./, "");

    if (allowedHostnames instanceof Set) {
      if (ALLOWED_DOMAINS.has(bareDomain)) {
        return bareDomain;
      }

      const bareDomainWithFirstSubdomainWildcarded = bareDomain.replace(
        /^([^.]+)/,
        "*",
      );
      if (ALLOWED_DOMAINS.has(bareDomainWithFirstSubdomainWildcarded)) {
        return bareDomainWithFirstSubdomainWildcarded;
      }
      return null;
    }

    const bareAllowedHostname = allowedHostnames.replace(/^www\./, "");
    if (bareDomain === bareAllowedHostname) {
      return bareAllowedHostname;
    }
  } catch (error) {
    // ignore
  }
  return null;
};

export const maybeParseEmbedSrc = (str: string): string => {
  const twitterMatch = str.match(RE_TWITTER_EMBED);
  if (twitterMatch && twitterMatch.length === 2) {
    return twitterMatch[1];
  }

  const redditMatch = str.match(RE_REDDIT_EMBED);
  if (redditMatch && redditMatch.length === 2) {
    return redditMatch[1];
  }

  const gistMatch = str.match(RE_GH_GIST_EMBED);
  if (gistMatch && gistMatch.length === 2) {
    return gistMatch[1];
  }

  if (RE_GIPHY.test(str)) {
    return `https://giphy.com/embed/${RE_GIPHY.exec(str)![1]}`;
  }

  const match = str.match(RE_GENERIC_EMBED);
  if (match && match.length === 2) {
    return match[1];
  }

  return str;
};

export const embeddableURLValidator = (
  url: string | null | undefined,
  validateEmbeddable: ExcalidrawProps["validateEmbeddable"],
): boolean => {
  if (!url) {
    return false;
  }
  if (validateEmbeddable != null) {
    if (typeof validateEmbeddable === "function") {
      const ret = validateEmbeddable(url);
      // if return value is undefined, leave validation to default
      if (typeof ret === "boolean") {
        return ret;
      }
    } else if (typeof validateEmbeddable === "boolean") {
      return validateEmbeddable;
    } else if (validateEmbeddable instanceof RegExp) {
      return validateEmbeddable.test(url);
    } else if (Array.isArray(validateEmbeddable)) {
      for (const domain of validateEmbeddable) {
        if (domain instanceof RegExp) {
          if (url.match(domain)) {
            return true;
          }
        } else if (matchHostname(url, domain)) {
          return true;
        }
      }
      return false;
    }
  }

  return !!matchHostname(url, ALLOWED_DOMAINS);
};

// ---------------------------------------------------------------------------
// Foreign-frame policy (ADR-0036 §4)
//
// Every embed frame is hostile by default: a provider can be compromised or
// broken, and its frame must never be able to reach Firo's origin, storage or
// DOM. The sandbox string, referrer policy and permissions policy are computed
// here, in one pure place, so the renderer cannot drift from the rule.
// ---------------------------------------------------------------------------

/**
 * Sandbox tokens for one resolved embed. Document (`srcdoc`) frames never
 * receive `allow-same-origin`: they run in an opaque origin with scripts
 * only, which closes the route a third-party widget script would otherwise
 * have into the app's DOM and storage. URL frames keep scripting, forms,
 * popups and presentation; `allow-same-origin` follows the per-provider list
 * resolved by `getEmbedLink`. `allow-downloads` and
 * `allow-popups-to-escape-sandbox` are gone everywhere.
 */
export const computeEmbedSandbox = (
  src: Pick<IframeData, "type" | "sandbox"> | null | undefined,
): string => {
  if (src?.type === "document") {
    return "allow-scripts";
  }
  const tokens = [
    "allow-scripts",
    "allow-forms",
    "allow-popups",
    "allow-presentation",
  ];
  if (src?.sandbox?.allowSameOrigin) {
    tokens.unshift("allow-same-origin");
  }
  return tokens.join(" ");
};

/**
 * ADR-0036 §4, adjusted by the provider re-verification the ADR requires:
 * document (`srcdoc`) frames send no referrer at all. URL frames send the
 * app *origin* only - never the full URL, which can carry a board id in its
 * path - because the major players (YouTube, confirmed live) refuse to run
 * with no referrer at all (error 153). `strict-origin-when-cross-origin` is
 * the minimal policy that keeps those embeds working.
 */
export const computeEmbedReferrerPolicy = (
  src: Pick<IframeData, "type"> | null | undefined,
): "no-referrer" | "strict-origin-when-cross-origin" => {
  return src?.type === "document"
    ? "no-referrer"
    : "strict-origin-when-cross-origin";
};

/**
 * ADR-0036 §4: the minimal permissions list. Drops `autoplay`,
 * `clipboard-write`, `accelerometer` and `gyroscope`; keeps `encrypted-media`
 * and `picture-in-picture` (fullscreen is the separate `allowFullScreen`
 * attribute).
 */
export const EMBED_PERMISSIONS_POLICY = "encrypted-media; picture-in-picture";

const EMBED_PROVIDER_NAMES: Record<string, string> = {
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "youtube-nocookie.com": "YouTube",
  "vimeo.com": "Vimeo",
  "player.vimeo.com": "Vimeo",
  "drive.google.com": "Google Drive",
  "figma.com": "Figma",
  "gist.github.com": "GitHub Gist",
  "twitter.com": "Twitter/X",
  "x.com": "Twitter/X",
  "val.town": "Val Town",
  "giphy.com": "GIPHY",
  "stackblitz.com": "StackBlitz",
  "*.simplepdf.eu": "SimplePDF",
  "forms.microsoft.com": "Microsoft Forms",
  "reddit.com": "Reddit",
  // the URL-embed endpoints the Twitter/X and Reddit branches resolve to
  "platform.twitter.com": "Twitter/X",
  "redditmedia.com": "Reddit",
};

/** Display name of the provider a link belongs to, or null when unknown. */
export const getEmbedProviderName = (
  link: string | null | undefined,
): string | null => {
  if (!link) {
    return null;
  }
  let hostname: string;
  try {
    hostname = new URL(
      link.startsWith("http") ? link : `https://${link}`,
    ).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  // the map keys are the provider universe: pasteable domains plus the
  // embed endpoints branches above derive (platform.twitter.com, ...)
  return (
    EMBED_PROVIDER_NAMES[hostname] ??
    EMBED_PROVIDER_NAMES[hostname.replace(/^([^.]+)/, "*")] ??
    null
  );
};

/** ADR-0036 §4: the frame title names the provider, not a vendor string. */
export const getEmbedFrameTitle = (
  provider: string | null | undefined,
): string => {
  return provider ? `Embedded content from ${provider}` : "Embedded content";
};
