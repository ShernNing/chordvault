// Interval naming relative to a chord's root.
// Used for "intervals" display mode in FretboardDiagram.

import { fretToMidi } from './notes'

const PC_INDEX = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11,
}

// Semitone offset → interval shorthand
const INTERVAL_LABELS = ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7']
// Major / dom / sus contexts prefer M3/M7; minor prefers m3/m7. We surface the
// natural major-scale spelling and let the chord context choose flat/sharp via callers if needed.

// chordName like "Cmaj7", "Bm7", "F#dim7", "D/F#" — extract root pitch class
export function rootPCOf(chordName) {
  if (!chordName) return null
  const m = chordName.match(/^([A-G][b#]?)/)
  if (!m) return null
  return PC_INDEX[m[1]] ?? null
}

// Per-fret interval label relative to chord root. Returns 'R', '3', '♭7', etc.
export function fretInterval(stringIdx, fret, rootPC) {
  if (rootPC == null) return ''
  const midi = fretToMidi(stringIdx, fret)
  const semis = (midi - rootPC + 144) % 12
  return INTERVAL_LABELS[semis]
}

export function isRootFret(stringIdx, fret, rootPC) {
  if (rootPC == null) return false
  const midi = fretToMidi(stringIdx, fret)
  return ((midi - rootPC) % 12 + 12) % 12 === 0
}
