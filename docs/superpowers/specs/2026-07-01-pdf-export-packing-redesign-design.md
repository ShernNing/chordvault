# PDF Export — Setlist Packing Redesign

**Date:** 2026-07-01
**Scope:** Setlist PDF export page-packing only. Segment-aware numbering is a
separate, later spec (user sequenced "packing fix first, then segments").

## Problem

Setlist PDF export (`handleExportPDF` in `src/views/SetlistView.jsx`) bin-packs
songs into A4 pages. A song whose longest line is wider than a half-page column
(`getMaxLineChars > MAX_HALF_COL_CHARS`, currently 45) is classified "wide" and:

1. **flushes** the current page (emitting it even if a column is empty), then
2. is emitted as its own **full-page** sheet (`type: 'single'`).

Result seen in the reported export: songs 1 & 2 (narrow) fill page 1's left
column; page 1's right column *and* lower area sit empty; song 3 (wide but
short — "Because He Lives") is orphaned onto page 2. Page 1 could hold song 3
below songs 1 & 2 at full width.

Secondary defect: wide songs are height-measured at half-column width (357px),
which over-estimates their height (extra wrapping). Harmless today (they always
get their own page) but wrong once we stack them.

## Decision (from brainstorming)

- **Segments** will be modeled later as **divider rows** in the setlist. Out of
  scope here.
