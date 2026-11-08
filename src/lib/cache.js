// ─── Shared resource cache ───────────────────────────────────────────────────
//
// A tiny module-level store so data survives route changes instead of being
// re-fetched on every mount. Backs the song/setlist hooks.
//
//  • Fetches once per session, then serves from memory until `invalidate()`d
//    (called by mutations — create / edit / delete).
//  • Single-flight: concurrent `ensure()` calls share one network request, so
//    components that mount together (e.g. SongView + its panels) fetch once.
//  • Latest wins: every forced fetch / invalidate / set bumps a generation
//    counter. A fetch only writes its result if no newer generation started
//    meanwhile, so a request launched BEFORE a mutation can never overwrite the
//    post-mutation data (and `ensure(true)` never reuses such a stale request).
//  • Optional localStorage mirror for instant first paint and offline, capped
//    per group with a small LRU so per-id keys don't grow without bound.
//  • Compatible with React's `useSyncExternalStore` — `getSnapshot` returns a
//    stable reference until the data actually changes.

// ── localStorage LRU ─────────────────────────────────────────────────────────
// Each group (e.g. "song", "setlist") keeps an index key listing its storage
// keys, least-recently-written first. Writing past the cap evicts the oldest.

const INDEX_PREFIX = 'cv-cache-index-'

function readIndex(group) {
  try {
    const raw = localStorage.getItem(INDEX_PREFIX + group)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function writeIndex(group, keys) {
  try { localStorage.setItem(INDEX_PREFIX + group, JSON.stringify(keys)) } catch { /* quota */ }
}

/** Mark `key` most-recently-used in `group`; evict beyond `cap`. Returns evicted keys. */
export function touchStorageKey(group, key, cap) {
  const keys = readIndex(group).filter(k => k !== key)
  keys.push(key)
  const evicted = []
  while (cap > 0 && keys.length > cap) {
    const old = keys.shift()
    evicted.push(old)
    try { localStorage.removeItem(old) } catch { /* ignore */ }
  }
  writeIndex(group, keys)
  return evicted
}

export function forgetStorageKey(group, key) {
  const keys = readIndex(group)
  if (keys.includes(key)) writeIndex(group, keys.filter(k => k !== key))
}

const _groups = new Set()

/** Evict the oldest entry across all known groups. Returns true if one was removed. */
export function evictOldestStorageEntry() {
  for (const group of _groups) {
    const keys = readIndex(group)
    if (keys.length) {
      const old = keys.shift()
      try { localStorage.removeItem(old) } catch { /* ignore */ }
      writeIndex(group, keys)
      return true
    }
  }
  return false
}

/** Write `value` under `key`; on quota error evict the oldest entry and retry once. */
export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    if (!evictOldestStorageEntry()) return false
    try {
      localStorage.setItem(key, value)
      return true
    } catch { return false }
  }
}

// Matches every cache key this module family writes: cv-songs-cache,
// cv-setlists-cache, cv-song-cache-<id>, cv-setlist-cache-<id>, index keys.
const CACHE_KEY_RE = /^cv-.*cache/

/** Remove every cached-data key from localStorage (used on sign-out). */
export function clearCacheStorage() {
  try {
    const doomed = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && CACHE_KEY_RE.test(k)) doomed.push(k)
    }
    doomed.forEach(k => localStorage.removeItem(k))
  } catch { /* storage unavailable */ }
}

// ── Global registry (for sign-out reset) ─────────────────────────────────────
const _resources = new Set()
const _resetListeners = new Set()

/** Register a callback run by resetAllCaches (e.g. to drop per-id resource maps). */
export function onCacheReset(fn) {
  _resetListeners.add(fn)
  return () => _resetListeners.delete(fn)
}

/** Clear every resource's in-memory data and all cached localStorage keys. */
export function resetAllCaches() {
  _resources.forEach(r => r.clear())
  _resetListeners.forEach(fn => { try { fn() } catch { /* ignore */ } })
  clearCacheStorage()
}

// ── Resource ─────────────────────────────────────────────────────────────────

export function createResource({ fetcher, storageKey = null, storageGroup = null, storageCap = 0 }) {
  if (storageGroup) _groups.add(storageGroup)
  let data = readInitial()
  let loaded = false        // have we fetched from the network this session?
  let inflight = null       // latest in-progress fetch promise (single-flight)
  let generation = 0        // bumped by every forced fetch / invalidate / set
  const subs = new Set()

  function readInitial() {
    if (!storageKey) return null
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  function persist() {
    if (!storageKey) return
    try {
      if (data == null) {
        localStorage.removeItem(storageKey)
        if (storageGroup) forgetStorageKey(storageGroup, storageKey)
        return
      }
      if (safeSetItem(storageKey, JSON.stringify(data)) && storageGroup) {
        touchStorageKey(storageGroup, storageKey, storageCap)
      }
    } catch { /* storage unavailable */ }
  }

  function emit() { subs.forEach(fn => fn()) }

  function write(next) {
    data = next
    persist()
    emit()
  }

  function startFetch() {
    const gen = ++generation
    const p = Promise.resolve()
      .then(fetcher)
      .then(fresh => {
        // A newer fetch / set / invalidate superseded this one — drop the result.
        if (gen === generation) { loaded = true; write(fresh) }
        return gen === generation ? fresh : data
      })
      .finally(() => { if (inflight === p) inflight = null })
    inflight = p
    return p
  }

  const resource = {
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
    getSnapshot() { return data },
    isLoaded() { return loaded },

    // Replace the cached value directly (fresh data after a mutation). Any
    // in-flight fetch started before this is superseded.
    set(next) { generation++; inflight = null; loaded = true; write(next) },

    // Transform the cached value locally without touching `loaded` (a local
    // tweak isn't a full session fetch). No-op when nothing is cached.
    mutate(fn) {
      if (data == null) return
      const next = fn(data)
      if (next !== data) write(next)
    },

    // Patch one item in an array-valued resource without a refetch. Does NOT
    // mark the resource loaded — a local tweak isn't a full session fetch.
    patchItem(id, partial, idKey = 'id') {
      if (!Array.isArray(data)) return
      let changed = false
      const next = data.map(item => {
        if (item?.[idKey] !== id) return item
        changed = true
        return { ...item, ...partial }
      })
      if (changed) write(next)
    },

    // Mark stale so the next `ensure()` refetches. Also supersedes any fetch
    // already in flight (it started before whatever made us stale).
    invalidate() { loaded = false; generation++; inflight = null },

    // Drop everything (sign-out).
    clear() {
      generation++
      inflight = null
      loaded = false
      data = null
      if (storageKey) {
        try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
      }
      emit()
    },

    // Fetch if we haven't this session (or `force`). Non-forced calls share the
    // latest in-flight request; a forced call always starts a new one that
    // supersedes older requests (latest wins).
    async ensure(force = false) {
      if (!force && loaded) return data
      if (!force && inflight) return inflight
      return startFetch()
    },
  }
  _resources.add(resource)
  return resource
}
