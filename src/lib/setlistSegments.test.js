import { describe, it, expect } from 'vitest'
import {
  segmentOf,
  groupSlotsBySegment,
  orderSlotsForExport,
  resolveSegment,
  computeSegmentDrop,
  zoneId,
} from './setlistSegments'

// helper: minimal slot
const slot = (id, segment = null) => ({ id, song_id: id, segment, song: { title: id } })

describe('segmentOf', () => {
  it('returns null for missing/null segment', () => {
    expect(segmentOf({ id: 'a' })).toBe(null)
    expect(segmentOf({ id: 'a', segment: null })).toBe(null)
  })
  it('returns the segment key when valid', () => {
    expect(segmentOf({ id: 'a', segment: 'communion' })).toBe('communion')
  })
  it('treats unknown segment values as main (null)', () => {
    expect(segmentOf({ id: 'a', segment: 'bogus' })).toBe(null)
  })
})

describe('groupSlotsBySegment', () => {
  it('returns one entry per segment in fixed order, preserving input order within a group', () => {
    const slots = [slot('a'), slot('b', 'communion'), slot('c'), slot('d', 'prayer_meeting')]
    const groups = groupSlotsBySegment(slots)
    expect(groups.map(g => g.key)).toEqual([null, 'communion', 'post_sermon', 'prayer_meeting'])
    expect(groups[0].slots.map(s => s.id)).toEqual(['a', 'c'])
    expect(groups[1].slots.map(s => s.id)).toEqual(['b'])
    expect(groups[2].slots).toEqual([])
    expect(groups[3].slots.map(s => s.id)).toEqual(['d'])
  })
})

describe('orderSlotsForExport', () => {
  it('flattens in segment order and tags only the first slot of each non-null segment', () => {
    const slots = [slot('a'), slot('b', 'communion'), slot('c', 'communion'), slot('d', 'post_sermon')]
    const out = orderSlotsForExport(slots)
    expect(out.map(s => s.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(out.map(s => s.segmentLabel)).toEqual([null, 'Communion', null, 'Post-Sermon'])
  })
  it('main set songs never get a label', () => {
    const out = orderSlotsForExport([slot('a'), slot('b')])
    expect(out.every(s => s.segmentLabel === null)).toBe(true)
  })
})

describe('resolveSegment', () => {
  const slots = [slot('a'), slot('b', 'communion')]
  it('resolves a zone droppable id to its segment key', () => {
    expect(resolveSegment('segzone:main', slots)).toBe(null)
    expect(resolveSegment('segzone:communion', slots)).toBe('communion')
  })
  it('resolves a row id to that row\'s segment', () => {
    expect(resolveSegment('a', slots)).toBe(null)
    expect(resolveSegment('b', slots)).toBe('communion')
  })
})

describe('zoneId', () => {
  it('round-trips through resolveSegment', () => {
    expect(resolveSegment(zoneId(null), [])).toBe(null)
    expect(resolveSegment(zoneId('communion'), [])).toBe('communion')
  })
})

describe('computeSegmentDrop', () => {
  const slots = [slot('a'), slot('b'), slot('c', 'communion')]

  it('reorders within the same group when dropped on a sibling row', () => {
    const r = computeSegmentDrop(slots, 'b', 'a')
    expect(r.orderedIds).toEqual(['b', 'a', 'c'])
    expect(r.destSegment).toBe(null)
    expect(r.changedSegment).toBe(false)
  })

  it('reorders DOWNWARD within a group with arrayMove semantics (lands after over)', () => {
    const s = [slot('a'), slot('b'), slot('c'), slot('d')]
    // drag a down onto b → a lands AFTER b, not before
    expect(computeSegmentDrop(s, 'a', 'b').orderedIds).toEqual(['b', 'a', 'c', 'd'])
    // drag a all the way down onto d → a lands last
    expect(computeSegmentDrop(s, 'a', 'd').orderedIds).toEqual(['b', 'c', 'd', 'a'])
  })

  it('reorders UPWARD within a group with arrayMove semantics', () => {
    const s = [slot('a'), slot('b'), slot('c'), slot('d')]
    expect(computeSegmentDrop(s, 'd', 'b').orderedIds).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moves a row to the end when dropped on its own group zone', () => {
    const s = [slot('a'), slot('b'), slot('c')]
    const r = computeSegmentDrop(s, 'a', 'segzone:main')
    expect(r.orderedIds).toEqual(['b', 'c', 'a'])
    expect(r.changedSegment).toBe(false)
  })

  it('moves a row into a new segment when dropped on that segment\'s zone', () => {
    const r = computeSegmentDrop(slots, 'a', 'segzone:communion')
    expect(r.destSegment).toBe('communion')
    expect(r.changedSegment).toBe(true)
    // a now lives in communion, after existing member c (appended)
    expect(r.orderedIds).toEqual(['b', 'c', 'a'])
  })

  it('inserts at the dropped row\'s position in the destination group', () => {
    const r = computeSegmentDrop(slots, 'a', 'c')
    expect(r.destSegment).toBe('communion')
    expect(r.orderedIds).toEqual(['b', 'a', 'c'])
  })

  it('returns null when the active id is unknown', () => {
    expect(computeSegmentDrop(slots, 'zzz', 'a')).toBe(null)
  })
})
