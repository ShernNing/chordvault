import { describe, it, expect, beforeEach } from 'vitest'
import {
  createResource,
  touchStorageKey,
  safeSetItem,
  clearCacheStorage,
  resetAllCaches,
} from './cache'

// Minimal in-memory localStorage with an optional quota (max number of keys).
function installStorage({ maxKeys = Infinity } = {}) {
  const m = new Map()
  globalThis.localStorage = {
    get length() { return m.size },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (!m.has(k) && m.size >= maxKeys) {
        const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e
      }
      m.set(k, String(v))
    },
    removeItem: (k) => { m.delete(k) },
    clear: () => m.clear(),
  }
  return m
}

const flush = () => new Promise(r => setTimeout(r, 0))

const deferred = () => {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

describe('createResource generations (latest wins)', () => {
  beforeEach(() => installStorage())

  it('ensure(true) does not reuse a fetch started before the mutation', async () => {
    const calls = []
    const r = createResource({ fetcher: () => { const d = deferred(); calls.push(d); return d.promise } })
    const stale = r.ensure()          // started before the mutation
    const fresh = r.ensure(true)      // forced after the mutation
    await flush()
    expect(calls).toHaveLength(2)
    calls[1].resolve('fresh')
    await fresh
    calls[0].resolve('stale')         // old response lands late
    await stale
    expect(r.getSnapshot()).toBe('fresh')
    expect(r.isLoaded()).toBe(true)
  })

  it('non-forced ensure shares the in-flight request', async () => {
    let n = 0
    const r = createResource({ fetcher: async () => ++n })
    await Promise.all([r.ensure(), r.ensure(), r.ensure()])
    expect(n).toBe(1)
    await r.ensure()
    expect(n).toBe(1)
  })

  it('set() supersedes an in-flight fetch', async () => {
    const d = deferred()
    const r = createResource({ fetcher: () => d.promise })
    const p = r.ensure()
    r.set('local')
    d.resolve('server-old')
    await p
    expect(r.getSnapshot()).toBe('local')
  })

  it('invalidate() supersedes an in-flight fetch and forces a refetch', async () => {
    const ds = []
    const r = createResource({ fetcher: () => { const d = deferred(); ds.push(d); return d.promise } })
    const p = r.ensure()
    r.invalidate()
    await flush()
    ds[0].resolve('old')
    await p
    expect(r.isLoaded()).toBe(false)
    const p2 = r.ensure()
    await flush()
    ds[1].resolve('new')
    await p2
    expect(r.getSnapshot()).toBe('new')
  })

  it('mutate() changes data without marking loaded', () => {
    const r = createResource({ fetcher: async () => [] })
    r.set([1, 2])
    r.invalidate()
    r.mutate(xs => xs.filter(x => x !== 1))
    expect(r.getSnapshot()).toEqual([2])
    expect(r.isLoaded()).toBe(false)
  })
})

describe('localStorage LRU', () => {
  it('evicts the oldest key beyond the cap', () => {
    const m = installStorage()
    for (const k of ['a', 'b', 'c']) { localStorage.setItem(k, '1'); touchStorageKey('g', k, 2) }
    expect(m.has('a')).toBe(false)
    expect(m.has('b')).toBe(true)
    expect(m.has('c')).toBe(true)
  })

  it('re-touching a key makes it most recent', () => {
    const m = installStorage()
    for (const k of ['a', 'b']) { localStorage.setItem(k, '1'); touchStorageKey('g', k, 2) }
    touchStorageKey('g', 'a', 2)
    localStorage.setItem('c', '1'); touchStorageKey('g', 'c', 2)
    expect(m.has('b')).toBe(false)
    expect(m.has('a')).toBe(true)
  })

  it('resources cap their per-id storage keys', () => {
    const m = installStorage()
    for (let i = 0; i < 5; i++) {
      const r = createResource({ fetcher: async () => i, storageKey: `cv-song-cache-${i}`, storageGroup: 'song-test', storageCap: 3 })
      r.set({ i })
    }
    const kept = [...m.keys()].filter(k => k.startsWith('cv-song-cache-'))
    expect(kept.sort()).toEqual(['cv-song-cache-2', 'cv-song-cache-3', 'cv-song-cache-4'])
  })

  it('on quota error evicts the oldest entry and retries once', () => {
    const m = installStorage({ maxKeys: 3 })
    // index key + 2 entries = 3 keys: storage is full
    const r1 = createResource({ fetcher: async () => 1, storageKey: 'cv-setlist-cache-1', storageGroup: 'quota', storageCap: 10 })
    r1.set('one')
    const r2 = createResource({ fetcher: async () => 2, storageKey: 'cv-setlist-cache-2', storageGroup: 'quota', storageCap: 10 })
    r2.set('two')
    expect(m.size).toBe(3)
    expect(safeSetItem('cv-setlist-cache-3', '"three"')).toBe(true)
    expect(m.has('cv-setlist-cache-1')).toBe(false)
    expect(m.get('cv-setlist-cache-3')).toBe('"three"')
  })
})

describe('sign-out reset', () => {
  it('clearCacheStorage removes only cache keys', () => {
    const m = installStorage()
    for (const k of ['cv-songs-cache', 'cv-setlists-cache', 'cv-song-cache-1', 'cv-setlist-cache-2', 'cv-cache-index-song', 'cv-font-size', 'chordvault-dark-mode']) m.set(k, '1')
    clearCacheStorage()
    expect([...m.keys()].sort()).toEqual(['chordvault-dark-mode', 'cv-font-size'])
  })

  it('resetAllCaches clears in-memory data of every resource', () => {
    installStorage()
    const r = createResource({ fetcher: async () => 'x', storageKey: 'cv-songs-cache' })
    r.set(['secret'])
    resetAllCaches()
    expect(r.getSnapshot()).toBe(null)
    expect(r.isLoaded()).toBe(false)
    expect(localStorage.getItem('cv-songs-cache')).toBe(null)
  })
})
