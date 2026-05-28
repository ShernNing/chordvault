// Standalone verifier. Reads catalog.js as text, extracts mk(...) calls, computes notes
// from frets, compares against the chord label, prints mismatches.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const txt = fs.readFileSync(path.join(ROOT, 'src/lib/voicings/catalog.js'), 'utf8')

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

// Extract mk(...) calls naively
const RE = /mk\('([^']+)',\s*'([^']+)',\s*\[([^\]]+)\]/g
let m, count = 0, mismatches = 0
const allEntries = []
while ((m = RE.exec(txt)) != null) {
  count++
  const rootChord = m[1]
  const displayName = m[2]
  const fretsRaw = m[3].split(',').map(s => s.trim())
  const frets = fretsRaw.map(s => s === 'null' ? null : Number(s))
  allEntries.push({ rootChord, displayName, frets })
}

console.log(`extracted ${count} voicings\n`)

for (const v of allEntries) {
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

console.log(`\ntotal mismatches: ${mismatches} / ${allEntries.length}`)
