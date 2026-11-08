import { describe, it, expect } from 'vitest'
import { isChord, parseRawContent, parseInlineChordFormat, detectKey } from './ingestion'
import { transposeParsedContent } from './transposition'

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

describe('isChord — extended qualities', () => {
  it.each([
    'Bm7b5', 'C7#9', 'E7b9', 'C6/9', 'Csus2/4', 'C°', 'Cø', 'C+', 'Caug', 'Cdim7',
    'Cm(maj7)', 'Cmaj7#11', 'C7b13', 'Cadd9', 'C(add9)', 'C/E/G', 'Bbm7', 'F#m7b5',
  ])('accepts %s', (c) => {
    expect(isChord(c)).toBe(true)
  })

  it.each(['A', 'Am', 'Ab', 'Bb', 'AM'])('still accepts %s', (c) => {
    expect(isChord(c)).toBe(true)
  })

  it.each(['Add', 'Bad', 'Bed', 'Be', 'Do', 'Go', 'Each', 'Abb', 'Emma', 'Dab', 'Cab', 'Bee', 'Ebb'])(
    'rejects lyric word %s',
    (w) => {
      expect(isChord(w)).toBe(false)
    },
  )

  it('does not hang on long digit runs', () => {
    expect(isChord('C' + '1'.repeat(40) + 'x')).toBe(false)
  })
})

describe('parseRawContent — extended chords transpose', () => {
  it('marks half-diminished chords as chords so they transpose', () => {
    const parsed = parseRawContent('Bm7b5   E7   Am')
    const out = transposeParsedContent(parsed, 3)
    const texts = out[0].tokens.filter((t) => t.isChord).map((t) => t.text)
    expect(texts).toEqual(['Dm7b5', 'G7', 'Cm'])
  })

  it('parses extended chords in inline [chord] format', () => {
    const r = parseInlineChordFormat('[Bm7b5]Holy [C6/9]is [Cm(maj7)]the Lord')
    expect(r.chordLine.trim().split(/\s+/)).toEqual(['Bm7b5', 'C6/9', 'Cm(maj7)'])
    expect(r.lyricLine).toBe('Holy is the Lord')
  })

  it('ignores non-chord bracket tags in inline format', () => {
    expect(parseInlineChordFormat('[Bridge]')).toBe(null)
  })
})

describe('parseRawContent — inline section lines', () => {
  it('preserves chord case in "Verse 1: Am F C G"', () => {
    const parsed = parseRawContent('Verse 1: Am F C G')
    expect(parsed[0]).toEqual({ type: 'section_header', text: '[Verse 1]' })
    expect(parsed[1].tokens.map((t) => t.text)).toEqual(['Am', 'F', 'C', 'G'])
  })

  it('still capitalises lowercase roots ("intro - a")', () => {
    const parsed = parseRawContent('intro - a')
    expect(parsed[1].tokens.map((t) => t.text)).toEqual(['A'])
  })
})

describe('parseRawContent — CRLF input', () => {
  it('handles CRLF annotation and inline section lines', () => {
    const parsed = parseRawContent('! big build\r\nVerse 1: Am F\r\nG  C\r\nHello there\r\n')
    expect(parsed[0]).toEqual({ type: 'annotation', text: 'big build' })
    expect(parsed[1]).toEqual({ type: 'section_header', text: '[Verse 1]' })
    expect(parsed[2].tokens.map((t) => t.text)).toEqual(['Am', 'F'])
    expect(parsed.some((l) => (l.text || l.raw || '').includes('\r'))).toBe(false)
  })

  it('handles bare CR line endings', () => {
    const parsed = parseRawContent('G  C\rHello there')
    expect(parsed.map((l) => l.type)).toEqual(['chord_line', 'lyric_line'])
  })
})

describe('detectKey — minor spelling', () => {
  it('spells Bb minor as Bbm, not A#m', () => {
    expect(detectKey(['Bbm', 'Gb', 'Db', 'Ab', 'Bbm', 'Fm', 'Bbm']).key).toBe('Bbm')
  })

  it('spells Eb minor as Ebm', () => {
    expect(detectKey(['Ebm', 'Cb', 'Gb', 'Db', 'Ebm', 'Bbm', 'Ebm']).key).toBe('Ebm')
  })

  it('keeps sharp spelling for F#m / C#m / G#m', () => {
    expect(detectKey(['F#m', 'D', 'A', 'E', 'F#m', 'C#m', 'F#m']).key).toBe('F#m')
    expect(detectKey(['C#m', 'A', 'E', 'B', 'C#m', 'G#m', 'C#m']).key).toBe('C#m')
    expect(detectKey(['G#m', 'E', 'B', 'F#', 'G#m', 'D#m', 'G#m']).key).toBe('G#m')
  })
})
