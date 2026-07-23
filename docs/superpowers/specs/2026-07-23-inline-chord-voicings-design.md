# Inline chord voicings toggle — design

**Date:** 2026-07-23
**Status:** Approved (design)

## Summary

Add a third display toggle to the chord-sheet control bar, beside the existing
Nashville toggle: **Voicings**. When ON, a compact fretboard diagram is rendered
under each chord in the sheet, showing how to play that chord. A global preset
picks the voicing style for the whole song (reusing the existing voicing-flow
presets), and each individual chord occurrence can be cycled to an alternate
voicing independently.

This is a **screen-only** feature. It does not touch the PDF/print export
pipeline, and its packing/measurement invariants are unaffected.

## Requirements (confirmed)

- Toggle button sits beside the Nashville/Chords toggle in `TransposeControls`.
- When toggled ON, each chord in the sheet shows its voicing (mini fretboard).
- Voicing switching works like the existing Song-order voicings panel:
  - **Global preset cycler** — one control switches the whole song's voicings
    at once (Auto / Low neck / Mid neck / High neck / string sets), reusing
    `PRESETS` and `pickVoicingPath` from `src/lib/voicings/flow.js`.
  - **Per-chord override** — each chord occurrence can be cycled to an alternate
    voicing on its own; the override applies to that occurrence only.
- **Per occurrence** (not per chord name): the same chord appearing in multiple
  spots is treated as an independent instance, so voice-leading can give
  different voicings at different spots, and an override affects only that spot.
- **Persistence:** toggle on/off and the chosen global preset persist in
  `localStorage` (like `cv-nashville`). Per-occurrence overrides are in-memory
  only and reset on reload (they are keyed by token position, which is fragile
  across song edits).
- **Screen-only:** the toggle affects the on-screen view; PDF/print output is
  unchanged. No change to the export packing/measurement invariants.
- **Scope:** owner-facing `SongView` only. `ShareView` and the print path are
  out of scope.

## Existing pieces reused

- `src/lib/voicings/flow.js`
  - `PRESETS` — ordered preset list (`Auto`, `Low neck`, `Mid neck`,
    `High neck`, `Strings 1·2·3`, `Strings 2·3·4`, `Strings 3·4·5`).
  - `pickVoicingPath(chordNames, preset)` — Viterbi voice-leading pass over a
    chord sequence → one voicing per chord (per-occurrence). Returns
    `{ chord, voicing, frets, displayedName, offPreset }` per input, with
    `{ voicing: null, frets: null }` for chords lacking catalog voicings.
  - `candidatesForPreset(chordName, preset)` — all catalog candidates for one
    chord under a preset (used to cycle per-chord overrides).
- `src/components/voicings/FretboardDiagram.jsx` — renders one fretboard;
  accepts `frets`, `width`, `highlightRoot`, `chordName`, `compareFrets`.
- Nashville threading is the pattern to mirror: state in `SongView`, passed to
  `TransposeControls` (button) and through `ChordSheetPage` → `SongRenderer`.

## Component / data-flow design

### 1. Toggle UI — `src/components/song/TransposeControls.jsx`

- Add a **Voicings** button immediately after the Nashville button (after
  current line 170), inside the same `flex flex-wrap items-center gap-3` row.
  Two-state (on/off), styled like the other control buttons, using a fretboard
  or grid icon from `lucide-react`.
- When `voicings` is ON, render a **preset cycler** beside the button: a small
  `◂ label ▸` control identical in shape to the Song-order panel cycler
  (`SongVoicingsPanel.jsx:190-202`), showing `PRESETS[voicingPreset].label`.
- New props:
  - `voicings: boolean`
  - `onToggleVoicings: () => void`
  - `voicingPreset: number` (index into `PRESETS`)
  - `onCyclePreset: (dir: 1 | -1) => void`
- The cycler is only shown when `voicings` is true. `PRESETS` is imported from
  `src/lib/voicings/flow.js`.

### 2. State — `src/views/SongView.jsx`

- Add, near the existing `nashville` state (line ~102):
  - `const [voicingsInline, setVoicingsInline] = useLocalStorage("cv-voicings-inline", false)`
  - `const [voicingPreset, setVoicingPreset] = useLocalStorage("cv-voicing-preset", 0)`
- Handlers:
  - `onToggleVoicings={() => setVoicingsInline(v => !v)}`
  - `onCyclePreset={(dir) => setVoicingPreset(i => (i + dir + PRESETS.length) % PRESETS.length)}`
