// Maps ranked semantic-match ids to in-memory song objects for the
// "Related songs" group. Pure (no React/Supabase imports).
//
// - preserves the rank order of `relatedIds`
// - drops ids not in `allSongs` (e.g. songs the user's RLS doesn't expose)
// - drops ids in `excludeIds` (already shown in the keyword results)
// - drops songs whose original_key != keyFilter when a key filter is active
export function selectRelatedSongs(relatedIds, allSongs, { excludeIds, keyFilter } = {}) {
  const byId = new Map(allSongs.map(s => [s.id, s]))
  const exclude = excludeIds ?? new Set()
  const out = []
  for (const id of relatedIds) {
    if (exclude.has(id)) continue
    const song = byId.get(id)
    if (!song) continue
    if (keyFilter && song.original_key !== keyFilter) continue
    out.push(song)
  }
  return out
}
