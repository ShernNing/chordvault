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
  const pcs = voicingUniquePitchClasses(frets)
  if (pcs.length === 0) return []
  try {
    const detected = Chord.detect(pcs, { assumePerfectFifth: true })
    return detected || []
  } catch {
    return []
  }
}
