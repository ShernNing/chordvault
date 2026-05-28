// Voice-leading score between two voicings.
//
// A "good" transition keeps notes on the same strings as close to each other as
// possible (minimal finger movement). Common tones are highlighted.

import { voicingUniquePitchClasses } from './notes'

// movement: sum of |fretA - fretB| over strings both play; muted strings ignored.
// common-strings: count of strings both play at the same fret.
// common-tones: pitch-classes shared by both voicings (regardless of string).
export function leadingScore(a, b) {
  if (!a || !b) return null
  let movement = 0
  let sharedStrings = 0
  let activeStrings = 0
  for (let i = 0; i < 6; i++) {
    const fa = a[i]
    const fb = b[i]
    if (fa == null || fb == null) continue
    activeStrings++
    movement += Math.abs(fa - fb)
    if (fa === fb) sharedStrings++
  }
  const pcsA = new Set(voicingUniquePitchClasses(a).map(pcToIndex))
  const pcsB = new Set(voicingUniquePitchClasses(b).map(pcToIndex))
  const commonTones = [...pcsA].filter(p => pcsB.has(p)).length

  return { movement, sharedStrings, commonTones, activeStrings }
}

const PC = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 }
function pcToIndex(name) { return PC[name] }

// Pick the best (b) voicing for chord B given a (a) voicing for chord A.
// candidates: array of frets arrays for chord B. Returns the index of the best
// (lowest movement, then highest sharedStrings).
export function pickBestNext(a, candidates) {
  if (!a || !candidates?.length) return -1
  let best = -1
  let bestScore = null
  for (let i = 0; i < candidates.length; i++) {
    const sc = leadingScore(a, candidates[i])
    if (!sc) continue
    if (!bestScore
      || sc.movement < bestScore.movement
      || (sc.movement === bestScore.movement && sc.sharedStrings > bestScore.sharedStrings)) {
      bestScore = sc
      best = i
    }
  }
  return best
}

// Mark which strings of `b` share a fret with `a` (returns boolean[6])
export function sharedStringMask(a, b) {
  const out = [false, false, false, false, false, false]
  if (!a || !b) return out
  for (let i = 0; i < 6; i++) if (a[i] != null && b[i] != null && a[i] === b[i]) out[i] = true
  return out
}
