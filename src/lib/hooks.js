import { useState, useEffect, useCallback, useMemo, useSyncExternalStore, useRef } from 'react'
import { supabaseSongOps, supabaseSetlistOps } from './supabaseOps'
import { ingest, cleanSongTitle } from './ingestion'
import { createResource } from './cache'

// ─── Online Status ─────────────────────────────────────────────────────────
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  return isOnline
}

// ─── Local Storage ─────────────────────────────────────────────────────────
export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? JSON.parse(stored) : defaultValue
    } catch { return defaultValue }
  })

  const setStored = useCallback((newValue) => {
    setValue(prev => {
      const resolved = typeof newValue === 'function' ? newValue(prev) : newValue
      try { localStorage.setItem(key, JSON.stringify(resolved)) } catch {}
      return resolved
    })
  }, [key])

  return [value, setStored]
}

// ─── Theme ─────────────────────────────────────────────────────────────────
export const DARK_THEMES = [
  { id: 'slate', label: 'Slate', swatch: '#0f172a', vars: null },
  {
    id: 'black', label: 'Black', swatch: '#000000',
    vars: {
      '--color-bg': '#000000', '--color-bg-warm': '#111111', '--color-border': '#222222',
      '--color-ink': '#f0f0f0', '--color-ink-soft': '#aaaaaa', '--color-ink-muted': '#666666',
      '--color-accent': '#f59e0b', '--color-accent-soft': '#1a1200',
      '--chord-color': '#fbbf24', '--lyric-color': '#f0f0f0', '--section-header-color': '#fbbf24',
    },
  },
  {
    id: 'gray', label: 'Gray', swatch: '#252525',
    vars: {
      '--color-bg': '#1a1a1a', '--color-bg-warm': '#252525', '--color-border': '#383838',
      '--color-ink': '#eeeeee', '--color-ink-soft': '#aaaaaa', '--color-ink-muted': '#666666',
      '--color-accent': '#f59e0b', '--color-accent-soft': '#1c1405',
      '--chord-color': '#fbbf24', '--lyric-color': '#eeeeee', '--section-header-color': '#fbbf24',
    },
  },
  {
    id: 'cream', label: 'Cream', swatch: '#2a2318',
    vars: {
      '--color-bg': '#1e1a14', '--color-bg-warm': '#2a2318', '--color-border': '#3d3426',
      '--color-ink': '#f0e6d0', '--color-ink-soft': '#b8a88a', '--color-ink-muted': '#7a6a52',
      '--color-accent': '#e8a020', '--color-accent-soft': '#2a1e08',
      '--chord-color': '#e8a020', '--lyric-color': '#f0e6d0', '--section-header-color': '#e8a020',
    },
  },
]

const ALL_DARK_VARS = [...new Set(DARK_THEMES.flatMap(t => t.vars ? Object.keys(t.vars) : []))]

export const STAGE_COLORS = [
  { id: 'gold',  label: 'Gold',  chord: '#FFD700', lyric: '#ffffff' },
  { id: 'green', label: 'Green', chord: '#00ff88', lyric: '#ffffff' },
  { id: 'cyan',  label: 'Cyan',  chord: '#00d4ff', lyric: '#ffffff' },
  { id: 'white', label: 'White', chord: '#ffffff', lyric: '#dddddd' },
  { id: 'pink',  label: 'Pink',  chord: '#ff6eb4', lyric: '#ffffff' },
]

export function useTheme() {
  // Default to the OS color-scheme when the user hasn't chosen yet.
  const prefersDark = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
  const [isDark, setIsDark] = useLocalStorage('chordvault-dark-mode', prefersDark)
  const [isStage, setIsStage] = useLocalStorage('chordvault-stage-mode', false)
  const [stageColorId, setStageColorId] = useLocalStorage('chordvault-stage-color', 'gold')
  const [darkThemeId, setDarkThemeId] = useLocalStorage('chordvault-dark-theme', 'slate')

  useEffect(() => {
    const root = document.documentElement
    if (isStage) {
      root.classList.add('dark', 'stage-mode')
      ALL_DARK_VARS.forEach(k => root.style.removeProperty(k))
      const col = STAGE_COLORS.find(c => c.id === stageColorId) || STAGE_COLORS[0]
      root.style.setProperty('--chord-color', col.chord)
      root.style.setProperty('--lyric-color', col.lyric)
      root.style.setProperty('--section-header-color', col.chord)
      root.style.setProperty('--color-accent', col.chord)
    } else {
      root.classList.remove('stage-mode')
      root.style.removeProperty('--chord-color')
      root.style.removeProperty('--lyric-color')
      root.style.removeProperty('--section-header-color')
      root.style.removeProperty('--color-accent')
      if (isDark) {
        root.classList.add('dark')
        const theme = DARK_THEMES.find(t => t.id === darkThemeId)
        if (theme?.vars) {
          Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
        } else {
          ALL_DARK_VARS.forEach(k => root.style.removeProperty(k))
        }
      } else {
        root.classList.remove('dark')
        ALL_DARK_VARS.forEach(k => root.style.removeProperty(k))
      }
    }
  }, [isDark, isStage, stageColorId, darkThemeId])

  const toggleDark = () => { setIsDark(d => !d); if (isStage) setIsStage(false) }
  const toggleStage = () => { setIsStage(s => !s); if (!isStage) setIsDark(true) }

  return { isDark, isStage, toggleDark, toggleStage, stageColorId, setStageColorId, darkThemeId, setDarkThemeId }
}

