// Pure helpers for per-user song favourites (persistence lives in supabaseOps).

/** New Set with `id` added if absent, removed if present. Never mutates. */
export function toggleIn(set, id) {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** Songs whose id is in `favoriteIds`, in original order. */
export function filterFavorites(songs, favoriteIds) {
  return songs.filter(s => favoriteIds.has(s.id))
}
