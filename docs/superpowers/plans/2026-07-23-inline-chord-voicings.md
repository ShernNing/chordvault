# Inline Chord Voicings Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Voicings" toggle beside the Nashville toggle that, when on, renders a compact fretboard diagram under each chord in the chord sheet, with a global voicing-preset cycler and per-chord-occurrence override.

**Architecture:** A pure helper (`inlineVoicings.js`) turns parsed content into a `key → voicing` map using the existing `pickVoicingPath` voice-leading engine, keyed per chord-token occurrence (`"lineIndex:tokenIndex"`). A presentational `InlineVoicingRow` renders a wrapped row of mini `FretboardDiagram`s under a chord line. `SongRenderer` owns the map memo + in-memory override state and injects the row under both paired and standalone chord lines. State (toggle + preset) lives in `SongView` via `useLocalStorage` and threads through `ChordSheetPage`. Screen-only: never rendered in `printMode` or the hidden measure mirror.

**Tech Stack:** React 18, Vite, Vitest, Tailwind CSS variables, existing `src/lib/voicings/*` engine, `lucide-react` icons.

---

## File Structure

- **Create** `src/lib/voicings/inlineVoicings.js` — pure functions: `CHORD_RE`, `collectChordSlots(content)`, `buildInlineVoicings(content, preset)`, `cycleVoicing(current, name, preset, dir)`. No React.
- **Create** `src/lib/voicings/inlineVoicings.test.js` — unit tests for the above.
- **Create** `src/components/song/InlineVoicingRow.jsx` — presentational wrapped row of mini fretboards for one chord line; per-chord ◂▸ cycling.
- **Modify** `src/components/song/SongRenderer.jsx` — new `voicings`/`voicingPreset` props; voicing-map memo; override state + clear effect; inject `InlineVoicingRow` in the pair branch and standalone chord-line path.
- **Modify** `src/components/song/TransposeControls.jsx` — Voicings toggle button + preset cycler.
- **Modify** `src/views/SongView.jsx` — `cv-voicings-inline` + `cv-voicing-preset` state; handlers; thread through `TransposeControls`, `ChordSheetPage`, and the visible `SongRenderer` (NOT the measure mirror).

**Chord-token identity (critical, used across files):** a chord slot key is the string `` `${lineIndex}:${tokenIndex}` `` where `lineIndex` is the index into the (transposed) `content` array and `tokenIndex` is the raw index within `line.tokens`. Both `collectChordSlots` and `InlineVoicingRow` MUST derive keys the same way, filtering tokens with the shared `CHORD_RE`.

---

## Task 1: Pure inline-voicing helpers

**Files:**
- Create: `src/lib/voicings/inlineVoicings.js`
- Test: `src/lib/voicings/inlineVoicings.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/voicings/inlineVoicings.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { PRESETS } from './flow'
import { collectChordSlots, buildInlineVoicings, cycleVoicing } from './inlineVoicings'

// A minimal parsed_content: two chord lines, "G C" then "C".
const content = [
  { type: 'chord_line', tokens: [
    { text: 'G', leadingSpaces: 0 },
    { text: 'C', leadingSpaces: 3 },
  ] },
  { type: 'lyric_line', text: 'hello there' },
  { type: 'chord_line', tokens: [
    { text: 'lol', leadingSpaces: 0 }, // not a chord — must be skipped
    { text: 'C', leadingSpaces: 2 },
  ] },
]

const AUTO = PRESETS[0]

describe('collectChordSlots', () => {
  it('collects chord tokens in reading order, skips non-chords, keys by line:token', () => {
    const slots = collectChordSlots(content)
    expect(slots).toEqual([
      { key: '0:0', name: 'G' },
      { key: '0:1', name: 'C' },
      { key: '2:1', name: 'C' }, // token index 1 within its line, non-chord at 0 skipped
    ])
  })

  it('does NOT collapse duplicate chords (per-occurrence)', () => {
    const slots = collectChordSlots(content)
    const cKeys = slots.filter(s => s.name === 'C').map(s => s.key)
    expect(cKeys).toEqual(['0:1', '2:1'])
  })

  it('returns [] for non-array input', () => {
    expect(collectChordSlots(null)).toEqual([])
  })
})

describe('buildInlineVoicings', () => {
  it('returns a map keyed like the slots, with real frets for known chords', () => {
    const map = buildInlineVoicings(content, AUTO)
    const g = map.get('0:0')
    expect(g).toBeTruthy()
    expect(g.name).toBe('G')
    expect(Array.isArray(g.frets)).toBe(true)
    expect(g.frets).toHaveLength(6)
    expect(map.get('2:1').name).toBe('C')
  })
})

describe('cycleVoicing', () => {
  it('advances to a different voicing and wraps around', () => {
    const map = buildInlineVoicings(content, AUTO)
    const start = map.get('0:0')
    const next = cycleVoicing(start, 'G', AUTO, 1)
    expect(next).toBeTruthy()
    expect(Array.isArray(next.frets)).toBe(true)
    // Cycling forward then back returns an equivalent fret signature.
    const back = cycleVoicing(next, 'G', AUTO, -1)
    const sig = f => f.map(v => (v == null ? 'x' : v)).join('-')
    expect(sig(back.frets)).toBe(sig(start.frets))
  })

  it('returns current unchanged when the chord has no catalog voicings', () => {
    const cur = { name: 'Zzz', voicing: null, frets: null, displayedName: 'Zzz', offPreset: false }
    expect(cycleVoicing(cur, 'Zzz', AUTO, 1)).toBe(cur)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/voicings/inlineVoicings.test.js`
