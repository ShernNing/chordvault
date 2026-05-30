// Standalone verifier. Imports the generated catalog, computes notes from each
// voicing's frets, and compares against its chord label. Prints mismatches.
import { VOICINGS } from '../src/lib/voicings/catalog.js'

const OPEN_MIDI = [40, 45, 50, 55, 59, 64]   // E2 A2 D3 G3 B3 E4
const PCNAME = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

function fretsToPCSet(frets) {
  const set = new Set()
  for (let i = 0; i < 6; i++) {
    const f = frets[i]
    if (f == null) continue
    set.add((OPEN_MIDI[i] + f) % 12)
  }
  return set
}

const PC = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 }

const CHORD_INTERVALS = {
  '':       [0, 4, 7],
  'maj7':   [0, 4, 7, 11],
  'maj9':   [0, 4, 7, 11, 2],
  'add9':   [0, 4, 7, 2],
  'add4':   [0, 4, 7, 5],
  'sus2':   [0, 2, 7],
  'sus4':   [0, 5, 7],
  '7':      [0, 4, 7, 10],
  '7sus4':  [0, 5, 7, 10],
  '9':      [0, 4, 7, 10, 2],
  'm':      [0, 3, 7],
  'm7':     [0, 3, 7, 10],
  'm9':     [0, 3, 7, 10, 2],
  'm7b5':   [0, 3, 6, 10],
  'dim':    [0, 3, 6],
  'dim7':   [0, 3, 6, 9],
  '5':      [0, 7],
}

function expectedPCs(displayName) {
  const m = displayName.match(/^([A-G][b#]?)(.*?)(?:\/(.*))?$/)
  if (!m) return null
  const root = m[1]; const q = m[2]; const bass = m[3]
  const ivs = CHORD_INTERVALS[q]
  if (ivs == null) return { unknownQuality: q }
  const set = new Set(ivs.map(i => (PC[root] + i + 12) % 12))
  if (bass) set.add(PC[bass] % 12)
  return set
}

let mismatches = 0
console.log(`checking ${VOICINGS.length} voicings\n`)

for (const v of VOICINGS) {
  const expected = expectedPCs(v.displayName)
  if (!expected) { console.log('UNPARSEABLE LABEL:', v.displayName); continue }
  if (expected.unknownQuality !== undefined) {
    console.log(`UNKNOWN QUALITY '${expected.unknownQuality}' in '${v.displayName}'`)
    continue
  }
  const actual = fretsToPCSet(v.frets)
  const missing = [...expected].filter(p => !actual.has(p))
  const extra = [...actual].filter(p => !expected.has(p))
  if (missing.length || extra.length) {
    mismatches++
    console.log(
      `MISMATCH ${v.displayName.padEnd(10)} ${v.rootChord.padEnd(7)} `
      + `frets=[${v.frets.map(f=>f==null?'x':f).join(' ')}]`
      + `\n  actual:   {${[...actual].sort((a,b)=>a-b).map(p=>PCNAME[p]).join(',')}}`
      + `\n  expected: {${[...expected].sort((a,b)=>a-b).map(p=>PCNAME[p]).join(',')}}`
      + `\n  missing:  [${missing.map(p=>PCNAME[p]).join(',')}]`
      + `\n  extra:    [${extra.map(p=>PCNAME[p]).join(',')}]`
    )
  }
}

console.log(`\ntotal mismatches: ${mismatches} / ${VOICINGS.length}`)
