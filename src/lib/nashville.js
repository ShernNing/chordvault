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

// Split a chord into its Nashville scale-degree numeral and the trailing
// quality/extension — everything after the root: 'm', '7', '2', 'sus', '/5'…
// Keeping them apart lets the renderer show the degree full-size and shrink the
// quality, so 'G2' reads as a 1 with a small 2 — not the ambiguous "12".
export function chordToNashvilleParts(chordName, key) {
  const none = { degree: chordName || '', quality: '' }
  if (!chordName || !key) return none
  const keyPc = keyChroma(key)
  if (keyPc == null) return none

  // Optional/passing chords are wrapped in ( ) or [ ] — e.g. '(D)'. Strip the
  // wrapper, convert the inner chord, then put the wrapper back around the
  // result so '(D)' in G reads as '(5)', not literal.
  const wrap = chordName.match(/^([([])(.+)([)\]])$/)
  if (wrap) {
    const inner = chordToNashvilleParts(wrap[2], key)
    return { degree: wrap[1] + inner.degree, quality: inner.quality + wrap[3] }
  }

  if (chordName.includes('/')) {
    const [top, bass] = chordName.split('/')
    const t = chordToNashvilleParts(top, key)
    return { degree: t.degree, quality: `${t.quality}/${noteToNashville(bass, keyPc)}` }
  }

  const m = chordName.match(/^([A-G][#b]?)(.*)$/)
  if (!m) return none
  const pc = chroma(m[1])
  if (pc == null) return none
  return { degree: DEGREE[(pc - keyPc + 12) % 12], quality: m[2] }
}

// Convert one chord name (e.g. 'Am7', 'F/A', 'Bbmaj7') to its Nashville number.
export function chordToNashville(chordName, key) {
  const { degree, quality } = chordToNashvilleParts(chordName, key)
  return degree + quality
}

// Attach Nashville parts to every chord token (does not mutate, keeps t.text so
// chord clicks / voicing lookups still resolve to the real chord). The renderer
// reads `t.nashville` and decides — by mode — whether to show the number alone
// ('numbers') or stacked above the chord name ('both').
export function annotateNashville(parsedContent, key, mode = 'numbers') {
  if (!parsedContent || !key || mode === 'off') return parsedContent
  return parsedContent.map(line => {
    if (line.type !== 'chord_line' || !line.tokens) return line
    return {
      ...line,
      tokens: line.tokens.map(t =>
        t.isChord ? { ...t, nashville: chordToNashvilleParts(t.text, key) } : t,
      ),
    }
  })
}

// Convert all chord tokens in parsed content to Nashville numbers (does not mutate).
export function nashvilleParsedContent(parsedContent, key) {
  if (!parsedContent || !key) return parsedContent
  return parsedContent.map(line => {
    if (line.type !== 'chord_line' || !line.tokens) return line
    return {
      ...line,
      tokens: line.tokens.map(t =>
        t.isChord ? { ...t, text: chordToNashville(t.text, key) } : t,
      ),
    }
  })
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
