import { describe, it, expect } from 'vitest'
import { splitDocumentIntoSongs, getImportFileType } from './docImport'

describe('splitDocumentIntoSongs — dash titles', () => {
  it('splits on "Title – Artist" lines between songs', () => {
    const text = [
      'Precious Jesus – Sinach',
      'G  C',
      'Jesus precious Jesus',
      '',
      'Way Maker — Sinach',
      'D  A',
      'You are here',
    ].join('\n')
    const songs = splitDocumentIntoSongs(text)
    expect(songs.map((s) => s.rawTitle)).toEqual(['Precious Jesus – Sinach', 'Way Maker — Sinach'])
  })

  it('does not split a song on a lyric line containing a dash', () => {
    const text = [
      'Precious Jesus – Sinach',
      'G         C',
      'Holy — You are worthy',
      'D         G',
      'Worthy is the Lamb',
    ].join('\n')
    const songs = splitDocumentIntoSongs(text)
    expect(songs).toHaveLength(1)
    expect(songs[0].rawContent).toContain('Holy — You are worthy')
  })

  it('does not split on a title-case dash lyric after a blank line followed by lyrics', () => {
    const text = [
      'Precious Jesus – Sinach',
      'G  C',
      'Jesus precious Jesus',
      '',
      'Holy Holy — Lord God Almighty',
      'Early in the morning',
    ].join('\n')
    expect(splitDocumentIntoSongs(text)).toHaveLength(1)
  })

  it('keeps numbered and keyed titles', () => {
    const text = [
      '1. The Joy (F)',
      'F  C',
      'joy',
      '2. TRIBES – Victory Worship (G)',
      'G  D',
      'tribes',
    ].join('\n')
    expect(splitDocumentIntoSongs(text).map((s) => s.rawTitle)).toEqual([
      '1. The Joy (F)',
      '2. TRIBES – Victory Worship (G)',
    ])
  })

  it('handles CRLF documents', () => {
    const songs = splitDocumentIntoSongs('1. The Joy (F)\r\nF  C\r\njoy\r\n')
    expect(songs[0].rawTitle).toBe('1. The Joy (F)')
    expect(songs[0].rawContent).toBe('F  C\njoy')
  })
})

describe('getImportFileType', () => {
  it('is case-insensitive', () => {
    expect(getImportFileType('SET.DOCX')).toBe('docx')
    expect(getImportFileType('set.Pdf')).toBe('pdf')
    expect(getImportFileType('SET.PDF')).toBe('pdf')
    expect(getImportFileType('set.doc')).toBe(null)
    expect(getImportFileType('')).toBe(null)
  })
})
