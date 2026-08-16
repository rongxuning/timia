export function sortFavoriteThenCreatedAt<
  T extends { id: string; is_favorite: boolean; created_at: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const favoriteOrder = Number(b.is_favorite) - Number(a.is_favorite);
    if (favoriteOrder !== 0) return favoriteOrder;
    const timeOrder =
      Date.parse(String(b.created_at || 0)) - Date.parse(String(a.created_at || 0));
    if (timeOrder !== 0) return timeOrder;
    return b.id.localeCompare(a.id);
  });
}

export function visiblePinnedTags<T extends { id: string }>(
  sortedItems: T[],
  anchorId: string | null,
  maxVisible = 5,
): T[] {
  if (sortedItems.length === 0) return [];
  const anchor = anchorId ? sortedItems.find((item) => item.id === anchorId) : undefined;
  if (!anchor) return sortedItems.slice(0, maxVisible);
  return [anchor, ...sortedItems.filter((item) => item.id !== anchor.id)].slice(0, maxVisible);
}