- A song too wide for a half column is **not** shrunk or wrapped.
- Instead, a wide-but-short song is rendered **full-width, stacked below** the
  narrow 2-column region on the same page when it fits vertically ("mixed
  layout"). Approved mockup:

  ```
  PAGE 1
  ┌─────────────┬─────────────┐
  │ 1. Awesome  │ (right col   │   ← cols band (column-major)
  │ 2. Praise   │  empty)      │
  ├─────────────┴─────────────┤
  │ 3. Because He Lives        │   ← full band, full width
  └───────────────────────────┘
  ```

## Model

A page is an ordered vertical stack of **bands**:

| Band   | Content         | Width          | Layout                                   |
|--------|-----------------|----------------|------------------------------------------|
| `cols` | narrow song(s)  | 357px × 2      | column-major waterfall (fill left, then right) |
| `full` | one wide song   | 746px          | full width                               |

Geometry (unchanged): print wrapper content width = 794 − 48 padding = 746px;
half column = (746 − 32 gap) / 2 = 357px; usable page height
`PAGE_COL_HEIGHT = 1087`; inter-song gap `SONG_GAP = 16`.

"Narrow" vs "wide" keeps the existing char heuristic
(`getMaxLineChars(content) <= MAX_HALF_COL_CHARS`). Chord lines are
`white-space: pre` (no wrap), so the heuristic guards real chord-line overflow.

## Packer — `packPages(items, opts)` (pure function, new module `src/lib/pdfPacking.js`)

Input: ordered `items`, each `{ id, fitsHalf: boolean, height: number }`
(height already measured at the correct width — 357px for narrow, 746px for
wide). Opts: `{ pageHeight = 1087, gap = 16 }`.

Output: ordered `pages`, each `pages[i] = { bands: Band[] }` where
- `{ type: 'cols', left: Item[], right: Item[] }`
- `{ type: 'full', item: Item }`

Algorithm (order-preserving, greedy, one page at a time). State per page:
`usedAbove` = summed height (+gaps) of already-closed bands; an optional **open
`cols` band** at the bottom with running `leftH`, `rightH`.

For each item in order:

- **Narrow** (`fitsHalf`):
  - `avail = pageHeight − usedAbove − (open cols band ? gap : 0)`.
  - Waterfall into the open cols band within `avail`: fill left until the next
    song would exceed `avail`, then right; column height counts `SONG_GAP`
    between stacked songs.
  - If it fits the open band → add. If no open band → open one (avail =
    `pageHeight − usedAbove`) and add. If neither column can take it → **new
    page**, open fresh cols band, add (first-item-on-page always placed even if
    it overflows).

- **Wide** (`!fitsHalf`):
  - Close the open cols band: its height = `max(leftH, rightH)`; add to
    `usedAbove` (+ gap if it followed other bands).
  - `avail = pageHeight − usedAbove − (usedAbove > 0 ? gap : 0)`.
  - If `item.height <= avail` → append `full` band to current page.
  - Else if page already has bands → **new page**, append `full` band (fresh
    page avail = `pageHeight`; if still taller than a page it's allowed to
    overflow → renderer applies internal 2-col split).
  - Else (empty page) → append `full` band here.
  - A `full` band closes the page's cols region; the next narrow item opens a
    new cols band below it.

First item on any page is always placed (matches existing rule; prevents
infinite loop on an oversized song).

## Measurement changes (`SetlistView.jsx`)

Measure each song at the width it will render:
- narrow songs → 357px hidden div (as today) via `SingleSongForColumn`;
- wide songs → 746px hidden div via `PrintableSongSheet` (captures internal
  2-col height when `> 45` non-blank lines).

Produce `items = [{ id: globalIdx, fitsHalf, height, slotData }]`, call
`packPages`, then render.

## Renderer (`src/components/song/SongRenderer.jsx`)

Replace the per-page `single | multi` branching in `handleExportPDF`
(`SetlistView.jsx:383-415`) and the standalone `MultiSongPage` with a single
`PrintPage({ bands })` component:
- `cols` band → existing two-column flex (`SingleSongForColumn` per item, left
  then right; single column when right is empty), wrapped so consecutive bands
  stack with `SONG_GAP`.
- `full` band → `PrintableSongSheet` (keeps `nonBlankLines > 45` internal 2-col
  split for tall songs).

One `PrintPage` renders per `pages[]` entry into one print container →
`exportSetlistToPDF` (unchanged; one container = one page image, may still
paginate internally for over-tall full songs).

## Numbering

Unchanged: global `songNumber = globalIdx + 1`, passed into items. `packPages`
never inspects numbers, so segment-aware numbering (next spec) only changes how
`songNumber` is computed upstream — no packer change needed.

## Testing

`packPages` is pure → `src/lib/pdfPacking.test.js` (vitest):
- two narrow + one short wide → single page: cols band [1,2] + full band [3];
- short wide that does NOT fit remaining height → wide on next page;
- wide taller than a full page → its own page (own `full` band);
- many narrow → column-major waterfall across left then right, then new page;
- narrow after a full band → new cols band below it;
- first oversized item still placed (no infinite loop);
- order preserved throughout.

Browser verification is blocked (cloud Supabase auth) per project memory;
rely on unit tests + `npm run test:run`, lint, and build.

## Out of scope

- Segment divider rows (data model, editor UI, per-segment numbering reset).
- DOCX export path (`exportSetlistToDocx`) — untouched.

## Measure/render parity invariants (added 2026-07-07 — regression: sliced songs + title gap)

A song was sliced mid-verse across PDF pages and every song title had a
phantom ~24px gap above its first chords. Root cause: `SongSheetBody` returned
a **fragment** (header + sections as separate top-level children). Inside
`PrintPage`'s `display:flex; flex-direction:column; gap:16px` band stack, each
fragment child became its own flex item, so:

1. the 16px band gap was injected INSIDE the song (title → chords, and between
   sections for single-column full-width songs), and
2. rendered height exceeded the measurement pass (which renders into a plain
   block div where no gaps exist and margins collapse), so `packPages`
   overfilled pages and `html2canvas`/`jsPDF` sliced the overflow mid-song
   onto the next PDF page.

These invariants are locked by `src/components/song/printLayout.test.jsx` —
do not weaken them:

1. **Single root element.** `SongSheetBody`, `SingleSongForColumn`, and
   `SegmentHeading` must each render exactly ONE root element, so each band is
   exactly one flex item and internal layout is identical in measure (block)
   and render (flex-item) contexts. `SONG_GAP` may appear only BETWEEN bands.
2. **Measure in the same font context as the render.** The hidden measure div
   sets `font-family:Arial,sans-serif;font-size:14px` (mirroring
   `createPrintContainer`); print components pin `font-family` and
   `line-height` inline (`PrintSongHeader` included).
3. **Never under-measure.** Heights use
   `Math.ceil(measureEl.getBoundingClientRect().height)`, not `scrollHeight`
   (which rounds to nearest and can round DOWN, accumulating overflow).
4. **Page budget ≤ 1086px.** A4 at 96dpi = 1122.5px minus wrapper padding
   (12 top + 24 bottom) = 1086.5px. `PAGE_HEIGHT` (SetlistView) and
   `PAGE_COL_HEIGHT` (SetlistFullEditor) are 1086 and must stay in sync.

Diagnostic harness: `print-lab.html` + `src/dev/printLab.jsx` renders the
measure→pack→render pipeline with visible page outlines, an A4-height marker,
and a measured-vs-rendered height report (`window.__printLabReport`). Use it
before touching any print component or packing constant.