// ─── Display Settings ──────────────────────────────────────────────────────
export const FONT_OPTIONS = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
]

export function useDisplaySettings() {
  const [fontSize, setFontSize] = useLocalStorage('cv-font-size', 14)
  const [fontFamily, setFontFamily] = useLocalStorage('cv-font-family', 'Arial, sans-serif')

  useEffect(() => {
    // Migrate old default of 12 to new default of 14
    if (fontSize === 12) { setFontSize(14); return }
    const root = document.documentElement
    root.style.setProperty('--chord-font', fontFamily)
    root.style.setProperty('--lyric-font', fontFamily)
    root.style.setProperty('--chord-size', `${fontSize}px`)
    root.style.setProperty('--lyric-size', `${fontSize}px`)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setFontSize from useLocalStorage is stable and intentionally omitted
  }, [fontSize, fontFamily])

  return { fontSize, setFontSize, fontFamily, setFontFamily }
}

// ─── Songs ─────────────────────────────────────────────────────────────────
// Shared caches — fetched once per session, refetched only when a mutation
// invalidates them. Survive route changes so navigating back is instant.
const songsResource = createResource({
  fetcher: () => supabaseSongOps.getAll(),
  storageKey: 'cv-songs-cache',
})
const setlistsResource = createResource({
  fetcher: () => supabaseSetlistOps.getAll(),
  storageKey: 'cv-setlists-cache',
})

const _songResources = new Map()
function songResource(id) {
  if (!_songResources.has(id)) {
    _songResources.set(id, createResource({
      fetcher: () => supabaseSongOps.getById(id),
      storageKey: `cv-song-cache-${id}`,
    }))
  }
  return _songResources.get(id)
}

const _setlistResources = new Map()
function setlistResource(id) {
  if (!_setlistResources.has(id)) {
    _setlistResources.set(id, createResource({
      fetcher: () => supabaseSetlistOps.getWithSongs(id),
      storageKey: `cv-setlist-cache-${id}`,
    }))
  }
  return _setlistResources.get(id)
}

const _noopSubscribe = () => () => {}
const _nullSnapshot = () => null

function _sortSongs(data, sortBy) {
  const d = [...data]
  switch (sortBy) {
    case 'artist': return d.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''))
    case 'key': return d.sort((a, b) => (a.original_key || '').localeCompare(b.original_key || '') || (a.title || '').localeCompare(b.title || ''))
    case 'recent': return d.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    case 'played': return d.sort((a, b) => {
      if (!a.last_played_at && !b.last_played_at) return 0
      if (!a.last_played_at) return 1
      if (!b.last_played_at) return -1
      return new Date(b.last_played_at) - new Date(a.last_played_at)
    })
    default: return d.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  }
}

