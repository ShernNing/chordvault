import { describe, it, expect } from 'vitest'
import { isChord } from './ingestion'

describe('isChord', () => {
  it('recognizes plain chords', () => {
    expect(isChord('G')).toBe(true)
    expect(isChord('Am7')).toBe(true)
  })

  it('recognizes chords wrapped in parens or brackets (optional/passing chords)', () => {
    expect(isChord('(D)')).toBe(true)
    expect(isChord('[D]')).toBe(true)
    expect(isChord('(Em7)')).toBe(true)
    expect(isChord('[F/A]')).toBe(true)
  })

  it('rejects non-chord tokens', () => {
    expect(isChord('hello')).toBe(false)
    expect(isChord('[hello]')).toBe(false)
  })
})
