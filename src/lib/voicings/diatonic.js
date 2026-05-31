// Diatonic chord helpers for the voicing library's "key" context.
// The library shows chords at their ABSOLUTE names — the selected key only
// decides which chords are diatonic (highlighted/ordered) and the enharmonic
// spelling (sharps vs flats).

import { ALL_KEYS, ALL_KEYS_FLAT } from './transpose'

const PC = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4,
  F: 5, 'E#': 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9,
  'A#': 10, Bb: 10, B: 11, Cb: 11,
}

// Major-scale diatonic triad qualities (I ii iii IV V vi vii°).
const DEGREES = [
  { semi: 0,  suffix: '',    roman: 'I'   },
  { semi: 2,  suffix: 'm',   roman: 'ii'  },
  { semi: 4,  suffix: 'm',   roman: 'iii' },
  { semi: 5,  suffix: '',    roman: 'IV'  },
  { semi: 7,  suffix: '',    roman: 'V'   },
  { semi: 9,  suffix: 'm',   roman: 'vi'  },
  { semi: 11, suffix: 'dim', roman: 'vii°' },
]

function rootPC(key) {
  if (!key) return null
  const m = key.match(/^[A-G][b#]?/)
  if (!m) return null
  return PC[m[0]] ?? null
}

// Map a catalog rootChord ('G', 'Am', 'F#dim') to its degree in `key`, or null.
// Returns { roman } when diatonic. Matches on pitch-class + quality family.
export function diatonicInfo(rootChord, key) {
  const root = rootPC(key)
  if (root == null || !rootChord) return null
  const m = rootChord.match(/^([A-G][b#]?)(.*)$/)
  if (!m) return null
  const chordPC = PC[m[1]]
  if (chordPC == null) return null
  const quality = m[2]
  // normalize quality to family: '', 'm', 'dim' (ignore 7ths/extensions)
  const fam = quality.startsWith('dim') ? 'dim'
    : quality.startsWith('m7b5') ? 'dim'
    : quality.startsWith('m') ? 'm'
    : quality.startsWith('maj') ? ''
    : quality.startsWith('7') || quality === '' ? '' : quality
  for (let i = 0; i < DEGREES.length; i++) {
    const d = DEGREES[i]
    if ((root + d.semi) % 12 === chordPC && d.suffix === fam) {
      return { roman: d.roman, degree: i }
    }
  }
  return null
}

// Names of the diatonic triads of `key`, spelled per `preferFlats`.
export function diatonicChordNames(key, preferFlats = false) {
  const root = rootPC(key)
  if (root == null) return []
  const names = preferFlats ? ALL_KEYS_FLAT : ALL_KEYS
  return DEGREES.map(d => names[(root + d.semi) % 12] + d.suffix)
}
