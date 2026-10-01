import { describe, it, expect } from 'vitest'
import { toggleIn, filterFavorites } from './favorites'

describe('toggleIn', () => {
  it('adds an absent id', () => {
    expect([...toggleIn(new Set(['a']), 'b')].sort()).toEqual(['a', 'b'])
  })
  it('removes a present id', () => {
    expect([...toggleIn(new Set(['a', 'b']), 'a')]).toEqual(['b'])
  })
  it('does not mutate the input', () => {
    const s = new Set(['a'])
    toggleIn(s, 'b')
    expect([...s]).toEqual(['a'])
  })
})

describe('filterFavorites', () => {
  const songs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  it('keeps only favourited songs, preserving order', () => {
    expect(filterFavorites(songs, new Set(['c', 'a'])).map(s => s.id)).toEqual(['a', 'c'])
  })
  it('returns empty for an empty set', () => {
    expect(filterFavorites(songs, new Set())).toEqual([])
  })
})
