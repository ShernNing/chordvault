import { describe, it, expect } from 'vitest'
import { PRESETS, candidatesForPreset } from './flow'
import { voicingPosition } from './notes'

const presetById = (id) => PRESETS.find(p => p.id === id)
const playedIdx = (frets) => frets.map((f, i) => (f != null ? i : null)).filter(i => i != null)

describe('PRESETS', () => {
  it('starts with auto and contains all seven presets in cycle order', () => {
    expect(PRESETS.map(p => p.id)).toEqual(
      ['auto', 'low', 'mid', 'high', 'set-gbe', 'set-dgb', 'set-adg'])
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
})
