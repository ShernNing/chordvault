import { describe, it, expect } from 'vitest'
import { selectRelatedSongs } from './relatedSongs'

const songs = [
  { id: 'a', title: 'A', original_key: 'G' },
  { id: 'b', title: 'B', original_key: 'C' },
  { id: 'c', title: 'C', original_key: 'G' },
]

describe('selectRelatedSongs', () => {
  it('maps ids to songs preserving rank order', () => {
    const out = selectRelatedSongs(['c', 'a'], songs, {})
    expect(out.map(s => s.id)).toEqual(['c', 'a'])
  })

  it('drops ids already in the keyword results', () => {
    const out = selectRelatedSongs(['a', 'b', 'c'], songs, { excludeIds: new Set(['b']) })
    expect(out.map(s => s.id)).toEqual(['a', 'c'])
  })

  it('drops ids not present in allSongs (not visible to user)', () => {
    const out = selectRelatedSongs(['a', 'zzz'], songs, {})
    expect(out.map(s => s.id)).toEqual(['a'])
  })

  it('applies the key filter when set', () => {
    const out = selectRelatedSongs(['a', 'b', 'c'], songs, { keyFilter: 'G' })
    expect(out.map(s => s.id)).toEqual(['a', 'c'])
  })

  it('returns empty for empty ids', () => {
    expect(selectRelatedSongs([], songs, {})).toEqual([])
  })
})
