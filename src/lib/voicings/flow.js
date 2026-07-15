// Voicing "flow" presets + global path optimization.
//
// A preset constrains WHICH catalog voicings a song may use (fretboard zone
// or string set). pickVoicingPath then chooses one voicing per chord so the
// whole sequence plays with minimal hand movement — a Viterbi pass over
// transition costs, instead of the greedy chord-by-chord pickBestNext chain.

import { voicingsForChord } from './lookup'
import { leadingScore } from './voiceLeading'
import { voicingPosition } from './notes'
import { transposeChordName } from './transpose'

// Which strings a voicing plays, as a low→high index signature ('2-3-4' = D-G-B).
const stringSetKey = (frets) =>
  frets.map((f, i) => (f != null ? i : null)).filter(i => i != null).join('-')

// Ordered cycle list. Zone bounds overlap one fret so no zone starves;
// zoneCenter feeds the drift penalty in nodeCost. `matches` takes a frets array.
export const PRESETS = [
  { id: 'auto', label: 'Auto' },
  { id: 'low',  label: 'Low neck',  zoneCenter: 3,
    matches: f => voicingPosition(f) >= 1 && voicingPosition(f) <= 5 },
  { id: 'mid',  label: 'Mid neck',  zoneCenter: 6.5,
    matches: f => voicingPosition(f) >= 4 && voicingPosition(f) <= 9 },
  { id: 'high', label: 'High neck', zoneCenter: 11.5,
    matches: f => voicingPosition(f) >= 8 },
  { id: 'set-gbe', label: 'Strings 1·2·3 (G-B-e)', matches: f => stringSetKey(f) === '3-4-5' },
  { id: 'set-dgb', label: 'Strings 2·3·4 (D-G-B)', matches: f => stringSetKey(f) === '2-3-4' },
  { id: 'set-adg', label: 'Strings 3·4·5 (A-D-G)', matches: f => stringSetKey(f) === '1-2-3' },
]

/**
 * Catalog candidates for one chord under a preset.
 * Returns [{ voicing, frets, displayedName, offPreset }].
 * If the preset filter empties the list (e.g. 7th chords exist only as top-4
 * shapes), falls back to the FULL list with every entry flagged offPreset.
 */
export function candidatesForPreset(chordName, preset) {
  let all = voicingsForChord(chordName)
  if (!all.length) return []
  // Quality guard: exact-match catalog groups mix qualities under one root
  // (plain 'G' carries Gsus2/G7/Gmaj7 voicings too) — keep only voicings
  // actually named like the requested chord when any exist.
  const named = all.filter(c => c.displayedName === chordName)
  if (named.length) all = named
  if (!preset?.matches) return all.map(c => ({ ...c, offPreset: false }))
  const filtered = all.filter(c => preset.matches(c.frets))
  const pool = filtered.length ? filtered : all
  const off = filtered.length === 0
  return pool.map(c => ({ ...c, offPreset: off }))
}
