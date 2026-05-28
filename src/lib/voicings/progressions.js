// Common chord progressions, expressed as scale degrees + quality.
// At render time, each degree is resolved against the chosen key.

// Major-key degrees: I ii iii IV V vi viiø
// Minor-key degrees: i iiø III iv v VI VII

const MAJOR_DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11]   // C major: C D E F G A B
const MAJOR_DEGREE_QUALITY = ['', 'm', 'm', '', '', 'm', 'dim']  // I ii iii IV V vi vii°

const MINOR_DEGREE_SEMITONES = [0, 2, 3, 5, 7, 8, 10]   // A minor: A B C D E F G
const MINOR_DEGREE_QUALITY = ['m', 'dim', '', 'm', 'm', '', '']  // i iiø III iv v VI VII

const PC_LIST = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const PC_LIST_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const PC_INDEX = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 }
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm'])

function noteAt(rootPC, semitones, preferFlats) {
  const idx = ((rootPC + semitones) % 12 + 12) % 12
  return (preferFlats ? PC_LIST_FLAT : PC_LIST)[idx]
}

// Resolve a degree symbol like "I", "ii", "IV", "V7", "vi" into a chord name in given key.
// Numerals can carry a chord-suffix override after them, e.g. "V7" or "ii7".
function resolveDegree(deg, keyName) {
  const m = deg.match(/^([ivIV]+|[1-7])(.*)$/)
  if (!m) return deg
  const sym = m[1]
  const suffixOverride = m[2]

  const isMinorKey = /m$/i.test(keyName) && !keyName.includes('Maj')
  const keyRoot = keyName.replace(/m$/, '').replace(/M$/, '')
  const rootPC = PC_INDEX[keyRoot]
  if (rootPC == null) return deg
  const preferFlats = FLAT_KEYS.has(keyName) || FLAT_KEYS.has(keyRoot)

  const degIndex = parseRoman(sym)
  if (degIndex == null) return deg

  const semitones = isMinorKey ? MINOR_DEGREE_SEMITONES[degIndex] : MAJOR_DEGREE_SEMITONES[degIndex]
  const quality = isMinorKey ? MINOR_DEGREE_QUALITY[degIndex] : MAJOR_DEGREE_QUALITY[degIndex]
  const root = noteAt(rootPC, semitones, preferFlats)
  const finalQual = suffixOverride || quality
  return root + finalQual
}

function parseRoman(s) {
  if (/^[1-7]$/.test(s)) return parseInt(s, 10) - 1
  const map = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 }
  return map[s.toLowerCase()] ?? null
}

// Predefined progressions.
export const PROGRESSIONS = [
  {
    id: 'pop',
    label: 'I – V – vi – IV (Pop)',
    description: 'The defining pop progression. Used in "Don\'t Stop Believing", "Let it Be", thousands of songs.',
    degrees: ['I', 'V', 'vi', 'IV'],
    mode: 'major',
  },
  {
    id: 'pop2',
    label: 'vi – IV – I – V',
    description: '"Sensitive female" progression — emotional and uplifting.',
    degrees: ['vi', 'IV', 'I', 'V'],
    mode: 'major',
  },
  {
    id: 'doowop',
    label: 'I – vi – IV – V (50s/Doo-wop)',
    description: 'Classic 1950s ballad pattern.',
    degrees: ['I', 'vi', 'IV', 'V'],
    mode: 'major',
  },
  {
    id: 'canon',
    label: 'I – V – vi – iii – IV – I – IV – V (Canon)',
    description: 'Pachelbel\'s Canon — the most popular classical progression in pop music.',
    degrees: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'],
    mode: 'major',
  },
  {
    id: 'jazz251',
    label: 'ii – V – I (Jazz)',
    description: 'The fundamental jazz cadence. Try ii7, V7, Imaj7 for full color.',
    degrees: ['ii7', 'V7', 'Imaj7'],
    mode: 'major',
  },
  {
    id: 'blues12',
    label: '12-bar Blues (I7 – IV7 – V7)',
    description: 'I7 (4 bars) → IV7 (2) → I7 (2) → V7 (1) → IV7 (1) → I7 (2). Use dominant 7ths.',
    degrees: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'],
    mode: 'major',
  },
  {
    id: 'minor-i-vi-iv-v',
    label: 'i – VI – III – VII (Andalusian)',
    description: 'Spanish/flamenco descent — moody and dramatic.',
    degrees: ['i', 'VII', 'VI', 'V'],
    mode: 'minor',
  },
  {
    id: 'minor-pop',
    label: 'i – VII – VI – VII (Minor pop)',
    description: 'Common in modern minor-key pop and rock.',
    degrees: ['i', 'VII', 'VI', 'VII'],
    mode: 'minor',
  },
  {
    id: 'jazz251m',
    label: 'iiø – V7 – i (Minor 2-5-1)',
    description: 'The minor-key jazz cadence — uses half-diminished ii.',
    degrees: ['iiø', 'V7', 'i'],
    mode: 'minor',
  },
]

// For a progression + key, return the array of resolved chord names.
export function resolveProgression(progression, keyName) {
  if (!progression || !keyName) return []
  // Half-dim degree iiø → m7b5
  return progression.degrees.map(d => {
    let deg = d
    if (/ø/.test(deg)) deg = deg.replace('ø', 'm7b5')
    return resolveDegree(deg, keyName)
  })
}
