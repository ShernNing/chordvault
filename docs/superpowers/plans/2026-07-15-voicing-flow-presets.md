# Voicing Flow Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players cycle a song's chord voicings through fretboard-zone / string-set presets in `SongVoicingsPanel`, with the whole sequence globally optimized (Viterbi) for smooth voice-leading.

**Architecture:** New pure module `src/lib/voicings/flow.js` owns presets, candidate filtering (with off-preset fallback), a Viterbi path picker over transition costs, and a parsed-content → chord-sequence helper. `SongVoicingsPanel.jsx` gains a toolbar (mode toggle Chords/Song order + preset cycler) and swaps its greedy `pickBestNext` chain for the DP path.

**Tech Stack:** Vite + React 18, Vitest (`npx vitest run <file>`), existing voicing catalog/lookup/voiceLeading modules.

**Spec:** `docs/superpowers/specs/2026-07-15-voicing-flow-presets-design.md`

**Key background for the implementer (read before Task 1):**

- Frets arrays are `[lowE, A, D, G, B, highE]`, `null` = muted, `N` = fret. String indices 0–5 low→high. Guitar string *numbering* is the reverse (string 1 = high e), so "Strings 1-2-3 (G-B-e)" = indices `[3,4,5]`.
- `voicingsForChord(name)` (`src/lib/voicings/lookup.js`) returns `[{ voicing, frets, displayedName }]`. IMPORTANT: `frets` may be transposed away from `voicing.frets`/`voicing.position`, so zone/string-set membership must be computed from the candidate's `frets`, never from `voicing.position` or `voicing.shape`.
- Exact-match catalog groups mix qualities (a `'G'` group contains G triads, Gmaj7, G7, Gsus2… each with its own `displayName`). The categorical fallback path relabels everything to the requested name. Hence the quality guard in `candidatesForPreset`.
- `leadingScore(a, b)` (`src/lib/voicings/voiceLeading.js`) takes two frets arrays, returns `{ movement, sharedStrings, commonTones, activeStrings }`.
- `voicingPosition(frets)` (`src/lib/voicings/notes.js`) = lowest fretted fret (>0), 0 if none.
- `parsed_content` line types (from `src/lib/ingestion.js`): `section_header` (`.text`), `chord_line` (`.tokens[].text`), `lyric_line`, `blank`.
- Tie-breaks in the DP use strict `<`, so the first candidate in catalog order wins — deterministic, satisfying the spec's determinism requirement.

---

### Task 1: `flow.js` — presets + `candidatesForPreset`

**Files:**
- Create: `src/lib/voicings/flow.js`
- Create: `src/lib/voicings/flow.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voicings/flow.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { PRESETS, candidatesForPreset } from './flow'
import { voicingPosition } from './notes'

const presetById = (id) => PRESETS.find(p => p.id === id)
const playedIdx = (frets) => frets.map((f, i) => (f != null ? i : null)).filter(i => i != null)

describe('PRESETS', () => {
  it('starts with auto and contains all seven presets in cycle order', () => {
    expect(PRESETS.map(p => p.id)).toEqual(
      ['auto', 'low', 'mid', 'high', 'set-gbe', 'set-dgb', 'set-adg'])
  })
})

describe('candidatesForPreset', () => {
  it('auto returns quality-matched candidates, none off-preset', () => {
    const cands = candidatesForPreset('G', presetById('auto'))
    expect(cands.length).toBeGreaterThan(0)
    for (const c of cands) {
      expect(c.displayedName).toBe('G')       // no Gsus2/G7 leaking into plain G
      expect(c.offPreset).toBe(false)
    }
  })

  it('zone presets filter by position', () => {
    for (const c of candidatesForPreset('G', presetById('low'))) {
      expect(voicingPosition(c.frets)).toBeGreaterThanOrEqual(1)
      expect(voicingPosition(c.frets)).toBeLessThanOrEqual(5)
    }
    for (const c of candidatesForPreset('G', presetById('high'))) {
      expect(voicingPosition(c.frets)).toBeGreaterThanOrEqual(8)
    }
  })

  it('string-set presets filter by played strings', () => {
    const cands = candidatesForPreset('C', presetById('set-gbe'))
    expect(cands.length).toBeGreaterThan(0)
    for (const c of cands) expect(playedIdx(c.frets)).toEqual([3, 4, 5])
  })

  it('falls back to the full list flagged offPreset when a preset has no match', () => {
    // Bm7b5 exists only as top-4 (D-G-B-e) shapes — no pure G-B-e voicing.
    const cands = candidatesForPreset('Bm7b5', presetById('set-gbe'))
    expect(cands.length).toBeGreaterThan(0)
    for (const c of cands) expect(c.offPreset).toBe(true)
  })

  it('returns [] for an unparseable chord', () => {
    expect(candidatesForPreset('???', presetById('auto'))).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/voicings/flow.test.js`
