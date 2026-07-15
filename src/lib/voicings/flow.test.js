import { describe, it, expect } from 'vitest'
import { PRESETS, candidatesForPreset, pickVoicingPath, pickPathFromLayers, chordSequenceFromParsedContent } from './flow'
import { voicingPosition } from './notes'

const presetById = (id) => PRESETS.find(p => p.id === id)
const playedIdx = (frets) => frets.map((f, i) => (f != null ? i : null)).filter(i => i != null)

describe('PRESETS', () => {
  it('starts with auto, then the top-strings default, in cycle order', () => {
    expect(PRESETS.map(p => p.id)).toEqual(
      ['auto', 'top-strings', 'low', 'mid', 'high', 'set-gbe', 'set-dgb', 'set-adg'])
  })
})

describe('top-strings default preset', () => {
  const topStrings = presetById('top-strings')
  const lowestString = (frets) => {
    for (let i = 0; i < 6; i++) if (frets[i] != null) return i
    return 5
  }

  it('softly biases — never hard-filters, so every chord keeps a full candidate pool', () => {
    for (const chord of ['G', 'C', 'Em', 'Bm7b5']) {
      const cands = candidatesForPreset(chord, topStrings)
      expect(cands.length).toBeGreaterThan(0)
      for (const c of cands) expect(c.offPreset).toBe(false)  // soft, not a filter
    }
  })

  it('keeps picks off the A string (idx ≤1 = the 3·4·5 set) when higher sets exist', () => {
    const path = pickVoicingPath(['G', 'C', 'D', 'Em', 'Am'], topStrings)
    for (const p of path) {
      expect(p.frets).not.toBeNull()
      expect(lowestString(p.frets)).toBeGreaterThanOrEqual(2)  // stays on strings 1·2·3 / 2·3·4
    }
  })

  it('prefers a top-three-string (G-B-e) voicing for an isolated triad', () => {
    const [p] = pickVoicingPath(['C'], topStrings)
    expect(lowestString(p.frets)).toBe(3)  // G-B-e set, the most-preferred
  })

  it('still returns a complete path for a 7th chord that only lives on the top-4 strings', () => {
    const path = pickVoicingPath(['Gmaj7', 'Am7', 'D7'], topStrings)
    expect(path).toHaveLength(3)
    for (const p of path) expect(p.frets).not.toBeNull()
  })
})

describe('candidatesForPreset', () => {
  it('auto returns quality-matched candidates, none off-preset', () => {
    const cands = candidatesForPreset('G', presetById('auto'))
    expect(cands.length).toBeGreaterThan(0)
    for (const c of cands) {
      expect(c.displayedName).toBe('G')       // no Gsus2/G7 leaking into plain G
      expect(c.offPreset).toBe(false)
    }
  })

  it('zone presets filter by position', () => {
    for (const c of candidatesForPreset('G', presetById('low'))) {
      expect(voicingPosition(c.frets)).toBeGreaterThanOrEqual(1)
      expect(voicingPosition(c.frets)).toBeLessThanOrEqual(5)
    }
    for (const c of candidatesForPreset('G', presetById('high'))) {
      expect(voicingPosition(c.frets)).toBeGreaterThanOrEqual(8)
    }
  })

  it('string-set presets filter by played strings', () => {
    const cands = candidatesForPreset('C', presetById('set-gbe'))
    expect(cands.length).toBeGreaterThan(0)
    for (const c of cands) expect(playedIdx(c.frets)).toEqual([3, 4, 5])
  })

  it('falls back to the full list flagged offPreset when a preset has no match', () => {
    // Bm7b5 exists only as top-4 (D-G-B-e) shapes — no pure G-B-e voicing.
    const cands = candidatesForPreset('Bm7b5', presetById('set-gbe'))
    expect(cands.length).toBeGreaterThan(0)
    for (const c of cands) expect(c.offPreset).toBe(true)
  })

  it('returns [] for an unparseable chord', () => {
    expect(candidatesForPreset('???', presetById('auto'))).toEqual([])
  })

  it('applies the quality guard to padded chord names', () => {
    const clean = candidatesForPreset('G', presetById('auto'))
    const padded = candidatesForPreset('G ', presetById('auto'))
    expect(padded).toEqual(clean)
  })
})

