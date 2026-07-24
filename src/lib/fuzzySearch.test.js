import { describe, it, expect } from 'vitest'
import { normalizeText, boundedLevenshtein, wordMatches, fuzzyMatch, scoreFields, highlightSegments } from './fuzzySearch'

describe('normalizeText', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeText('Café del Mar!')).toBe('cafe del mar')
    expect(normalizeText('Beyoncé — Halo')).toBe('beyonce halo')
    expect(normalizeText(null)).toBe('')
  })
})

describe('boundedLevenshtein', () => {
  it('measures edit distance', () => {
    expect(boundedLevenshtein('praise', 'paise', 3)).toBe(1)
    expect(boundedLevenshtein('kitten', 'sitting', 3)).toBe(3)
    expect(boundedLevenshtein('abc', 'abc', 2)).toBe(0)
  })
  it('early-exits past the ceiling', () => {
    expect(boundedLevenshtein('abcdef', 'zzzzzz', 2)).toBe(3) // max + 1
  })
})

describe('wordMatches', () => {
  it('matches substrings and near-typos', () => {
    expect(wordMatches('praise', 'paise')).toBe(true) // 1 edit
    expect(wordMatches('beatles', 'beatls')).toBe(true)
    expect(wordMatches('halo', 'hallo')).toBe(true)
  })
  it('requires substring for very short tokens', () => {
    expect(wordMatches('cat', 'cot')).toBe(false) // len 3 → no fuzz
    expect(wordMatches('am', 'am7')).toBe(true) // substring ok
  })
})

describe('fuzzyMatch', () => {
  const fields = ['O Praise The Name', 'Hillsong', 'A', ['worship', 'anthem']]

  it('matches an exact contiguous substring', () => {
    expect(fuzzyMatch('praise the', fields)).toBe(true)
  })
  it('matches across typos (praise → paise)', () => {
    expect(fuzzyMatch('o paise', fields)).toBe(true)
    expect(fuzzyMatch('praise', ['O Paise The Name'])).toBe(true)
  })
  it('matches artist and tags fuzzily', () => {
    expect(fuzzyMatch('hilsong', fields)).toBe(true) // missing l
    expect(fuzzyMatch('worshp', fields)).toBe(true) // tag typo
  })
  it('requires every token to match', () => {
    expect(fuzzyMatch('praise xylophone', fields)).toBe(false)
  })
  it('empty query matches everything', () => {
    expect(fuzzyMatch('   ', fields)).toBe(true)
  })
})

describe('scoreFields', () => {
  const title = { text: 'Amazing Grace', weight: 6 }
  const artist = { text: 'John Newton', weight: 4 }
  const body = { text: 'how sweet the sound that saved a wretch like me', weight: 1 }

  it('returns 0 when a token matches nothing', () => {
    expect(scoreFields('xylophone', [title, artist, body])).toBe(0)
  })

  it('ranks a title hit above a body-only hit', () => {
    const titleHit = scoreFields('grace', [title, artist, body])
    const bodyHit = scoreFields('wretch', [title, artist, body])
    expect(titleHit).toBeGreaterThan(bodyHit)
    expect(bodyHit).toBeGreaterThan(0)
  })

  it('rewards a whole-query contiguous phrase', () => {
    const phrase = scoreFields('amazing grace', [title, artist, body])
    const single = scoreFields('amazing', [title, artist, body])
    expect(phrase).toBeGreaterThan(single)
  })

  it('still scores near-typos above zero', () => {
    expect(scoreFields('amazin grace', [title, artist, body])).toBeGreaterThan(0)
  })
})

describe('highlightSegments', () => {
  it('marks case-insensitive matches, leaves the rest', () => {
    const segs = highlightSegments('Amazing Grace', 'grace')
    expect(segs).toEqual([
      { text: 'Amazing ', hit: false },
      { text: 'Grace', hit: true },
    ])
  })
  it('handles no match and empty query', () => {
    expect(highlightSegments('Hello', 'xyz')).toEqual([{ text: 'Hello', hit: false }])
    expect(highlightSegments('Hello', '')).toEqual([{ text: 'Hello', hit: false }])
  })
})
