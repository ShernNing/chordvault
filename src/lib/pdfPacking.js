/**
 * Pure page-packer for setlist PDF export.
 *
 * A page is an ordered vertical stack of "bands":
 *   - { type: 'cols', left: Item[], right: Item[] }  — narrow songs, two
 *     half-width columns, filled column-major (left fully, then right).
 *   - { type: 'full', item: Item }                    — one wide song, rendered
 *     full width.
 *   - { type: 'heading', label: string }              — a segment divider heading.
 *
 * Divider input items are `{ isDivider: true, label, pageBreak, height }`; a
 * `pageBreak` divider starts a new page, otherwise the heading flows inline
 * (moving to the next page only if it does not fit the remaining height).
 *
 * Wide-but-short songs stack full-width *below* the narrow cols band on the same
 * page when they fit the remaining height, instead of always claiming their own
 * page. Song order is preserved: reading each cols band left column top-to-bottom
 * then right column reproduces the input order (waterfall fill).
 *
 * Input items: { id, fitsHalf: boolean, height: number }. `height` must already
 * be measured at the width the item will render (357px narrow, 746px wide).
 *
 * @param {Array<{id:*, fitsHalf:boolean, height:number}>} items
 * @param {{pageHeight?:number, gap?:number}} [opts]
 * @returns {Array<{bands: Array}>}
 */
export function packPages(items, { pageHeight = 1087, gap = 16 } = {}) {
  const pages = []
  let page = null // { bands: [], usedAbove } — usedAbove = height of closed bands (+ gaps)
  let openCols = null // { left, right, leftH, rightH, avail, useRight }

  const startPage = () => {
    page = { bands: [], usedAbove: 0 }
    pages.push(page)
    openCols = null
  }

  // Remaining vertical space below the already-closed bands on the current page.
  const remaining = () =>
    pageHeight - page.usedAbove - (page.usedAbove > 0 ? gap : 0)

  const openColsBand = () => {
    openCols = {
      left: [],
      right: [],
      leftH: 0,
      rightH: 0,
      avail: remaining(),
      useRight: false,
    }
  }

  const closeCols = () => {
    if (!openCols) return
    if (openCols.left.length === 0 && openCols.right.length === 0) {
      openCols = null
      return
    }
    const h = Math.max(openCols.leftH, openCols.rightH)
    page.usedAbove += (page.usedAbove > 0 ? gap : 0) + h
    page.bands.push({ type: 'cols', left: openCols.left, right: openCols.right })
    openCols = null
  }

  for (const item of items) {
    if (!page) startPage()

    if (item.isDivider) {
      closeCols()
      const needNewPage = item.pageBreak
        ? page.bands.length > 0
        : item.height > remaining() && page.bands.length > 0
      if (needNewPage) startPage()
      page.usedAbove += (page.usedAbove > 0 ? gap : 0) + item.height
      page.bands.push({ type: 'heading', label: item.label })
    } else if (item.fitsHalf) {
      if (!openCols) openColsBand()
      if (!placeNarrow(openCols, item, gap)) {
        // The song does not fit either column of the current band (its column
        // budget = the page height that was still free when the band opened).
        // If this page already holds anything, retry on a fresh full-height
        // page where the whole page height is available.
        const pageHasContent =
          page.bands.length > 0 ||
          openCols.left.length > 0 ||
          openCols.right.length > 0
        if (pageHasContent) {
          closeCols()
          startPage()
          openColsBand()
        }
        if (!placeNarrow(openCols, item, gap)) {
          // Still doesn't fit an entirely empty page — i.e. the song is taller
          // than a full page. Measurement makes this impossible for real songs
          // (fitsHalf requires height <= pageHeight), but guard it anyway: place
          // it alone so its unavoidable overflow only spills into blank space,
          // never on top of the next song.
          openCols.left.push(item)
          openCols.leftH = item.height
        }
      }
    } else {
      closeCols()
      if (item.height <= remaining() || page.bands.length === 0) {
        page.usedAbove += (page.usedAbove > 0 ? gap : 0) + item.height
        page.bands.push({ type: 'full', item })
      } else {
        startPage()
        page.usedAbove += item.height
        page.bands.push({ type: 'full', item })
      }
    }
  }
  closeCols()

  return pages
}

/**
 * Waterfall a narrow song into an open cols band: fill the left column until the
 * next song would exceed the band's column budget (`band.avail`), then spill to
 * the right column under the same budget. Never places a song that would push a
 * column past `avail`, so a band can never overflow the space it was opened in.
 * Returns false when neither column has room; the caller then reflows onto a
 * fresh page (see packPages).
 */
function placeNarrow(band, item, gap) {
  const h = item.height
  if (!band.useRight) {
    const next = band.leftH === 0 ? h : band.leftH + gap + h
    if (next <= band.avail) {
      band.left.push(item)
      band.leftH = next
      return true
    }
    band.useRight = true
  }
  const next = band.rightH === 0 ? h : band.rightH + gap + h
  if (next <= band.avail) {
    band.right.push(item)
    band.rightH = next
    return true
  }
  return false
}
