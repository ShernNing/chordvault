# ChordVault — instructions for Claude

Vite + React 18 chord-sheet manager (Supabase backend, Vercel deploy).
Commands: `npm run dev` · `npm run lint` · `npm run test:run` · `npm run build`.

<!-- ⚠️ PERMANENT SECTION — DO NOT DELETE OR REWRITE. If regenerating this
     file (e.g. via /init), keep everything between these markers verbatim.
     These rules exist because violating them shipped broken PDF exports
     (songs sliced mid-verse across pages, phantom gaps after song titles). -->

## PDF export invariants (setlist export) — PERMANENT

Full spec: `docs/superpowers/specs/2026-07-01-pdf-export-packing-redesign-design.md`
(“Measure/render parity invariants”). Regression tests:
`src/components/song/printLayout.test.jsx` and `src/lib/pdfPacking.test.js`.

The export pipeline is **measure → pack → render → rasterize**
(`SetlistView.handleExportPDF` → `packPages` in `src/lib/pdfPacking.js` →
`PrintPage` in `src/components/song/SongRenderer.jsx` → `exportSetlistToPDF`).
Measured heights and rendered heights MUST match exactly, or pages overfill
and html2canvas slices songs mid-line across PDF page boundaries.

1. **One root element per print component.** `SongSheetBody`,
   `SingleSongForColumn`, `SegmentHeading` must render a SINGLE root element
   (never a fragment). `PrintPage`'s band stack is `flex` with `gap:16px`;
   fragment children become separate flex items, injecting the gap INSIDE a
   song (between title and chords) and breaking height parity.
2. **Gap only between songs.** `SONG_GAP` (16px) lives in the band stack and
   column flex `gap` only. Title→content spacing inside a song is the 8px
   `PrintSongHeader` margin — do not add more.
3. **Measure in the render's font context.** The hidden measure div sets
   `font-family:Arial,sans-serif;font-size:14px` (mirrors
   `createPrintContainer`); print components pin `font-family`/`line-height`
   inline.
4. **Never under-measure.** Use
   `Math.ceil(measureEl.getBoundingClientRect().height)` — NOT `scrollHeight`
   (rounds to nearest, can round down, accumulates page overflow).
5. **Page budget is 1086px.** A4@96dpi 1122.5px − wrapper padding 36px =
   1086.5px. `PAGE_HEIGHT` (`SetlistView.jsx`) and `PAGE_COL_HEIGHT`
   (`SetlistFullEditor.jsx`) must both stay 1086 and in sync.
6. **Songs are never split by the packer.** `packPages` places whole songs;
   a segment heading is kept with its first song (`blockH` check). Any change
   to packing must keep `src/lib/pdfPacking.test.js` green.

Before touching print components, packing constants, or measurement code, run
the diagnostic harness: open `/print-lab.html` in the dev server and check
`window.__printLabReport` — measured vs rendered heights must agree (±1px)
and every page must stay under the A4 marker.

<!-- ⚠️ END PERMANENT SECTION -->

## Verification

- Cloud Supabase + auth means most views can't be browser-verified here; rely
  on `npm run lint`, `npm run test:run`, `npm run build`, and unit-tested lib
  modules (see project memory).
- `/print-lab.html` needs no auth — use it for print-layout verification.