Expected: FAIL — "Failed to resolve import ... inlineVoicings" / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/voicings/inlineVoicings.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/voicings/inlineVoicings.test.js`
Expected: PASS — all cases green. (If the `cycleVoicing` wrap test fails because `G` has only one Auto candidate, change the two cycle-test chords to a chord known to have multiple catalog voicings — inspect `src/lib/voicings/catalog.js` `TEMPLATES` and pick one, e.g. a chord with several shapes; adjust the test's chord name and re-run.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voicings/inlineVoicings.js src/lib/voicings/inlineVoicings.test.js
git commit -m "feat: add pure inline-voicing sequence + override helpers"
```

---

## Task 2: InlineVoicingRow component

**Files:**
- Create: `src/components/song/InlineVoicingRow.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/song/InlineVoicingRow.jsx`:

```jsx
import { ChevronLeft, ChevronRight } from 'lucide-react'
import FretboardDiagram from '../voicings/FretboardDiagram'
import { CHORD_RE } from '../../lib/voicings/inlineVoicings'

/**
 * Screen-only row of compact fretboard diagrams, one per chord token on a chord
 * line, rendered directly beneath that chord line when the Voicings toggle is on.
 *
 * Props:
 *   line       the chord_line object ({ tokens: [{ text, ... }] })
 *   lineIndex  index of this line within the rendered content array
 *   lookup     (key) => voicing object | null   (key = `${lineIndex}:${tokenIndex}`)
 *   onCycle    (key, name, dir) => void         (dir = 1 | -1)
 */
export default function InlineVoicingRow({ line, lineIndex, lookup, onCycle }) {
  if (!line?.tokens) return null

  const chips = []
  line.tokens.forEach((tok, ti) => {
    const name = (tok?.text || '').trim()
    if (!name || !CHORD_RE.test(name)) return
    chips.push({ key: `${lineIndex}:${ti}`, name })
  })
  if (!chips.length) return null

  return (
    <div className='inline-voicing-row no-print flex flex-wrap gap-2 mt-1 mb-2'>
      {chips.map(({ key, name }) => {
        const v = lookup(key)
        return (
          <div key={key} className='flex flex-col items-center gap-0.5 w-[68px]'>
            <span className='font-mono text-[10px] text-[var(--color-ink-soft)] leading-none'>
              {v?.displayedName || name}
            </span>
            {v?.frets ? (
              <FretboardDiagram
                frets={v.frets}
                width={64}
                highlightRoot
                chordName={v.displayedName || name}
              />
            ) : (
              <span className='text-[9px] italic text-[var(--color-ink-muted)] py-2'>
                no voicing
              </span>
            )}
            {v?.frets && (
              <div className='flex items-center gap-1'>
                <button
                  type='button'
                  aria-label={`Previous voicing for ${name}`}
                  onClick={() => onCycle(key, name, -1)}
                  className='text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                >
                  <ChevronLeft size={12} />
                </button>
                <button
                  type='button'
                  aria-label={`Next voicing for ${name}`}
                  onClick={() => onCycle(key, name, 1)}
                  className='text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles (lint)**

Run: `npm run lint`
Expected: PASS (no new errors for `InlineVoicingRow.jsx`). The component is not yet used — that's fine.

- [ ] **Step 3: Commit**

```bash
git add src/components/song/InlineVoicingRow.jsx
git commit -m "feat: add InlineVoicingRow mini-fretboard component"
```

---

## Task 3: Voicings toggle + preset cycler in TransposeControls

**Files:**
- Modify: `src/components/song/TransposeControls.jsx`

- [ ] **Step 1: Add imports and props**

In `src/components/song/TransposeControls.jsx`, update the icon import on line 1 to add `Guitar`, `ChevronLeft`, `ChevronRight`:

```jsx
import { RotateCcw, ChevronUp, ChevronDown, Hash, Guitar, ChevronLeft, ChevronRight } from "lucide-react";
```

Add the `PRESETS` import after the existing `nashville` import (after line 8):

```jsx
import { PRESETS } from "../../lib/voicings/flow";
```

Extend the props destructuring (lines 21-28) to add the four voicing props:

```jsx
export default function TransposeControls({
  originalKey,
  semitones = 0,
  capo = 0,
  onChange,
  nashville = false,
  onToggleNashville = null,
  voicings = false,
  onToggleVoicings = null,
  voicingPreset = 0,
  onCyclePreset = null,
}) {
```

- [ ] **Step 2: Add the button + cycler after the Nashville block**

Immediately after the Nashville block's closing `})()}` (current line 170) and before the `{/* ── Capo hint ── */}` comment (line 172), insert:

```jsx
      {/* ── Voicings (fretboard diagrams under each chord) ──────────────── */}
      {onToggleVoicings && (
        <div className='flex items-center gap-1'>
          <Tooltip
            content={
              voicings
                ? "Hide chord voicings under the chords"
                : "Show a fretboard diagram under each chord"
            }
          >
            <Button
              variant={voicings ? "primary" : "secondary"}
              size='sm'
              onClick={onToggleVoicings}
            >
              <Guitar size={12} /> Voicings
            </Button>
          </Tooltip>
          {voicings && onCyclePreset && (
            <div className='flex items-center rounded border border-[var(--color-border)] text-xs h-8'>
              <button
                type='button'
                onClick={() => onCyclePreset(-1)}
                aria-label='Previous voicing set'
                className='px-1.5 h-full flex items-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]'
              >
                <ChevronLeft size={14} />
              </button>
              <span className='px-1 min-w-[92px] text-center text-[var(--color-ink)]'>
                {PRESETS[voicingPreset]?.label || PRESETS[0].label}
              </span>
              <button
                type='button'
                onClick={() => onCyclePreset(1)}
                aria-label='Next voicing set'
                className='px-1.5 h-full flex items-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]'
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS (no unused-var or undefined errors in `TransposeControls.jsx`).

- [ ] **Step 4: Commit**

```bash
git add src/components/song/TransposeControls.jsx
git commit -m "feat: add Voicings toggle and preset cycler to TransposeControls"
```

---

## Task 4: SongRenderer integration

**Files:**
- Modify: `src/components/song/SongRenderer.jsx`

- [ ] **Step 1: Update imports**

Change line 1 to add `useMemo` and `useEffect`:

```jsx
import React, { useState, useMemo, useEffect } from "react";
```

Add these imports after line 5 (`normalizeSectionHeader ...`):

```jsx
import { PRESETS } from "../../lib/voicings/flow";
import { buildInlineVoicings, cycleVoicing } from "../../lib/voicings/inlineVoicings";
import InlineVoicingRow from "./InlineVoicingRow";
```

- [ ] **Step 2: Add props to SongRenderer**

Extend the `SongRenderer` prop list (currently ending at line 252 `nashville = false,`):

```jsx
export default function SongRenderer({
  parsedContent,
  semitones = 0,
  targetKey = null,
  twoColumn = false,
  printMode = false,
  onLineTypeOverride = null,
  onChordClick = null,
  fontSize = 14,
  nashville = false,
  voicings = false,
  voicingPreset = 0,
}) {
```

- [ ] **Step 3: Add voicing map, override state, and helpers**

Right after the existing `const [overrides, setOverrides] = useState({});` line (line 254), add:

```jsx
  const [voicingOverrides, setVoicingOverrides] = useState({});
  const showVoicings = voicings && !printMode;
```

Then, immediately after the `content` computation block (after line 264, the `annotateNashville(...)` assignment), add the memo + effect + helpers:

```jsx
  // Screen-only: one voicing per chord occurrence, keyed "lineIndex:tokenIndex".
  // Rebuilt when the song, transposition, or preset changes. `content` is a pure
  // function of these scalars, so depend on the scalars (not the fresh `content`
  // ref, which changes every render while transposing).
  const voicingMap = useMemo(
    () =>
      showVoicings
        ? buildInlineVoicings(content, PRESETS[voicingPreset] || PRESETS[0])
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showVoicings, parsedContent, semitones, targetKey, voicingPreset],
  );

  // Per-occurrence overrides are preset-relative and position-keyed, so drop them
  // when the preset, song, or transposition changes (keys/frets would be stale).
  useEffect(() => {
    setVoicingOverrides({});
  }, [voicingPreset, parsedContent, semitones, targetKey]);

  const lookupVoicing = (key) =>
    voicingOverrides[key] ?? voicingMap?.get(key) ?? null;

  const handleCycleVoicing = (key, name, dir) => {
    const current = lookupVoicing(key);
    const next = cycleVoicing(current, name, PRESETS[voicingPreset] || PRESETS[0], dir);
    setVoicingOverrides((prev) => ({ ...prev, [key]: next }));
  };

  const voicingRow = (line, lineIndex) =>
    showVoicings ? (
      <InlineVoicingRow
        line={line}
        lineIndex={lineIndex}
        lookup={lookupVoicing}
        onCycle={handleCycleVoicing}
      />
    ) : null;
```

Note: this block must be placed BEFORE the `if (!content || content.length === 0)` early-return guard would skip it — but hooks must run unconditionally. Place the `useMemo`/`useEffect` ABOVE the `if (!content ...) return (...)` guard (line 266). Move them so they sit right after the `content` assignment and before that guard. The plain (non-hook) helpers `lookupVoicing`/`handleCycleVoicing`/`voicingRow` may sit after the guard, but keeping them together after the hooks (still above the guard) is fine and simplest.

- [ ] **Step 4: Render the row in the pair branch**

In `renderGroup`, the `group.type === "pair"` branch (lines 354-373), insert `{voicingRow(chord, chordIndex)}` between the chord-line `<span>` and the lyric `<span>`:

```jsx
      return (
        <div
          key={getKey(group)}
          className={`chord-lyric-pair ${chord.uncertain ? "uncertain-line" : ""}`}
        >
          <span
            className={`chord-line ${hasNashvilleStack(chord, nashMode) ? "with-nash" : ""}`}
          >
            {chordContent}
          </span>
          {voicingRow(chord, chordIndex)}
          <span className='lyric-line'>{lyric.text}</span>
          {chord.uncertain && !printMode && onLineTypeOverride && (
            <UncertainOverlay
              label='Chord line?'
              onConfirm={() => handleOverride(chordIndex, "chord_line")}
              onReject={() => handleOverride(chordIndex, "lyric_line")}
            />
          )}
        </div>
      );
```

- [ ] **Step 5: Thread the row into standalone chord lines**

The `renderGroup` "single" path delegates to `<RenderLine>`. Pass `voicingRow` down. Update the `<RenderLine>` call (lines 376-384) to add the prop:

```jsx
    return (
      <RenderLine
        key={getKey(group)}
        line={group.line}
        index={group.index}
        printMode={printMode}
        onOverride={onLineTypeOverride ? handleOverride : null}
        onChordClick={!printMode ? onChordClick : null}
        nashMode={nashMode}
        voicingRow={voicingRow}
      />
    );
```

Update `RenderLine`'s signature (lines 415-422) to accept and forward it:

```jsx
function RenderLine({
  line,
  index,
  printMode,
  onOverride,
  onChordClick,
  nashMode = "off",
  voicingRow = null,
}) {
```

In `RenderLine`'s `case "chord_line":` (lines 431-442), pass `voicingRow` to `<ChordLineRender>`:

```jsx
    case "chord_line":
      return (
        <ChordLineRender
          key={index}
          line={line}
          index={index}
          printMode={printMode}
          onOverride={onOverride}
          onChordClick={onChordClick}
          nashMode={nashMode}
          voicingRow={voicingRow}
        />
      );
```

Update `ChordLineRender`'s signature (lines 481-488) to accept it:

```jsx
function ChordLineRender({
  line,
  index,
  printMode,
  onOverride,
  onChordClick,
  nashMode = "off",
  voicingRow = null,
}) {
```

In `ChordLineRender`'s returned JSX, insert `{voicingRow?.(line, index)}` right after the closing `</span>` of the `chord-line` span (after line 503):

```jsx
      <span
        className={`chord-line ${hasNashvilleStack(line, nashMode) ? "with-nash" : ""}`}
      >
        {chordContent}
      </span>
      {voicingRow?.(line, index)}
```

- [ ] **Step 6: Lint + run existing tests**

Run: `npm run lint && npm run test:run`
Expected: PASS. In particular `src/components/song/printLayout.test.jsx` and `src/lib/pdfPacking.test.js` stay green — the feature is gated by `!printMode`, so print output is byte-identical.

- [ ] **Step 7: Commit**

```bash
git add src/components/song/SongRenderer.jsx
git commit -m "feat: render inline voicing rows under chord lines (screen only)"
```

---

## Task 5: Wire state through SongView

**Files:**
- Modify: `src/views/SongView.jsx`

- [ ] **Step 1: Add the PRESETS import**

After line 49 (`import { bestTransposeFrets } ...`), add:

```jsx
import { PRESETS } from "../lib/voicings/flow";
```

- [ ] **Step 2: Add persisted state**

After line 102 (`const [nashville, setNashville] = useLocalStorage("cv-nashville", false);`), add:

```jsx
  const [voicingsInline, setVoicingsInline] = useLocalStorage(
    "cv-voicings-inline",
    false,
  );
  const [voicingPreset, setVoicingPreset] = useLocalStorage(
    "cv-voicing-preset",
    0,
  );
```

- [ ] **Step 3: Pass props to TransposeControls**

Update the `<TransposeControls>` usage (lines 597-604) to add the four voicing props:

```jsx
        <TransposeControls
          originalKey={song.original_key}
          semitones={transpose.semitones}
          capo={transpose.capo}
          onChange={handleTransposeChange}
          nashville={nashville}
          onToggleNashville={() => setNashville(cycleNashville)}
          voicings={voicingsInline}
          onToggleVoicings={() => setVoicingsInline((v) => !v)}
          voicingPreset={voicingPreset}
          onCyclePreset={(dir) =>
            setVoicingPreset((i) => (i + dir + PRESETS.length) % PRESETS.length)
          }
        />
```

- [ ] **Step 4: Pass props to ChordSheetPage**

Update the `<ChordSheetPage>` usage (lines 736-748) to add:

```jsx
      <ChordSheetPage
        song={song}
        semitones={shapeSemitones}
        targetKey={shapeKey}
        twoColumn={twoColumn}
        onTwoColumnChange={setTwoColumn}
        printRef={printRef}
        fontSize={fontSize}
        onReload={reload}
        onLineTypeOverride={handleLineTypeOverride}
        onChordClick={setActiveVoicingChord}
        nashville={nashville}
        voicings={voicingsInline}
        voicingPreset={voicingPreset}
      />
```

- [ ] **Step 5: Accept props in ChordSheetPage and pass to the VISIBLE SongRenderer only**

Update `ChordSheetPage`'s signature (lines 1134-1145) to add the two props:

```jsx
function ChordSheetPage({
  song,
  semitones,
  targetKey,
  twoColumn,
  printRef,
  fontSize = 14,
  onReload,
  onLineTypeOverride,
  onChordClick,
  nashville = false,
  voicings = false,
  voicingPreset = 0,
}) {
```

Update ONLY the visible `<SongRenderer>` (lines 1199-1208) to receive them:

```jsx
        <SongRenderer
          parsedContent={song.parsed_content}
          semitones={semitones}
          targetKey={targetKey}
          twoColumn={effectiveTwoCol}
          fontSize={fontSize}
          onLineTypeOverride={onLineTypeOverride}
          onChordClick={onChordClick}
          nashville={nashville}
          voicings={voicings}
          voicingPreset={voicingPreset}
        />
```

Do NOT add `voicings`/`voicingPreset` to the hidden measure-mirror `<SongRenderer>` (lines 1225-1232). That mirror measures natural single-column height for the two-column decision; adding diagrams would inflate the measurement and corrupt column layout. Leave it exactly as-is.

- [ ] **Step 6: Lint, test, build**

Run: `npm run lint && npm run test:run && npm run build`
Expected: all PASS. No changes to `printLayout`/`pdfPacking` test results.

- [ ] **Step 7: Commit**

```bash
git add src/views/SongView.jsx
git commit -m "feat: persist inline voicings toggle + preset in SongView"
```

---

## Task 6: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server and open a song**

Use the preview tooling (`preview_start` with the dev-server launch config, or create `.claude/launch.json` for `npm run dev`). Note: most authed views can't be browser-verified here (cloud Supabase + auth — see project memory). If auth blocks the song view, rely on the automated suites from Tasks 1/4/5 plus a manual pass by the user, and record that in the final report instead of forcing a browser check.

If the song view IS reachable:

- [ ] **Step 2: Toggle Voicings on**

Click the new **Voicings** button beside Nashville. Confirm a row of mini fretboards appears under each chord line, in reading order, one per chord token. Chords with no catalog voicing show a muted "no voicing" chip.

- [ ] **Step 3: Cycle the global preset**

Click ◂ / ▸ next to the toggle. Confirm the preset label changes (Auto → Low neck → …) and the whole song's diagrams update. Confirm per-chord overrides reset when the preset changes.

- [ ] **Step 4: Per-chord override**

Click ◂ / ▸ under one chord's diagram. Confirm only that occurrence changes; other occurrences of the same chord are unaffected.

- [ ] **Step 5: Persistence + print**

Reload the page: toggle state and preset persist; per-chord overrides reset (expected). Trigger PDF export / print preview and confirm NO fretboard diagrams appear in the print output (screen-only).

- [ ] **Step 6: Final report**

Summarize what was verified (and what could not be browser-verified due to auth), with `npm run lint`/`test:run`/`build` results.

---

## Self-Review Notes

- **Spec coverage:** toggle beside Nashville → Task 3/5; diagram under each chord → Task 2/4; global preset cycler → Task 3/5 + `voicingPreset` memo (Task 4); per-occurrence override → Task 1 `cycleVoicing` + Task 4 override state; per-occurrence (no dup collapse) → Task 1 test; persist toggle+preset / in-memory overrides → Task 5 `useLocalStorage` + Task 4 `useState`+clear effect; screen-only / no PDF → `!printMode` gate + measure-mirror exclusion (Task 4/5); ShareView out of scope → untouched.
- **Type/name consistency:** slot key `"lineIndex:tokenIndex"` and `CHORD_RE` are defined once in `inlineVoicings.js` and reused by `InlineVoicingRow`; voicing object shape `{ name, voicing, frets, displayedName, offPreset }` is identical across `buildInlineVoicings`, `cycleVoicing`, and `lookupVoicing`.
- **Known limitation (accepted):** two-column split height (`SCREEN_COLUMN_HEIGHT`) does not account for diagram-row height, so columns may look uneven when voicings are on. Screen-only, non-blocking; out of scope per spec.
