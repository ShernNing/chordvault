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

// Lowest played string index (0=lowE … 5=highE) — how far down the thick
// strings a voicing reaches.
function lowestPlayedString(frets) {
  for (let i = 0; i < 6; i++) if (frets[i] != null) return i
  return 5
}

// Soft "top strings" bias, keyed on the lowest played string. Triads on the
// top three strings — G-B-e, lowest idx 3, i.e. guitarist strings 1·2·3 — are
// free; D-G-B / top-4 drop-2 (lowest idx 2, strings 2·3·4) cost a little; and
// anything dipping to the A string or below (idx ≤1, the 3·4·5 A-D-G set) is
// pushed well down so it's picked only when nothing higher fits. Applied as a
// node cost (not a filter), so 7th chords that only exist as top-4 shapes still
// appear, and the path may shift up/down the neck to keep the preferred set.
const STRING_PREF_COST = [10, 6, 1.5, 0]   // index = lowest played string; idx ≥3 → 0
function stringPrefCost(frets) {
  const lo = lowestPlayedString(frets)
  return lo < STRING_PREF_COST.length ? STRING_PREF_COST[lo] : 0
}

// Ordered cycle list. `top-strings` is the default (see SongVoicingsPanel):
// a soft bias toward high strings with a gentle high-neck lean, no hard filter.
// Zone bounds overlap one fret so no zone starves; zoneCenter feeds the drift
// penalty in nodeCost, stringCost feeds the string-set penalty. `matches` (when
// present) hard-filters the candidate pool; presets without it bias softly.
export const PRESETS = [
  { id: 'auto', label: 'Auto' },
  { id: 'top-strings', label: 'Top strings (1·2·3 / 2·3·4)',
    zoneCenter: 6, stringCost: stringPrefCost },
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
export function candidatesForPreset(chordName, preset, opts = {}) {
  // voicingsForChord trims its input; trim here too so the quality guard
  // below compares against the same normalized name (e.g. 'G ' vs 'G').
  const want = String(chordName ?? '').trim()
  const original = voicingsForChord(want)
  if (!original.length) return []
  // Quality guard: exact-match catalog groups mix qualities under one root
  // (plain 'G' carries Gsus2/G7/Gmaj7 voicings too) — keep only voicings
  // actually named like the requested chord when any exist.
  const named = original.filter(c => c.displayedName === want)
  let all = original
  if (named.length) {
    all = named
    // For plain major/minor chords, optionally fold in the same-root shell
    // (power) voicings so manual cycling can reach the no-3rd shapes. Appended
    // AFTER the real triads, so they never displace the default primary pick.
    if (opts.includeShells) {
      const m = want.match(/^([A-G][b#]?)m?$/)
      if (m) {
        const shells = original.filter((c) => c.displayedName === `${m[1]}5`)
        if (shells.length) all = [...named, ...shells]
      }
    }
  }
  if (!preset?.matches) return all.map(c => ({ ...c, offPreset: false }))
  const filtered = all.filter(c => preset.matches(c.frets))
  const pool = filtered.length ? filtered : all
  const off = filtered.length === 0
  return pool.map(c => ({ ...c, offPreset: off }))
}

// ─── Path optimization (Viterbi) ────────────────────────────────────────────
// Cost components are fixed by the spec; the weight values are tunable.
const W_POSITION_JUMP = 0.75  // per-fret neck jump between consecutive voicings
const W_SHARED_STRING = 1.5   // bonus per string kept at the same fret
const W_ZONE_DRIFT = 0.5      // per-fret distance from a zone preset's center
// Inert through pickVoicingPath (candidatesForPreset flags whole layers
// uniformly, so it adds a constant to every path); binds only for
// pickPathFromLayers callers that build mixed on/off-preset layers.
const W_OFF_PRESET = 25

function nodeCost(cand, preset) {
  let cost = cand.offPreset ? W_OFF_PRESET : 0
  if (!cand.offPreset && preset?.zoneCenter != null) {
    cost += W_ZONE_DRIFT * Math.abs(voicingPosition(cand.frets) - preset.zoneCenter)
  }
  if (!cand.offPreset && preset?.stringCost) {
    cost += preset.stringCost(cand.frets)
  }
  return cost
}

function edgeCost(aFrets, bFrets) {
  const sc = leadingScore(aFrets, bFrets)
  if (!sc) return 0
  const posJump = Math.abs(voicingPosition(aFrets) - voicingPosition(bFrets))
  return sc.movement + W_POSITION_JUMP * posJump - W_SHARED_STRING * sc.sharedStrings
}

// Viterbi over layers[start..end) — writes the chosen candidate per layer
// into picks. Ties resolve by strict `<`, i.e. first candidate in catalog
// order wins (deterministic).
function solveRun(layers, start, end, preset, picks) {
  const costs = [layers[start].map(c => nodeCost(c, preset))]
  const backs = [layers[start].map(() => -1)]

  for (let i = start + 1; i < end; i++) {
    const prevLayer = layers[i - 1]
    const prevCost = costs[costs.length - 1]
    const layerCosts = []
    const layerBacks = []
    for (const cand of layers[i]) {
      let best = Infinity
      let bestJ = -1
      for (let j = 0; j < prevLayer.length; j++) {
        const c = prevCost[j] + edgeCost(prevLayer[j].frets, cand.frets)
        if (c < best) { best = c; bestJ = j }
      }
      layerCosts.push(best + nodeCost(cand, preset))
      layerBacks.push(bestJ)
    }
    costs.push(layerCosts)
    backs.push(layerBacks)
  }

  const last = costs[costs.length - 1]
  let k = 0
  for (let j = 1; j < last.length; j++) if (last[j] < last[k]) k = j
  for (let i = end - 1; i >= start; i--) {
    picks[i] = layers[i][k]
    k = backs[i - start][k]
  }
}

/**
 * Core path picker over pre-built candidate layers. Each candidate needs a
 * `.frets` array. An empty layer breaks the voice-leading chain (its slot is
 * null; the next run starts fresh). Returns one candidate (or null) per layer.
 */
export function pickPathFromLayers(layers, preset) {
  const picks = new Array(layers.length).fill(null)
  let start = 0
  while (start < layers.length) {
    if (!layers[start].length) { start++; continue }
    let end = start
    while (end < layers.length && layers[end].length) end++
    solveRun(layers, start, end, preset, picks)
    start = end
  }
  return picks
}

/**
 * One voicing per chord for the whole sequence under a preset.
 * Returns [{ chord, voicing, frets, displayedName, offPreset }]; chords with
 * no catalog voicings get { voicing: null, frets: null }.
 */
export function pickVoicingPath(chordNames, preset) {
  const layers = chordNames.map(ch => candidatesForPreset(ch, preset))
  const picks = pickPathFromLayers(layers, preset)
  return chordNames.map((chord, i) => picks[i]
    ? {
        chord,
        voicing: picks[i].voicing,
        frets: picks[i].frets,
        displayedName: picks[i].displayedName,
        offPreset: !!picks[i].offPreset,
      }
    : { chord, voicing: null, frets: null, displayedName: chord, offPreset: false })
}

// ─── Song-order chord sequence ──────────────────────────────────────────────
/**
 * Walk parsed_content in playing order → [{ label, chords }] groups split on
 * section_header lines. Consecutive duplicate chords collapse (G G C → G C).
 * Transposition mirrors SongVoicingsPanel's display logic.
 */
export function chordSequenceFromParsedContent(parsedContent, { semitones = 0, preferFlats = false } = {}) {
  if (!parsedContent) return []
  const groups = []
  let current = { label: null, chords: [] }
  const flush = () => { if (current.chords.length) groups.push(current) }

  for (const line of parsedContent) {
    if (line.type === 'section_header') {
      flush()
      current = { label: line.text || null, chords: [] }
      continue
    }
    if (line.type !== 'chord_line' || !line.tokens) continue
    for (const tok of line.tokens) {
      const txt = (tok.text || '').trim()
      if (!txt || !/^[A-G][b#]?/.test(txt)) continue
      const displayed = semitones !== 0 ? transposeChordName(txt, semitones, preferFlats) : txt
      if (current.chords[current.chords.length - 1] !== displayed) current.chords.push(displayed)
    }
  }
  flush()
  return groups
}