describe('pickPathFromLayers', () => {
  const V = (frets) => ({ voicing: { id: 'syn' }, frets, displayedName: 'X', offPreset: false })

  it('beats greedy on a trap sequence', () => {
    // Greedy takes the cheap first hop (5→4, movement 3) and then pays a huge
    // jump to fret 12. The globally cheaper path goes 5→9→12.
    const layers = [
      [V([null, null, 5, 5, 5, null])],
      [V([null, null, 4, 4, 4, null]), V([null, null, 9, 9, 9, null])],
      [V([null, null, 12, 12, 12, null])],
    ]
    const path = pickPathFromLayers(layers, PRESETS[0])
    expect(path[1].frets).toEqual([null, null, 9, 9, 9, null])
  })

  it('breaks the chain at an empty layer and picks around it', () => {
    const layers = [
      [V([null, null, 5, 5, 5, null])],
      [],
      [V([null, null, 7, 7, 7, null])],
    ]
    const path = pickPathFromLayers(layers, PRESETS[0])
    expect(path[0]).not.toBeNull()
    expect(path[1]).toBeNull()
    expect(path[2]).not.toBeNull()
  })
})

describe('pickVoicingPath', () => {
  it('gives a repeated chord the identical voicing (zero-movement path)', () => {
    const path = pickVoicingPath(['G', 'G', 'G'], PRESETS[0])
    expect(path[0].frets).toEqual(path[1].frets)
    expect(path[1].frets).toEqual(path[2].frets)
  })

  it('returns a complete path for every preset on a common progression', () => {
    for (const preset of PRESETS) {
      const path = pickVoicingPath(['G', 'C', 'D', 'Em'], preset)
      expect(path).toHaveLength(4)
      for (const p of path) {
        expect(p.frets).not.toBeNull()
        expect(p.voicing).not.toBeNull()
      }
    }
  })

  it('honors zone presets: every non-offPreset pick sits inside the zone', () => {
    const path = pickVoicingPath(['G', 'C', 'D', 'Em'], PRESETS.find(p => p.id === 'high'))
    for (const p of path) {
      if (!p.offPreset) {
        const pos = p.frets.filter(f => f != null && f > 0)
        expect(Math.min(...pos)).toBeGreaterThanOrEqual(8)
      }
    }
  })

  it('is deterministic', () => {
    const a = pickVoicingPath(['G', 'C', 'D', 'Em', 'C', 'G'], PRESETS.find(p => p.id === 'mid'))
    const b = pickVoicingPath(['G', 'C', 'D', 'Em', 'C', 'G'], PRESETS.find(p => p.id === 'mid'))
    expect(a).toEqual(b)
  })

  it('returns a null-voicing placeholder for unknown chords', () => {
    const path = pickVoicingPath(['G', '???', 'C'], PRESETS[0])
    expect(path[1]).toEqual({ chord: '???', voicing: null, frets: null, displayedName: '???', offPreset: false })
    expect(path[0].frets).not.toBeNull()
    expect(path[2].frets).not.toBeNull()
  })
})

describe('chordSequenceFromParsedContent', () => {
  const parsed = [
    { type: 'section_header', text: 'Verse 1' },
    { type: 'chord_line', tokens: [{ text: 'G' }, { text: 'G' }, { text: 'C' }] },
    { type: 'lyric_line', text: 'la la la' },
    { type: 'chord_line', tokens: [{ text: 'C' }, { text: 'D' }] },
    { type: 'section_header', text: 'Chorus' },
    { type: 'chord_line', tokens: [{ text: 'Em' }, { text: 'C' }] },
  ]

  it('groups by section header and collapses consecutive duplicates', () => {
    expect(chordSequenceFromParsedContent(parsed)).toEqual([
      { label: 'Verse 1', chords: ['G', 'C', 'D'] },   // G G → G; C|C across lines → C
      { label: 'Chorus', chords: ['Em', 'C'] },
    ])
  })

  it('puts headerless songs in one unlabeled group', () => {
    const noHeader = [{ type: 'chord_line', tokens: [{ text: 'Am' }, { text: 'F' }] }]
    expect(chordSequenceFromParsedContent(noHeader)).toEqual([
      { label: null, chords: ['Am', 'F'] },
    ])
  })

  it('applies transposition', () => {
    const groups = chordSequenceFromParsedContent(parsed, { semitones: 2 })
    expect(groups[0].chords).toEqual(['A', 'D', 'E'])
  })

  it('does not collapse duplicates across a section boundary', () => {
    const crossing = [
      { type: 'section_header', text: 'Verse' },
      { type: 'chord_line', tokens: [{ text: 'G' }, { text: 'C' }] },
      { type: 'section_header', text: 'Chorus' },
      { type: 'chord_line', tokens: [{ text: 'C' }, { text: 'D' }] },
    ]
    expect(chordSequenceFromParsedContent(crossing)).toEqual([
      { label: 'Verse', chords: ['G', 'C'] },
      { label: 'Chorus', chords: ['C', 'D'] },
    ])
  })

  it('ignores non-chord tokens and returns [] for missing content', () => {
    const junk = [{ type: 'chord_line', tokens: [{ text: '(x2)' }, { text: 'G' }] }]
    expect(chordSequenceFromParsedContent(junk)[0].chords).toEqual(['G'])
    expect(chordSequenceFromParsedContent(null)).toEqual([])
  })
})
