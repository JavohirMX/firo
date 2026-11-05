import { VOTE_COLLECTION_ID } from "@firo/facilitation";
import { DOC_BLOCK_COLLECTION_ID } from "@firo/records";

/** Read the document, not the presentation's filtered canvas. */
export const hasBoardContent = (snapshot: {
  elements: readonly { isDeleted?: boolean }[];
  collections: readonly { id: string }[];
}): boolean =>
  snapshot.elements.some((element) => !element.isDeleted) ||
  snapshot.collections.some(
    (collection) =>
      collection.id !== VOTE_COLLECTION_ID &&
      collection.id !== DOC_BLOCK_COLLECTION_ID,
  );
