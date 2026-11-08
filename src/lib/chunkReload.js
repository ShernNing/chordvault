// After a deploy, an open tab still references the previous build's hashed
// chunk names. Lazy-loading a view then fails with a chunk-load error and the
// app would blank. One reload fetches the new index.html + chunks. A
// sessionStorage timestamp prevents reload loops if the failure is real
// (e.g. offline).

const KEY = 'cv-chunk-reload-at'
const WINDOW_MS = 30_000

const PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
  /ChunkLoadError/i,
]

export function isChunkLoadError(error) {
  if (!error) return false
  const text = `${error.name || ''} ${error.message || error}`
  return PATTERNS.some((re) => re.test(text))
}

// Returns true if a reload was triggered.
export function reloadOnceForStaleChunk(storage = globalThis.sessionStorage, now = Date.now(), reload = () => window.location.reload()) {
  try {
    const stored = storage?.getItem(KEY)
    if (stored != null && now - Number(stored) < WINDOW_MS) return false
    storage?.setItem(KEY, String(now))
  } catch {
    return false
  }
  reload()
  return true
}
