import { describe, it, expect } from 'vitest'
import { extractChordsWithSections } from './ingestion'

const content = [
  { type: 'section_header', text: 'Verse' },
  { type: 'chord_line', tokens: [{ text: 'G', isChord: true }, { text: 'C', isChord: true }] },
  { type: 'lyric_line', text: 'la la' },
  { type: 'section_header', text: 'Chorus' },
  { type: 'chord_line', tokens: [{ text: 'D', isChord: true }, { text: 'Em', isChord: true }, { text: 'the', isChord: false }] },
]

describe('extractChordsWithSections', () => {
  it('returns aligned flat chords and section ranges', () => {
    const { chords, sections } = extractChordsWithSections(content)
    expect(chords).toEqual(['G', 'C', 'D', 'Em'])
    expect(sections).toEqual([
      { label: 'Verse', start: 0, end: 2 },
      { label: 'Chorus', start: 2, end: 4 },
    ])
    // ranges index correctly into the flat array
    const chorus = sections[1]
    expect(chords.slice(chorus.start, chorus.end)).toEqual(['D', 'Em'])
  })

  it('drops empty sections and handles no headers', () => {
    const { chords, sections } = extractChordsWithSections([
      { type: 'chord_line', tokens: [{ text: 'A', isChord: true }] },
    ])
    expect(chords).toEqual(['A'])
    expect(sections).toEqual([])
  })
})
