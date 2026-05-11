import { useState, useEffect, useCallback, useRef } from 'react'
import { db, songOps, setlistOps, appStateOps } from './db'
import { ingest } from './ingestion'

// ─── Online Status ─────────────────────────────────────────────────────────
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

// ─── Local Storage ─────────────────────────────────────────────────────────
export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setStored = useCallback((newValue) => {
    setValue(newValue)
    try {
      localStorage.setItem(key, JSON.stringify(newValue))
    } catch {}
  }, [key])

  return [value, setStored]
}

// ─── Theme ─────────────────────────────────────────────────────────────────
export function useTheme() {
  const [isDark, setIsDark] = useLocalStorage('chordvault-dark-mode', false)
  const [isStage, setIsStage] = useLocalStorage('chordvault-stage-mode', false)

  useEffect(() => {
    const root = document.documentElement
    if (isStage) {
      root.classList.add('dark', 'stage-mode')
    } else if (isDark) {
      root.classList.add('dark')
      root.classList.remove('stage-mode')
    } else {
      root.classList.remove('dark', 'stage-mode')
    }
  }, [isDark, isStage])

  const toggleDark = () => {
    setIsDark(d => !d)
    if (isStage) setIsStage(false)
  }

  const toggleStage = () => {
    setIsStage(s => !s)
    if (!isStage) setIsDark(true)
  }

  return { isDark, isStage, toggleDark, toggleStage }
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
      let data = await songOps.getAll()

      switch (sortBy) {
        case 'artist':
          data = data.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''))
          break
        case 'recent':
          data = data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          break
        case 'played':
          data = data.sort((a, b) => {
            if (!a.last_played_at && !b.last_played_at) return 0
            if (!a.last_played_at) return 1
            if (!b.last_played_at) return -1
            return new Date(b.last_played_at) - new Date(a.last_played_at)
          })
          break
        default: // title
          data = data.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
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
    const song = await songOps.create({
      title,
      artist,
      raw_content: rawContent,
      parsed_content: result.parsed_content,
      original_key: result.original_key,
      tags,
    })
    await load()
    return { song, ingestionResult: result }
  }, [load])

  const updateSong = useCallback(async (id, updates) => {
    let finalUpdates = { ...updates }
    if (updates.raw_content) {
      const result = ingest(updates.raw_content, updates.title)
      finalUpdates.parsed_content = result.parsed_content
      if (!updates.original_key) {
        finalUpdates.original_key = result.original_key
      }
    }
    const song = await songOps.update(id, finalUpdates)
    await load()
    return song
  }, [load])

  const deleteSong = useCallback(async (id) => {
    await songOps.delete(id)
    await load()
  }, [load])

  const bulkDeleteSongs = useCallback(async (ids) => {
    for (const id of ids) {
      await songOps.delete(id)
    }
    await load()
  }, [load])

  return { songs, loading, error, reload: load, createSong, updateSong, deleteSong, bulkDeleteSongs }
}

// ─── Single Song ───────────────────────────────────────────────────────────
export function useSong(id) {
  const [song, setSong] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      setError(null)
      const data = await songOps.getById(id)
      if (!data) throw new Error('Song not found')
      setSong(data)
      // Mark as played
      await songOps.markPlayed(id)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const update = useCallback(async (updates) => {
    let finalUpdates = { ...updates }
    if (updates.raw_content) {
      const result = ingest(updates.raw_content, updates.title || song?.title)
      finalUpdates.parsed_content = result.parsed_content
      if (!updates.original_key) {
        finalUpdates.original_key = result.original_key
      }
    }
    const updated = await songOps.update(id, finalUpdates)
    setSong(updated)
    return updated
  }, [id, song])

  return { song, loading, error, reload: load, update }
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
      const data = await setlistOps.getAll()
      setSetlists(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createSetlist = useCallback(async (name) => {
    const s = await setlistOps.create(name)
    await load()
    return s
  }, [load])

  const deleteSetlist = useCallback(async (id) => {
    await setlistOps.delete(id)
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
      const data = await setlistOps.getWithSongs(id)
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
    await setlistOps.addSong(id, songId, chosenKey, capo)
    await load()
  }, [id, load])

  const removeSong = useCallback(async (slotId) => {
    await setlistOps.removeSong(slotId)
    await load()
  }, [load])

  const updateSlot = useCallback(async (slotId, updates) => {
    await setlistOps.updateSongSlot(slotId, updates)
    await load()
  }, [load])

  const reorder = useCallback(async (orderedSlotIds) => {
    await setlistOps.reorderSongs(id, orderedSlotIds)
    await load()
  }, [id, load])

  const rename = useCallback(async (name) => {
    await setlistOps.update(id, { name })
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
    if (!debouncedQuery.trim()) {
      setResults(allSongs)
      return
    }
    const q = debouncedQuery.toLowerCase()
    setResults(
      allSongs.filter(s =>
        s.title?.toLowerCase().includes(q) ||
        s.artist?.toLowerCase().includes(q) ||
        s.tags?.some(t => t.toLowerCase().includes(q))
      )
    )
  }, [debouncedQuery, allSongs])

  return { query, setQuery, results }
}

// ─── Auth ──────────────────────────────────────────────────────────────────
export function useAuth() {
  const [currentUser, setCurrentUser] = useState({ isLoggedIn: false })
  const [interaction, setInteraction] = useState(null)

  useEffect(() => {
    if (!db.cloud?.currentUser) return
    const sub = db.cloud.currentUser.subscribe(u => setCurrentUser(u ?? { isLoggedIn: false }))
    return () => sub.unsubscribe()
  }, [])

  useEffect(() => {
    if (!db.cloud?.userInteraction) return
    const sub = db.cloud.userInteraction.subscribe(ia => setInteraction(ia ?? null))
    return () => sub.unsubscribe()
  }, [])

  const login = useCallback(() => { db.cloud?.login?.() }, [])
  const logout = useCallback(() => { db.cloud?.logout?.() }, [])

  return {
    isLoggedIn: currentUser?.isLoggedIn ?? false,
    email: currentUser?.email,
    interaction,
    login,
    logout,
  }
}

// ─── Sync State ────────────────────────────────────────────────────────────
export function useSyncState() {
  const [syncState, setSyncState] = useState({ status: 'offline' })

  useEffect(() => {
    if (!db.cloud?.syncState) return
    const sub = db.cloud.syncState.subscribe(s => setSyncState(s ?? { status: 'offline' }))
    return () => sub.unsubscribe()
  }, [])

  return syncState
}