- Pass `voicings`, `voicingPreset` (and the handlers) to `TransposeControls`.
- Thread `voicings={voicingsInline}` and `voicingPreset={voicingPreset}` down
  through `ChordSheetPage` → `SongRenderer`, exactly as `nashville` is threaded
  (`SongView.jsx:602, 747, 1207, 1231`). The print instances of `SongRenderer`
  must NOT receive these (or must ignore them via `printMode`).

### 3. Inline render — `src/components/song/SongRenderer.jsx`

New props: `voicings = false`, `voicingPreset = 0`. Feature active only when
`voicings && !printMode`.

**Flat chord-token sequence (voice-leading input).** After `content` is
computed (transposed + optionally Nashville-annotated), build once (useMemo,
keyed on `content` + `voicingPreset`):

- Walk `content` in reading order. For every `chord_line` token whose trimmed
  text matches a chord (`/^[A-G][b#]?/`, same guard as
  `chordSequenceFromParsedContent`), assign a **running global index** and
  collect its (transposed) chord name.
- Do **not** collapse duplicates — every real chord token is its own instance
  (per-occurrence requirement; differs from
  `chordSequenceFromParsedContent`, which collapses consecutive dupes).
- Run `pickVoicingPath(names, PRESETS[voicingPreset])` → array of picks.
- Produce a map `globalIndex → { chord, frets, voicing, displayedName }`, plus a
  per-line list of the global indices belonging to that line's chord tokens.

**Rendering the diagram row.** During the existing group/band render, when a
chord line is emitted and the feature is active, render a **wrapped flex row**
directly beneath that chord line's text. For each chord token on the line, in
order, render a chip:

- chord name label,
- `FretboardDiagram` (`width ≈ 60`, `highlightRoot`, `chordName`),
- `◂ ▸` buttons to cycle this occurrence's voicing (per-chord override).
- Chords with no catalog voicing render a small muted "no voicing" placeholder
  chip.

The diagram row is a sibling element under the chord-line text within the same
group container. It must be marked `no-print` (or simply gated by `!printMode`,
which is stronger — the print `SongRenderer` never activates the feature) so it
never enters the export DOM.

### 4. Per-occurrence override — `src/components/song/SongRenderer.jsx`

- In-memory state: `const [voicingOverrides, setVoicingOverrides] = useState({})`
  — map `globalIndex → chosenFrets` (or the chosen candidate object).
- Cycling a chip: compute `candidatesForPreset(chord, PRESETS[voicingPreset])`,
  find the current pick's position in that list, advance by `dir`, store the new
  candidate under `globalIndex`.
- Resolved voicing for a token = `voicingOverrides[globalIndex] ?? pathPick`.
- **Changing the global preset clears overrides** (they are preset-relative):
  reset `voicingOverrides` to `{}` when `voicingPreset` changes.
- Overrides live only in `SongRenderer` local state → naturally reset on reload
  / remount, satisfying the in-memory-only requirement.

### 5. Interaction with existing modes

- Works alongside Nashville: the chord line still renders its tokens (plain,
  numbers, or stacked) via the existing `renderChordTextInline`; the diagram row
  is added underneath and is independent of Nashville mode. The diagram chip
  label uses the real chord name (`t.text`), matching how clicks already pass
  `t.text`.
- The existing click-to-open-drawer (`onChordClick`) is unaffected; the diagram
  row is additive.

## Testing

- **Unit tests** (new, colocated in `src/lib/voicings/` or a small helper
  module extracted from `SongRenderer`):
  - Flat chord-token sequence builder: reading order preserved, non-chord tokens
    skipped, duplicates NOT collapsed (per-occurrence), transposed names used.
  - Override resolution: `resolved = override ?? pathPick`; cycling advances
    within `candidatesForPreset`; preset change clears overrides.
- Extract the sequence-building + override logic into a small pure helper so it
  is unit-testable without rendering (keeps `SongRenderer` thin and testable).
- `npm run lint`, `npm run test:run`, `npm run build` all green.
- No `printLayout.test.jsx` / `pdfPacking.test.js` changes expected — feature is
  screen-only and never enters the print DOM. Confirm those suites stay green.

## Non-goals / YAGNI

- No PDF/print rendering of inline voicings.
- No `ShareView` support.
- No persistence of per-occurrence overrides.
- No pixel-precise alignment of diagrams under chord character columns
  (Approach 2/3 rejected) — diagrams render in a wrapped reading-order row.
- No new voicing data or catalog changes.
