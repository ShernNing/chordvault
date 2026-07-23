// Smart display-time transpose for single-note licks/solos.
//
// Naive transpose shifts every note on the same string by `semitones`, which can
// push notes off the playable neck. This keeps playable notes exactly where the
// naive shift puts them (fixed anchors) and relocates only off-neck notes to a
// same-pitch position on another string, chosen (via a short DP) to stay near the
// surrounding fixed notes so the run remains a playable, clustered run.
//
// Pure module (no React). Notes are { string, fret, slideTo?, bend? } with
// string 0 = low E … 5 = high e. Pitch is preserved exactly except for a
// last-resort octave shift when a note's target pitch is unreachable on any string.

import { STRING_OPEN_MIDI, fretToMidi } from './notes'

const MIN_FRET = 0
const MAX_FRET = 22
const NUM_STRINGS = 6
const W_STRING = 2 // cost weight per string crossed, relative to one fret of travel

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Every playable (string, fret) that sounds exactly `midi`.
function positionsForMidi(midi) {
  const out = []
  for (let s = 0; s < NUM_STRINGS; s++) {
    const f = midi - STRING_OPEN_MIDI[s]
    if (f >= MIN_FRET && f <= MAX_FRET) out.push({ string: s, fret: f })
  }
  return out
}

// Candidate positions for a target pitch, with octave fallback when the exact
// pitch is unreachable. Prefers the smaller octave offset; ties drop (-12) so the
// result stays lower on the neck. If still unreachable, returns a clamped naive
// position so output is always defined.
function candidatesForMidi(targetMidi, naiveString, naiveFret) {
  let cands = positionsForMidi(targetMidi)
  if (cands.length) return cands
  for (const off of [-12, 12]) {
    cands = positionsForMidi(targetMidi + off)
    if (cands.length) return cands
  }
  return [{ string: naiveString, fret: clamp(naiveFret, MIN_FRET, MAX_FRET) }]
}

const dist = (a, b) =>
  Math.abs(a.fret - b.fret) + W_STRING * Math.abs(a.string - b.string)

// Viterbi over a run of candidate layers, anchored by the fixed positions before
// (prevAnchor) and after (nextAnchor) the run. With no left anchor, bias toward
// low frets so an unanchored run doesn't drift up the neck.
function pickRun(layers, prevAnchor, nextAnchor) {
  const n = layers.length
  const cost = layers.map((l) => l.map(() => Infinity))
  const back = layers.map((l) => l.map(() => -1))

  layers[0].forEach((c, j) => {
    cost[0][j] = prevAnchor ? dist(prevAnchor, c) : c.fret
  })
  for (let i = 1; i < n; i++) {
    layers[i].forEach((c, j) => {
      for (let k = 0; k < layers[i - 1].length; k++) {
        const t = cost[i - 1][k] + dist(layers[i - 1][k], c)
        if (t < cost[i][j]) {
          cost[i][j] = t
          back[i][j] = k
        }
      }
    })
  }

  let best = Infinity
  let bj = 0
  layers[n - 1].forEach((c, j) => {
    const t = cost[n - 1][j] + (nextAnchor ? dist(c, nextAnchor) : 0)
    if (t < best) {
      best = t
      bj = j
    }
  })

  const picks = new Array(n)
  let j = bj
  for (let i = n - 1; i >= 0; i--) {
    picks[i] = layers[i][j]
    j = back[i][j] < 0 ? 0 : back[i][j]
  }
  return picks
}

/**
 * Transpose lick notes by `semitones` for display, relocating off-neck notes.
 * Returns a new array (originals not mutated). `semitones === 0` is identity.
 */
export function smartTransposeLick(notes, semitones) {
  const list = notes || []
  if (!semitones) return list.map((n) => ({ ...n }))

  const info = list.map((n) => {
    const targetMidi = fretToMidi(n.string, n.fret) + semitones
    const naiveFret = n.fret + semitones
    const inRange = naiveFret >= MIN_FRET && naiveFret <= MAX_FRET
    return {
      note: n,
      targetMidi,
      naiveString: n.string,
      naiveFret,
      pos: inRange ? { string: n.string, fret: naiveFret } : null,
      relocate: !inRange,
    }
  })

  let i = 0
  while (i < info.length) {
    if (!info[i].relocate) {
      i++
      continue
    }
    let end = i
    while (end < info.length && info[end].relocate) end++
    const prevAnchor = i > 0 ? info[i - 1].pos : null
    const nextAnchor = end < info.length ? info[end].pos : null
    const layers = []
    for (let k = i; k < end; k++) {
      layers.push(
        candidatesForMidi(info[k].targetMidi, info[k].naiveString, info[k].naiveFret),
      )
    }
    const picks = pickRun(layers, prevAnchor, nextAnchor)
    for (let k = i; k < end; k++) info[k].pos = picks[k - i]
    i = end
  }

  return info.map(({ note, pos }) => {
    const out = { string: pos.string, fret: pos.fret }
    if (note.slideTo != null) {
      const slidePitch = STRING_OPEN_MIDI[note.string] + note.slideTo + semitones
      out.slideTo = clamp(slidePitch - STRING_OPEN_MIDI[pos.string], MIN_FRET, MAX_FRET)
    }
    if (note.bend != null) out.bend = note.bend
    return out
  })
}
