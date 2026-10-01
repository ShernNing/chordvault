import { describe, it, expect, vi } from 'vitest'

vi.mock('jspdf', () => ({ default: class {} }))
vi.mock('html2canvas', () => ({ default: () => {} }))

const { fitPageImage } = await import('./pdf')

// jsPDF A4 in px with the px_scaling hotfix.
const PDF_W = 793.7
const PDF_H = 1122.5

describe('fitPageImage (setlist pages are never sliced)', () => {
  it('places a page that fits at full width, top-left', () => {
    const r = fitPageImage(794 * 1.5, 1100 * 1.5, PDF_W, PDF_H)
    expect(r.x).toBe(0)
    expect(r.width).toBe(PDF_W)
    expect(r.height).toBeLessThanOrEqual(PDF_H)
  })

  it('shrinks an overfull page onto ONE PDF page, centred', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = fitPageImage(794 * 1.5, 1300 * 1.5, PDF_W, PDF_H)
    expect(r.height).toBe(PDF_H)
    expect(r.width).toBeLessThan(PDF_W)
    expect(r.x).toBeCloseTo((PDF_W - r.width) / 2)
    expect(r.width / r.height).toBeCloseTo(794 / 1300)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
