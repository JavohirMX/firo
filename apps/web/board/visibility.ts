import type { FiroDoc } from "@firo/doc";

import { canDriveSession } from "./facilitator";

/** Set existing durable flags, never editor customData or session awareness. */
export const setElementVisibility = (
  getDocument: () => FiroDoc,
  refresh: () => void,
  ids: readonly string[],
  flag: "hiddenUntilRevealed" | "hideInPresentation",
  value: boolean,
): void => {
  // A callback retained from a previous editable render must still refuse a
  // watcher after a role change. This is not a driver-session claim.
  if (!canDriveSession()) {
    return;
  }
  const document = getDocument();
  const selectedIds = new Set(ids);
  const updates = document
    .read()
    .elements.filter(
      (element) =>
        !element.isDeleted &&
        selectedIds.has(element.id) &&
        !!element[flag] !== value,
    )
    .map((element) => ({ id: element.id, changes: { [flag]: value } }));
  if (!updates.length) {
    return;
  }
  document.commit([{ kind: "updateElements", updates }]);
  refresh();
};
