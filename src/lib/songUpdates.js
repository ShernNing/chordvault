// Pure helpers that normalise a song update before it is written, keeping
// raw_content and parsed_content in sync (see serializeContent.js for why).

import { ingest, cleanSongTitle } from './ingestion'
import { serializeParsedContent } from './serializeContent'

/**
 * Normalise a partial song update.
 *  • title is cleaned.
 *  • parsed_content supplied → it is authoritative: never re-parsed. If the
 *    caller didn't also supply raw_content, a matching raw_content is derived
 *    so the Edit modal (which starts from raw_content) shows the same song.
 *  • raw_content supplied (including "" to clear the sheet) without
 *    parsed_content → re-parsed; original_key falls back to the detected key.
 */
export function prepareSongUpdates(updates, fallbackTitle = '') {
  const out = { ...updates }
  if (updates.title) out.title = cleanSongTitle(updates.title)
  if (updates.parsed_content !== undefined) {
    if (updates.raw_content === undefined) out.raw_content = serializeParsedContent(updates.parsed_content)
  } else if (updates.raw_content !== undefined) {
    const result = ingest(updates.raw_content ?? '', updates.title || fallbackTitle)
    out.parsed_content = result.parsed_content
    if (!updates.original_key) out.original_key = result.original_key
  }
  return out
}
