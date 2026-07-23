// Electric-guitar voicing catalog. Focus: the top four strings (D, G, B, high-E)
// played up and down the neck — compact triads (all three inversions) and 4-string
// drop-2 seventh chords. NO open "campfire" chords, full six-string barres, power
// chords, or slash voicings — those live in muscle memory already; this catalog is
// the movable, position-shifting shapes electric players reach for.
//
// frets: [lowE, A, D, G, B, highE] — null = muted string, N = fret N.
// Every voicing is movable (no open strings) so it auto-transposes to all 12 keys.
//
// Voicings are GENERATED from a small set of C-rooted shape templates (verified by
// scripts/verify-voicings.mjs), then transposed to each chord root and laddered into
// every playable neck position. Pitch-class correctness is guaranteed by construction.

import { isMovable, voicingPosition } from './notes.js'

const X = null
const OPEN_MIDI = [40, 45, 50, 55, 59, 64]   // E2 A2 D3 G3 B3 E4
const PCIDX = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 }

// Chord families shown on the chip rail (major, then minor, then dim / half-dim).
export const CHORD_ROOTS_IN_G = [
  'G', 'C', 'D', 'A', 'E', 'F', 'B',
  'Am', 'Em', 'Dm', 'Bm', 'Fm', 'Cm', 'Gm', 'F#m',
  'F#dim', 'Bdim', 'Bm7b5',
]

// ─── Shape templates (C-rooted, low→high). ─────────────────────────────────
// Each template's frets spell the chord with root note C; the generator shifts
// them by the target root's pitch class and ladders octaves into the playable
// window. `strings` is purely descriptive for the label.
const TEMPLATES = {
  // Major triad — drop-2 on the top four strings (D,G,B,e), all three inversions.
  majTriad: [
    { frets: [X,X,10,9,8,8],   inv: 'root', strings: 'D-G-B-e' },
    { frets: [X,X,14,12,13,12], inv: '1st', strings: 'D-G-B-e' },
    { frets: [X,X,5,5,5,3],    inv: '2nd',  strings: 'D-G-B-e' },
  ],
  // Minor triad — drop-2 on the top four strings, all three inversions.
  minTriad: [
    { frets: [X,X,10,8,8,8],   inv: 'root', strings: 'D-G-B-e' },
    { frets: [X,X,13,12,13,11], inv: '1st', strings: 'D-G-B-e' },
    { frets: [X,X,5,5,4,3],    inv: '2nd',  strings: 'D-G-B-e' },
  ],
  // Diminished triad — drop-2 on the top four strings, all three inversions.
  dimTriad: [
    { frets: [X,X,10,8,7,8],   inv: 'root', strings: 'D-G-B-e' },
    { frets: [X,X,13,11,13,11], inv: '1st', strings: 'D-G-B-e' },
    { frets: [X,X,4,5,4,2],    inv: '2nd',  strings: 'D-G-B-e' },
  ],
  // Drop-2 sevenths on the top four strings (D,G,B,e).
  maj7: [
    { frets: [X,X,10,9,8,7],   inv: 'root', strings: 'D-G-B-e' },
  ],
  m7: [
    { frets: [X,X,10,8,8,6],   inv: 'root', strings: 'D-G-B-e' },
  ],
  dom7: [
    { frets: [X,X,10,9,8,6],   inv: 'root', strings: 'D-G-B-e' },
  ],
  m7b5: [
    { frets: [X,X,10,8,7,6],   inv: 'root', strings: 'D-G-B-e' },
  ],
  // dim7 is symmetric — repeats every 3 frets; two positions a minor 3rd apart.
  dim7: [
    { frets: [X,X,1,2,1,2],    inv: 'root', strings: 'D-G-B-e' },
    { frets: [X,X,4,5,4,5],    inv: 'inv',  strings: 'D-G-B-e' },
  ],
}

