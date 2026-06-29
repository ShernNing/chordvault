// Builds the text that represents a song for semantic embedding.
// Pure (no Supabase/React imports) so it is unit-testable and reusable by the
// backfill script.

// gte-small caps at ~512 tokens; ~2000 chars is a safe under-budget cutoff.
export const MAX_EMBED_CHARS = 2000

// Lyrics for embedding: the lyric_line entries of parsed_content, falling back
// to the original raw sheet when no parsed lyrics exist.
export function extractLyrics(song) {
  const lines = Array.isArray(song?.parsed_content) ? song.parsed_content : null
  if (lines) {
    const lyrics = lines
      .filter(l => l.type === 'lyric_line' && l.text)
      .map(l => l.text)
      .join('\n')
    if (lyrics.trim()) return lyrics
  }
  return song?.raw_content ?? ''
}

// Title + artist + tags + lyrics, newline-joined and length-capped.
export function buildEmbedText(song) {
  const parts = [
    song?.title ?? '',
    song?.artist ?? '',
    (song?.tags ?? []).join(' '),
    extractLyrics(song),
  ]
  return parts.join('\n').slice(0, MAX_EMBED_CHARS)
}
