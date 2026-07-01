/**
 * Segment-aware numbering for setlist slots.
 *
 * A setlist slot is either a song row (`song_id` set) or a segment divider row
 * (`song_id` null, carrying a `label` and a `page_break` flag). Song numbering
 * restarts at 1 after every divider, so each segment is numbered independently.
 *
 * @param {Array} slots ordered setlist slots (each `{ id, song_id, song, label, page_break }`)
 * @returns {Array<
 *   | { kind: 'song', slot: object, songNumber: number }
 *   | { kind: 'divider', slot: object, label: string, pageBreak: boolean }
 * >}
 */
export function numberSlots(slots) {
  const entries = []
  let n = 0
  for (const slot of slots || []) {
    if (slot.song_id == null) {
      // Divider: reset the per-segment counter.
      n = 0
      entries.push({
        kind: 'divider',
        slot,
        label: slot.label || '',
        pageBreak: !!slot.page_break,
      })
    } else if (slot.song) {
      // Song with loaded data. Rows whose song failed to load are skipped.
      n += 1
      entries.push({ kind: 'song', slot, songNumber: n })
    }
  }
  return entries
}
