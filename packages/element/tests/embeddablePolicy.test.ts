import {
  computeEmbedSandbox,
  computeEmbedReferrerPolicy,
  EMBED_PERMISSIONS_POLICY,
  getEmbedFrameTitle,
  getEmbedLink,
  getEmbedProviderName,
} from "../src/embeddable";

// ADR-0036 §4: every foreign frame is hostile by default. The sandbox is
// computed by one pure helper and these tests pin its rules.

describe("computeEmbedSandbox", () => {
  it("document (srcdoc) frames never receive allow-same-origin", () => {
    const src = getEmbedLink("https://gist.github.com/user/deadbeef");
    expect(src).toBeTruthy();
    expect(src?.type).toBe("document");
    // the per-provider list still grants gist same-origin in the resolved
    // data; the policy must strip it for document frames
    const sandbox = computeEmbedSandbox(src);
    expect(sandbox).toBe("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
  });

  it("Twitter/X and Reddit resolve to official URL embed endpoints", () => {
    // their srcdoc widgets cannot render in an opaque origin (verified live:
    // blank tweet, reddit "blocked by network security"), so ADR-0036's
    // URL-form fallback applies: a cross-origin frame on the provider's own
    // embed host, where allow-same-origin cannot expose the app.
    const tweet = getEmbedLink("https://twitter.com/jack/status/20");
    expect(tweet?.type).toBe("generic");
    if (tweet?.type === "generic") {
      expect(tweet.link).toBe(
        "https://platform.twitter.com/embed/Tweet.html?id=20",
      );
    }
    const xTweet = getEmbedLink("https://x.com/jack/status/20");
    if (xTweet?.type === "generic") {
      expect(xTweet.link).toBe(
        "https://platform.twitter.com/embed/Tweet.html?id=20",
      );
    }
    const post = getEmbedLink(
      "https://www.reddit.com/r/javascript/comments/abc123/some_title/",
    );
    expect(post?.type).toBe("generic");
    if (post?.type === "generic") {
      expect(post.link).toBe(
        "https://www.redditmedia.com/r/javascript/comments/abc123/some_title/?embed=true",
      );
    }
  });

  it("URL frames keep scripts/forms/popups/presentation", () => {
    const src = getEmbedLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(src?.type).toBe("video");
    const sandbox = computeEmbedSandbox(src);
    for (const token of [
      "allow-scripts",
      "allow-forms",
      "allow-popups",
      "allow-presentation",
    ]) {
      expect(sandbox).toContain(token);
    }
  });

  it("URL frames keep per-provider same-origin only", () => {
    const youtube = computeEmbedSandbox(
      getEmbedLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    );
    expect(youtube).toContain("allow-same-origin");

    const valtown = computeEmbedSandbox(
      getEmbedLink("https://www.val.town/v/std.someVal"),
    );
    expect(valtown).not.toContain("allow-same-origin");
  });

  it("no frame ever includes allow-downloads or popups-to-escape", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://twitter.com/jack/status/20",
      "https://gist.github.com/user/deadbeef",
      "https://www.figma.com/file/abc/name",
      null,
    ]) {
      const sandbox = computeEmbedSandbox(url ? getEmbedLink(url) : null);
      expect(sandbox).not.toContain("allow-downloads");
      expect(sandbox).not.toContain("allow-popups-to-escape-sandbox");
    }
  });

  it("handles a null frame defensively", () => {
    const sandbox = computeEmbedSandbox(null);
    expect(sandbox).not.toContain("allow-same-origin");
    expect(sandbox).toContain("allow-scripts");
  });
});

describe("frame metadata policy", () => {
  it("document frames send no referrer", () => {
    expect(
      computeEmbedReferrerPolicy(
        getEmbedLink("https://gist.github.com/user/deadbeef"),
      ),
    ).toBe("no-referrer");
  });

  it("URL frames send the origin only, never the full board URL", () => {
    // YouTube refuses to play with no referrer at all (error 153, verified
    // live); strict-origin-when-cross-origin sends only the app origin to
    // the cross-origin provider, never a board-carrying path.
    const policy = computeEmbedReferrerPolicy(
      getEmbedLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    );
    expect(policy).toBe("strict-origin-when-cross-origin");
    expect(computeEmbedReferrerPolicy(null)).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("the permissions policy is the minimal list", () => {
    expect(EMBED_PERMISSIONS_POLICY).not.toContain("autoplay");
    expect(EMBED_PERMISSIONS_POLICY).not.toContain("clipboard-write");
    expect(EMBED_PERMISSIONS_POLICY).not.toContain("accelerometer");
    expect(EMBED_PERMISSIONS_POLICY).not.toContain("gyroscope");
    expect(EMBED_PERMISSIONS_POLICY).toContain("encrypted-media");
    expect(EMBED_PERMISSIONS_POLICY).toContain("picture-in-picture");
  });

  it("names providers for frame titles", () => {
    expect(getEmbedProviderName("https://www.youtube.com/watch?v=abc")).toBe(
      "YouTube",
    );
    expect(getEmbedProviderName("https://youtu.be/abc")).toBe("YouTube");
    expect(getEmbedProviderName("https://gist.github.com/u/abc")).toBe(
      "GitHub Gist",
    );
    expect(
      getEmbedProviderName(
        "https://www.reddit.com/r/javascript/comments/abc123/x/",
      ),
    ).toBe("Reddit");
    expect(getEmbedProviderName("https://twitter.com/u/status/1")).toBe(
      "Twitter/X",
    );
    expect(getEmbedProviderName("https://x.com/u/status/1")).toBe("Twitter/X");
    expect(getEmbedProviderName("https://edit.simplepdf.eu/abc")).toBe(
      "SimplePDF",
    );
    expect(getEmbedProviderName("https://example.com/nope")).toBeNull();
    expect(getEmbedProviderName(null)).toBeNull();
  });

  it("the title names the provider, not a vendor string", () => {
    expect(getEmbedFrameTitle("YouTube")).toBe("Embedded content from YouTube");
    expect(getEmbedFrameTitle(null)).toBe("Embedded content");
    expect(getEmbedFrameTitle(undefined)).toBe("Embedded content");
  });
});
