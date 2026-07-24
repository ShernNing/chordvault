import { describe, it, expect } from 'vitest'
import {
  countBars,
  estimateSongSeconds,
  formatDuration,
  DEFAULT_SONG_SECONDS,
} from './songDuration'

const song = {
  id: 's1',
  parsed_content: [
    { type: 'section_header', text: 'Verse' },
    { type: 'chord_line', tokens: [{ text: 'G' }, { text: 'C' }, { text: 'D' }, { text: 'G' }] },
    { type: 'lyric_line', text: 'la la la' },
    { type: 'chord_line', tokens: [{ text: 'Em' }, { text: 'C' }] },
    { type: 'blank' },
  ],
}

describe('countBars', () => {
  it('counts chord changes as bars', () => {
    expect(countBars(song.parsed_content)).toBe(6) // 4 + 2 chord tokens
  })
  it('falls back to non-blank lines when no chords', () => {
    expect(countBars([
      { type: 'lyric_line', text: 'a' },
      { type: 'lyric_line', text: 'b' },
      { type: 'blank' },
    ])).toBe(2)
  })
  it('returns 0 for unparsed content', () => {
    expect(countBars(null)).toBe(0)
  })
})

describe('estimateSongSeconds', () => {
  it('scales with tempo: 6 bars × 4 beats at 120bpm = 12s (floored to min)', () => {
    // 6*4*60/120 = 12 → below the 30s floor
    expect(estimateSongSeconds(song, 120, 4)).toBe(30)
  })
  it('slower tempo yields a longer estimate', () => {
    const slow = estimateSongSeconds(song, 40, 4) // 6*4*60/40 = 36
    expect(slow).toBe(36)
  })
  it('faster tempo is shorter than slower', () => {
    expect(estimateSongSeconds(song, 200, 4)).toBeLessThanOrEqual(
      estimateSongSeconds(song, 60, 4),
    )
  })
  it('falls back to the default when nothing to count', () => {
    expect(estimateSongSeconds({ id: 'x' }, 100)).toBe(DEFAULT_SONG_SECONDS)
  })
})

describe('formatDuration', () => {
  it('formats m:ss and hours', () => {
    expect(formatDuration(75)).toBe('1:15')
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(3720)).toBe('1h 2m')
  })
})
