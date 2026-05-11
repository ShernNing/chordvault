export async function lookupArtist(title) {
  if (!title?.trim()) return null
  const url = `https://musicbrainz.org/ws/2/recording/?query=recording:"${encodeURIComponent(title.trim())}"&fmt=json&limit=5`
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  })
  if (!res.ok) throw new Error(`MusicBrainz error: ${res.status}`)
  const data = await res.json()
  const recording = data.recordings?.[0]
  if (!recording) return null
  const credit = recording['artist-credit']?.[0]
  return credit?.artist?.name || null
}
