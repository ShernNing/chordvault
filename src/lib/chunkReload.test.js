import { describe, it, expect, vi } from 'vitest'
import { isChunkLoadError, reloadOnceForStaleChunk } from './chunkReload'

function memStorage() {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
}

describe('isChunkLoadError', () => {
  it('recognises browser chunk-load failures', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/SongView-abc.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true)
  })
  it('ignores ordinary errors', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'title')"))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe('reloadOnceForStaleChunk', () => {
  it('reloads once, then refuses within the window to avoid loops', () => {
    const storage = memStorage()
    const reload = vi.fn()
    expect(reloadOnceForStaleChunk(storage, 1_000, reload)).toBe(true)
    expect(reloadOnceForStaleChunk(storage, 5_000, reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('allows another reload after the window passes', () => {
    const storage = memStorage()
    const reload = vi.fn()
    reloadOnceForStaleChunk(storage, 1_000, reload)
    expect(reloadOnceForStaleChunk(storage, 60_000, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
  it('does not reload when storage throws (private mode)', () => {
    const reload = vi.fn()
    const storage = { getItem: () => { throw new Error('denied') }, setItem: () => {} }
    expect(reloadOnceForStaleChunk(storage, 1_000, reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
