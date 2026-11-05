import { describe, expect, it } from "vitest";

import { VOTE_COLLECTION_ID } from "@firo/facilitation";
import { DOC_BLOCK_COLLECTION_ID } from "@firo/records";

import { hasBoardContent } from "../hasBoardContent";

describe("the empty-board hint", () => {
  it("returns for a genuinely empty board", () => {
    expect(hasBoardContent({ elements: [], collections: [] })).toBe(false);
    expect(
      hasBoardContent({ elements: [{ isDeleted: true }], collections: [] }),
    ).toBe(false);
  });

  it("does not call withheld or presentation-filtered content blank", () => {
    // The document still has a live element when the canvas is filtered empty.
    expect(
      hasBoardContent({ elements: [{ isDeleted: false }], collections: [] }),
    ).toBe(true);
  });

  it("retains record collection content but excludes internal collections", () => {
    expect(
      hasBoardContent({ elements: [], collections: [{ id: "records" }] }),
    ).toBe(true);
    expect(
      hasBoardContent({
        elements: [],
        collections: [
          { id: VOTE_COLLECTION_ID },
          { id: DOC_BLOCK_COLLECTION_ID },
        ],
      }),
    ).toBe(false);
  });
});
