import { describe, it, expect } from 'vitest'
import { songBodyText, songSearchFields, lyricSnippet } from './songSearch'

const song = {
  title: 'O Praise The Name',
  artist: 'Hillsong',
  tags: ['worship'],
  original_key: 'A',
  parsed_content: [
    { type: 'section_header', text: 'Verse 1' },
    { type: 'chord_line', tokens: [{ text: 'A' }, { text: 'E' }, { text: 'F#m' }] },
    { type: 'lyric_line', text: 'I cast my mind to Calvary' },
    { type: 'lyric_line', text: 'Where our salvation He did buy' },
    { type: 'blank' },
  ],
}

describe('songBodyText', () => {
  it('flattens lyrics, chords, and headers', () => {
    const t = songBodyText(song)
    expect(t).toContain('Calvary')
    expect(t).toContain('A E F#m')
    expect(t).toContain('Verse 1')
  })
  it('is empty for unparsed songs', () => {
    expect(songBodyText({ title: 'x' })).toBe('')
  })
})

describe('songSearchFields', () => {
  it('weights title above the body', () => {
    const fields = songSearchFields(song)
    const title = fields.find(f => f.text === song.title)
    const bodyField = fields[fields.length - 1]
    expect(title.weight).toBeGreaterThan(bodyField.weight)
    expect(bodyField.text).toContain('Calvary')
  })
})

describe('lyricSnippet', () => {
  it('returns a trimmed snippet around a lyric hit', () => {
    expect(lyricSnippet(song, 'calvary')).toContain('Calvary')
  })
  it('returns empty when no lyric matches', () => {
    expect(lyricSnippet(song, 'xylophone')).toBe('')
  })
})
