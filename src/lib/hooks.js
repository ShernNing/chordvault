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
    setValue(newValue)
    try { localStorage.setItem(key, JSON.stringify(newValue)) } catch {}
  }, [key])

  return [value, setStored]
}

// ─── Theme ─────────────────────────────────────────────────────────────────
export function useTheme() {
  const [isDark, setIsDark] = useLocalStorage('chordvault-dark-mode', false)
  const [isStage, setIsStage] = useLocalStorage('chordvault-stage-mode', false)

  useEffect(() => {
    const root = document.documentElement
    if (isStage) { root.classList.add('dark', 'stage-mode') }
    else if (isDark) { root.classList.add('dark'); root.classList.remove('stage-mode') }
    else { root.classList.remove('dark', 'stage-mode') }
  }, [isDark, isStage])

  const toggleDark = () => { setIsDark(d => !d); if (isStage) setIsStage(false) }
  const toggleStage = () => { setIsStage(s => !s); if (!isStage) setIsDark(true) }

  return { isDark, isStage, toggleDark, toggleStage }
}

// ─── Display Settings ──────────────────────────────────────────────────────
export const FONT_OPTIONS = [
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
]

export function useDisplaySettings() {
  const [fontSize, setFontSize] = useLocalStorage('cv-font-size', 12)
  const [fontFamily, setFontFamily] = useLocalStorage('cv-font-family', "'Courier New', Courier, monospace")

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--chord-font', fontFamily)
    root.style.setProperty('--lyric-font', fontFamily)
    root.style.setProperty('--chord-size', `${fontSize}px`)
    root.style.setProperty('--lyric-size', `${fontSize}px`)
  }, [fontSize, fontFamily])

  return { fontSize, setFontSize, fontFamily, setFontFamily }
}

// ─── Songs ─────────────────────────────────────────────────────────────────
export function useSongs(sortBy = 'title') {
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      let data = await supabaseSongOps.getAll()

      switch (sortBy) {
        case 'artist': data = data.sort((a, b) => (a.artist || '').localeCompare(b.artist || '')); break
        case 'key': data = data.sort((a, b) => (a.original_key || '').localeCompare(b.original_key || '') || (a.title || '').localeCompare(b.title || '')); break
        case 'recent': data = data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break
        case 'played':
          data = data.sort((a, b) => {
            if (!a.last_played_at && !b.last_played_at) return 0
            if (!a.last_played_at) return 1
            if (!b.last_played_at) return -1
            return new Date(b.last_played_at) - new Date(a.last_played_at)
          })
          break
        default: data = data.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
      }

      setSongs(data)
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
    for (const id of ids) await supabaseSongOps.delete(id)
    await load()
  }, [load])

  return { songs, loading, error, reload: load, createSong, updateSong, deleteSong, bulkDeleteSongs }
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
      await supabaseSongOps.markPlayed(id)
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
      s.tags?.some(t => t.toLowerCase().includes(q))
    ))
  }, [debouncedQuery, allSongs])

  return { query, setQuery, results }
}
