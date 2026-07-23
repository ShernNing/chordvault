import { describe, it, expect } from 'vitest'
import { PRESETS } from './flow'
import { collectChordSlots, buildInlineVoicings, cycleVoicing } from './inlineVoicings'

// A minimal parsed_content: two chord lines, "G C" then "C".
const content = [
  { type: 'chord_line', tokens: [
    { text: 'G', leadingSpaces: 0 },
    { text: 'C', leadingSpaces: 3 },
  ] },
  { type: 'lyric_line', text: 'hello there' },
  { type: 'chord_line', tokens: [
    { text: 'lol', leadingSpaces: 0 }, // not a chord — must be skipped
    { text: 'C', leadingSpaces: 2 },
  ] },
]

const AUTO = PRESETS[0]

describe('collectChordSlots', () => {
  it('collects chord tokens in reading order, skips non-chords, keys by line:token', () => {
    const slots = collectChordSlots(content)
    expect(slots).toEqual([
      { key: '0:0', name: 'G' },
      { key: '0:1', name: 'C' },
      { key: '2:1', name: 'C' }, // token index 1 within its line, non-chord at 0 skipped
    ])
  })

  it('does NOT collapse duplicate chords (per-occurrence)', () => {
    const slots = collectChordSlots(content)
    const cKeys = slots.filter(s => s.name === 'C').map(s => s.key)
    expect(cKeys).toEqual(['0:1', '2:1'])
  })

  it('returns [] for non-array input', () => {
    expect(collectChordSlots(null)).toEqual([])
  })
})

describe('buildInlineVoicings', () => {
  it('returns a map keyed like the slots, with real frets for known chords', () => {
    const map = buildInlineVoicings(content, AUTO)
    const g = map.get('0:0')
    expect(g).toBeTruthy()
    expect(g.name).toBe('G')
    expect(Array.isArray(g.frets)).toBe(true)
    expect(g.frets).toHaveLength(6)
    expect(map.get('2:1').name).toBe('C')
  })
})

describe('cycleVoicing', () => {
  it('advances to a different voicing and wraps around', () => {
    const map = buildInlineVoicings(content, AUTO)
    const start = map.get('0:0')
    const next = cycleVoicing(start, 'G', AUTO, 1)
    expect(next).toBeTruthy()
    expect(Array.isArray(next.frets)).toBe(true)
    // Cycling forward then back returns an equivalent fret signature.
    const back = cycleVoicing(next, 'G', AUTO, -1)
    const sig = f => f.map(v => (v == null ? 'x' : v)).join('-')
    expect(sig(back.frets)).toBe(sig(start.frets))
  })

  it('returns current unchanged when the chord has no catalog voicings', () => {
    const cur = { name: 'Zzz', voicing: null, frets: null, displayedName: 'Zzz', offPreset: false }
    expect(cycleVoicing(cur, 'Zzz', AUTO, 1)).toBe(cur)
  })

  it('cycles a plain major chord into same-root shell (power) voicings', () => {
    const map = buildInlineVoicings(content, AUTO)
    let cur = map.get('0:0') // default primary — a real G triad, never a shell
    expect(cur.displayedName).toBe('G')
    const names = new Set()
    for (let i = 0; i < 20; i++) {
      cur = cycleVoicing(cur, 'G', AUTO, 1)
      names.add(cur.displayedName)
    }
    // Shells are reachable by manual cycling, labeled honestly as G5.
    expect(names.has('G5')).toBe(true)
  })
})
