// Fixed liturgical segments for a setlist. `key === null` is the main worship
// set (default for every existing slot). Order here drives both the editor's
// group order and the export order.
export const SETLIST_SEGMENTS = [
  { key: null, label: null, zone: 'Set' },
  { key: 'communion', label: 'Communion', zone: 'Communion' },
  { key: 'post_sermon', label: 'Post-Sermon', zone: 'Post-Sermon' },
  { key: 'prayer_meeting', label: 'Prayer Meeting', zone: 'Prayer Meeting' },
]

const SEGMENT_KEYS = SETLIST_SEGMENTS.map((s) => s.key)
const ZONE_PREFIX = 'segzone:'

// Normalize a slot's segment to a known key; unknown/missing → main (null).
export function segmentOf(slot) {
  const s = slot?.segment ?? null
  return SEGMENT_KEYS.includes(s) ? s : null
}

// Group slots into the fixed segment order, preserving each slot's input order
// (callers pass slots already sorted by position) within its group.
export function groupSlotsBySegment(slots) {
  return SETLIST_SEGMENTS.map((seg) => ({
    ...seg,
    slots: (slots || []).filter((s) => segmentOf(s) === seg.key),
  }))
}

// Flatten slots in segment order; tag the FIRST slot of each non-null segment
// with `segmentLabel` (the printed header text). All other slots get null.
export function orderSlotsForExport(slots) {
  const out = []
  for (const seg of SETLIST_SEGMENTS) {
    const group = (slots || []).filter((s) => segmentOf(s) === seg.key)
    group.forEach((s, i) => {
      out.push({ ...s, segmentLabel: i === 0 && seg.label ? seg.label : null })
    })
  }
  return out
}

// Resolve a dnd-kit drop target id to a segment key. Drop targets are either a
// zone container (`segzone:<key|main>`) or a row (a slot id).
export function resolveSegment(overId, slots) {
  if (typeof overId === 'string' && overId.startsWith(ZONE_PREFIX)) {
    const key = overId.slice(ZONE_PREFIX.length)
    return key === 'main' ? null : key
  }
  const s = (slots || []).find((x) => x.id === overId)
  return s ? segmentOf(s) : null
}

export function zoneId(segmentKey) {
  return `${ZONE_PREFIX}${segmentKey == null ? 'main' : segmentKey}`
}

// Compute the new global slot-id order and destination segment after a drop.
// Pure: callers persist the result via reorder()/updateSlot().
//
// Same-segment reorders use arrayMove semantics (identical to @dnd-kit's
// sortable arrayMove) so the drop matches what verticalListSortingStrategy
// animates — critically, downward drags land the row *after* the over-row.
// Cross-segment moves remove the row from its source group and insert it into
// the destination group before the over-row (or append when dropped on a zone).
export function computeSegmentDrop(slots, activeId, overId) {
  const active = (slots || []).find((s) => s.id === activeId)
  if (!active) return null
  const activeSegment = segmentOf(active)
  const destSegment = resolveSegment(overId, slots)

  // Per-segment id arrays, active kept in place for now.
  const groups = new Map(SETLIST_SEGMENTS.map((s) => [s.key, []]))
  for (const s of slots) groups.get(segmentOf(s)).push(s.id)

  const destArr = groups.get(destSegment)
  if (!destArr) return null // overId encoded an unknown segment — ignore the drop

  if (destSegment === activeSegment) {
    // Same group: arrayMove(from, to). `to` is the over-row's index in the
    // still-intact array; splice-out then splice-in reproduces arrayMove exactly.
    const from = destArr.indexOf(activeId)
    let to = destArr.indexOf(overId)
    if (to === -1) to = destArr.length - 1 // dropped on own zone → move to end
    destArr.splice(to, 0, destArr.splice(from, 1)[0])
  } else {
    // Cross group: pull active out of its source, insert into dest before over.
    const srcArr = groups.get(activeSegment)
    srcArr.splice(srcArr.indexOf(activeId), 1)
    let idx = destArr.indexOf(overId)
    if (idx === -1) idx = destArr.length // dropped on the zone, not a row → append
    destArr.splice(idx, 0, activeId)
  }

  const orderedIds = SETLIST_SEGMENTS.flatMap((s) => groups.get(s.key))
  return {
    orderedIds,
    destSegment,
    changedSegment: destSegment !== activeSegment,
  }
}
