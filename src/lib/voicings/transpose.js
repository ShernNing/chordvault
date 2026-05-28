import { isMovable } from './notes'

const MAX_FRET = 22

// 12 keys, sharp-preferred default ordering. Display layer applies enharmonic preference per key.
export const ALL_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const ALL_KEYS_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

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

export function pitchClassIndex(name) {
  if (!name) return null
  // strip optional minor/quality suffix from a chord name to get root
  const m = name.match(/^[A-G][b#]?/)
  if (!m) return null
  return PC_INDEX[m[0]] ?? null
}

// Distance in semitones from→to (0..11).
export function semitoneDelta(fromKey, toKey) {
  const a = pitchClassIndex(fromKey)
  const b = pitchClassIndex(toKey)
  if (a == null || b == null) return 0
  return (b - a + 12) % 12
}

// Shift every fretted note by `semitones`. Returns null if any fret leaves playable range.
export function transposeFrets(frets, semitones) {
  if (semitones === 0) return frets.slice()
  const out = []
  for (const f of frets) {
    if (f == null) { out.push(null); continue }
    const nf = f + semitones
    if (nf < 1 || nf > MAX_FRET) return null
    out.push(nf)
  }
  return out
}

// Try every octave-equivalent shift and pick the lowest-position playable result.
// Keeps voicings between frets 1-12 when possible instead of always shifting upward.
export function bestTransposeFrets(frets, delta) {
  const candidates = [delta - 12, delta, delta + 12]
  let best = null
  let bestMax = Infinity
  for (const s of candidates) {
    const out = transposeFrets(frets, s)
    if (!out) continue
    let maxF = 0
    for (const f of out) if (f != null && f > maxF) maxF = f
    if (maxF < bestMax) { best = out; bestMax = maxF }
  }
  return best
}

// For a voicing declared in `sourceKey`, attempt to produce a frets array in `targetKey`.
// Open-string voicings are not movable and return null unless target === source.
export function transposeVoicingTo(voicing, targetKey) {
  if (voicing.sourceKey === targetKey) return voicing.frets.slice()
  if (!isMovable(voicing.frets)) return null

  const delta = semitoneDelta(voicing.sourceKey, targetKey)
  return bestTransposeFrets(voicing.frets, delta)
}

// Shift a chord-name root (e.g. 'G', 'Bm', 'F#dim') by semitones.
// Quality (suffix) preserved verbatim. Slash-chord bass note is also transposed.
export function transposeChordName(chord, semitones, preferFlats = false) {
  if (!chord) return chord
  const slash = chord.match(/^([^/]+)\/(.+)$/)
  if (slash) {
    const top = transposeChordName(slash[1], semitones, preferFlats)
    const bass = transposeChordName(slash[2], semitones, preferFlats)
    return `${top}/${bass}`
  }
  const m = chord.match(/^([A-G][b#]?)(.*)$/)
  if (!m) return chord
  const root = m[1]
  const quality = m[2]
  const idx = PC_INDEX[root]
  if (idx == null) return chord
  const newIdx = (idx + semitones + 12 * 4) % 12
  const newRoot = (preferFlats ? ALL_KEYS_FLAT : ALL_KEYS)[newIdx]
  return newRoot + quality
}
