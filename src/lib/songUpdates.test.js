import { describe, it, expect } from 'vitest'
import { prepareSongUpdates } from './songUpdates'
import { parseRawContent } from './ingestion'
import { shouldAutoDetectTitle } from './titleAutoDetect'

describe('prepareSongUpdates', () => {
  it('never re-parses caller-supplied parsed_content and derives matching raw_content', () => {
    const parsed = parseRawContent('[Verse]\n! softly\nG   C\nHello there')
    // a manual fix: mark the chord line certain + keep the annotation
    const fixed = parsed.map(l => ({ ...l, uncertain: false }))
    const out = prepareSongUpdates({ parsed_content: fixed })
    expect(out.parsed_content).toBe(fixed)
    expect(out.raw_content).toBe('[Verse]\n! softly\nG   C\nHello there')
  })

  it('keeps both when parsed_content and raw_content are supplied', () => {
    const out = prepareSongUpdates({ parsed_content: [], raw_content: 'x' })
    expect(out.raw_content).toBe('x')
    expect(out.parsed_content).toEqual([])
  })

  it('re-parses raw_content and detects the key when none is given', () => {
    const out = prepareSongUpdates({ raw_content: 'G  C  D\nWords', original_key: null })
    expect(out.parsed_content.map(l => l.type)).toEqual(['chord_line', 'lyric_line'])
    expect(out.original_key).toBe('G')
  })

  it('clearing the sheet ("") also clears parsed_content', () => {
    const out = prepareSongUpdates({ raw_content: '' })
    expect(out.parsed_content).toEqual([])
  })

  it('leaves content alone for metadata-only updates', () => {
    const out = prepareSongUpdates({ original_key: 'D' })
    expect(out).toEqual({ original_key: 'D' })
  })
})

describe('shouldAutoDetectTitle', () => {
  it('does not steal the first line while typing it', () => {
    expect(shouldAutoDetectTitle('', 'T')).toBe(false)
    expect(shouldAutoDetectTitle('T', 'Th')).toBe(false)
    expect(shouldAutoDetectTitle('Amazing Grac', 'Amazing Grace\n')).toBe(false)
  })

  it('fires when the content first becomes multi-line', () => {
    expect(shouldAutoDetectTitle('Amazing Grace\n', 'Amazing Grace\nG')).toBe(true)
    expect(shouldAutoDetectTitle('a\nb', 'a\nb\nc')).toBe(false)
  })

  it('fires on paste', () => {
    expect(shouldAutoDetectTitle('', 'Amazing Grace', { pasted: true })).toBe(true)
    expect(shouldAutoDetectTitle('', '   ', { pasted: true })).toBe(false)
  })
})
