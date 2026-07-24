// Song-length estimation from chart structure + tempo. Pure (no React) so it
// unit-tests cleanly and is shared by the setlist total and the BPM-synced
// auto-scroll. Estimates are approximate — the user can still override a
// per-song duration manually (setSongSeconds).

export const DEFAULT_SONG_SECONDS = 210 // 3:30 fallback when nothing to estimate from
export const DEFAULT_BPM = 100
const MIN_ESTIMATE_SECONDS = 30

/**
 * Rough bar count for a chart: one bar per chord change (the common feel for
 * pop/worship charts). Falls back to non-blank line count for lyric-only or
 * unparsed songs. Returns 0 when there's nothing to count.
 */
export function countBars(parsedContent) {
  if (!Array.isArray(parsedContent)) return 0
  let chords = 0
  let nonBlank = 0
  for (const line of parsedContent) {
    if (!line || line.type === 'blank') continue
    nonBlank++
    if (line.type === 'chord_line' && Array.isArray(line.tokens)) {
      for (const t of line.tokens) if ((t?.text || '').trim()) chords++
    }
  }
  return chords > 0 ? chords : nonBlank
}

/** Per-song performance tempo (localStorage, set by the Perform bar); DEFAULT_BPM otherwise. */
export function getSongBpm(songId) {
  if (!songId) return DEFAULT_BPM
  try {
    const v = localStorage.getItem(`cv-bpm-${songId}`)
    const n = v != null ? JSON.parse(v) : DEFAULT_BPM
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_BPM
  } catch {
    return DEFAULT_BPM
  }
}

/**
 * Estimated seconds to play a song once through, from bar count × tempo.
 * bpm defaults to the song's stored performance tempo.
 */
export function estimateSongSeconds(song, bpm, beatsPerBar = 4) {
  const bars = countBars(song?.parsed_content)
  if (!bars) return DEFAULT_SONG_SECONDS
  const tempo = Number.isFinite(bpm) && bpm > 0 ? bpm : getSongBpm(song?.id)
  const seconds = (bars * beatsPerBar * 60) / tempo
  return Math.max(MIN_ESTIMATE_SECONDS, Math.round(seconds))
}

/** Seconds → "m:ss" (or "Hh Mm" past an hour). */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}
