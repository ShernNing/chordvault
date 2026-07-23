# Smart Lick/Solo Transpose Positions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a song is transposed, relocate any solo/lick note that would land off the playable neck to a same-pitch position on another string, chosen to stay near the rest of the lick — display-only.

**Architecture:** A new pure module `src/lib/voicings/lickTranspose.js` exposes `smartTransposeLick(notes, semitones)`, which keeps playable naive-shifted notes as fixed anchors and relocates off-neck notes via a short anchored DP over same-pitch candidate positions. `ElectricGuitarNotesPanel` renders its read-only lick list from a new `rendered` memo that uses this mapper for licks, while the existing naive `displayed` memo (which seeds editing and the save inverse) is left unchanged.

**Tech Stack:** React 18, Vite, Vitest, existing `src/lib/voicings/notes.js` tuning primitives (`STRING_OPEN_MIDI`, `fretToMidi`).

---

## File Structure

- **Create** `src/lib/voicings/lickTranspose.js` — pure: `smartTransposeLick(notes, semitones)` + internal helpers (`positionsForMidi`, `candidatesForMidi`, `pickRun`). No React.
- **Create** `src/lib/voicings/lickTranspose.test.js` — unit tests.
- **Modify** `src/components/song/ElectricGuitarNotesPanel.jsx` — add a `rendered` memo (smart for lick entries) and render the read-only list from it; leave `displayed` (naive) as the source for `startEdit` and unchanged save path.

**Data shapes (from the codebase):**
- Lick note: `{ string /* 0–5, 0 = low E, 5 = high e */, fret /* int */, slideTo? /* int fret on same string */, bend? /* semitones */ }`.
- Tuning: `STRING_OPEN_MIDI = [40, 45, 50, 55, 59, 64]` (`src/lib/voicings/notes.js:4`); `fretToMidi(stringIdx, fret) = STRING_OPEN_MIDI[stringIdx] + fret` (`notes.js:13`).
- Playable range: `MIN_FRET = 0`, `MAX_FRET = 22`.

---

## Task 1: Pure smart-transpose module

**Files:**
- Create: `src/lib/voicings/lickTranspose.js`
- Test: `src/lib/voicings/lickTranspose.test.js`

TDD: test first, run (fail), implement, run (pass), commit.

- [ ] **Step 1: Write the failing test** — create `src/lib/voicings/lickTranspose.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { STRING_OPEN_MIDI, fretToMidi } from './notes'
import { smartTransposeLick } from './lickTranspose'

const midiOf = (n) => fretToMidi(n.string, n.fret)

describe('smartTransposeLick', () => {
  it('is identity when semitones is 0', () => {
    const notes = [{ string: 0, fret: 3 }, { string: 2, fret: 7, bend: 2 }]
    expect(smartTransposeLick(notes, 0)).toEqual(notes)
  })

  it('leaves an in-range note on the same string (naive shift)', () => {
    // low E (string 0) fret 3, +2 -> fret 5, still in 0..22
    const out = smartTransposeLick([{ string: 0, fret: 3 }], 2)
    expect(out[0]).toEqual({ string: 0, fret: 5 })
  })

  it('relocates an off-the-top note to a same-pitch playable position', () => {
    // low E fret 20 (midi 60), +5 -> naive fret 25 (off neck). target midi 65.
    const out = smartTransposeLick([{ string: 0, fret: 20 }], 5)
    expect(midiOf(out[0])).toBe(65)           // exact same pitch preserved
    expect(out[0].fret).toBeLessThanOrEqual(22)
    expect(out[0].fret).toBeGreaterThanOrEqual(0)
  })

  it('relocates an off-the-bottom note (symmetric) to a same-pitch position', () => {
    // high e (string 5) fret 2 (midi 66), -7 -> naive fret -5 (off). target midi 59.
    const out = smartTransposeLick([{ string: 5, fret: 2 }], -7)
    expect(midiOf(out[0])).toBe(59)
    expect(out[0].fret).toBeGreaterThanOrEqual(0)
  })

  it('clusters a relocated note near a fixed anchor neighbor', () => {
    // note0: string0 fret10 (midi50) +5 -> fret15 in range => anchor {0,15}
    // note1: string0 fret20 (midi60) +5 -> naive fret25 off, target midi65.
    // candidates for 65: s1 f20, s2 f15, s3 f10, s4 f6, s5 f1.
    // nearest to anchor {0,15} by |dfret| + 2*|dstring| is {string:2, fret:15} (cost 4).
    const out = smartTransposeLick(
      [{ string: 0, fret: 10 }, { string: 0, fret: 20 }],
      5,
    )
    expect(out[0]).toEqual({ string: 0, fret: 15 }) // anchor unchanged
    expect(out[1]).toEqual({ string: 2, fret: 15 }) // clustered near anchor
    expect(midiOf(out[1])).toBe(65)
  })

  it('octave-fallbacks when the exact pitch is unreachable on any string', () => {
    // high e fret 20 (midi 84), +5 -> target midi 89 (> highest playable 86).
    // fallback -12 -> midi 77, which is playable.
    const out = smartTransposeLick([{ string: 5, fret: 20 }], 5)
    expect(out[0].fret).toBeGreaterThanOrEqual(0)
    expect(out[0].fret).toBeLessThanOrEqual(22)
    // resulting pitch is octave-related to the unreachable target 89
    expect((89 - midiOf(out[0])) % 12).toBe(0)
    expect(midiOf(out[0])).toBeLessThan(89)
  })

  it('remaps slideTo to preserve the slide-target pitch on the new string', () => {
    // string0 fret20 slideTo22 (slide target midi 62), +5.
    // note relocates (single note -> lowest fret candidate for midi 65 = string5 fret1).
    // slide target pitch 62+5=67 -> on string5: 67-64 = fret 3.
    const out = smartTransposeLick([{ string: 0, fret: 20, slideTo: 22 }], 5)
    expect(out[0]).toEqual({ string: 5, fret: 1, slideTo: 3 })
    expect(STRING_OPEN_MIDI[out[0].string] + out[0].slideTo).toBe(67)
  })

  it('passes bend through unchanged', () => {
    const out = smartTransposeLick([{ string: 0, fret: 3, bend: 2 }], 2)
    expect(out[0]).toEqual({ string: 0, fret: 5, bend: 2 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/voicings/lickTranspose.test.js`
