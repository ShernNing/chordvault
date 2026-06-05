import { describe, it, expect } from 'vitest'
import {
  transposeChord,
  transposeKey,
  semitonesFromKeyToKey,
  getCapoShapeKey,
  transposeParsedContent,
  keyPrefersFlats,
  keyPrefersSharps,
} from './transposition'

describe('transposeChord', () => {
  it('returns the chord unchanged for 0 semitones', () => {
    expect(transposeChord('G', 0)).toBe('G')
  })

  it('transposes a major chord up a whole tone', () => {
    expect(transposeChord('C', 2)).toBe('D')
  })

  it('preserves chord quality', () => {
    expect(transposeChord('Am7', 3)).toBe('Cm7')
  })

  it('transposes both halves of a slash chord', () => {
    expect(transposeChord('F/A', 2)).toBe('G/B')
  })

  it('wraps an octave back to the same root', () => {
    expect(transposeChord('C', 12)).toBe('C')
  })

  it('respects target-key enharmonic preference', () => {
    // Up 1 semitone from A, spelled for a flat key, is Bb (not A#).
    expect(transposeChord('A', 1, 'Bb')).toBe('Bb')
  })
})

describe('transposeKey', () => {
  it('returns the key unchanged for 0 semitones', () => {
    expect(transposeKey('C', 0)).toBe('C')
  })

  it('transposes a major key up a whole tone', () => {
    expect(transposeKey('G', 2)).toBe('A')
  })

  it('keeps the minor suffix', () => {
    expect(transposeKey('Am', 3)).toBe('Cm')
  })

  it('chooses the simpler enharmonic spelling', () => {
    expect(transposeKey('A', 1)).toBe('Bb')
  })
})

describe('semitonesFromKeyToKey', () => {
  it('returns 0 for the same key', () => {
    expect(semitonesFromKeyToKey('G', 'G')).toBe(0)
  })

  it('returns the shortest signed distance', () => {
    expect(semitonesFromKeyToKey('C', 'D')).toBe(2)
    expect(semitonesFromKeyToKey('C', 'F')).toBe(5)
    // G is 7 up but only 5 down — normalized to the shorter move.
    expect(semitonesFromKeyToKey('C', 'G')).toBe(-5)
  })

  it('ignores minor suffixes', () => {
    expect(semitonesFromKeyToKey('Am', 'Cm')).toBe(3)
  })

  it('returns 0 when an argument is missing', () => {
    expect(semitonesFromKeyToKey('', 'C')).toBe(0)
  })
})

describe('getCapoShapeKey', () => {
  it('returns the shape key a guitarist plays under a capo', () => {
    // Play D shapes with capo 2 → sounds like E.
    expect(getCapoShapeKey('E', 2)).toBe('D')
  })

  it('returns the display key when there is no capo', () => {
    expect(getCapoShapeKey('G', 0)).toBe('G')
  })

  it('returns the input when the display key is missing', () => {
    expect(getCapoShapeKey(null, 2)).toBe(null)
  })
})

describe('key accidental preference', () => {
  it('flags flat keys', () => {
    expect(keyPrefersFlats('Bb')).toBe(true)
    expect(keyPrefersFlats('F')).toBe(true)
    expect(keyPrefersFlats('G')).toBe(false)
  })

  it('flags sharp keys', () => {
    expect(keyPrefersSharps('E')).toBe(true)
    expect(keyPrefersSharps('F')).toBe(false)
  })
})

describe('transposeParsedContent', () => {
  it('returns the same reference for 0 semitones', () => {
    const content = [{ type: 'chord_line', tokens: [] }]
    expect(transposeParsedContent(content, 0)).toBe(content)
  })

  it('transposes only chord tokens and does not mutate the input', () => {
    const content = [
      {
        type: 'chord_line',
        tokens: [
          { isChord: true, text: 'C' },
          { isChord: false, text: '   ' },
          { isChord: true, text: 'Am' },
        ],
      },
      { type: 'lyric_line', text: 'unchanged' },
    ]
    const out = transposeParsedContent(content, 2)
    expect(out[0].tokens[0].text).toBe('D')
    expect(out[0].tokens[1].text).toBe('   ')
    expect(out[0].tokens[2].text).toBe('Bm')
    expect(out[1]).toEqual({ type: 'lyric_line', text: 'unchanged' })
    // original untouched
    expect(content[0].tokens[0].text).toBe('C')
  })
})
