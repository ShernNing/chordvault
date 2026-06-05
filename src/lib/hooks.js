import { useState, useEffect, useCallback } from 'react'
import { supabaseSongOps, supabaseSetlistOps } from './supabaseOps'
import { ingest, cleanSongTitle } from './ingestion'

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
const SONGS_CACHE_KEY = 'cv-songs-cache'

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
  const [songs, setSongs] = useState(() => {
    try {
      const raw = localStorage.getItem(SONGS_CACHE_KEY)
      return raw ? _sortSongs(JSON.parse(raw), sortBy) : []
    } catch { return [] }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (force = false) => {
    if (force) {
      setSongs([])
      try { localStorage.removeItem(SONGS_CACHE_KEY) } catch {}
    }
    try {
      setLoading(true)
      setError(null)
      const data = _sortSongs(await supabaseSongOps.getAll(), sortBy)
      setSongs(data)
      try { localStorage.setItem(SONGS_CACHE_KEY, JSON.stringify(data)) } catch {}
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [sortBy])

  useEffect(() => { load() }, [load])

  const createSong = useCallback(async (rawContent, title, artist, tags = []) => {
    const result = ingest(rawContent, title)
    const cleanedTitle = cleanSongTitle(title)
    const song = await supabaseSongOps.create({ title: cleanedTitle, artist, raw_content: rawContent, parsed_content: result.parsed_content, original_key: result.original_key, tags })
    await load()
    return { song, ingestionResult: result }
  }, [load])

  const updateSong = useCallback(async (id, updates) => {
    let finalUpdates = { ...updates }
    if (updates.title) finalUpdates.title = cleanSongTitle(updates.title)
    if (updates.raw_content) {
      const result = ingest(updates.raw_content, updates.title)
      finalUpdates.parsed_content = result.parsed_content
      if (!updates.original_key) finalUpdates.original_key = result.original_key
    }
    const song = await supabaseSongOps.update(id, finalUpdates)
    await load()
    return song
  }, [load])

  const deleteSong = useCallback(async (id) => {
    await supabaseSongOps.delete(id)
    await load()
  }, [load])

  const bulkDeleteSongs = useCallback(async (ids) => {
    await supabaseSongOps.deleteMany(ids)
    await load()
  }, [load])

  return { songs, loading: loading && songs.length === 0, error, reload: () => load(true), createSong, updateSong, deleteSong, bulkDeleteSongs }
}

// ─── Single Song ───────────────────────────────────────────────────────────
export function useSong(id) {
  const [song, setSong] = useState(() => {
    if (!id) return null
    try {
      const raw = localStorage.getItem(`cv-song-cache-${id}`)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (force = false) => {
    if (!id) return
    if (force) {
      setSong(null)
      try { localStorage.removeItem(`cv-song-cache-${id}`) } catch {}
    }
    try {
      setLoading(true)
      setError(null)
      const data = await supabaseSongOps.getById(id)
      if (!data) throw new Error('Song not found')
      setSong(data)
      try { localStorage.setItem(`cv-song-cache-${id}`, JSON.stringify(data)) } catch {}
      // Fire-and-forget: don't block the loading state on the play-count write.
      supabaseSongOps.markPlayed(id).catch(() => {})
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const update = useCallback(async (updates) => {
    let finalUpdates = { ...updates }
    if (updates.title) finalUpdates.title = cleanSongTitle(updates.title)
    if (updates.raw_content) {
      const result = ingest(updates.raw_content, updates.title || song?.title)
      finalUpdates.parsed_content = result.parsed_content
      if (!updates.original_key) finalUpdates.original_key = result.original_key
    }
    const updated = await supabaseSongOps.update(id, finalUpdates)
    setSong(updated)
    try { localStorage.setItem(`cv-song-cache-${id}`, JSON.stringify(updated)) } catch {}
    return updated
  }, [id, song])

  return { song, loading: loading && !song, error, reload: () => load(true), update }
}

// ─── Setlists ──────────────────────────────────────────────────────────────
export function useSetlists() {
  const [setlists, setSetlists] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setSetlists(await supabaseSetlistOps.getAll())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createSetlist = useCallback(async (name) => {
    const s = await supabaseSetlistOps.create(name)
    await load()
    return s
  }, [load])

  const deleteSetlist = useCallback(async (id) => {
    await supabaseSetlistOps.delete(id)
    await load()
  }, [load])

  return { setlists, loading, error, reload: load, createSetlist, deleteSetlist }
}

// ─── Single Setlist ────────────────────────────────────────────────────────
export function useSetlist(id) {
  const [setlist, setSetlist] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      setError(null)
      const data = await supabaseSetlistOps.getWithSongs(id)
      if (!data) throw new Error('Setlist not found')
      setSetlist(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const addSong = useCallback(async (songId, chosenKey, capo) => {
    await supabaseSetlistOps.addSong(id, songId, chosenKey, capo)
    await load()
  }, [id, load])

  const removeSong = useCallback(async (slotId) => {
    await supabaseSetlistOps.removeSong(slotId)
    await load()
  }, [load])

  const updateSlot = useCallback(async (slotId, updates) => {
    await supabaseSetlistOps.updateSongSlot(slotId, updates)
    await load()
  }, [load])

  const reorder = useCallback(async (orderedSlotIds) => {
    await supabaseSetlistOps.reorderSongs(id, orderedSlotIds)
    await load()
  }, [id, load])

  const rename = useCallback(async (name) => {
    await supabaseSetlistOps.update(id, { name })
    await load()
  }, [id, load])

  return { setlist, loading, error, reload: load, addSong, removeSong, updateSlot, reorder, rename }
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