// Family → { suffix appended to the root note for displayName, template key, base tag }.
const FAMILIES = {
  majTriad: { suffix: '',      key: 'majTriad', tag: 'triad' },
  minTriad: { suffix: 'm',     key: 'minTriad', tag: 'triad' },
  dimTriad: { suffix: 'dim',   key: 'dimTriad', tag: 'triad' },
  maj7:     { suffix: 'maj7',  key: 'maj7',     tag: 'maj7'  },
  m7:       { suffix: 'm7',    key: 'm7',       tag: 'm7'    },
  dom7:     { suffix: '7',     key: 'dom7',     tag: 'dom7'  },
  m7b5:     { suffix: 'm7b5',  key: 'm7b5',     tag: 'm7b5'  },
  dim7:     { suffix: 'dim7',  key: 'dim7',     tag: 'dim7'  },
  sus2:     { suffix: 'sus2',  key: 'sus2',     tag: 'sus'   },
  sus4:     { suffix: 'sus4',  key: 'sus4',     tag: 'sus'   },
  // Root-5th-octave "shell" voicings (no 3rd) — the compact movable shapes
  // players slide up the neck. Works over major or minor roots alike.
  power:    { suffix: '5',     key: 'power',    tag: 'power' },
}

// Which families each chord root carries.
const CHORD_FAMILIES = {}
for (const r of ['G','C','D','A','E','F','B'])         CHORD_FAMILIES[r] = ['majTriad', 'maj7', 'dom7']
for (const r of ['Am','Em','Dm','Bm','Fm','Cm','Gm','F#m']) CHORD_FAMILIES[r] = ['minTriad', 'm7']
CHORD_FAMILIES['F#dim'] = ['dimTriad', 'dim7']
CHORD_FAMILIES['Bdim']  = ['dimTriad', 'dim7']
CHORD_FAMILIES['Bm7b5'] = ['m7b5']

// ─── Fret math ─────────────────────────────────────────────────────────────
const NECK_LO = 1
const NECK_HI = 15

const minFret = (f) => Math.min(...f.filter(v => v != null))
const maxFret = (f) => Math.max(...f.filter(v => v != null))
const shift = (f, n) => f.map(v => v == null ? null : v + n)
const inWindow = (f) => f.every(v => v == null || (v >= NECK_LO && v <= NECK_HI))

const fretSig = (f) => f.map(v => v == null ? 'x' : v).join('-')

// Bring a shifted shape into the lowest valid neck window.
function normalize(f) {
  let cur = f
  while (maxFret(cur) > NECK_HI) {
    const down = shift(cur, -12)
    if (minFret(down) < NECK_LO) break
    cur = down
  }
  while (minFret(cur) < NECK_LO) cur = shift(cur, 12)
  return cur
}

// Every in-window octave copy of a shape (low→high), for laddering up the neck.
function octaveCopies(f) {
  const out = [f]
  for (let i = 1; i <= 2; i++) {
    const up = shift(f, 12 * i)
    if (inWindow(up)) out.push(up); else break
  }
  return out
}

