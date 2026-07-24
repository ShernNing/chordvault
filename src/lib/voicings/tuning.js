// Alternate guitar tunings. Each preset gives the six open-string MIDI numbers
// low→high (index 0 = lowest string). The default catalog voicings are movable
// STANDARD-tuning shapes, so alt tunings apply to note read-outs, the custom
// voicing builder, and audio — not to the generated catalog.

import { STRING_OPEN_MIDI } from './notes'

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** MIDI number → bare note name (no octave), sharp spelling. */
export function midiNoteName(midi) {
  return SHARP[((midi % 12) + 12) % 12]
}

/** Per-string labels for a tuning; high two strings lowercased, as the app does. */
export function tuningLabels(midi) {
  return midi.map((m, i) => {
    const n = midiNoteName(m)
    return i >= 4 ? n.toLowerCase() : n
  })
}

// low→high MIDI. Standard = E2 A2 D3 G3 B3 E4 = [40,45,50,55,59,64].
export const TUNINGS = [
  { id: 'standard', name: 'Standard (EADGBE)', midi: STRING_OPEN_MIDI },
  { id: 'drop-d', name: 'Drop D (DADGBE)', midi: [38, 45, 50, 55, 59, 64] },
  { id: 'eb', name: 'E♭ / Half-step down', midi: [39, 44, 49, 54, 58, 63] },
  { id: 'd-standard', name: 'D standard / Whole-step down', midi: [38, 43, 48, 53, 57, 62] },
  { id: 'drop-c', name: 'Drop C (CGCFAD)', midi: [36, 43, 48, 53, 57, 62] },
  { id: 'dadgad', name: 'DADGAD', midi: [38, 45, 50, 55, 57, 62] },
  { id: 'open-g', name: 'Open G (DGDGBD)', midi: [38, 43, 50, 55, 59, 62] },
  { id: 'open-d', name: 'Open D (DADF#AD)', midi: [38, 45, 50, 54, 57, 62] },
  { id: 'open-e', name: 'Open E (EBEG#BE)', midi: [40, 47, 52, 56, 59, 64] },
]

export const STANDARD_TUNING = TUNINGS[0].midi

export function getTuning(id) {
  return TUNINGS.find((t) => t.id === id) || TUNINGS[0]
}
