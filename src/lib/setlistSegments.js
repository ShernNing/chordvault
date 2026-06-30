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
export function computeSegmentDrop(slots, activeId, overId) {
  const active = (slots || []).find((s) => s.id === activeId)
  if (!active) return null
  const destSegment = resolveSegment(overId, slots)

  // Build per-segment id arrays with the active row pulled out.
  const groups = new Map(SETLIST_SEGMENTS.map((s) => [s.key, []]))
  for (const s of slots) {
    if (s.id === activeId) continue
    groups.get(segmentOf(s)).push(s.id)
  }

  const destArr = groups.get(destSegment)
  if (!destArr) return null // overId encoded an unknown segment — ignore the drop
  let idx = destArr.indexOf(overId)
  if (idx === -1) idx = destArr.length // dropped on the zone, not a row → append
  destArr.splice(idx, 0, activeId)

  const orderedIds = SETLIST_SEGMENTS.flatMap((s) => groups.get(s.key))
  return {
    orderedIds,
    destSegment,
    changedSegment: destSegment !== segmentOf(active),
  }
}
