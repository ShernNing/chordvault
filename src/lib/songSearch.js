// Song-domain glue for the fuzzy searcher: turns a song (title/artist/tags +
// parsed_content) into weighted searchable fields, and pulls a lyric snippet
// around a match for the result card.

import { normalizeText } from './fuzzySearch'

/**
 * Flatten a song's parsed_content into plain searchable text: lyric lines,
 * chord tokens, and section headers, one line each. Empty for unparsed songs.
 */
export function songBodyText(song) {
  const pc = song?.parsed_content
  if (!Array.isArray(pc)) return ''
  const parts = []
  for (const line of pc) {
    if (!line) continue
    if (line.type === 'lyric_line' && line.text) parts.push(line.text)
    else if (line.type === 'section_header' && line.text) parts.push(line.text)
    else if (line.type === 'chord_line' && Array.isArray(line.tokens)) {
      const chords = line.tokens.map((t) => t?.text).filter(Boolean).join(' ')
      if (chords) parts.push(chords)
    }
  }
  return parts.join('\n')
}

/**
 * Weighted fields for scoreFields — title matters most, lyrics/chords least.
 * `bodyText` can be passed in when it's been precomputed (search index).
 */
export function songSearchFields(song, bodyText) {
  return [
    { text: song.title || '', weight: 6 },
    { text: song.artist || '', weight: 4 },
    { text: (song.tags || []).join(' '), weight: 3 },
    { text: song.original_key || '', weight: 2 },
    { text: bodyText != null ? bodyText : songBodyText(song), weight: 1 },
  ]
}

/**
 * First lyric line containing a query token, trimmed to a snippet around the
 * hit. Returns '' when the match wasn't in the body (e.g. title-only match) so
 * the card only shows a snippet when it adds information.
 */
export function lyricSnippet(song, query, radius = 32) {
  const tokens = normalizeText(query).split(' ').filter((t) => t.length >= 2)
  if (!tokens.length) return ''
  const pc = song?.parsed_content
  if (!Array.isArray(pc)) return ''
  for (const line of pc) {
    if (line?.type !== 'lyric_line' || !line.text) continue
    const raw = line.text
    const lower = raw.toLowerCase()
    let hit = -1
    for (const t of tokens) {
      const i = lower.indexOf(t)
      if (i !== -1 && (hit === -1 || i < hit)) hit = i
    }
    if (hit === -1) continue
    let start = Math.max(0, hit - radius)
    let end = Math.min(raw.length, hit + radius)
    // Snap to word boundaries so we don't cut mid-word.
    while (start > 0 && /\S/.test(raw[start - 1])) start--
    while (end < raw.length && /\S/.test(raw[end])) end++
    const prefix = start > 0 ? '…' : ''
    const suffix = end < raw.length ? '…' : ''
    return `${prefix}${raw.slice(start, end).trim()}${suffix}`
  }
  return ''
}
