import { Note } from 'tonal'

// Nashville Number System: chord roots become scale degrees relative to the key.
// Numbers are key-invariant — a I-IV-V in G shows 1-4-5, and still 1-4-5 in A.
// Quality suffix (m, 7, maj7, dim, sus4…) is preserved after the number.

const DEGREE = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
}

function chroma(noteName) {
  if (!noteName) return null
  const n = Note.get(noteName)
  return Number.isInteger(n.chroma) ? n.chroma : null
}

function keyChroma(key) {
  return chroma((key || '').replace(/m$/, '').trim())
}

function noteToNashville(noteName, keyPc) {
  const m = (noteName || '').match(/^([A-G][#b]?)/)
  if (!m) return noteName
  const pc = chroma(m[1])
  if (pc == null || keyPc == null) return noteName
  return DEGREE[(pc - keyPc + 12) % 12] + noteName.slice(m[1].length)
}

// Convert one chord name (e.g. 'Am7', 'F/A', 'Bbmaj7') to its Nashville number.
export function chordToNashville(chordName, key) {
  if (!chordName || !key) return chordName
  const keyPc = keyChroma(key)
  if (keyPc == null) return chordName

  if (chordName.includes('/')) {
    const [top, bass] = chordName.split('/')
    return `${chordToNashville(top, key)}/${noteToNashville(bass, keyPc)}`
  }

  const m = chordName.match(/^([A-G][#b]?)(.*)$/)
  if (!m) return chordName
  const pc = chroma(m[1])
  if (pc == null) return chordName
  return DEGREE[(pc - keyPc + 12) % 12] + m[2]
}

// Annotate chord tokens with Nashville numbers (does not mutate).
//   mode 'numbers' → replace chord text with the number (1, 6m, 4/6…)
//   mode 'both'    → keep chord text, attach `.nashville` so the renderer can
//                    stack the number above the original chord name
export function annotateNashville(parsedContent, key, mode = 'numbers') {
  if (!parsedContent || !key || mode === 'off') return parsedContent
  return parsedContent.map(line => {
    if (line.type !== 'chord_line' || !line.tokens) return line
    return {
      ...line,
      tokens: line.tokens.map(t => {
        if (!t.isChord) return t
        const num = chordToNashville(t.text, key)
        return mode === 'both' ? { ...t, nashville: num } : { ...t, text: num }
      }),
    }
  })
}

// Convert all chord tokens in parsed content to Nashville numbers (does not mutate).
export function nashvilleParsedContent(parsedContent, key) {
  return annotateNashville(parsedContent, key, 'numbers')
}

// ── Tri-state display mode: 'off' → 'numbers' → 'both' → 'off' ──────────────
// Tolerates legacy booleans from prefs stored before the third state existed.
export function normalizeNashville(v) {
  if (v === true || v === 'numbers') return 'numbers'
  if (v === 'both') return 'both'
  return 'off'
}

export function cycleNashville(v) {
  const m = normalizeNashville(v)
  return m === 'off' ? 'numbers' : m === 'numbers' ? 'both' : 'off'
}
