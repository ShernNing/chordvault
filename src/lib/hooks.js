import { useState, useEffect, useCallback } from 'react'
import { songOps, setlistOps } from './db'
import { supabaseSongOps, supabaseSetlistOps } from './supabaseOps'
import { useAuth } from './AuthContext'
import { ingest } from './ingestion'

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

// ─── Songs ─────────────────────────────────────────────────────────────────
export function useSongs(sortBy = 'title') {
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { isLoggedIn } = useAuth()

  const load = useCallback(async () => {
    const ops = isLoggedIn ? supabaseSongOps : songOps
    try {
      setLoading(true)
      setError(null)
      let data = await ops.getAll()

      switch (sortBy) {
        case 'artist': data = data.sort((a, b) => (a.artist || '').localeCompare(b.artist || '')); break
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
  }, [isLoggedIn, sortBy])

  useEffect(() => { load() }, [load])

  const createSong = useCallback(async (rawContent, title, artist, tags = []) => {
    const ops = isLoggedIn ? supabaseSongOps : songOps
    const result = ingest(rawContent, title)
    const song = await ops.create({ title, artist, raw_content: rawContent, parsed_content: result.parsed_content, original_key: result.original_key, tags })
    await load()
    return { song, ingestionResult: result }
  }, [isLoggedIn, load])

  const updateSong = useCallback(async (id, updates) => {
    const ops = isLoggedIn ? supabaseSongOps : songOps
    let finalUpdates = { ...updates }
    if (updates.raw_content) {
      const result = ingest(updates.raw_content, updates.title)
      finalUpdates.parsed_content = result.parsed_content
      if (!updates.original_key) finalUpdates.original_key = result.original_key
    }
    const song = await ops.update(id, finalUpdates)
    await load()
    return song
  }, [isLoggedIn, load])

  const deleteSong = useCallback(async (id) => {
    const ops = isLoggedIn ? supabaseSongOps : songOps
    await ops.delete(id)
    await load()
  }, [isLoggedIn, load])

  const bulkDeleteSongs = useCallback(async (ids) => {
    const ops = isLoggedIn ? supabaseSongOps : songOps
    for (const id of ids) await ops.delete(id)
    await load()
  }, [isLoggedIn, load])

  return { songs, loading, error, reload: load, createSong, updateSong, deleteSong, bulkDeleteSongs }
}

// ─── Single Song ───────────────────────────────────────────────────────────
export function useSong(id) {
  const [song, setSong] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { isLoggedIn } = useAuth()

  const load = useCallback(async () => {
    if (!id) return
    const ops = isLoggedIn ? supabaseSongOps : songOps
    try {
      setLoading(true)
      setError(null)
      const data = await ops.getById(id)
      if (!data) throw new Error('Song not found')
      setSong(data)
      await ops.markPlayed(id)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id, isLoggedIn])

  useEffect(() => { load() }, [load])

  const update = useCallback(async (updates) => {
    const ops = isLoggedIn ? supabaseSongOps : songOps
    let finalUpdates = { ...updates }
    if (updates.raw_content) {
      const result = ingest(updates.raw_content, updates.title || song?.title)
      finalUpdates.parsed_content = result.parsed_content
      if (!updates.original_key) finalUpdates.original_key = result.original_key
    }
    const updated = await ops.update(id, finalUpdates)
    setSong(updated)
    return updated
  }, [id, isLoggedIn, song])

  return { song, loading, error, reload: load, update }
}

// ─── Setlists ──────────────────────────────────────────────────────────────
export function useSetlists() {
  const [setlists, setSetlists] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { isLoggedIn } = useAuth()

  const load = useCallback(async () => {
    const ops = isLoggedIn ? supabaseSetlistOps : setlistOps
    try {
      setLoading(true)
      setError(null)
      setSetlists(await ops.getAll())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [isLoggedIn])

  useEffect(() => { load() }, [load])

  const createSetlist = useCallback(async (name) => {
    const ops = isLoggedIn ? supabaseSetlistOps : setlistOps
    const s = await ops.create(name)
    await load()
    return s
  }, [isLoggedIn, load])

  const deleteSetlist = useCallback(async (id) => {
    const ops = isLoggedIn ? supabaseSetlistOps : setlistOps
    await ops.delete(id)
    await load()
  }, [isLoggedIn, load])

  return { setlists, loading, error, reload: load, createSetlist, deleteSetlist }
}

// ─── Single Setlist ────────────────────────────────────────────────────────
export function useSetlist(id) {
  const [setlist, setSetlist] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { isLoggedIn } = useAuth()

  const load = useCallback(async () => {
    if (!id) return
    const ops = isLoggedIn ? supabaseSetlistOps : setlistOps
    try {
      setLoading(true)
      setError(null)
      const data = await ops.getWithSongs(id)
      if (!data) throw new Error('Setlist not found')
      setSetlist(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id, isLoggedIn])

  useEffect(() => { load() }, [load])

  const addSong = useCallback(async (songId, chosenKey, capo) => {
    const ops = isLoggedIn ? supabaseSetlistOps : setlistOps
    await ops.addSong(id, songId, chosenKey, capo)
    await load()
  }, [id, isLoggedIn, load])

  const removeSong = useCallback(async (slotId) => {
    const ops = isLoggedIn ? supabaseSetlistOps : setlistOps
    await ops.removeSong(slotId)
    await load()
  }, [isLoggedIn, load])

  const updateSlot = useCallback(async (slotId, updates) => {
    const ops = isLoggedIn ? supabaseSetlistOps : setlistOps
    await ops.updateSongSlot(slotId, updates)
    await load()
  }, [isLoggedIn, load])

  const reorder = useCallback(async (orderedSlotIds) => {
    const ops = isLoggedIn ? supabaseSetlistOps : setlistOps
    await ops.reorderSongs(id, orderedSlotIds)
    await load()
  }, [id, isLoggedIn, load])

  const rename = useCallback(async (name) => {
    const ops = isLoggedIn ? supabaseSetlistOps : setlistOps
    await ops.update(id, { name })
    await load()
  }, [id, isLoggedIn, load])

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
