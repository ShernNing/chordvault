// Identify all possible chord names that match a voicing's pitch-class set.
// Uses `tonal` for chord detection. Returns sorted by likelihood (most specific first).

import { Chord } from 'tonal'
import { voicingUniquePitchClasses } from './notes'

// Detect chord names from a voicing's frets.
// Returns array of chord names (strings), e.g. ["Cmaj7", "Em/C"].
export function detectChordNames(frets) {
  if (!frets) return []
  const pcs = voicingUniquePitchClasses(frets)
  if (pcs.length === 0) return []
  try {
    const detected = Chord.detect(pcs)
    return detected || []
  } catch {
    return []
  }
}

// As above, but with an explicit bass note (lowest sounding string).
export function detectChordNamesWithBass(frets) {
  if (!frets) return []
  // Find lowest fretted string
  let bassPC = null
  const STRING_OPEN_MIDI = [40, 45, 50, 55, 59, 64]
  const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  for (let i = 0; i < 6; i++) {
    const f = frets[i]
    if (f == null) continue
    bassPC = SHARP_NAMES[(STRING_OPEN_MIDI[i] + f) % 12]
    break
  }
  const pcs = voicingUniquePitchClasses(frets)
  if (pcs.length === 0) return []
  try {
    const detected = Chord.detect(pcs, { assumePerfectFifth: true })
    return detected || []
  } catch {
    return []
  }
}
