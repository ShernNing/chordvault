# Smart lick/solo transpose positions — design

**Date:** 2026-07-23
**Status:** Approved (design)

## Summary

When a song is transposed, single-note solo/lick entries (in
`ElectricGuitarNotesPanel`) currently shift **naively on the same string**
(`fret + semitones`, octave-wrapped when they leave 0–24). This pushes notes to
awkward or unplayable neck positions. This feature relocates any note that would
land off the playable neck to a **same-pitch position on another string**,
chosen to stay near the rest of the lick so the run remains playable and
coherent.

Scope is **display-only**: the transposed read-only lick view shows smart
positions; stored data (in the song's original key), the edit grid, and the
"Save key" persistence path are all left untouched.

## Requirements (confirmed)

- **Always re-optimize on transpose** — the smart mapper runs on every
  transposed display (`semitones ≠ 0`); `semitones === 0` is identity.
- **Objective: minimal displacement from original fingering** — notes keep the
  naive same-string shifted position when it is playable; only notes forced off
  the neck are relocated, and relocated notes stay clustered near their
  neighbors ("not a random note far from the others").
- **Trigger: off the neck only** — a note is relocated only when its naive
  shifted fret leaves the playable range. Playable notes stay put.
- **Symmetric** — handle both off-the-top (fret > `MAX_FRET`) and
  off-the-bottom (fret < `MIN_FRET`) by relocating to a same-pitch playable
  position.
- **Pitch-preserving** — a relocated note sounds the **exact same transposed
  pitch** (same MIDI); only its `(string, fret)` changes.
- **Octave fallback (last resort)** — if a note's exact transposed pitch has no
  playable position on any string (0–`MAX_FRET`), shift that one note by ±1
  octave to the nearest playable octave (prefer the smaller shift). Only when
  truly unreachable.
- **Display-only scope** — applies to the transposed read-only lick display
  (`LickTabStrip`) only. `saveEntry` (edit round-trip) and `SongView`'s "Save
  key" persistence keep their existing naive behavior. Stored `electric_guitar_notes`
  stay in the original-key frame.

## Existing pieces reused

- `src/lib/voicings/notes.js`
  - `STRING_OPEN_MIDI = [40,45,50,55,59,64]` — standard tuning, index 0 = low E … 5 = high e.
  - `fretToMidi(stringIdx, fret) = STRING_OPEN_MIDI[stringIdx] + fret` — forward (string,fret)→MIDI.
- `src/components/song/ElectricGuitarNotesPanel.jsx`
  - Lick note shape: `{ string /*0–5, 0=low E*/, fret /*0–24*/, slideTo?, bend? }`.
  - `transposeLickEntry` (~lines 95–105) + `shiftFret` (~lines 88–93) — the
    current naive display transform. `LickTabStrip` (~lines 1375–1518) renders
    the transposed notes read-only.
- `MAX_FRET` convention: `src/lib/voicings/transpose.js` uses `MAX_FRET = 22`
  for playability; reuse 22 here. `MIN_FRET = 0` (open string).

## Component / algorithm design

### 1. New pure module — `src/lib/voicings/lickTranspose.js`

No React. One primary export plus small internal helpers.

```
smartTransposeLick(notes, semitones) -> notes[]
```

- `notes`: array of `{ string, fret, slideTo?, bend? }` in the current stored
  (original-key) frame.
- `semitones`: integer transpose offset.
- Returns a new array of the same length, each note transposed and possibly
  relocated: `{ string, fret, slideTo?, bend? }`. `bend` is passed through
  unchanged; `slideTo` is remapped (see §3). Original objects are not mutated.
- `semitones === 0` → returns notes unchanged (identity, new array is fine).

Constants: `MIN_FRET = 0`, `MAX_FRET = 22`, `W_STRING = 2` (string-cross penalty
weight, tunable), `NUM_STRINGS = 6`.

### 2. Algorithm — anchored relocation

**Step A — classify each note.**
For note `i`:
- `targetMidi = fretToMidi(note.string, note.fret) + semitones`
- `naiveFret = note.fret + semitones`, `naiveString = note.string`
- If `MIN_FRET ≤ naiveFret ≤ MAX_FRET`: **fixed anchor** — chosen position is
  `{ string: naiveString, fret: naiveFret }`, `relocate = false`.
- Else: **needs relocation** — carry `targetMidi`, `relocate = true`.

**Step B — candidate positions for a pitch.**
`candidatesForMidi(targetMidi)`:
- For each string `s` in `0..NUM_STRINGS-1`: `f = targetMidi - STRING_OPEN_MIDI[s]`;
  if `MIN_FRET ≤ f ≤ MAX_FRET`, add `{ string: s, fret: f }`.
- If the list is empty (unreachable): octave fallback — try
  `candidatesForMidi(targetMidi + 12)` and `candidatesForMidi(targetMidi - 12)`;
  choose the octave offset (`+12` or `-12`) that yields a non-empty list,
  preferring the smaller `|offset|` (tie → `-12`, i.e. drop, keeps it lower).
  If both octaves still empty (extreme; effectively never for ±12 transpose),
  fall back to a clamped naive position `{ string: naiveString, fret:
  clamp(naiveFret, MIN_FRET, MAX_FRET) }` so output is always defined.

**Step C — relocate runs.**
Walk the note sequence. Fixed anchors already have positions. For each maximal
run of consecutive `relocate` notes, bounded by `prevAnchorPos` (the chosen
position of the nearest fixed note before the run, or `null` if the run starts
the lick) and `nextAnchorPos` (nearest fixed note after the run, or `null`):

- Build a candidate layer per note in the run via `candidatesForMidi`.
- Run a short DP (Viterbi) minimizing total cost:
  - **distance(a, b)** `= |a.fret - b.fret| + W_STRING * |a.string - b.string|`.
  - Node entry cost for the first run note = `prevAnchorPos ? distance(prevAnchorPos, cand) : cand.fret` (no left anchor → prefer lower frets).
  - Edge cost between consecutive run notes = `distance(prevCand, cand)`.
  - Final: if `nextAnchorPos`, add `distance(lastCand, nextAnchorPos)` to each
    terminal path; pick the min-cost full path. If no right anchor, just pick
    min-cost path (with the low-fret bias already in entry cost).
- Assign the chosen candidate `{ string, fret }` to each note in the run.

This keeps every playable note exactly where the naive shift put it, and pulls
only forced notes onto nearby strings, clustered around the surrounding fixed
notes (or toward low frets when unanchored).

### 3. slideTo / bend handling

For each note, after its new `{ string, fret }` is chosen:
- **bend**: copied unchanged (semitone bend, position-independent).
- **slideTo** (present → a target fret on the *original* same string): remap to
  preserve the slide's target **pitch** on the note's **new** string:
  - `slidePitch = STRING_OPEN_MIDI[origString] + slideTo + semitones`
  - `newSlideTo = slidePitch - STRING_OPEN_MIDI[newString]`
  - Clamp `newSlideTo` to `[MIN_FRET, MAX_FRET]`. Slides stay single-string (on
    the note's new string). If `slideTo` was absent, it stays absent.

### 4. Wiring — `src/components/song/ElectricGuitarNotesPanel.jsx`

- Locate the **read-only transposed display** path for lick entries (the one
  feeding `LickTabStrip`, currently derived via `transposeLickEntry` /
  `shiftFret`). Replace the per-note naive shift there with
  `smartTransposeLick(entry.notes, semitones)` when `semitones !== 0`.
- Do **not** change: `saveEntry` (edit round-trip back to original frame), the
  editing grid state, or `SongView`'s "Save key" persistence (`SongView.jsx`
  ~191–208). Those keep the naive same-string shift. This preserves the
  original-key stored frame and avoids any smart-relocation inverse problem.
- Chord entries are unaffected (they already use `bestTransposeFrets`).

**Implementation note for the plan:** before wiring, confirm the exact call
site so the smart mapping affects only the read-only display, never the value
used to seed the edit grid or the save path. If `transposeLickEntry` is shared
between display and edit-seeding, introduce a display-only variant rather than
altering the shared one.

## Testing

Pure unit tests for `smartTransposeLick` (`src/lib/voicings/lickTranspose.test.js`):
- **Identity**: `semitones === 0` returns equivalent notes.
- **In-range unchanged**: a note whose naive shift stays in 0–22 keeps
  `{ string, fret }` = naive shift (e.g. low-E fret 3, +2 → low-E fret 5).
- **Off-top relocation**: a note that naively exceeds fret 22 relocates to a
  same-pitch position on a higher string at a lower fret; assert the relocated
  note's MIDI (`fretToMidi(newString, newFret)`) equals the target MIDI, and
  the fret is ≤ 22.
- **Off-bottom relocation (symmetric)**: transposing down below fret 0 relocates
  to a lower string, same pitch, fret ≥ 0.
- **Clustering**: with a fixed anchor neighbor, a relocated note picks the
  candidate nearest the anchor (assert chosen string/fret is the min-distance
  option, not a far one).
- **Octave fallback**: a note whose exact transposed pitch is unreachable on any
  string gets a ±12 octave shift to a playable position (assert playable and
  octave-related to target).
- **slideTo remap**: a note with `slideTo` that relocates strings has its
  `newSlideTo` preserve the slide-target pitch on the new string (clamped).
- **bend preserved**: `bend` value copied unchanged.
- Verify with `npm run lint`, `npm run test:run`, `npm run build`.

## Non-goals / YAGNI

- No change to stored data, the edit grid, or "Save key" persistence
  (display-only).
- No relocation of in-range (playable) notes — trigger is off-neck only.
- No alternate tunings / capo-aware fret math beyond the existing standard
  tuning in `notes.js`.
- No re-fingering heuristics beyond nearest-to-anchor distance (no ergonomic
  hand-span modeling, no finger assignment).
- No change to chord-type entries (they already use `bestTransposeFrets`).
