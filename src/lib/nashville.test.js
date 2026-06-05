import { describe, it, expect } from 'vitest'
import { chordToNashville, nashvilleParsedContent } from './nashville'

describe('chordToNashville', () => {
  it('maps the tonic to 1', () => {
    expect(chordToNashville('G', 'G')).toBe('1')
  })

  it('maps a I-IV-V the same way regardless of key', () => {
    expect(chordToNashville('C', 'G')).toBe('4')
    expect(chordToNashville('D', 'G')).toBe('5')
    expect(chordToNashville('A', 'E')).toBe('4')
    expect(chordToNashville('B', 'E')).toBe('5')
  })

  it('preserves the chord quality suffix', () => {
    expect(chordToNashville('Am7', 'C')).toBe('6m7')
    expect(chordToNashville('Em', 'G')).toBe('6m')
  })

  it('handles slash chords on both sides', () => {
    expect(chordToNashville('F/A', 'C')).toBe('4/6')
  })

  it('returns the input when key or chord is missing', () => {
    expect(chordToNashville('C', '')).toBe('C')
    expect(chordToNashville('', 'C')).toBe('')
  })

  it('ignores a minor-key suffix when resolving the tonic', () => {
    expect(chordToNashville('A', 'Am')).toBe('1')
  })
})

describe('nashvilleParsedContent', () => {
  it('converts chord tokens and leaves lyrics alone', () => {
    const content = [
      {
        type: 'chord_line',
        tokens: [
          { isChord: true, text: 'C' },
          { isChord: false, text: ' ' },
          { isChord: true, text: 'G' },
        ],
      },
      { type: 'lyric_line', text: 'hello' },
    ]
    const out = nashvilleParsedContent(content, 'C')
    expect(out[0].tokens[0].text).toBe('1')
    expect(out[0].tokens[2].text).toBe('5')
    expect(out[1].text).toBe('hello')
    // original untouched
    expect(content[0].tokens[0].text).toBe('C')
  })

  it('returns the input unchanged when no key is given', () => {
    const content = [{ type: 'chord_line', tokens: [] }]
    expect(nashvilleParsedContent(content, null)).toBe(content)
  })
})
