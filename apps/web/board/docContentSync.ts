/**
 * Doc block ids whose stored content differs from what was last seen. Updates
 * `seen` in place. The block being edited locally is excluded so a remote
 * write never repaints over the local editor.
 */
export const changedDocBlockIds = (
  seen: Map<string, string>,
  next: Map<string, string>,
  activeId: string | null,
): Set<string> => {
  const changed = new Set<string>();
  next.forEach((content, id) => {
    if (seen.get(id) !== content) {
      changed.add(id);
    }
    seen.set(id, content);
  });
  if (activeId) {
    changed.delete(activeId);
  }
  return changed;
};
