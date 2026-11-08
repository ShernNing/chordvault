import { describe, it, expect } from 'vitest'
import { parseRawContent } from './ingestion'
import { serializeParsedContent } from './serializeContent'

// Compare the parts of a parsed line that matter for rendering (the chord line
// `raw` field can differ in trailing whitespace only).
const shape = (lines) => lines.map(l => {
  if (l.type === 'chord_line') return { type: l.type, tokens: l.tokens.map(t => [t.text, t.leadingSpaces, t.isChord]) }
  return { type: l.type, text: l.text }
})

const roundTrip = (parsed) => parseRawContent(serializeParsedContent(parsed))

describe('serializeParsedContent', () => {
  it('round-trips a typical sheet with headers, chords, lyrics and blanks', () => {
    const raw = [
      '[Verse 1]',
      'G       D/F#    Em',
      'Amazing grace how sweet',
      '',
      'Chorus',
      '   C    G',
      'My chains are gone',
    ].join('\n')
    const parsed = parseRawContent(raw)
    expect(shape(roundTrip(parsed))).toEqual(shape(parsed))
  })

  it('keeps "!" annotations as annotations (not lyrics)', () => {
    const parsed = parseRawContent('[Intro]\n! capo 2 here\nG  C\n! big build')
    const back = roundTrip(parsed)
    expect(back.filter(l => l.type === 'annotation').map(l => l.text)).toEqual(['capo 2 here', 'big build'])
    expect(shape(back)).toEqual(shape(parsed))
  })

  it('round-trips inline-chord and inline-section input', () => {
    const parsed = parseRawContent('Intro: G C D\n[G]Amazing [C]grace')
    expect(shape(roundTrip(parsed))).toEqual(shape(parsed))
  })

  it('round-trips bar-line notation', () => {
    const parsed = parseRawContent('| Eb / / / | Bb / / / |')
    expect(shape(roundTrip(parsed))).toEqual(shape(parsed))
  })

  it('keeps chord columns (leading spaces) for chord lines', () => {
    const tokens = [
      { text: 'G', isChord: true, leadingSpaces: 2 },
      { text: 'C', isChord: true, leadingSpaces: 5 },
    ]
    const line = { type: 'chord_line', tokens, raw: '  G     C', uncertain: false }
    expect(serializeParsedContent([line])).toBe('  G     C')
    expect(shape(roundTrip([line]))).toEqual(shape([line]))
  })

  it('round-trips transposed content (Save key rebuild)', () => {
    const parsed = parseRawContent('[Verse]\n! softly\nA      E\nWords here')
    const transposed = parsed.map(l => l.type === 'chord_line'
      ? { ...l, tokens: l.tokens.map(t => ({ ...t, text: t.text === 'A' ? 'Bb' : 'F' })) }
      : l)
    expect(shape(roundTrip(transposed))).toEqual(shape(transposed))
  })

  it('handles empty / missing content', () => {
    expect(serializeParsedContent([])).toBe('')
    expect(serializeParsedContent(null)).toBe('')
  })
})
