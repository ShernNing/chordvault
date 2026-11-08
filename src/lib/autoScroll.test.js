import { describe, it, expect } from 'vitest'
import { createScrollAccumulator } from './autoScroll'

describe('createScrollAccumulator', () => {
  it('accumulates sub-pixel steps into whole pixels', () => {
    const acc = createScrollAccumulator()
    let pos = 0
    // 6 px/s at 120 Hz = 0.05 px per frame; one second should move ~6 px.
    for (let i = 0; i < 120; i++) pos += acc.step(pos, 6 / 120)
    expect(pos).toBeGreaterThanOrEqual(5)
    expect(pos).toBeLessThanOrEqual(6)
  })

  it('never returns fractional pixels', () => {
    const acc = createScrollAccumulator()
    let pos = 0
    for (let i = 0; i < 50; i++) {
      const px = acc.step(pos, 0.37)
      expect(Number.isInteger(px)).toBe(true)
      pos += px
    }
  })

  it('drops the remainder when the user scrolls manually', () => {
    const acc = createScrollAccumulator()
    expect(acc.step(0, 0.9)).toBe(0)
    // User jumped to 500; the 0.9 carry is discarded.
    expect(acc.step(500, 0.5)).toBe(0)
    expect(acc.step(500, 0.6)).toBe(1)
  })
})