Expected: FAIL — cannot resolve `./lickTranspose`.

- [ ] **Step 3: Write the implementation** — create `src/lib/voicings/lickTranspose.js`:

```js
// Smart display-time transpose for single-note licks/solos.
//
// Naive transpose shifts every note on the same string by `semitones`, which can
// push notes off the playable neck. This keeps playable notes exactly where the
// naive shift puts them (fixed anchors) and relocates only off-neck notes to a
// same-pitch position on another string, chosen (via a short DP) to stay near the
// surrounding fixed notes so the run remains a playable, clustered run.
//
// Pure module (no React). Notes are { string, fret, slideTo?, bend? } with
// string 0 = low E … 5 = high e. Pitch is preserved exactly except for a
// last-resort octave shift when a note's target pitch is unreachable on any string.

import { STRING_OPEN_MIDI, fretToMidi } from './notes'

const MIN_FRET = 0
const MAX_FRET = 22
const NUM_STRINGS = 6
const W_STRING = 2 // cost weight per string crossed, relative to one fret of travel

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Every playable (string, fret) that sounds exactly `midi`.
function positionsForMidi(midi) {
  const out = []
  for (let s = 0; s < NUM_STRINGS; s++) {
    const f = midi - STRING_OPEN_MIDI[s]
    if (f >= MIN_FRET && f <= MAX_FRET) out.push({ string: s, fret: f })
  }
  return out
}

// Candidate positions for a target pitch, with octave fallback when the exact
// pitch is unreachable. Prefers the smaller octave offset; ties drop (-12) so the
// result stays lower on the neck. If still unreachable, returns a clamped naive
// position so output is always defined.
function candidatesForMidi(targetMidi, naiveString, naiveFret) {
  let cands = positionsForMidi(targetMidi)
  if (cands.length) return cands
  for (const off of [-12, 12]) {
    cands = positionsForMidi(targetMidi + off)
    if (cands.length) return cands
  }
  return [{ string: naiveString, fret: clamp(naiveFret, MIN_FRET, MAX_FRET) }]
}

const dist = (a, b) =>
  Math.abs(a.fret - b.fret) + W_STRING * Math.abs(a.string - b.string)

// Viterbi over a run of candidate layers, anchored by the fixed positions before
// (prevAnchor) and after (nextAnchor) the run. With no left anchor, bias toward
// low frets so an unanchored run doesn't drift up the neck.
function pickRun(layers, prevAnchor, nextAnchor) {
  const n = layers.length
  const cost = layers.map((l) => l.map(() => Infinity))
  const back = layers.map((l) => l.map(() => -1))

  layers[0].forEach((c, j) => {
    cost[0][j] = prevAnchor ? dist(prevAnchor, c) : c.fret
  })
  for (let i = 1; i < n; i++) {
    layers[i].forEach((c, j) => {
      for (let k = 0; k < layers[i - 1].length; k++) {
        const t = cost[i - 1][k] + dist(layers[i - 1][k], c)
        if (t < cost[i][j]) {
          cost[i][j] = t
          back[i][j] = k
        }
      }
    })
  }

  let best = Infinity
  let bj = 0
  layers[n - 1].forEach((c, j) => {
    const t = cost[n - 1][j] + (nextAnchor ? dist(c, nextAnchor) : 0)
    if (t < best) {
      best = t
      bj = j
    }
  })

  const picks = new Array(n)
  let j = bj
  for (let i = n - 1; i >= 0; i--) {
    picks[i] = layers[i][j]
    j = back[i][j] < 0 ? 0 : back[i][j]
  }
  return picks
}

/**
 * Transpose lick notes by `semitones` for display, relocating off-neck notes.
 * Returns a new array (originals not mutated). `semitones === 0` is identity.
 */
export function smartTransposeLick(notes, semitones) {
  const list = notes || []
  if (!semitones) return list.map((n) => ({ ...n }))

  // Step A — classify each note as a fixed anchor (naive shift stays playable) or
  // needing relocation (naive shift leaves 0..MAX_FRET).
  const info = list.map((n) => {
    const targetMidi = fretToMidi(n.string, n.fret) + semitones
    const naiveFret = n.fret + semitones
    const inRange = naiveFret >= MIN_FRET && naiveFret <= MAX_FRET
    return {
      note: n,
      targetMidi,
      naiveString: n.string,
      naiveFret,
      pos: inRange ? { string: n.string, fret: naiveFret } : null,
      relocate: !inRange,
    }
  })

  // Step C — relocate each maximal run of consecutive off-neck notes, anchored by
  // the fixed positions on either side.
  let i = 0
  while (i < info.length) {
    if (!info[i].relocate) {
      i++
      continue
    }
    let end = i
    while (end < info.length && info[end].relocate) end++
    const prevAnchor = i > 0 ? info[i - 1].pos : null
    const nextAnchor = end < info.length ? info[end].pos : null
    const layers = []
    for (let k = i; k < end; k++) {
      layers.push(
        candidatesForMidi(info[k].targetMidi, info[k].naiveString, info[k].naiveFret),
      )
    }
    const picks = pickRun(layers, prevAnchor, nextAnchor)
    for (let k = i; k < end; k++) info[k].pos = picks[k - i]
    i = end
  }

  // Build output: chosen position, slideTo remapped to preserve its pitch on the
  // note's new string, bend passed through unchanged.
  return info.map(({ note, pos }) => {
    const out = { string: pos.string, fret: pos.fret }
    if (note.slideTo != null) {
      const slidePitch = STRING_OPEN_MIDI[note.string] + note.slideTo + semitones
      out.slideTo = clamp(slidePitch - STRING_OPEN_MIDI[pos.string], MIN_FRET, MAX_FRET)
    }
    if (note.bend != null) out.bend = note.bend
    return out
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/voicings/lickTranspose.test.js`
Expected: PASS — all 8 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voicings/lickTranspose.js src/lib/voicings/lickTranspose.test.js
git commit -m "feat: add smart lick transpose (relocate off-neck notes to playable positions)"
```

---

## Task 2: Wire smart transpose into the read-only lick display

**Files:**
- Modify: `src/components/song/ElectricGuitarNotesPanel.jsx`

Read the file around lines 80–160 and 185–310 first to confirm current positions.

- [ ] **Step 1: Add the import**

Near the top of `ElectricGuitarNotesPanel.jsx`, with the other `../../lib/voicings/*` imports, add:

```jsx
import { smartTransposeLick } from "../../lib/voicings/lickTranspose";
```

- [ ] **Step 2: Add a `rendered` memo (smart for licks) after the existing `displayed` memo**

The file currently has (around line 157):

```jsx
  const displayed = useMemo(
    () => stored.map((e) => transposeForDisplay(e, semitones, displayKey)),
    [stored, semitones, displayKey],
  );
```

Leave that exactly as-is (it seeds `startEdit` and the save inverse — must stay naive). Immediately after it, add:

```jsx
  // Read-only render frame: lick entries use smart relocation (off-neck notes
  // moved to same-pitch playable positions near their neighbors); chord entries
  // and the naive-shift edit/save path are unchanged. Editing still seeds from the
  // naive `displayed` memo, so relocation never corrupts the stored original-key
  // frame (see docs/superpowers/specs/2026-07-23-smart-lick-transpose-design.md).
  const rendered = useMemo(
    () =>
      stored.map((e) =>
        entryType(e) === "lick"
          ? { ...e, notes: smartTransposeLick(e.notes || [], semitones) }
          : transposeForDisplay(e, semitones, displayKey),
      ),
    [stored, semitones, displayKey],
  );
```

(`entryType` and `transposeForDisplay` are already defined/used in this file.)

- [ ] **Step 3: Render the read-only list from `rendered`**

Find the two places that consume `displayed` for rendering the list (NOT `startEdit`):

The empty-state check (around line 298):

```jsx
          {displayed.length === 0 && editingId !== "new" && (
```

Change to:

```jsx
          {rendered.length === 0 && editingId !== "new" && (
```

The list map (around line 306):

```jsx
          {groupBySection(displayed).map(({ section, entries }) => (
```

Change to:

```jsx
          {groupBySection(rendered).map(({ section, entries }) => (
```

Leave `startEdit` (around line 186, `const live = displayed.find((e) => e.id === entry.id);`) using `displayed` unchanged — this keeps editing in the naive frame. The entry ids in `rendered` and `displayed` are identical (same `stored` entries, ids untouched), so `startEdit(entry)` still resolves correctly.

- [ ] **Step 4: Lint, test, build**

Run: `npm run lint && npm run test:run && npm run build`
Expected: all PASS. `displayed` is still referenced by `startEdit`, so no unused-variable lint error.

- [ ] **Step 5: Commit**

```bash
git add src/components/song/ElectricGuitarNotesPanel.jsx
git commit -m "feat: show smart-relocated lick positions in transposed display"
```

---

## Task 3: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Note the environment constraint**

Per project memory, `ElectricGuitarNotesPanel` lives behind cloud Supabase auth and can't be browser-verified in this environment. Rely on the unit tests (Task 1) + lint/build. If the panel IS reachable, do the steps below; otherwise record that verification rested on the automated suites.

- [ ] **Step 2: If reachable — verify behavior**

Open a song with a lick entry near the top of the neck. Transpose up several semitones until the naive positions would exceed fret 22. Confirm the read-only tab strip shows the notes relocated to lower frets on higher strings (same pitches), clustered near the un-moved notes — not scattered far away. Transpose down past open position and confirm symmetric relocation to lower strings. Confirm that at 0 semitones the display is unchanged, and that clicking Edit still shows the note grid in the original (naive) frame.

- [ ] **Step 3: Final report**

Summarize verification (automated + any manual), with lint/test/build results.

---

## Self-Review Notes

- **Spec coverage:** always re-optimize on transpose → `rendered` recomputes on `semitones` change (Task 2); minimal displacement / anchors → Step A classification keeps in-range notes fixed (Task 1); off-neck-only trigger → `relocate = !inRange` (Task 1); symmetric → `naiveFret < MIN_FRET || > MAX_FRET` both mark relocate (Task 1); pitch-preserving → `positionsForMidi` only emits exact-pitch positions (Task 1); octave fallback → `candidatesForMidi` `[-12, 12]` (Task 1, tested); display-only scope → separate `rendered` memo, `displayed`/save untouched (Task 2); slideTo remap + bend passthrough → output builder (Task 1, tested).
- **Type/name consistency:** `smartTransposeLick(notes, semitones)` signature identical across the module, tests, and the panel call site; note shape `{ string, fret, slideTo?, bend? }` consistent throughout; helper names `positionsForMidi`/`candidatesForMidi`/`pickRun` used consistently.
- **Known tradeoff (accepted, scope A):** the read-only display can show a note on a different string than the edit grid does (edit stays in the naive frame). This is intentional — editing/persistence remain in the untouched original-key frame to avoid any relocation round-trip corruption. Documented in the spec's non-goals.
