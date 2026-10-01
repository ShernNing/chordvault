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
(`SetlistView.handleExportPDF` → `measureSetlistItems` in
`src/lib/printMeasure.jsx` → `packPages` in `src/lib/pdfPacking.js` →
`PrintPage` in `src/components/song/SongRenderer.jsx` → `exportSetlistToPDF`).
Measured heights and rendered heights MUST match exactly, or pages overfill.

1. **One measure pass, one geometry module.** `measureSetlistItems` is the
   ONLY measurement code — SetlistView (export), SetlistFullEditor (preview)
   and `src/dev/printLab.jsx` all call it. Never copy it inline again (the old
   copies drifted and the preview paginated differently from the PDF). Every
   print number (`PRINT_PAGE_HEIGHT` 1086, `PRINT_FULL_WIDTH` 746,
   `PRINT_HALF_COL_WIDTH` 357, `PRINT_COL_GAP` 32, `PRINT_SONG_GAP` 28,
   `PRINT_TWO_COL_LINE_THRESHOLD`) lives in `src/lib/printMetrics.js`; never
   hardcode them. `packPages` defaults to them.
2. **One root element per print component.** `SongSheetBody`,
   `SingleSongForColumn`, `SegmentHeading` must render a SINGLE root element
   (never a fragment). `PrintPage`'s band stack is `flex` with a
   `PRINT_SONG_GAP` gap; fragment children become separate flex items,
   injecting the gap INSIDE a song and breaking height parity. Title→content
   spacing inside a song is the 8px (× scale) `PrintSongHeader` margin.
3. **Measure in the render's font context, with the real component.** The
   measure host mirrors the PrintPage wrapper (`Arial`, 16px); print
   components pin `font-family`/`line-height` inline. Heights use
   `Math.ceil(getBoundingClientRect().height)` — NOT `scrollHeight` (rounds to
   nearest, can round down).
4. **Widths are measured in pixels, not characters.** Chord lines are
   `white-space: pre` and never wrap; `measureSetlistItems` reads each line's
   natural width (`data-print-line` + Range rects). A song is half-column only
   if every line fits 357px unwrapped; the widest chord line caps the font
   scale for whatever column it lands in.
5. **Two-column split uses measured, balanced sections.** Long songs get
   `splitAt` from `chooseBalancedSplit` over measured section heights
   (`data-print-section`). The legacy estimate split (`splitAt` undefined) is
   only for standalone single-song export.
6. **No song ever exceeds its page.** Songs are never split by the packer. A
   song that doesn't fit its budget is shrunk via the `scale` prop
   (`fitScale`); a song directly after a segment heading gets
   `PRINT_PAGE_HEIGHT − heading − gap` so the heading always shares its page.
   `exportSetlistToPDF` never slices a page across PDF pages — an overfull
   page is shrunk onto one page (with a console warning) as a last resort.
   Scaling is done with explicit px sizes, not CSS `zoom`/`transform`
   (html2canvas reads computed font sizes).
7. **Tests stay green:** `src/lib/pdfPacking.test.js`,
   `src/lib/printMetrics.test.js`, `src/lib/pdf.test.js`,
   `src/components/song/printLayout.test.jsx`.

Before touching print components, packing constants, or measurement code, run
the diagnostic harness: open `/print-lab.html` in the dev server and check
`window.__printLabReport.ok === true` — it runs the real pipeline on a stress
setlist (wrapping long songs, dense chords, over-tall songs, headings) and
checks rendered vs measured heights, A4 overflow and chord-line overflow per
page.

## Verification

- Cloud Supabase + auth means most views can't be browser-verified here; rely
  on `npm run lint`, `npm run test:run`, `npm run build`, and unit-tested lib
  modules (see project memory).
- `/print-lab.html` needs no auth — use it for print-layout verification.
