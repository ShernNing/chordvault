// Map an arbitrary chord name (from a song) → catalog voicings transposed
// to that chord's root. Handles major/minor/dim/sus/dom7/slash families.

import { VOICINGS_BY_CHORD } from './catalog'
import { semitoneDelta, bestTransposeFrets } from './transpose'

/**
 * Parse a chord name like "Bm7", "C#dim7", "F#m7b5", "D/F#" into root + quality.
 */
export function parseChordName(name) {
  if (!name) return null
  const cleaned = String(name).trim()
  const m = cleaned.match(/^([A-G][b#]?)([^/]*)(\/(.*))?$/)
  if (!m) return null
  return {
    root: m[1],
    quality: m[2] || '',
    bassNote: m[4] || null,
    raw: cleaned,
  }
}

function categoryOf(quality) {
  if (/dim|°/i.test(quality)) return 'dim'
  if (/^m(?!aj)|^min/i.test(quality)) return 'minor'
  return 'major'  // dom7/maj7/add9/sus all use the major frame
}

// Map a category to the canonical rootChord groups present in the catalog.
const CANONICAL_GROUPS = {
  major: ['G', 'C', 'D', 'A'],
  minor: ['Am', 'Bm', 'Em'],
  dim:   ['F#dim'],
}

// Per-voicing transpose so the voicing's root note becomes `targetRoot`.
function shiftVoicingToRoot(voicing, targetRoot) {
  const m = voicing.rootChord.match(/^([A-G][b#]?)/)
  if (!m) return null
  const voicingRoot = m[1]
  const shift = semitoneDelta(voicingRoot, targetRoot)
  return bestTransposeFrets(voicing.frets, shift)
}

/**
 * Given a chord name from a song, return an array of { voicing, frets, displayedName }.
 * `displayedName` keeps the user's quality suffix but with the new root.
 */
export function voicingsForChord(chordName) {
  const parsed = parseChordName(chordName)
  if (!parsed) return []

  // Exact match in catalog — e.g. clicking "Bm" returns the catalog's Bm voicings unchanged.
  // Also handles slash chords like "D/F#".
  const exactKey = parsed.bassNote
    ? `${parsed.root}${parsed.quality}/${parsed.bassNote}`
    : `${parsed.root}${parsed.quality}`

  if (VOICINGS_BY_CHORD[exactKey]) {
    return VOICINGS_BY_CHORD[exactKey].map(v => ({
      voicing: v,
      frets: v.frets.slice(),
      displayedName: v.displayName,
    }))
  }

  // Categorical fallback: pick canonical group, shift every voicing to targetRoot.
  const category = categoryOf(parsed.quality)
  const groups = CANONICAL_GROUPS[category]
  const seen = new Set()
  const out = []

  for (const g of groups) {
    for (const v of VOICINGS_BY_CHORD[g] || []) {
      // Skip non-movable voicings whose source root differs from target (open strings won't shift).
      if (!v.movable) {
        const vRoot = v.rootChord.match(/^([A-G][b#]?)/)?.[1]
        if (vRoot !== parsed.root) continue
      }
      const frets = shiftVoicingToRoot(v, parsed.root)
      if (!frets) continue
      const sig = frets.map(f => f == null ? 'x' : f).join('-')
      if (seen.has(sig)) continue
      seen.add(sig)

      // Re-derive displayedName: keep quality suffix from clicked chord (e.g. "F#m7")
      const displayedName = `${parsed.root}${parsed.quality}${parsed.bassNote ? '/' + parsed.bassNote : ''}`
      out.push({ voicing: v, frets, displayedName })
    }
  }

  return out
}
