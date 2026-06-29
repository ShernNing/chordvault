import { describe, it, expect } from 'vitest'
import { extractLyrics, buildEmbedText, MAX_EMBED_CHARS } from './embedText'

describe('extractLyrics', () => {
  it('joins lyric_line text from parsed_content', () => {
    const song = {
      parsed_content: [
        { type: 'section_header', text: 'Verse 1' },
        { type: 'chord_line', tokens: [{ chord: 'G' }] },
        { type: 'lyric_line', text: 'Amazing grace how sweet' },
        { type: 'lyric_line', text: 'the sound that saved' },
      ],
    }
    expect(extractLyrics(song)).toBe('Amazing grace how sweet\nthe sound that saved')
  })

  it('falls back to raw_content when parsed_content has no lyrics', () => {
    const song = { parsed_content: [{ type: 'chord_line', tokens: [] }], raw_content: 'RAW SHEET' }
    expect(extractLyrics(song)).toBe('RAW SHEET')
  })

  it('falls back to raw_content when parsed_content is missing', () => {
    expect(extractLyrics({ raw_content: 'RAW' })).toBe('RAW')
  })

  it('returns empty string when nothing is available', () => {
    expect(extractLyrics({})).toBe('')
  })
})

describe('buildEmbedText', () => {
  it('combines title, artist, tags, and lyrics', () => {
    const song = {
      title: 'Amazing Grace',
      artist: 'John Newton',
      tags: ['hymn', 'grace'],
      parsed_content: [{ type: 'lyric_line', text: 'how sweet the sound' }],
    }
    expect(buildEmbedText(song)).toBe('Amazing Grace\nJohn Newton\nhymn grace\nhow sweet the sound')
  })

  it('tolerates missing artist and tags', () => {
    const song = { title: 'X', raw_content: 'words' }
    expect(buildEmbedText(song)).toBe('X\n\n\nwords')
  })

  it('truncates to MAX_EMBED_CHARS', () => {
    const song = { title: 'T', raw_content: 'x'.repeat(MAX_EMBED_CHARS * 2) }
    expect(buildEmbedText(song).length).toBe(MAX_EMBED_CHARS)
  })
})
