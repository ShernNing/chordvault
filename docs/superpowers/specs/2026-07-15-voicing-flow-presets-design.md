# Voicing Flow Presets — Design

**Date:** 2026-07-15
**Status:** Approved
**Surface:** `SongVoicingsPanel` (song view slide-up panel)

## Goal

When viewing a song's chord voicings, the player can cycle the whole song
through *voicing presets* — areas of the fretboard (low / mid / high neck) or
string groups (1-2-3, 2-3-4, 3-4-5) — and get a coherent, playable set of
voicings whose transitions are globally optimized for minimal hand movement
(smart voice-leading), not just picked chord-by-chord.

## Decisions (user-confirmed)

1. **Chord list:** toggle between *Chords* (unique chords, first-appearance
   order — current behavior) and *Song order* (every occurrence, grouped by
   section headers).
2. **Cycle scope:** global — one control re-voices the entire song within the
   chosen preset.
3. **Preset dimension:** combined presets mixing fretboard zones and string
   sets (single cycle list, simple mental model).
4. **Placement:** extend the existing `SongVoicingsPanel`; no new view.
5. **Algorithm:** global DP (Viterbi) over the chord sequence, replacing the
   greedy `pickBestNext` chain for primary-voicing selection.
6. **Default preset:** `Auto` (unconstrained — current pure voice-leading
   behavior).

## Architecture

### New module: `src/lib/voicings/flow.js` (pure, unit-tested)

**`PRESETS`** — ordered cycle list:

| id | label | constraint |
|----|-------|-----------|
| `auto` | Auto | none |
| `low` | Low neck | `1 <= voicingPosition(frets) <= 5` |
| `mid` | Mid neck | `4 <= voicingPosition(frets) <= 9` |
| `high` | High neck | `voicingPosition(frets) >= 8` |
| `set-gbe` | Strings 1-2-3 (G-B-e) | played strings exactly `G-B-e` |
| `set-dgb` | Strings 2-3-4 (D-G-B) | played strings exactly `D-G-B` |
| `set-adg` | Strings 3-4-5 (A-D-G) | played strings exactly `A-D-G` |

Zones deliberately overlap one fret so no zone preset starves. Membership is
computed from each candidate's `frets` array — zone membership via
`voicingPosition(frets)`, string-set membership via the played-string
signature (which string indices are non-null) — NOT from the catalog
voicing's `shape` label or `voicing.position` field, because
`voicingsForChord` can return frets transposed away from the catalog entry's
recorded position.

**`candidatesForPreset(chordName, preset)`** — runs `voicingsForChord`, filters
by the preset constraint. If the filter empties the list (e.g. maj7/m7/dom7
chords exist only as top-4 `D-G-B-e` drop-2 shapes, so 3-string presets have no
match), it falls back to the **full** candidate list with each entry flagged
`offPreset: true`. A chord with no catalog voicings at all returns `[]`.

**`pickVoicingPath(chordNames, preset)`** — Viterbi/DP over the sequence:

- **Edge cost (a → b):** finger movement (sum of |Δfret| over strings both
  play — reuses `leadingScore`) **+** small penalty × |positionA − positionB|
  (discourages neck jumps even when few strings overlap) **−** bonus ×
  sharedStrings.
- **Node cost:** for zone presets, distance of `position` from the zone
  center; flat penalty for `offPreset` candidates so they are used only when
  unavoidable.
- **Tie-break:** deterministic — first candidate in catalog order wins
  (strict `<` comparisons throughout).
- **Returns:** one `{ chord, voicing, frets, offPreset }` per input chord;
  `voicing: null` entries for chords with no catalog voicings (callers render
  a placeholder and the DP chain treats them as a break — the next chord
  starts fresh, node cost only).

Complexity is trivial (≤ ~200 occurrences × ~15 candidates²). Exact weight
values are implementation-tunable; the spec fixes the cost *components* above.

### `SongVoicingsPanel.jsx` changes

**Header controls** (between title and PDF/close buttons):

- Mode toggle (segmented): **Chords** | **Song order**.
- Preset cycler: `‹  [preset label]  ›` stepping through `PRESETS`, wrapping.

**Chords mode** (current grid, modified):

- Unique-chord list built exactly as today (order of first appearance,
  transposition applied before lookup).
- Primary (first) voicing per chord now comes from `pickVoicingPath` over the
  unique-chord sequence under the active preset.
- Up to 2 alternates follow, drawn from `candidatesForPreset` (excluding the
  primary), preserving today's 3-diagram layout.
- `offPreset` voicings render with a muted "off set" badge.
- Existing extras unchanged: difficulty label, `compareFrets` shared-string
  highlight vs previous chord's primary, "Used in N other songs", PDF export.

**Song order mode** (new):

- Walk `parsed_content` in order; `section_header` lines become group
  dividers (songs with no headers render one unlabeled group).
- Every chord-token occurrence is listed; **consecutive duplicates are
  collapsed** (same chord repeated back-to-back shows once).
- One diagram per occurrence (the DP path voicing), smaller width (~120px),
  chord name above, fret string below, `compareFrets` vs the previous
  occurrence's voicing.
- Same preset cycler applies; the DP runs over the full occurrence sequence,
  so a repeated chord may legitimately get different voicings in different
  contexts.

### Data flow

`parsed_content` → chord list (unique or sequenced, transposed) →
`pickVoicingPath(chords, activePreset)` → render grid/strip → (optional) PDF
export of the rendered DOM (mechanism unchanged).

## Error handling

- Chord with no catalog voicings: Chords mode keeps the existing "No catalog
  voicings found" card; Song order mode renders a placeholder chip.
- Empty preset for a chord: automatic fallback + `offPreset` badge (never an
  empty card).
- No section headers: single unlabeled group.
- Transposition/flat-preference handling reuses the panel's existing logic.

## Testing

`src/lib/voicings/flow.test.js` (Vitest, colocated like sibling modules):

1. Zone presets filter by position bounds; string-set presets by played
   strings.
2. Fallback: 7th chord under a 3-string preset returns full list, all
   `offPreset: true`.
3. Repeated chord yields identical consecutive voicings (zero-movement path).
4. Constructed trap case where greedy `pickBestNext` chaining is suboptimal;
   DP finds the lower-total-cost path.
5. Every preset returns a complete path for a representative G–C–D–Em song.
6. Determinism: identical input → identical output.

Panel behind auth → no browser verification (project memory); verify with
`npm run lint`, `npm run test:run`, `npm run build`.

## Out of scope

- Per-chord manual voicing override (global cycle only, per decision 2).
- Persisting the chosen preset per song/user.
- Catalog additions (e.g. 3-string shell voicings for 7th chords) — fallback
  covers the gap; catalog work is a separate effort.
- PDF layout changes beyond exporting whatever the panel renders.
