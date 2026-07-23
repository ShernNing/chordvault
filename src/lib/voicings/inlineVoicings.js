// Screen-only inline voicings: map each chord-token occurrence in a song to a
// voicing chosen by the global voice-leading path, keyed by "lineIndex:tokenIndex".
//
// Pure module (no React) so the sequence + override logic is unit-testable
// without rendering. Consumed by SongRenderer + InlineVoicingRow.

import { PRESETS, pickVoicingPath, candidatesForPreset } from './flow'

// Same chord-name guard used by chordSequenceFromParsedContent.
export const CHORD_RE = /^[A-G][b#]?/

const fretSig = (f) => (f ? f.map((v) => (v == null ? 'x' : v)).join('-') : '')

/**
 * Walk parsed content in reading order and return one slot per real chord token:
 *   [{ key: "lineIndex:tokenIndex", name }]
 * Duplicates are NOT collapsed — every occurrence is its own slot. Non-chord
 * tokens (lyrics fragments on a chord line, symbols) are skipped.
 */
export function collectChordSlots(content) {
  const slots = []
  if (!Array.isArray(content)) return slots
  content.forEach((line, li) => {
    if (line?.type !== 'chord_line' || !Array.isArray(line.tokens)) return
    line.tokens.forEach((tok, ti) => {
      const name = (tok?.text || '').trim()
      if (!name || !CHORD_RE.test(name)) return
      slots.push({ key: `${li}:${ti}`, name })
    })
  })
  return slots
}

/**
 * Build a Map<key, { name, voicing, frets, displayedName, offPreset }> for the
 * whole song under `preset`, using the Viterbi voice-leading path so voicings
 * flow across the sequence. Chords with no catalog voicing get frets: null.
 */
export function buildInlineVoicings(content, preset) {
  const slots = collectChordSlots(content)
  const picks = pickVoicingPath(slots.map((s) => s.name), preset || PRESETS[0])
  const map = new Map()
  slots.forEach((s, i) => {
    const p = picks[i]
    map.set(s.key, {
      name: s.name,
      voicing: p?.voicing ?? null,
      frets: p?.frets ?? null,
      displayedName: p?.displayedName ?? s.name,
      offPreset: !!p?.offPreset,
    })
  })
  return map
}

/**
 * Cycle one occurrence to the next/previous catalog candidate for its chord
 * under `preset`. `current` is the currently-resolved voicing object (or null).
 * Returns a new voicing object, or `current` unchanged when there are <2
 * candidates (nothing to cycle).
 */
export function cycleVoicing(current, name, preset, dir) {
  const cands = candidatesForPreset(name, preset || PRESETS[0])
  if (cands.length <= 1) return current
  const sig = fretSig(current?.frets)
  let idx = cands.findIndex((c) => fretSig(c.frets) === sig)
  if (idx < 0) idx = 0
  const next = cands[(idx + dir + cands.length) % cands.length]
  return {
    name,
    voicing: next.voicing,
    frets: next.frets,
    displayedName: next.displayedName || name,
    offPreset: !!next.offPreset,
  }
}
