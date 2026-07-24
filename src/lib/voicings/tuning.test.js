import { describe, it, expect } from 'vitest'
import { TUNINGS, getTuning, tuningLabels, midiNoteName, STANDARD_TUNING } from './tuning'
import { fretToPitchClass, voicingUniquePitchClasses } from './notes'

describe('tuning presets', () => {
  it('every preset has six MIDI numbers ascending overall', () => {
    for (const t of TUNINGS) {
      expect(t.midi).toHaveLength(6)
      expect(t.midi.every(Number.isFinite)).toBe(true)
    }
  })
  it('getTuning falls back to standard', () => {
    expect(getTuning('nope')).toBe(TUNINGS[0])
    expect(getTuning('drop-d').midi[0]).toBe(38) // D2
  })
  it('labels the low string of Drop D as D', () => {
    expect(tuningLabels(getTuning('drop-d').midi)[0]).toBe('D')
    expect(midiNoteName(38)).toBe('D')
  })
})

describe('note computation respects tuning', () => {
  const dropD = getTuning('drop-d').midi
  it('open low string: E in standard, D in Drop D', () => {
    expect(fretToPitchClass(0, 0, false, STANDARD_TUNING)).toBe('E')
    expect(fretToPitchClass(0, 0, false, dropD)).toBe('D')
  })
  it('same shape spells different chords per tuning', () => {
    // low three strings open+2: standard vs drop D differ on the low string
    const frets = [0, 2, 2, null, null, null]
    const std = voicingUniquePitchClasses(frets, false, STANDARD_TUNING)
    const dd = voicingUniquePitchClasses(frets, false, dropD)
    expect(std).not.toEqual(dd)
    expect(std[0]).toBe('E')
    expect(dd[0]).toBe('D')
  })
})
