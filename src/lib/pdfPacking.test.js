import { describe, it, expect } from 'vitest'
import { packPages } from './pdfPacking'

// Helpers to keep the arithmetic readable in tests.
const narrow = (id, height) => ({ id, fitsHalf: true, height })
const wide = (id, height) => ({ id, fitsHalf: false, height })
const heading = (label, height, pageBreak = false) => ({
  isDivider: true,
  label,
  pageBreak,
  height,
})

const ids = (arr) => arr.map((x) => x.id)

const OPTS = { pageHeight: 1000, gap: 16 }

describe('packPages', () => {
  it('stacks a short wide song full-width below the narrow cols band on the same page', () => {
    const pages = packPages(
      [narrow(1, 200), narrow(2, 200), wide(3, 300)],
      OPTS,
    )
    expect(pages).toHaveLength(1)
    const [cols, full] = pages[0].bands
    expect(cols.type).toBe('cols')
    expect(ids(cols.left)).toEqual([1, 2])
    expect(cols.right).toEqual([])
    expect(full.type).toBe('full')
    expect(full.item.id).toBe(3)
  })

  it('pushes a wide song to the next page when it does not fit remaining height', () => {
    // left col: 500 + 16 + 450 = 966 used; remaining ~18 < 300
    const pages = packPages(
      [narrow(1, 500), narrow(2, 450), wide(3, 300)],
      OPTS,
    )
    expect(pages).toHaveLength(2)
    expect(pages[0].bands).toHaveLength(1)
    expect(pages[0].bands[0].type).toBe('cols')
    expect(ids(pages[0].bands[0].left)).toEqual([1, 2])
    expect(pages[1].bands).toHaveLength(1)
    expect(pages[1].bands[0].type).toBe('full')
    expect(pages[1].bands[0].item.id).toBe(3)
  })

  it('gives an over-tall wide song its own page (overflow allowed)', () => {
    const pages = packPages([wide(1, 1500)], OPTS)
    expect(pages).toHaveLength(1)
    expect(pages[0].bands).toEqual([
      { type: 'full', item: wide(1, 1500) },
    ])
  })

  it('fills left column then right column (column-major waterfall)', () => {
    const pages = packPages(
      [
        narrow(1, 300),
        narrow(2, 300),
        narrow(3, 300),
        narrow(4, 300),
        narrow(5, 300),
      ],
      OPTS,
    )
    expect(pages).toHaveLength(1)
    const [cols] = pages[0].bands
    expect(ids(cols.left)).toEqual([1, 2, 3]) // 300+16+300+16+300 = 932 <= 1000
    expect(ids(cols.right)).toEqual([4, 5])
  })

  it('opens a fresh cols band below a full band for a following narrow song', () => {
    const pages = packPages([wide(1, 300), narrow(2, 200)], OPTS)
    expect(pages).toHaveLength(1)
    const [full, cols] = pages[0].bands
    expect(full.type).toBe('full')
    expect(full.item.id).toBe(1)
    expect(cols.type).toBe('cols')
    expect(ids(cols.left)).toEqual([2])
  })

  it('starts a new page when both columns are full', () => {
    // Each 400 tall; left: 400+16+400=816 (fits 2), third would be 1232 > 1000.
    const pages = packPages(
      [narrow(1, 400), narrow(2, 400), narrow(3, 400), narrow(4, 400)],
      OPTS,
    )
    // left [1,2], right [3,4] -> single page (right also holds 2)
    expect(pages).toHaveLength(1)
    expect(ids(pages[0].bands[0].left)).toEqual([1, 2])
    expect(ids(pages[0].bands[0].right)).toEqual([3, 4])
  })

  it('overflows a page and starts a new one when 5 tall narrow songs exceed both columns', () => {
    const pages = packPages(
      [
        narrow(1, 400),
        narrow(2, 400),
        narrow(3, 400),
        narrow(4, 400),
        narrow(5, 400),
      ],
      OPTS,
    )
    expect(pages).toHaveLength(2)
    expect(ids(pages[0].bands[0].left)).toEqual([1, 2])
    expect(ids(pages[0].bands[0].right)).toEqual([3, 4])
    expect(ids(pages[1].bands[0].left)).toEqual([5])
  })

  it('always places the first oversized narrow song on a page (no infinite loop)', () => {
    const pages = packPages([narrow(1, 1200), narrow(2, 200)], OPTS)
    expect(pages).toHaveLength(1)
    const [cols] = pages[0].bands
    expect(ids(cols.left)).toEqual([1]) // placed despite exceeding page height
    expect(ids(cols.right)).toEqual([2]) // next narrow spills to right
  })

  it('preserves global order across a mixed sequence', () => {
    const pages = packPages(
      [narrow(1, 200), wide(2, 300), narrow(3, 200), narrow(4, 200)],
      OPTS,
    )
    // page 1: cols[1] , full[2], cols[3,4]
    expect(pages).toHaveLength(1)
    const [c1, f, c2] = pages[0].bands
    expect(ids(c1.left)).toEqual([1])
    expect(f.item.id).toBe(2)
    expect(ids(c2.left)).toEqual([3, 4])
  })

  it('returns an empty array for no items', () => {
    expect(packPages([], OPTS)).toEqual([])
  })

  it('renders a flowing divider heading inline and keeps packing below it', () => {
    const pages = packPages(
      [narrow(1, 200), heading('Communion', 40), narrow(2, 200)],
      OPTS,
    )
    expect(pages).toHaveLength(1)
    const [c1, h, c2] = pages[0].bands
    expect(ids(c1.left)).toEqual([1])
    expect(h).toEqual({ type: 'heading', label: 'Communion' })
    expect(ids(c2.left)).toEqual([2])
  })

  it('starts a new page for a page-break divider', () => {
    const pages = packPages(
      [narrow(1, 200), heading('Prayer Meeting', 40, true), narrow(2, 200)],
      OPTS,
    )
    expect(pages).toHaveLength(2)
    expect(ids(pages[0].bands[0].left)).toEqual([1])
    expect(pages[1].bands[0]).toEqual({ type: 'heading', label: 'Prayer Meeting' })
    expect(ids(pages[1].bands[1].left)).toEqual([2])
  })

  it('does not emit a blank page for a leading page-break divider', () => {
    const pages = packPages(
      [heading('Communion', 40, true), narrow(1, 200)],
      OPTS,
    )
    expect(pages).toHaveLength(1)
    expect(pages[0].bands[0]).toEqual({ type: 'heading', label: 'Communion' })
    expect(ids(pages[0].bands[1].left)).toEqual([1])
  })

  it('pushes a flowing divider to the next page when its heading does not fit', () => {
    // left col fills to 966; a 40px heading + gap does not fit remaining ~18.
    const pages = packPages(
      [narrow(1, 500), narrow(2, 450), heading('Communion', 40), narrow(3, 200)],
      OPTS,
    )
    expect(pages).toHaveLength(2)
    expect(ids(pages[0].bands[0].left)).toEqual([1, 2])
    expect(pages[1].bands[0]).toEqual({ type: 'heading', label: 'Communion' })
    expect(ids(pages[1].bands[1].left)).toEqual([3])
  })
})
