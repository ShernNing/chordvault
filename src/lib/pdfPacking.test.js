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

  it('reflows a right-column narrow song to a new page instead of overflowing', () => {
    // full 300 -> remaining 684 = band budget. narrow 684 fills the left column
    // exactly; narrow 700 cannot fit the left OR the right column within 684, so
    // it must move to a fresh page rather than overflow the right column.
    const pages = packPages([wide(1, 300), narrow(2, 684), narrow(3, 700)], OPTS)
    expect(pages).toHaveLength(2)
    expect(pages[0].bands.map((b) => b.type)).toEqual(['full', 'cols'])
    expect(ids(pages[0].bands[1].left)).toEqual([2])
    expect(pages[0].bands[1].right).toEqual([])
    expect(pages[1].bands[0].type).toBe('cols')
    expect(ids(pages[1].bands[0].left)).toEqual([3])
  })

  it('pushes a narrow song to a new page when it does not fit below a tall full band', () => {
    // full 900 leaves only ~84px remaining; narrow 300 cannot fit and must move
    // to a fresh full-height page instead of overflowing the shared page.
    const pages = packPages([wide(1, 900), narrow(2, 300)], OPTS)
    expect(pages).toHaveLength(2)
    expect(pages[0].bands).toHaveLength(1)
    expect(pages[0].bands[0].type).toBe('full')
    expect(pages[0].bands[0].item.id).toBe(1)
    expect(pages[1].bands[0].type).toBe('cols')
    expect(ids(pages[1].bands[0].left)).toEqual([2])
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

  it('keeps a flowing divider with its next song (no orphaned heading)', () => {
    // full 900 -> remaining 84. The 40px heading fits alone, but heading + its
    // song (300) do not, so the heading must travel to the next page WITH the
    // song rather than being stranded at the bottom of page 1.
    const pages = packPages(
      [wide(1, 900), heading('Communion', 40), narrow(2, 300)],
      OPTS,
    )
    expect(pages).toHaveLength(2)
    expect(pages[0].bands.map((b) => b.type)).toEqual(['full'])
    expect(pages[1].bands[0]).toEqual({ type: 'heading', label: 'Communion' })
    expect(ids(pages[1].bands[1].left)).toEqual([2])
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

  // Stability invariant: across many randomized setlists (songs AND dividers),
  // no page may pack a band stack taller than the page. The single allowed
  // exception is a page holding exactly one over-tall full song (a song simply
  // larger than a page must overflow somewhere, but it sits alone and eats only
  // blank space). Also verifies input order is preserved end to end.
  it('never packs bands past the page height (randomized invariant)', () => {
    const { pageHeight, gap } = OPTS
    // Deterministic PRNG so failures reproduce.
    let seed = 0x9e3779b9
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }
    const colH = (arr) =>
      arr.reduce((sum, it, i) => sum + it.height + (i > 0 ? gap : 0), 0)

    for (let trial = 0; trial < 3000; trial++) {
      const n = 1 + Math.floor(rand() * 14)
      const items = []
      const headingH = new Map() // label -> height, to score heading bands
      for (let i = 0; i < n; i++) {
        const r = rand()
        if (r < 0.15) {
          // divider, unique label, occasionally forcing a page break
          const label = `H${i}`
          const h = 30 + Math.floor(rand() * 30)
          headingH.set(label, h)
          items.push(heading(label, h, rand() < 0.3))
        } else if (r < 0.3) {
          // wide song, occasionally taller than a page (allowed to overflow)
          items.push(wide(i, 120 + Math.floor(rand() * 1200)))
        } else {
          // narrow song: measurement guarantees height <= pageHeight
          items.push(narrow(i, 120 + Math.floor(rand() * (pageHeight - 120))))
        }
      }
      const bandH = (b) =>
        b.type === 'full'
          ? b.item.height
          : b.type === 'heading'
            ? headingH.get(b.label)
            : Math.max(colH(b.left), colH(b.right))

      const pages = packPages(items, OPTS)

      // Order preservation: flattening every page (full item / heading label /
      // each cols band left-then-right) must reproduce the input sequence.
      const flat = []
      for (const page of pages) {
        for (const b of page.bands) {
          if (b.type === 'full') flat.push(b.item.id)
          else if (b.type === 'heading') flat.push(b.label)
          else {
            b.left.forEach((it) => flat.push(it.id))
            b.right.forEach((it) => flat.push(it.id))
          }
        }
      }
      const expected = items.map((it) => (it.isDivider ? it.label : it.id))
      expect(flat).toEqual(expected)

      // No emitted page may be blank.
      for (const page of pages) expect(page.bands.length).toBeGreaterThan(0)

      for (const page of pages) {
        const total =
          page.bands.reduce((s, b) => s + bandH(b), 0) +
          (page.bands.length - 1) * gap
        if (total <= pageHeight) continue
        // Only tolerated overflow: a lone over-tall full song.
        expect(page.bands).toHaveLength(1)
        expect(page.bands[0].type).toBe('full')
        expect(page.bands[0].item.height).toBeGreaterThan(pageHeight)
      }
    }
  })
})
