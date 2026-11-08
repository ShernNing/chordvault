/**
 * Sub-pixel-safe auto-scroll accumulator.
 *
 * Browsers round scroll positions to (device) pixels, so applying
 * `speed * dt` directly each frame loses everything below a pixel — at slow
 * speeds (6 px/s at 120 Hz ≈ 0.05 px/frame) the page never moves. This keeps
 * the fractional remainder in a float and only hands back whole pixels.
 *
 * If the scroll position moved by something other than our own step (the user
 * dragged/wheeled), the remainder is dropped and we resync to the new spot.
 *
 *   const acc = createScrollAccumulator()
 *   // per frame:
 *   const px = acc.step(currentScrollTop, speed * dt)
 *   if (px) el.scrollTop += px
 */
export function createScrollAccumulator() {
  let remainder = 0
  let expected = null // where we expect the scroll position to be next frame

  return {
    step(current, delta) {
      if (expected != null && Math.abs(current - expected) >= 1) {
        // Manual scroll (or clamping) since last frame — resync.
        remainder = 0
      }
      remainder += Number.isFinite(delta) ? delta : 0
      const whole = Math.trunc(remainder)
      remainder -= whole
      expected = current + whole
      return whole
    },
    reset() {
      remainder = 0
      expected = null
    },
  }
}
