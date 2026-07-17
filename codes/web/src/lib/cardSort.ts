export function favoriteCardsFirst<T extends { is_favorite: boolean; created_at: string }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => {
    const favoriteOrder = Number(b.is_favorite) - Number(a.is_favorite);
    if (favoriteOrder !== 0) return favoriteOrder;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}