function rootNoteOf(rootChord) {
  return rootChord.match(/^([A-G][b#]?)/)[1]
}

// ─── Generation ──────────────────────────────────────────────────────────
let _id = 0
function mk(rootChord, displayName, frets, family, tpl) {
  const tags = [family.tag, 'movable', 'electric', `top-${tpl.strings.split('-').length}`]
  if (tpl.inv && tpl.inv !== 'root') tags.push('inversion')
  const invLabel = tpl.inv === 'root' ? 'root position' : tpl.inv === '1st' ? '1st inversion'
    : tpl.inv === '2nd' ? '2nd inversion' : 'inversion'
  return {
    id: `v${++_id}-${rootChord.replace(/[^A-Za-z0-9]/g, '')}-${fretSig(frets)}`,
    rootChord,
    displayName,
    frets,
    sourceKey: 'G',
    movable: isMovable(frets),
    position: voicingPosition(frets),
    shape: `${tpl.strings} · ${tpl.inv === 'root' ? 'root' : tpl.inv}`,
    inversion: tpl.inv && tpl.inv !== 'root' ? tpl.inv : null,
    tags,
    description: `${displayName} on the ${tpl.strings} strings — ${invLabel} (${minFret(frets)}fr).`,
  }
}

function buildVoicings() {
  const out = []
  for (const rootChord of Object.keys(CHORD_FAMILIES)) {
    const rootPC = PCIDX[rootNoteOf(rootChord)]
    const seen = new Set()
    for (const famKey of CHORD_FAMILIES[rootChord]) {
      const fam = FAMILIES[famKey]
      const displayName = `${rootNoteOf(rootChord)}${fam.suffix}`
      for (const tpl of TEMPLATES[fam.key]) {
        const base = normalize(shift(tpl.frets, rootPC))
        for (const frets of octaveCopies(base)) {
          const sig = `${famKey}:${fretSig(frets)}`
          if (seen.has(sig)) continue
          seen.add(sig)
          out.push(mk(rootChord, displayName, frets, fam, tpl))
        }
      }
    }
  }
  return out
}

// ─── Programmatic 3-string triads ──────────────────────────────────────────
// Closed triads built directly from chord tones on each adjacent 3-string set,
// in all three inversions, laddered through every playable octave. This fans the
// same chord across the neck (low + high) and across string groups (A-D-G,
// D-G-B, G-B-e) so players get compact options, not just the top-4 drop-2 shapes.
// Pitch-class correctness is guaranteed by construction (see verify-voicings).

const TRIAD_INTERVALS = {
  majTriad: [0, 4, 7], minTriad: [0, 3, 7], dimTriad: [0, 3, 6],
  sus2: [0, 2, 7], sus4: [0, 5, 7],
  power: [0, 7, 12], // root · 5th · octave (no 3rd) — the shell shape
}

// Which 3-note families each chord root carries in the string-set generator.
// Major roots also get sus2/sus4 (same root, 3rd swapped for the 2nd/4th).
function triadFamiliesFor(rootChord) {
  const cats = CHORD_FAMILIES[rootChord]
  // Shell (power) shapes carry no 3rd, so they suit major and minor roots alike;
  // diminished/half-dim need the b5, so they're excluded.
  if (cats.includes('majTriad')) return ['majTriad', 'sus2', 'sus4', 'power']
  if (cats.includes('minTriad')) return ['minTriad', 'power']
  if (cats.includes('dimTriad')) return ['dimTriad']
  return []
}

const TRIAD_INVERSIONS = [
  { order: [0, 1, 2], label: 'root' },
  { order: [1, 2, 0], label: '1st' },
  { order: [2, 0, 1], label: '2nd' },
]

// String sets as low→high open-string indices. [E,A,D,G,B,e] = 0..5.
const TRIAD_STRING_SETS = [
  { idx: [1, 2, 3], label: 'A-D-G' },
  { idx: [2, 3, 4], label: 'D-G-B' },
  { idx: [3, 4, 5], label: 'G-B-e' },
]

// Lowest compact closed triad on one string set for a given inversion.
// Builds the tightest ascending voicing (open allowed), then lifts the WHOLE
// shape up an octave if any string is open so it stays fully movable — never
// stretching individual notes apart. Rejects anything wider than a 5-fret span.
const TRIAD_MAX_SPAN = 5
function closedTriad(rootPc, intervals, setIdx, order) {
  const pcs = order.map(i => (rootPc + intervals[i]) % 12)
  const frets = [X, X, X, X, X, X]
  let prevMidi = -Infinity
  for (let k = 0; k < 3; k++) {
    const s = setIdx[k]
    const open = OPEN_MIDI[s]
    let f = (((pcs[k] - open) % 12) + 12) % 12   // smallest fret ≥ 0 for this pitch class
    while (open + f <= prevMidi) f += 12          // keep notes ascending = closed voicing
    frets[s] = f
    prevMidi = open + f
  }
  // Lift the whole shape an octave if it uses any open string (must be movable).
  if (setIdx.some(s => frets[s] === 0)) for (const s of setIdx) frets[s] += 12
  const played = setIdx.map(s => frets[s])
  const span = Math.max(...played) - Math.min(...played)
  if (span > TRIAD_MAX_SPAN || Math.max(...played) > 17) return null
  return frets
}

function buildTriadSetVoicings() {
  const out = []
  for (const rootChord of Object.keys(CHORD_FAMILIES)) {
    const rootPc = PCIDX[rootNoteOf(rootChord)]
    const seen = new Set()
    for (const type of triadFamiliesFor(rootChord)) {
      const fam = FAMILIES[type]
      const intervals = TRIAD_INTERVALS[type]
      const displayName = `${rootNoteOf(rootChord)}${fam.suffix}`
      for (const set of TRIAD_STRING_SETS) {
        for (const inv of TRIAD_INVERSIONS) {
          const base0 = closedTriad(rootPc, intervals, set.idx, inv.order)
          if (!base0) continue
          const base = normalize(base0)
          for (const frets of octaveCopies(base)) {
            const sig = `${type}:${fretSig(frets)}`
            if (seen.has(sig)) continue
            seen.add(sig)
            out.push(mk(rootChord, displayName, frets, fam, { inv: inv.label, strings: set.label }))
          }
        }
      }
    }
  }
  return out
}

export const VOICINGS = [...buildVoicings(), ...buildTriadSetVoicings()]

export const VOICINGS_BY_CHORD = VOICINGS.reduce((acc, v) => {
  (acc[v.rootChord] = acc[v.rootChord] || []).push(v)
  return acc
}, {})

// ─── Progression sets (key of G — diatonic triads up/down the neck) ────────
// Pick the triad voicing of `rootChord` whose position is nearest `approxFret`.
function pickTriad(rootChord, approxFret) {
  const cands = (VOICINGS_BY_CHORD[rootChord] || []).filter(v => v.tags.includes('triad'))
  if (cands.length === 0) return undefined
  const best = cands.reduce((a, b) =>
    Math.abs(b.position - approxFret) < Math.abs(a.position - approxFret) ? b : a)
  return best.id
}

export const PROGRESSION_SETS = [
  {
    id: 'step-up',
    label: 'Step-Up (Ascending)',
    description: 'Diatonic triads climbing the neck — builds forward motion.',
    sourceKey: 'G',
    chords: [
      { rootChord: 'G',     voicingId: pickTriad('G', 3) },
      { rootChord: 'Am',    voicingId: pickTriad('Am', 5) },
      { rootChord: 'Bm',    voicingId: pickTriad('Bm', 7) },
      { rootChord: 'C',     voicingId: pickTriad('C', 8) },
      { rootChord: 'D',     voicingId: pickTriad('D', 10) },
      { rootChord: 'Em',    voicingId: pickTriad('Em', 12) },
      { rootChord: 'F#dim', voicingId: pickTriad('F#dim', 13) },
    ],
  },
  {
    id: 'step-down',
    label: 'Step-Down (Descending)',
    description: 'Diatonic triads descending the neck — smooth resolving motion.',
    sourceKey: 'G',
    chords: [
      { rootChord: 'G',     voicingId: pickTriad('G', 12) },
      { rootChord: 'Am',    voicingId: pickTriad('Am', 10) },
      { rootChord: 'Bm',    voicingId: pickTriad('Bm', 9) },
      { rootChord: 'C',     voicingId: pickTriad('C', 8) },
      { rootChord: 'D',     voicingId: pickTriad('D', 7) },
      { rootChord: 'Em',    voicingId: pickTriad('Em', 5) },
      { rootChord: 'F#dim', voicingId: pickTriad('F#dim', 4) },
    ],
  },
  {
    id: 'top-strings',
    label: 'Top-Strings Set (G major)',
    description: 'Compact triads low on the G, B & high-E strings — clear and articulate.',
    sourceKey: 'G',
    chords: [
      { rootChord: 'G',  voicingId: pickTriad('G', 3) },
      { rootChord: 'Am', voicingId: pickTriad('Am', 5) },
      { rootChord: 'Bm', voicingId: pickTriad('Bm', 7) },
      { rootChord: 'C',  voicingId: pickTriad('C', 5) },
      { rootChord: 'D',  voicingId: pickTriad('D', 7) },
      { rootChord: 'Em', voicingId: pickTriad('Em', 9) },
    ],
  },
]

export function getVoicingById(id) {
  return VOICINGS.find(v => v.id === id) || null
}
