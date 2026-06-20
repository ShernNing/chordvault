// ─── Shared resource cache ───────────────────────────────────────────────────
//
// A tiny module-level store so data survives route changes instead of being
// re-fetched on every mount. Backs the song/setlist hooks.
//
//  • Fetches once per session, then serves from memory until `invalidate()`d
//    (called by mutations — create / edit / delete).
//  • Single-flight: concurrent `ensure()` calls share one network request, so
//    components that mount together (e.g. SongView + its panels) fetch once.
//  • Optional localStorage mirror for instant first paint and offline.
//  • Compatible with React's `useSyncExternalStore` — `getSnapshot` returns a
//    stable reference until the data actually changes.

export function createResource({ fetcher, storageKey = null }) {
  let data = readInitial()
  let loaded = false        // have we fetched from the network this session?
  let inflight = null       // in-progress fetch promise (for single-flight)
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
      if (data == null) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, JSON.stringify(data))
    } catch {}
  }

  function emit() { subs.forEach(fn => fn()) }

  function write(next) {
    data = next
    persist()
    emit()
  }

  return {
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
    getSnapshot() { return data },
    isLoaded() { return loaded },

    // Replace the cached value directly (fresh data after a mutation).
    set(next) { loaded = true; write(next) },

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

    // Mark stale so the next `ensure()` refetches.
    invalidate() { loaded = false },

    // Fetch if we haven't this session (or `force`). Dedupes concurrent calls.
    async ensure(force = false) {
      if (!force && loaded) return data
      if (inflight) return inflight
      inflight = Promise.resolve()
        .then(fetcher)
        .then(fresh => { loaded = true; write(fresh); return fresh })
        .finally(() => { inflight = null })
      return inflight
    },
  }
}
