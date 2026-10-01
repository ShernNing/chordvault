/**
 * Print geometry + pure layout helpers for setlist PDF export.
 *
 * Single source of truth for every number the measure pass
 * (printMeasure.jsx), the packer (pdfPacking.js), the print renderer
 * (SongRenderer.jsx) and the diagnostic lab (src/dev/printLab.jsx) must agree
 * on. If any of these drift apart, measured heights stop matching rendered
 * heights and songs get sliced across PDF page boundaries — see "PDF export
 * invariants" in CLAUDE.md.
 */

// A4 at 96dpi is 1122.5px tall; the PrintPage wrapper eats 12px top + 24px
// bottom padding, so the true content budget is 1086.5px.
export const PRINT_PAGE_HEIGHT = 1086;
// 794px wrapper − 2×24px horizontal padding.
export const PRINT_FULL_WIDTH = 746;
// Horizontal gap between the two columns of a cols band / 2-col song.
export const PRINT_COL_GAP = 32;
// (746 − 32) / 2.
export const PRINT_HALF_COL_WIDTH = 357;
// Vertical gap between songs: the PrintPage band stack, the within-column
// stack, and the packer's `gap`.
export const PRINT_SONG_GAP = 28;
// Songs with more non-blank lines than this prefer a full-width band split
// into two internal columns over a single tall column.
export const PRINT_TWO_COL_LINE_THRESHOLD = 45;

/**
 * Pick where to split a song's sections into two internal columns so the
 * taller column is as short as possible. Sections are never split, so the
 * answer is a section index: the first `k` sections go left, the rest right.
 * Ties go to the left-heavy split (reads naturally: left column ≥ right).
 *
 * @param {number[]} heights measured height of each section, in order
 * @returns {number} k in [1, n−1], or 0 when there are fewer than 2 sections
 */
export function chooseBalancedSplit(heights) {
  const n = heights.length;
  if (n < 2) return 0;
  const total = heights.reduce((sum, h) => sum + h, 0);
  let best = 1;
  let bestMax = Infinity;
  let left = 0;
  for (let k = 1; k < n; k++) {
    left += heights[k - 1];
    const tallest = Math.max(left, total - left);
    if (tallest < bestMax || (tallest === bestMax && left >= total - left)) {
      best = k;
      bestMax = tallest;
    }
  }
  return best;
}

/**
 * Largest font scale (≤ maxScale) at which `measureAt(scale)` fits `budget`.
 *
 * 1. Shrink: jump to the proportional scale (budget / height) and re-measure
 *    until something fits — usually one step.
 * 2. Grow back: shrinking text in a fixed-width column also stops lines
 *    wrapping, so height falls FASTER than the scale and the proportional
 *    guess overshoots (a song can land far under budget). Bisect between the
 *    last fitting and last overflowing scale to recover the largest font.
 *
 * Returns the scale with its measured height. The height only exceeds
 * `budget` if the shrink iteration cap is hit (callers must still treat it as
 * untrusted — pdf.js shrinks any overfull page as a last resort).
 *
 * @param {(scale:number) => number} measureAt rendered height at a scale;
 *   assumed non-decreasing in scale
 * @param {number} budget max allowed height
 * @param {number} [maxScale=1] upper bound (e.g. from a width constraint)
 * @returns {{scale:number, height:number}}
 */
export function fitScale(measureAt, budget, maxScale = 1) {
  let lo = floorScale(Math.min(1, maxScale));
  let loH = measureAt(lo);
  if (loH <= budget) return { scale: lo, height: loH };

  let hi = lo; // smallest scale known to overflow
  for (let i = 0; i < 8 && loH > budget; i++) {
    hi = lo;
    const next = floorScale(lo * (budget / loH) * 0.995);
    lo = next < lo ? next : lo - 0.001;
    loH = measureAt(lo);
  }
  if (loH > budget) return { scale: lo, height: loH };

  for (let i = 0; i < 6 && hi - lo > 0.005; i++) {
    const mid = floorScale((lo + hi) / 2);
    if (mid <= lo) break;
    const h = measureAt(mid);
    if (h <= budget) {
      lo = mid;
      loH = h;
    } else {
      hi = mid;
    }
  }
  return { scale: lo, height: loH };
}

/**
 * Largest scale at which a line `naturalWidth` px wide (at scale 1) fits a
 * column `colWidth` px wide. 1px slack absorbs sub-pixel glyph rounding.
 */
export function widthScale(naturalWidth, colWidth) {
  if (!(naturalWidth > colWidth)) return 1;
  return floorScale((colWidth - 1) / naturalWidth);
}

/**
 * Choose between candidate layouts: the one rendering at the largest font
 * scale wins; on a tie (within 0.001) the earlier candidate wins, so callers
 * list candidates in order of preference. Null candidates are skipped.
 *
 * @template {{scale:number}} T
 * @param {Array<T|null|undefined>} candidates
 * @returns {T|undefined}
 */
export function pickBestLayout(candidates) {
  let best;
  for (const c of candidates) {
    if (!c) continue;
    if (!best || c.scale > best.scale + 1e-3) best = c;
  }
  return best;
}

function floorScale(s) {
  return Math.floor(s * 1000) / 1000;
}
