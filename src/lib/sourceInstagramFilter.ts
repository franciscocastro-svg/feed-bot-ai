export const ALL_SOURCES_FILTER = "all";
export const SHARED_SOURCES_FILTER = "shared";

export function isSharedOrUnlinkedSource(linkedInstagramIds: string[]) {
  return linkedInstagramIds.length !== 1;
}

export function sourceMatchesInstagramFilter(
  linkedInstagramIds: string[],
  filter: string,
) {
  if (filter === ALL_SOURCES_FILTER) return true;
  if (filter === SHARED_SOURCES_FILTER) {
    return isSharedOrUnlinkedSource(linkedInstagramIds);
  }
  return linkedInstagramIds.includes(filter);
}