export function useSongs(sortBy = 'title') {
  const data = useSyncExternalStore(songsResource.subscribe, songsResource.getSnapshot)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(() => !songsResource.isLoaded())

  // Fetch once per session; cached data is served instantly on later mounts.
  const load = useCallback(async (force = false) => {
    try {
      setError(null)
      setPending(!songsResource.isLoaded() || force)
      await songsResource.ensure(force)
    } catch (e) {
      setError(e.message)
    } finally {
      setPending(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Sort is client-side — changing `sortBy` never triggers a refetch.
  const songs = useMemo(() => _sortSongs(data ?? [], sortBy), [data, sortBy])

  const createSong = useCallback(async (rawContent, title, artist, tags = []) => {
    const result = ingest(rawContent, title)
    const cleanedTitle = cleanSongTitle(title)
    const song = await supabaseSongOps.create({ title: cleanedTitle, artist, raw_content: rawContent, parsed_content: result.parsed_content, original_key: result.original_key, tags })
    await songsResource.ensure(true)
    return { song, ingestionResult: result }
  }, [])

  const updateSong = useCallback(async (id, updates) => {
    let finalUpdates = { ...updates }
    if (updates.title) finalUpdates.title = cleanSongTitle(updates.title)
    if (updates.raw_content) {
      const result = ingest(updates.raw_content, updates.title)
      finalUpdates.parsed_content = result.parsed_content
      if (!updates.original_key) finalUpdates.original_key = result.original_key
    }
    const song = await supabaseSongOps.update(id, finalUpdates)
    await songsResource.ensure(true)
    return song
  }, [])

  const deleteSong = useCallback(async (id) => {
    await supabaseSongOps.delete(id)
    await songsResource.ensure(true)
  }, [])

  const bulkDeleteSongs = useCallback(async (ids) => {
    await supabaseSongOps.deleteMany(ids)
    await songsResource.ensure(true)
  }, [])

  return { songs, loading: pending && songs.length === 0, error, reload: () => load(true), createSong, updateSong, deleteSong, bulkDeleteSongs }
}

// ─── Single Song ───────────────────────────────────────────────────────────
export function useSong(id) {
  const res = id ? songResource(id) : null
  const song = useSyncExternalStore(
    res ? res.subscribe : _noopSubscribe,
    res ? res.getSnapshot : _nullSnapshot,
  )
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(() => !!id && !(res && res.isLoaded()))

  useEffect(() => {
    if (!id) return
    const r = songResource(id)
    let alive = true
    setError(null)
    setPending(!r.isLoaded())
    r.ensure()
      .then(data => { if (!data) throw new Error('Song not found') })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setPending(false) })
    // Fire-and-forget play tracking. Patch the songs-list cache in place so
    // "recently played" sort stays fresh without a full refetch.
    supabaseSongOps.markPlayed(id).catch(() => {})
    songsResource.patchItem(id, { last_played_at: new Date().toISOString() })
    return () => { alive = false }
  }, [id])

  const reload = useCallback(() => { if (id) songResource(id).ensure(true) }, [id])

  const update = useCallback(async (updates) => {
    let finalUpdates = { ...updates }
    if (updates.title) finalUpdates.title = cleanSongTitle(updates.title)
    if (updates.raw_content) {
      const result = ingest(updates.raw_content, updates.title || song?.title)
      finalUpdates.parsed_content = result.parsed_content
      if (!updates.original_key) finalUpdates.original_key = result.original_key
    }
    const updated = await supabaseSongOps.update(id, finalUpdates)
    songResource(id).set(updated)
    songsResource.invalidate() // list now stale — refetch on next Library mount
    return updated
  }, [id, song])

  return { song, loading: pending && !song, error, reload, update }
}

// ─── Setlists ──────────────────────────────────────────────────────────────
export function useSetlists() {
  const data = useSyncExternalStore(setlistsResource.subscribe, setlistsResource.getSnapshot)
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(() => !setlistsResource.isLoaded())

  const load = useCallback(async (force = false) => {
    try {
      setError(null)
      setPending(!setlistsResource.isLoaded() || force)
      await setlistsResource.ensure(force)
    } catch (e) {
      setError(e.message)
    } finally {
      setPending(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const setlists = data ?? []

  const createSetlist = useCallback(async (name) => {
    const s = await supabaseSetlistOps.create(name)
    await setlistsResource.ensure(true)
    return s
  }, [])

  const deleteSetlist = useCallback(async (id) => {
    await supabaseSetlistOps.delete(id)
    _setlistResources.delete(id)
    await setlistsResource.ensure(true)
  }, [])

  return { setlists, loading: pending && setlists.length === 0, error, reload: () => load(true), createSetlist, deleteSetlist }
}

// ─── Single Setlist ────────────────────────────────────────────────────────
export function useSetlist(id) {
  const res = id ? setlistResource(id) : null
  const setlist = useSyncExternalStore(
    res ? res.subscribe : _noopSubscribe,
    res ? res.getSnapshot : _nullSnapshot,
  )
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(() => !!id && !(res && res.isLoaded()))

  const load = useCallback(async (force = false) => {
    if (!id) return
    const r = setlistResource(id)
    try {
      setError(null)
      setPending(!r.isLoaded() || force)
      const data = await r.ensure(force)
      if (!data) throw new Error('Setlist not found')
    } catch (e) {
      setError(e.message)
    } finally {
      setPending(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(() => setlistResource(id).ensure(true), [id])

  const addSong = useCallback(async (songId, chosenKey, capo) => {
    await supabaseSetlistOps.addSong(id, songId, chosenKey, capo)
    await refresh()
  }, [id, refresh])

  const addDivider = useCallback(async (label, pageBreak = false) => {
    await supabaseSetlistOps.addDivider(id, label, pageBreak)
    await refresh()
  }, [id, refresh])

  const removeSong = useCallback(async (slotId) => {
    await supabaseSetlistOps.removeSong(slotId)
    await refresh()
  }, [refresh])

  const updateSlot = useCallback(async (slotId, updates) => {
    await supabaseSetlistOps.updateSongSlot(slotId, updates)
    await refresh()
  }, [refresh])

  const reorder = useCallback(async (orderedSlotIds) => {
    const r = setlistResource(id)
    const current = r.getSnapshot()
    // Optimistic: reorder the cached snapshot immediately so the list settles
    // the moment the user drops, then persist in the background.
    if (current?.songs) {
      const byId = new Map(current.songs.map((s) => [s.id, s]))
      const songs = orderedSlotIds
        .map((sid, position) => {
          const s = byId.get(sid)
          return s ? { ...s, position } : null
        })
        .filter(Boolean)
      r.set({ ...current, songs })
      try {
        await supabaseSetlistOps.reorderSongs(id, orderedSlotIds)
      } catch (e) {
        r.set(current) // rollback on failure
        throw e
      }
      return
    }
    await supabaseSetlistOps.reorderSongs(id, orderedSlotIds)
    await refresh()
  }, [id, refresh])

  const rename = useCallback(async (name) => {
    await supabaseSetlistOps.update(id, { name })
    await refresh()
    setlistsResource.invalidate() // name shown in the list — refetch it next time
  }, [id, refresh])

  return { setlist, loading: pending && !setlist, error, reload: () => load(true), addSong, addDivider, removeSong, updateSlot, reorder, rename }
}

// ─── Keyboard / Pedal Controls ───────────────────────────────────────────────
// Maps arrow keys, space, and PageUp/PageDown (the codes most Bluetooth
// page-turner pedals send) to next / prev / toggle actions. Ignores key events
// while the user is typing in a form field.
export function useKeyboardControls({ onNext, onPrev, onToggle, enabled = true }) {
  useEffect(() => {
    if (!enabled) return undefined
    const handler = (e) => {
      const el = e.target
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          if (onNext) { e.preventDefault(); onNext() }
          break
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          if (onPrev) { e.preventDefault(); onPrev() }
          break
        case ' ':
        case 'Spacebar':
          if (onToggle) { e.preventDefault(); onToggle() }
          break
        default:
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onNext, onPrev, onToggle, enabled])
}

// ─── Per-song duration estimate (localStorage, no DB) ────────────────────────
export const DEFAULT_SONG_SECONDS = 210 // 3:30 default per song

export function getSongSeconds(songId) {
  try {
    const v = localStorage.getItem(`cv-duration-${songId}`)
    const n = v != null ? JSON.parse(v) : DEFAULT_SONG_SECONDS
    return Number.isFinite(n) ? n : DEFAULT_SONG_SECONDS
  } catch { return DEFAULT_SONG_SECONDS }
}

export function setSongSeconds(songId, seconds) {
  try { localStorage.setItem(`cv-duration-${songId}`, JSON.stringify(seconds)) } catch { /* quota */ }
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

// ─── Debounce ──────────────────────────────────────────────────────────────
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// ─── Search ────────────────────────────────────────────────────────────────
export function useSearch(allSongs) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 200)
  const [results, setResults] = useState(allSongs)

  useEffect(() => {
    if (!debouncedQuery.trim()) { setResults(allSongs); return }
    const q = debouncedQuery.toLowerCase()
    setResults(allSongs.filter(s =>
      s.title?.toLowerCase().includes(q) ||
      s.artist?.toLowerCase().includes(q) ||
      s.original_key?.toLowerCase().includes(q) ||
      s.tags?.some(t => t.toLowerCase().includes(q))
    ))
  }, [debouncedQuery, allSongs])

  return { query, setQuery, results }
}

// ─── Semantic search ─────────────────────────────────────────────────────────
// Calls the search-songs edge function for the typed query and returns the
// ranked matching song ids. Debounced (400ms), min length 3, per-session cache,
// and stale responses are ignored (acts as an abort).
export function useSemanticSearch(query) {
  const debounced = useDebounce(query, 400)
  const [relatedIds, setRelatedIds] = useState([])
  const cacheRef = useRef(new Map())

  useEffect(() => {
    const q = debounced.trim()
    if (q.length < 3) { setRelatedIds([]); return }
    if (cacheRef.current.has(q)) { setRelatedIds(cacheRef.current.get(q)); return }

    let cancelled = false
    supabaseSongOps.semanticSearch(q)
      .then(results => {
        if (cancelled) return
        const ids = results.map(r => r.id)
        cacheRef.current.set(q, ids)
        setRelatedIds(ids)
      })
      .catch(() => { if (!cancelled) setRelatedIds([]) })

    return () => { cancelled = true }
  }, [debounced])

  return { relatedIds }
}
