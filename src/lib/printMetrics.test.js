import { describe, it, expect } from 'vitest'
import {
  PRINT_FULL_WIDTH,
  PRINT_HALF_COL_WIDTH,
  PRINT_COL_GAP,
  chooseBalancedSplit,
  fitScale,
  pickBestLayout,
  widthScale,
} from './printMetrics'

describe('print geometry', () => {
  it('half column width is (full width − column gap) / 2', () => {
    expect(PRINT_HALF_COL_WIDTH).toBe((PRINT_FULL_WIDTH - PRINT_COL_GAP) / 2)
  })
})

describe('chooseBalancedSplit', () => {
  it('returns 0 (no split) for fewer than two sections', () => {
    expect(chooseBalancedSplit([])).toBe(0)
    expect(chooseBalancedSplit([500])).toBe(0)
  })

  it('splits equal sections down the middle', () => {
    expect(chooseBalancedSplit([100, 100, 100, 100])).toBe(2)
  })

  it('minimises the taller column instead of filling left first', () => {
    // Fill-left-to-1000 would put 900+50 left, 50+50 right (950 tall).
    // Balanced: [900] | [50, 50, 50] → 900 tall.
    expect(chooseBalancedSplit([900, 50, 50, 50])).toBe(1)
    // k=2 and k=3 are both 900 tall; the tie goes to the left-heavy k=3.
    expect(chooseBalancedSplit([300, 300, 300, 300, 300])).toBe(3)
  })

  it('always leaves at least one section in each column', () => {
    expect(chooseBalancedSplit([10, 1000])).toBe(1)
    expect(chooseBalancedSplit([1000, 10])).toBe(1)
  })
})

describe('fitScale', () => {
  it('keeps full scale when the layout already fits', () => {
    const calls = []
    const r = fitScale((s) => (calls.push(s), 500 * s), 1086)
    expect(r).toEqual({ scale: 1, height: 500 })
    expect(calls).toEqual([1])
  })

  it('shrinks a too-tall layout to fit the budget (linear heights)', () => {
    const r = fitScale((s) => 2000 * s, 1086)
    expect(r.height).toBeLessThanOrEqual(1086)
    expect(r.scale).toBeGreaterThan(0.53) // close to the ideal 0.543
  })

  it('grows back after overshooting when height falls faster than scale', () => {
    // Super-linear: shrinking also un-wraps lines, so height ~ 2400·s².
    // A pure proportional step lands at ~0.45 (≈490px, far under budget);
    // the ideal is sqrt(1086/2400) ≈ 0.6727.
    const r = fitScale((s) => Math.ceil(2400 * s * s), 1086)
    expect(r.height).toBeLessThanOrEqual(1086)
    expect(r.scale).toBeGreaterThan(0.66)
  })

  it('never exceeds maxScale (width cap)', () => {
    const r = fitScale((s) => 400 * s, 1086, 0.8)
    expect(r.scale).toBe(0.8)
  })

  it('returns a measured height for the scale it returns', () => {
    const measure = (s) => Math.ceil(1500 * s * s)
    const r = fitScale(measure, 1086)
    expect(r.height).toBe(measure(r.scale))
  })
})

describe('widthScale', () => {
  it('is 1 when the line fits the column', () => {
    expect(widthScale(300, 357)).toBe(1)
    expect(widthScale(0, 357)).toBe(1)
  })

  it('shrinks so the line fits with 1px slack', () => {
    const s = widthScale(714, 357)
    expect(714 * s).toBeLessThanOrEqual(356)
    expect(s).toBeGreaterThan(0.49)
  })
})

describe('pickBestLayout', () => {
  it('prefers the larger font scale', () => {
    const a = { name: 'a', scale: 0.8 }
    const b = { name: 'b', scale: 0.9 }
    expect(pickBestLayout([a, b])).toBe(b)
  })

  it('breaks ties in favour of the earlier (preferred) candidate', () => {
    const a = { name: 'a', scale: 0.9 }
    const b = { name: 'b', scale: 0.9005 }
    expect(pickBestLayout([a, b])).toBe(a)
  })

  it('skips missing candidates', () => {
    const b = { name: 'b', scale: 1 }
    expect(pickBestLayout([null, b, undefined])).toBe(b)
  })
})
