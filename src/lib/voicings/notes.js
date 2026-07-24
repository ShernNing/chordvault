// Guitar string tuning EADGBE, index 0 = low E, index 5 = high E.
// Open-string pitches with octave for audio playback.
export const STRING_OPEN_PITCH = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
export const STRING_OPEN_MIDI = [40, 45, 50, 55, 59, 64]
export const STRING_LABEL = ['E', 'A', 'D', 'G', 'B', 'e']

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm'])

// fret: integer >= 0 (0 = open). Returns MIDI number.
// `tuning` is six open-string MIDI numbers low→high; defaults to standard.
export function fretToMidi(stringIdx, fret, tuning = STRING_OPEN_MIDI) {
  return tuning[stringIdx] + fret
}

// Returns pitch like 'C#4'. Honors sharp/flat preference.
export function fretToPitch(stringIdx, fret, preferFlats = false, tuning = STRING_OPEN_MIDI) {
  const midi = fretToMidi(stringIdx, fret, tuning)
  const name = (preferFlats ? FLAT_NAMES : SHARP_NAMES)[midi % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${name}${octave}`
}

// Returns pitch class like 'C#' (no octave).
export function fretToPitchClass(stringIdx, fret, preferFlats = false, tuning = STRING_OPEN_MIDI) {
  const midi = fretToMidi(stringIdx, fret, tuning)
  return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[midi % 12]
}

export function keyPrefersFlats(key) {
  if (!key) return false
  return FLAT_KEYS.has(key.replace(/\s+/g, ''))
}

// frets: array of 6, null = muted, 0..N = fret. Returns array of pitch-classes (mute stripped).
export function voicingPitchClasses(frets, preferFlats = false, tuning = STRING_OPEN_MIDI) {
  const out = []
  for (let i = 0; i < 6; i++) {
    const f = frets[i]
    if (f == null) continue
    out.push(fretToPitchClass(i, f, preferFlats, tuning))
  }
  return out
}

// Unique ordered pitch classes (low→high) — useful for "notes" display.
export function voicingUniquePitchClasses(frets, preferFlats = false, tuning = STRING_OPEN_MIDI) {
  const seen = new Set()
  const out = []
  for (const pc of voicingPitchClasses(frets, preferFlats, tuning)) {
    if (!seen.has(pc)) { seen.add(pc); out.push(pc) }
  }
  return out
}

// Full pitches (with octave), low→high.
export function voicingPitches(frets, preferFlats = false, tuning = STRING_OPEN_MIDI) {
  const out = []
  for (let i = 0; i < 6; i++) {
    const f = frets[i]
    if (f == null) continue
    out.push(fretToPitch(i, f, preferFlats, tuning))
  }
  return out
}

// Lowest fretted fret (>0) — used for "position" label.
export function voicingPosition(frets) {
  let min = Infinity
  for (const f of frets) if (f != null && f > 0 && f < min) min = f
  return min === Infinity ? 0 : min
}

// True when voicing has no open strings (every played string is fretted > 0).
export function isMovable(frets) {
  return frets.every(f => f == null || f > 0)
}

// Compact text rendering: 'x x 5 7 8 x'
export function formatFrets(frets) {
  return frets.map(f => f == null ? 'x' : String(f)).join(' ')
}