Expected: FAIL — `Cannot find module './flow'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `src/lib/voicings/flow.js`:

```js
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
```

(`transposeChordName` is imported now to keep the file's final import list stable; it's used by Task 3's sequence helper.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/voicings/flow.test.js`
Expected: PASS (5 tests). If the lint step complains about the unused `leadingScore`/`transposeChordName` imports before Tasks 2–3 land, ignore until Task 2 — they are used there. (Do not run `npm run lint` until Task 3 is complete.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voicings/flow.js src/lib/voicings/flow.test.js
git commit -m "feat: add voicing flow presets and preset-filtered candidates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `flow.js` — Viterbi path picker

**Files:**
- Modify: `src/lib/voicings/flow.js` (append)
- Modify: `src/lib/voicings/flow.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/voicings/flow.test.js` (extend the import line first):

```js
import { PRESETS, candidatesForPreset, pickVoicingPath, pickPathFromLayers } from './flow'
```

Then append:

```js
describe('pickPathFromLayers', () => {
  const V = (frets) => ({ voicing: { id: 'syn' }, frets, displayedName: 'X', offPreset: false })

  it('beats greedy on a trap sequence', () => {
    // Greedy takes the cheap first hop (5→4, movement 3) and then pays a huge
    // jump to fret 12. The globally cheaper path goes 5→9→12.
    const layers = [
      [V([null, null, 5, 5, 5, null])],
      [V([null, null, 4, 4, 4, null]), V([null, null, 9, 9, 9, null])],
      [V([null, null, 12, 12, 12, null])],
    ]
    const path = pickPathFromLayers(layers, PRESETS[0])
    expect(path[1].frets).toEqual([null, null, 9, 9, 9, null])
  })

  it('breaks the chain at an empty layer and picks around it', () => {
    const layers = [
      [V([null, null, 5, 5, 5, null])],
      [],
      [V([null, null, 7, 7, 7, null])],
    ]
    const path = pickPathFromLayers(layers, PRESETS[0])
    expect(path[0]).not.toBeNull()
    expect(path[1]).toBeNull()
    expect(path[2]).not.toBeNull()
  })
})

describe('pickVoicingPath', () => {
  it('gives a repeated chord the identical voicing (zero-movement path)', () => {
    const path = pickVoicingPath(['G', 'G', 'G'], PRESETS[0])
    expect(path[0].frets).toEqual(path[1].frets)
    expect(path[1].frets).toEqual(path[2].frets)
  })

  it('returns a complete path for every preset on a common progression', () => {
    for (const preset of PRESETS) {
      const path = pickVoicingPath(['G', 'C', 'D', 'Em'], preset)
      expect(path).toHaveLength(4)
      for (const p of path) {
        expect(p.frets).not.toBeNull()
        expect(p.voicing).not.toBeNull()
      }
    }
  })

  it('honors zone presets: every non-offPreset pick sits inside the zone', () => {
    const path = pickVoicingPath(['G', 'C', 'D', 'Em'], PRESETS.find(p => p.id === 'high'))
    for (const p of path) {
      if (!p.offPreset) {
        const pos = p.frets.filter(f => f != null && f > 0)
        expect(Math.min(...pos)).toBeGreaterThanOrEqual(8)
      }
    }
  })

  it('is deterministic', () => {
    const a = pickVoicingPath(['G', 'C', 'D', 'Em', 'C', 'G'], PRESETS.find(p => p.id === 'mid'))
    const b = pickVoicingPath(['G', 'C', 'D', 'Em', 'C', 'G'], PRESETS.find(p => p.id === 'mid'))
    expect(a).toEqual(b)
  })

  it('returns a null-voicing placeholder for unknown chords', () => {
    const path = pickVoicingPath(['G', '???', 'C'], PRESETS[0])
    expect(path[1]).toEqual({ chord: '???', voicing: null, frets: null, displayedName: '???', offPreset: false })
    expect(path[0].frets).not.toBeNull()
    expect(path[2].frets).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/voicings/flow.test.js`
Expected: FAIL — `pickVoicingPath is not a function` / `pickPathFromLayers is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/voicings/flow.js`:

```js
// ─── Path optimization (Viterbi) ────────────────────────────────────────────
// Cost components are fixed by the spec; the weight values are tunable.
const W_POSITION_JUMP = 0.75  // per-fret neck jump between consecutive voicings
const W_SHARED_STRING = 1.5   // bonus per string kept at the same fret
const W_ZONE_DRIFT = 0.5      // per-fret distance from a zone preset's center
const W_OFF_PRESET = 25       // only take off-preset picks when unavoidable

function nodeCost(cand, preset) {
  let cost = cand.offPreset ? W_OFF_PRESET : 0
  if (preset?.zoneCenter != null && !cand.offPreset) {
    cost += W_ZONE_DRIFT * Math.abs(voicingPosition(cand.frets) - preset.zoneCenter)
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/voicings/flow.test.js`
Expected: PASS (12 tests).

Sanity check on the trap test with the weights above: path via fret 4 costs (3 + 0.75) + (24 + 6) = 33.75; path via fret 9 costs (12 + 3) + (9 + 2.25) = 26.25 — DP must pick fret 9 while greedy would grab the 3.75 first hop. If a weight is later tuned, re-derive this arithmetic before changing the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voicings/flow.js src/lib/voicings/flow.test.js
git commit -m "feat: add Viterbi voicing path picker over flow presets

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `flow.js` — chord sequence from parsed content

**Files:**
- Modify: `src/lib/voicings/flow.js` (append)
- Modify: `src/lib/voicings/flow.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Extend the flow.test.js import to include `chordSequenceFromParsedContent`, then append:

```js
describe('chordSequenceFromParsedContent', () => {
  const parsed = [
    { type: 'section_header', text: 'Verse 1' },
    { type: 'chord_line', tokens: [{ text: 'G' }, { text: 'G' }, { text: 'C' }] },
    { type: 'lyric_line', text: 'la la la' },
    { type: 'chord_line', tokens: [{ text: 'C' }, { text: 'D' }] },
    { type: 'section_header', text: 'Chorus' },
    { type: 'chord_line', tokens: [{ text: 'Em' }, { text: 'C' }] },
  ]

  it('groups by section header and collapses consecutive duplicates', () => {
    expect(chordSequenceFromParsedContent(parsed)).toEqual([
      { label: 'Verse 1', chords: ['G', 'C', 'D'] },   // G G → G; C|C across lines → C
      { label: 'Chorus', chords: ['Em', 'C'] },
    ])
  })

  it('puts headerless songs in one unlabeled group', () => {
    const noHeader = [{ type: 'chord_line', tokens: [{ text: 'Am' }, { text: 'F' }] }]
    expect(chordSequenceFromParsedContent(noHeader)).toEqual([
      { label: null, chords: ['Am', 'F'] },
    ])
  })

  it('applies transposition', () => {
    const groups = chordSequenceFromParsedContent(parsed, { semitones: 2 })
    expect(groups[0].chords).toEqual(['A', 'D', 'E'])
  })

  it('ignores non-chord tokens and returns [] for missing content', () => {
    const junk = [{ type: 'chord_line', tokens: [{ text: '(x2)' }, { text: 'G' }] }]
    expect(chordSequenceFromParsedContent(junk)[0].chords).toEqual(['G'])
    expect(chordSequenceFromParsedContent(null)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/voicings/flow.test.js`
Expected: FAIL — `chordSequenceFromParsedContent is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/voicings/flow.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/voicings/flow.test.js`
Expected: PASS (16 tests).

Also run the full suite + lint now that all flow.js imports are used:
Run: `npm run test:run && npm run lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voicings/flow.js src/lib/voicings/flow.test.js
git commit -m "feat: add song-order chord sequence extraction for voicing flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Panel — toolbar + DP-driven Chords mode

**Files:**
- Modify: `src/components/voicings/SongVoicingsPanel.jsx`

No component-test convention exists for panels in this repo; correctness lives in the flow.js unit tests. Verify this task with lint + build + full test suite.

- [ ] **Step 1: Update imports and state**

In `src/components/voicings/SongVoicingsPanel.jsx`, replace:

```js
import { useMemo, useRef, useState } from 'react'
import { X, FileDown, Music2, Link2 } from 'lucide-react'
```

with:

```js
import { useMemo, useRef, useState } from 'react'
import { X, FileDown, Music2, Link2, ChevronLeft, ChevronRight } from 'lucide-react'
```

Replace:

```js
import { voicingsForChord } from '../../lib/voicings/lookup'
import { pickBestNext } from '../../lib/voicings/voiceLeading'
import { transposeChordName } from '../../lib/voicings/transpose'
import { keyPrefersFlats } from '../../lib/voicings/notes'
```

with:

```js
import { PRESETS, candidatesForPreset, pickVoicingPath, chordSequenceFromParsedContent } from '../../lib/voicings/flow'
import { keyPrefersFlats } from '../../lib/voicings/notes'
```

Inside the component, replace:

```js
  const printRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  const { songs: allSongs } = useSongs()
```

with:

```js
  const printRef = useRef(null)
  const [exporting, setExporting] = useState(false)
  const [mode, setMode] = useState('chords')       // 'chords' | 'sequence'
  const [presetIdx, setPresetIdx] = useState(0)    // index into PRESETS, 0 = Auto
  const { songs: allSongs } = useSongs()

  const preset = PRESETS[presetIdx]
  const cyclePreset = (dir) => setPresetIdx(i => (i + dir + PRESETS.length) % PRESETS.length)
```

- [ ] **Step 2: Replace the chord-collection and voicing-selection memos**

Replace the entire `orderedChords` memo AND the entire `chordsWithVoicings` memo (both blocks, from `// Walk parsed_content…` through the end of the `chordsWithVoicings` memo) with:

```js
  const preferFlats = keyPrefersFlats(targetKey || song?.target_key || song?.original_key)

  // Playing-order chord groups (split on section headers, consecutive dupes collapsed).
  const sequenceGroups = useMemo(
    () => chordSequenceFromParsedContent(song?.parsed_content, { semitones, preferFlats }),
    [song, semitones, preferFlats])

  // Unique chords in order of first appearance.
  const orderedChords = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const g of sequenceGroups) for (const ch of g.chords) if (!seen.has(ch)) { seen.add(ch); out.push(ch) }
    return out
  }, [sequenceGroups])

  // Chords mode: primary voicing per unique chord from the global DP path,
  // plus up to 2 preset-filtered alternates.
  const chordsWithVoicings = useMemo(() => {
    const fretSig = (f) => f.map(v => v == null ? 'x' : v).join('-')
    const path = pickVoicingPath(orderedChords, preset)
    return path.map(p => {
      if (!p.frets) return { chord: p.chord, voicings: [], primaryFrets: null }
      const primarySig = fretSig(p.frets)
      const alternates = candidatesForPreset(p.chord, preset)
        .filter(c => fretSig(c.frets) !== primarySig)
        .slice(0, 2)
      return {
        chord: p.chord,
        voicings: [
          { voicing: p.voicing, frets: p.frets, displayedName: p.displayedName, offPreset: p.offPreset },
          ...alternates,
        ],
        primaryFrets: p.frets,
      }
    })
  }, [orderedChords, preset])

  // Song-order mode: one voicing per occurrence, DP over the full flattened
  // sequence (voice-leading flows across section boundaries), with each item
  // carrying the previous occurrence's frets for shared-string highlighting.
  const sequenceWithVoicings = useMemo(() => {
    if (mode !== 'sequence') return []
    const flat = sequenceGroups.flatMap(g => g.chords)
    const path = pickVoicingPath(flat, preset)
    let k = 0
    let prevFrets = null
    return sequenceGroups.map(g => ({
      label: g.label,
      items: g.chords.map(() => {
        const p = path[k++]
        const item = { ...p, prevFrets }
        if (p.frets) prevFrets = p.frets
        return item
      }),
    }))
  }, [sequenceGroups, preset, mode])
```

- [ ] **Step 3: Add the toolbar below the header**

Directly after the closing `</header>` tag, insert:

```jsx
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)] shrink-0 flex-wrap no-print">
          <div className="flex rounded border border-[var(--color-border)] overflow-hidden text-xs h-8">
            {[['chords', 'Chords'], ['sequence', 'Song order']].map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2.5 h-full ${mode === m
                  ? 'bg-[var(--color-bg-warm)] text-[var(--color-ink)] font-medium'
                  : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'}`}
              >{label}</button>
            ))}
          </div>
          <div className="flex items-center rounded border border-[var(--color-border)] text-xs h-8">
            <button
              onClick={() => cyclePreset(-1)}
              aria-label="Previous voicing set"
              className="px-1.5 h-full flex items-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]"
            ><ChevronLeft size={14} /></button>
            <span className="px-1 min-w-[130px] text-center text-[var(--color-ink)]">{preset.label}</span>
            <button
              onClick={() => cyclePreset(1)}
              aria-label="Next voicing set"
              className="px-1.5 h-full flex items-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]"
            ><ChevronRight size={14} /></button>
          </div>
        </div>
```

- [ ] **Step 4: Show the off-preset badge in the chord grid**

In the existing `voicings.map((v, i) => …)` block, replace:

```jsx
                            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">
                              {v.frets.map(f => f == null ? 'x' : f).join(' ')}
                            </span>
```

with:

```jsx
                            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">
                              {v.frets.map(f => f == null ? 'x' : f).join(' ')}
                            </span>
                            {v.offPreset && (
                              <span className="text-[9px] uppercase tracking-wide text-[var(--color-ink-muted)] border border-[var(--color-border)] rounded px-1">
                                off set
                              </span>
                            )}
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run test:run && npm run build`
Expected: all green. (`transposeChordName` import was removed from the panel — the sequence helper handles transposition — so lint must not report unused imports.)

- [ ] **Step 6: Commit**

```bash
git add src/components/voicings/SongVoicingsPanel.jsx
git commit -m "feat: preset cycler and DP voice-leading in song voicings panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Panel — Song order mode rendering

**Files:**
- Modify: `src/components/voicings/SongVoicingsPanel.jsx`

- [ ] **Step 1: Wrap the existing grid in a mode switch and add the sequence view**

The existing chord grid is the `<div className="grid gap-4 grid-cols-[repeat(auto-fill,…)]">…</div>` inside the `printRef` div. Wrap it so the panel renders the grid only in `chords` mode, and renders the sequence strip in `sequence` mode:

```jsx
          <div ref={printRef} className="bg-[var(--color-bg)]">
            {mode === 'sequence' ? (
              <div className="flex flex-col gap-5">
                {sequenceWithVoicings.map((group, gi) => (
                  <section key={gi}>
                    {group.label && (
                      <h3 className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)] mb-2">
                        {group.label}
                      </h3>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {group.items.map((item, i) => item.frets ? (
                        <div key={i} className="flex flex-col items-center gap-1 w-[120px]">
                          <span className="font-display text-sm text-[var(--color-ink)]">{item.chord}</span>
                          <FretboardDiagram
                            frets={item.frets}
                            width={120}
                            highlightRoot
                            chordName={item.displayedName || item.chord}
                            compareFrets={item.prevFrets}
                          />
                          <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">
                            {item.frets.map(f => f == null ? 'x' : f).join(' ')}
                          </span>
                          {item.offPreset && (
                            <span className="text-[9px] uppercase tracking-wide text-[var(--color-ink-muted)] border border-[var(--color-border)] rounded px-1">
                              off set
                            </span>
                          )}
                        </div>
                      ) : (
                        <div key={i} className="w-[120px] min-h-[80px] flex items-center justify-center text-[10px] italic text-[var(--color-ink-muted)] border border-dashed border-[var(--color-border)] rounded p-2 text-center">
                          {item.chord}: no voicing
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(440px,100%),1fr))]">
                {/* …existing chordsWithVoicings.map block, unchanged… */}
              </div>
            )}
          </div>
```

Keep the existing `chordsWithVoicings.map` content byte-identical inside the `else` branch — only the wrapper changes.

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run test:run && npm run build`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/components/voicings/SongVoicingsPanel.jsx
git commit -m "feat: song-order voicing sequence view grouped by section

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full gate**

Run: `npm run lint && npm run test:run && npm run build`
Expected: all green. This is the project's full verification path — the panel sits behind cloud-Supabase auth, so no browser verification is possible here (project memory); `/print-lab.html` is untouched by this change (no print components, packing constants, or measurement code modified).

- [ ] **Step 2: Spec cross-check**

Confirm each spec requirement maps to landed code:
- Presets table (7 entries, cycle order, overlapping zones) → `PRESETS`
- Off-preset fallback + badge → `candidatesForPreset` + badge markup in both modes
- Viterbi with movement/position-jump/shared-string/zone-drift/off-preset costs → `pickVoicingPath`
- Chain break on unknown chords → `pickPathFromLayers` empty-layer handling
- Chords/Song order toggle, preset cycler, section grouping, consecutive-dupe collapse, `compareFrets` highlight → panel changes
- PDF export mechanism untouched → `onExport` unchanged

- [ ] **Step 3: Land any stragglers**

If the cross-check or gate surfaced fixes, commit them:

```bash
git add -A && git commit -m "fix: address voicing flow verification findings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
