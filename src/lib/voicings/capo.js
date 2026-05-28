// Capo helper:
//   "I want to play chord X. If I capo at fret N, what open-position shape gives me X?"
//   Equivalently: the sounding pitch of an open chord at capo N is shape + N semitones.
//
// Implementation: shape X played with capo at fret N produces chord (X transposed up N semitones).
// Inverse: to play chord Y with capo N, play shape (Y transposed down N semitones).

const PC_LIST = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const PC_INDEX = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 }

// Easiest open shapes — caged + a few extras.
export const OPEN_SHAPES = ['C', 'D', 'E', 'G', 'A', 'F', 'Am', 'Em', 'Dm']

// Returns the open shape needed to play `target` chord when capoed at fret `capoFret`.
export function shapeForCapo(target, capoFret) {
  const m = target.match(/^([A-G][b#]?)(.*)$/)
  if (!m) return null
  const root = m[1]
  const quality = m[2]
  const idx = PC_INDEX[root]
  if (idx == null) return null
  const shapeIdx = ((idx - capoFret) % 12 + 12) % 12
  const shapeRoot = PC_LIST[shapeIdx]
  return shapeRoot + quality
}

// Returns array of { capoFret, shape } pairs that produce `target` using one of OPEN_SHAPES.
export function capoOptionsFor(target) {
  if (!target) return []
  const m = target.match(/^([A-G][b#]?)(.*)$/)
  if (!m) return []
  const quality = m[2]
  const out = []
  for (let capo = 0; capo <= 9; capo++) {
    const shape = shapeForCapo(target, capo)
    if (!shape) continue
    const shapeRoot = shape.match(/^([A-G][b#]?)/)?.[1]
    const shapeName = shapeRoot + quality
    // Match against OPEN_SHAPES (root + quality combined)
    if (OPEN_SHAPES.includes(shapeName)) {
      out.push({ capoFret: capo, shape: shapeName })
    }
  }
  return out
}
