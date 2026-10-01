/**
 * Measure pass for setlist PDF export — the ONLY implementation, shared by
 * SetlistView (real export), SetlistFullEditor (page preview) and the
 * /print-lab.html diagnostic harness, so all three always paginate the same.
 *
 * Pipeline: measureSetlistItems → packPages (pdfPacking.js) → PrintPage
 * (SongRenderer.jsx) → exportSetlistToPDF (pdf.js).
 *
 * Every song is laid out by rendering the real print component into a hidden
 * host in the print font context and reading the browser's own layout:
 *   1. Natural line widths (pixel-exact, not character counts) decide whether a
 *      song fits a half-page column without wrapping, and cap the font scale
 *      so a chord line (white-space: pre) never runs past its column.
 *   2. Long songs split into two internal columns at the section boundary that
 *      balances the MEASURED column heights.
 *   3. A song that still does not fit its page budget is shrunk (`scale`)
 *      until it does — the packer never splits songs, so this is what keeps
 *      every song on one page. The budget for a song right after a segment
 *      heading excludes the heading, so the heading always shares its page.
 * Returned heights are measured at the final layout, so packPages' math
 * matches the render exactly.
 */
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  SegmentHeading,
  SingleSongForColumn,
  SongSheetBody,
} from "../components/song/SongRenderer";
import {
  PRINT_PAGE_HEIGHT,
  PRINT_FULL_WIDTH,
  PRINT_HALF_COL_WIDTH,
  PRINT_SONG_GAP,
  PRINT_TWO_COL_LINE_THRESHOLD,
  chooseBalancedSplit,
  fitScale,
  pickBestLayout,
  widthScale,
} from "./printMetrics";

// Host width for natural-width probing: wide enough that no line wraps.
const WIDTH_PROBE = 4000;

/**
 * @typedef {{kind:'divider', label:string, pageBreak:boolean}} DividerEntry
 * @typedef {{kind:'song', props:object, meta?:object}} SongEntry
 *   props — print component props (song, semitones, targetKey, keyLabel,
 *   songNumber); meta — extra fields copied onto the item (e.g. slotId).
 *
 * @param {Array<DividerEntry|SongEntry>} entries in print order
 * @returns {Array<object>} packPages items. Songs carry their props plus
 *   `fitsHalf`, `height`, `scale` and (full-width only) `splitAt`.
 */
export function measureSetlistItems(entries) {
  const host = document.createElement("div");
  // Mirrors the PrintPage wrapper's font context (PRINT_WRAPPER_STYLE), the
  // direct parent of every band in the real render.
  host.style.cssText =
    "position:absolute;top:-9999px;left:-9999px;visibility:hidden;pointer-events:none;" +
    "font-family:Arial,sans-serif;font-size:16px;color:#000;";
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (width, node) => {
    host.style.width = `${width}px`;
    flushSync(() => root.render(node));
  };
  // Math.ceil, never scrollHeight: scrollHeight rounds to nearest and can
  // round DOWN, under-measuring and overfilling pages.
  const heightOf = (width, node) => {
    render(width, node);
    return Math.ceil(host.getBoundingClientRect().height);
  };
  const m = { host, render, heightOf };

  try {
    let headingH = 0; // height of a heading directly above the current song
    return entries.map((entry, id) => {
      if (entry.kind === "divider") {
        const height = heightOf(
          PRINT_FULL_WIDTH,
          <SegmentHeading label={entry.label} />,
        );
        headingH = height;
        return {
          id,
          isDivider: true,
          label: entry.label,
          pageBreak: entry.pageBreak,
          height,
        };
      }
      const budget =
        PRINT_PAGE_HEIGHT - (headingH > 0 ? headingH + PRINT_SONG_GAP : 0);
      headingH = 0;
      return {
        id,
        ...entry.props,
        ...layoutSong(entry.props, budget, m),
        ...entry.meta,
      };
    });
  } finally {
    root.unmount();
    host.remove();
  }
}

function layoutSong(props, budget, m) {
  const { maxLine, maxChord } = measureLineWidths(props, m);
  const nonBlank = (props.song?.parsed_content || []).filter(
    (l) => l.type !== "blank",
  ).length;

  // Narrow: the whole song in one half-page column, nothing wrapped, unscaled.
  if (nonBlank <= PRINT_TWO_COL_LINE_THRESHOLD && maxLine <= PRINT_HALF_COL_WIDTH) {
    const height = m.heightOf(
      PRINT_HALF_COL_WIDTH,
      <SingleSongForColumn {...props} />,
    );
    if (height <= budget) return { fitsHalf: true, height, scale: 1 };
  }

  // Full-width band: one column, or two internal columns. Chord lines can't
  // wrap, so the widest one caps the scale for the column width it gets.
  const fit = (splitAt, maxScale) => ({
    splitAt,
    ...fitScale(
      (scale) =>
        m.heightOf(
          PRINT_FULL_WIDTH,
          <SongSheetBody {...props} splitAt={splitAt} scale={scale} />,
        ),
      budget,
      maxScale,
    ),
  });
  const single = () => fit(0, widthScale(maxChord, PRINT_FULL_WIDTH));
  const columns = () => {
    const splitAt = balancedSplit(props, m);
    return splitAt > 0
      ? fit(splitAt, widthScale(maxChord, PRINT_HALF_COL_WIDTH))
      : null;
  };

  // Long songs prefer two columns; others prefer one. The second option is
  // only tried when the preferred one had to shrink, and wins only by
  // rendering at a strictly larger font.
  const order =
    nonBlank > PRINT_TWO_COL_LINE_THRESHOLD
      ? [columns, single]
      : [single, columns];
  const candidates = [];
  for (const make of order) {
    const c = make();
    candidates.push(c);
    if (c && c.scale === 1) break;
  }
  const best = pickBestLayout(candidates);
  return {
    fitsHalf: false,
    height: best.height,
    scale: best.scale,
    splitAt: best.splitAt,
  };
}

// Natural (unwrapped) pixel width of the song's widest line, and of its widest
// chord line, at scale 1. Read from text ranges, which hug the glyphs
// (including leading spaces that position chords) rather than the block box.
function measureLineWidths(props, m) {
  m.render(WIDTH_PROBE, <SingleSongForColumn {...props} />);
  const range = document.createRange();
  let maxLine = 0;
  let maxChord = 0;
  for (const el of m.host.querySelectorAll("[data-print-line]")) {
    range.selectNodeContents(el);
    const w = Math.ceil(range.getBoundingClientRect().width);
    if (w > maxLine) maxLine = w;
    if (el.dataset.printLine === "chord_line" && w > maxChord) maxChord = w;
  }
  return { maxLine, maxChord };
}

// Section index that best balances the two internal columns, from each
// section's measured height at half-column width (top-to-top distance, so
// collapsed margins between sections are counted once).
function balancedSplit(props, m) {
  m.render(PRINT_HALF_COL_WIDTH, <SingleSongForColumn {...props} />);
  const els = [...m.host.querySelectorAll("[data-print-section]")];
  if (els.length < 2) return 0;
  const tops = els.map((el) => el.getBoundingClientRect().top);
  const bottom = els[els.length - 1].getBoundingClientRect().bottom;
  const heights = tops.map((t, i) => (i + 1 < tops.length ? tops[i + 1] : bottom) - t);
  return chooseBalancedSplit(heights);
}
