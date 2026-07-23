import { describe, it, expect } from 'vitest'
import { STRING_OPEN_MIDI, fretToMidi } from './notes'
import { smartTransposeLick } from './lickTranspose'

const midiOf = (n) => fretToMidi(n.string, n.fret)

describe('smartTransposeLick', () => {
  it('is identity when semitones is 0', () => {
    const notes = [{ string: 0, fret: 3 }, { string: 2, fret: 7, bend: 2 }]
    expect(smartTransposeLick(notes, 0)).toEqual(notes)
  })

  it('leaves an in-range note on the same string (naive shift)', () => {
    const out = smartTransposeLick([{ string: 0, fret: 3 }], 2)
    expect(out[0]).toEqual({ string: 0, fret: 5 })
  })

  it('relocates an off-the-top note to a same-pitch playable position', () => {
    const out = smartTransposeLick([{ string: 0, fret: 20 }], 5)
    expect(midiOf(out[0])).toBe(65)
    expect(out[0].fret).toBeLessThanOrEqual(22)
    expect(out[0].fret).toBeGreaterThanOrEqual(0)
  })

  it('relocates an off-the-bottom note (symmetric) to a same-pitch position', () => {
    const out = smartTransposeLick([{ string: 5, fret: 2 }], -7)
    expect(midiOf(out[0])).toBe(59)
    expect(out[0].fret).toBeGreaterThanOrEqual(0)
  })

  it('clusters a relocated note near a fixed anchor neighbor', () => {
    const out = smartTransposeLick(
      [{ string: 0, fret: 10 }, { string: 0, fret: 20 }],
      5,
    )
    expect(out[0]).toEqual({ string: 0, fret: 15 })
    expect(out[1]).toEqual({ string: 2, fret: 15 })
    expect(midiOf(out[1])).toBe(65)
  })

  it('octave-fallbacks when the exact pitch is unreachable on any string', () => {
    const out = smartTransposeLick([{ string: 5, fret: 20 }], 5)
    expect(out[0].fret).toBeGreaterThanOrEqual(0)
    expect(out[0].fret).toBeLessThanOrEqual(22)
    expect((89 - midiOf(out[0])) % 12).toBe(0)
    expect(midiOf(out[0])).toBeLessThan(89)
  })

  it('remaps slideTo to preserve the slide-target pitch on the new string', () => {
    const out = smartTransposeLick([{ string: 0, fret: 20, slideTo: 22 }], 5)
    expect(out[0]).toEqual({ string: 5, fret: 1, slideTo: 3 })
    expect(STRING_OPEN_MIDI[out[0].string] + out[0].slideTo).toBe(67)
  })

  it('passes bend through unchanged', () => {
    const out = smartTransposeLick([{ string: 0, fret: 3, bend: 2 }], 2)
    expect(out[0]).toEqual({ string: 0, fret: 5, bend: 2 })
  })

  it('keeps a multi-note off-neck run clustered on one string (DP transition)', () => {
    // note0: string0 fret10 (midi50) +5 -> fret15 in range => anchor {0,15}
    // note1: string0 fret21 (midi61) +5 -> naive 26 off, target midi 66
    // note2: string0 fret22 (midi62) +5 -> naive 27 off, target midi 67
    // DP picks the run nearest the anchor: {string:2,fret:16} then {string:2,fret:17}.
    const out = smartTransposeLick(
      [{ string: 0, fret: 10 }, { string: 0, fret: 21 }, { string: 0, fret: 22 }],
      5,
    )
    expect(out[0]).toEqual({ string: 0, fret: 15 })
    expect(out[1]).toEqual({ string: 2, fret: 16 })
    expect(out[2]).toEqual({ string: 2, fret: 17 })
    expect(midiOf(out[1])).toBe(66)
    expect(midiOf(out[2])).toBe(67)
  })
})
