import { useState, useEffect, useCallback, useMemo, useSyncExternalStore, useRef } from 'react'
import { supabaseSongOps, supabaseSetlistOps, supabaseFavoriteOps } from './supabaseOps'
import { toggleIn } from './favorites'
import { useAuth } from './AuthContext'
import { useToast } from './toast'
import { ingest, cleanSongTitle } from './ingestion'
import { createResource, onCacheReset } from './cache'
import { prepareSongUpdates } from './songUpdates'
import { scoreFields } from './fuzzySearch'
import { songSearchFields } from './songSearch'
import { DEFAULT_SONG_SECONDS, formatDuration, estimateSongSeconds } from './songDuration'

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
      '--color-ink': '#f0f0f0', '--color-ink-soft': '#aaaaaa', '--color-ink-muted': '#7e7e7e',
      '--color-accent': '#f59e0b', '--color-accent-soft': '#1a1200', '--color-accent-text': '#f59e0b',
      '--chord-color': '#fbbf24', '--lyric-color': '#f0f0f0', '--section-header-color': '#fbbf24',
    },
  },
  {
    id: 'gray', label: 'Gray', swatch: '#252525',
    vars: {
      '--color-bg': '#1a1a1a', '--color-bg-warm': '#252525', '--color-border': '#383838',
      '--color-ink': '#eeeeee', '--color-ink-soft': '#aaaaaa', '--color-ink-muted': '#8d8d8d',
      '--color-accent': '#f59e0b', '--color-accent-soft': '#1c1405', '--color-accent-text': '#f59e0b',
      '--chord-color': '#fbbf24', '--lyric-color': '#eeeeee', '--section-header-color': '#fbbf24',
    },
  },
  {
    id: 'cream', label: 'Cream', swatch: '#2a2318',
    vars: {
      '--color-bg': '#1e1a14', '--color-bg-warm': '#2a2318', '--color-border': '#3d3426',
      '--color-ink': '#f0e6d0', '--color-ink-soft': '#b8a88a', '--color-ink-muted': '#978b78',
      '--color-accent': '#e8a020', '--color-accent-soft': '#2a1e08', '--color-accent-text': '#e8a020',
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

// Per-id localStorage mirrors are LRU-capped (see cache.js) so they can't grow
// without bound.
const SONG_CACHE_CAP = 50
const SETLIST_CACHE_CAP = 20

const _songResources = new Map()
function songResource(id) {
  if (!_songResources.has(id)) {
    _songResources.set(id, createResource({
      fetcher: () => supabaseSongOps.getById(id),
      storageKey: `cv-song-cache-${id}`,
      storageGroup: 'song',
      storageCap: SONG_CACHE_CAP,
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
      storageGroup: 'setlist',
      storageCap: SETLIST_CACHE_CAP,
    }))
  }
  return _setlistResources.get(id)
}

// Sign-out (resetAllCaches) drops the per-id resources too.
onCacheReset(() => {
  _songResources.clear()
  _setlistResources.clear()
})

// ─── Cache-aware song mutations ──────────────────────────────────────────────
// Setlist caches hold full copies of their songs, so a song write must refresh
// the song resource, the library list AND every cached setlist embedding it.
// Every song create/update/delete in the app goes through these helpers.

function setlistsEmbedding(songId) {
  const out = []
  for (const r of _setlistResources.values()) {
    if (r.getSnapshot()?.songs?.some(s => s.song_id === songId)) out.push(r)
  }
  return out
}

function afterSongCreated(song) {
  songsResource.mutate(list => (Array.isArray(list) ? [...list, song] : list))
  songsResource.invalidate()
}

function afterSongUpdated(song) {
  if (_songResources.has(song.id)) _songResources.get(song.id).set(song)
  songsResource.patchItem(song.id, song)
  songsResource.invalidate()
  for (const r of setlistsEmbedding(song.id)) {
    r.mutate(sl => ({
      ...sl,
      songs: sl.songs.map(s => (s.song_id === song.id ? { ...s, song, missing: undefined } : s)),
    }))
    r.invalidate()
  }
}

function afterSongDeleted(id) {
  const res = _songResources.get(id)
  if (res) { res.clear(); _songResources.delete(id) }
  songsResource.mutate(list => (Array.isArray(list) ? list.filter(s => s.id !== id) : list))
  songsResource.invalidate()
  for (const r of setlistsEmbedding(id)) {
    r.mutate(sl => ({ ...sl, songs: sl.songs.filter(s => s.song_id !== id) }))
    r.invalidate()
  }
}

/** Mark one setlist's cache stale (e.g. a song was added from elsewhere). */
export function markSetlistStale(setlistId) {
  _setlistResources.get(setlistId)?.invalidate()
}

export async function createSongRecord(songData) {
  const song = await supabaseSongOps.create(songData)
  afterSongCreated(song)
  return song
}

/** Raw update (no parsing). Use prepareSongUpdates first for content changes. */
export async function updateSongRecord(id, updates) {
  const song = await supabaseSongOps.update(id, updates)
  afterSongUpdated(song)
  return song
}

export async function deleteSongRecord(id) {
  await supabaseSongOps.delete(id)
  afterSongDeleted(id)
}

/** Add a song to a setlist and mark that setlist stale. Throws DuplicateSlotError. */
export async function addSongToSetlist(setlistId, songId, chosenKey = null, capo = 0) {
  const slot = await supabaseSetlistOps.addSong(setlistId, songId, chosenKey, capo)
  markSetlistStale(setlistId)
  return slot
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
    const song = await createSongRecord({ title: cleanedTitle, artist, raw_content: rawContent, parsed_content: result.parsed_content, original_key: result.original_key, tags })
    await songsResource.ensure(true)
    return { song, ingestionResult: result }
  }, [])

  const updateSong = useCallback(async (id, updates) => {
    const song = await updateSongRecord(id, prepareSongUpdates(updates))
    await songsResource.ensure(true)
    return song
  }, [])

  const deleteSong = useCallback(async (id) => {
    await deleteSongRecord(id)
    await songsResource.ensure(true)
  }, [])

  // Returns { deleted: id[], failed: [{ id, error }] }; never hides partial failure.
  const bulkDeleteSongs = useCallback(async (ids) => {
    const result = await supabaseSongOps.deleteMany(ids)
    result.deleted.forEach(afterSongDeleted)
    await songsResource.ensure(true).catch(() => {})
    return result
  }, [])

  return { songs, loading: pending && songs.length === 0, error, reload: () => load(true), createSong, updateSong, deleteSong, bulkDeleteSongs }
}

// ─── Song Favourites ───────────────────────────────────────────────────────
// Per-user starred songs (song_favorites table). Toggle is optimistic and rolls
// back on failure so the star never lies about what is persisted.
export function useSongFavorites() {
  const { userId } = useAuth()
  const toast = useToast()
  const [ids, setIds] = useState(() => new Set())
  const [loading, setLoading] = useState(!!userId)
  const idsRef = useRef(ids)
  idsRef.current = ids

  useEffect(() => {
    if (!userId) { setIds(new Set()); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    supabaseFavoriteOps.list(userId)
      .then(list => { if (!cancelled) setIds(new Set(list)) })
      .catch(e => {
        if (cancelled) return
        const msg = e?.message || ''
        toast.error(
          msg.includes('song_favorites')
            ? 'Favourites need a database migration: run supabase/migrations/20261001000000_song_favorites.sql'
            : msg || 'Could not load favourites',
        )
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- toast identity is not a reload trigger
  }, [userId])

  const has = useCallback((id) => ids.has(id), [ids])

  const toggle = useCallback(async (songId) => {
    if (!userId) return
    const wasFavorite = idsRef.current.has(songId)
    setIds(prev => toggleIn(prev, songId))
    try {
      if (wasFavorite) await supabaseFavoriteOps.remove(userId, songId)
      else await supabaseFavoriteOps.add(userId, songId)
    } catch (e) {
      setIds(prev => (prev.has(songId) === wasFavorite ? prev : toggleIn(prev, songId)))
      toast.error(e?.message || 'Could not update favourite')
    }
  }, [userId, toast])

  return { ids, has, toggle, loading, enabled: !!userId }
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
    supabaseSongOps.markPlayed(id).catch(e => console.warn('Could not record play:', e))
    songsResource.patchItem(id, { last_played_at: new Date().toISOString() })
    return () => { alive = false }
  }, [id])

  const reload = useCallback(() => { if (id) songResource(id).ensure(true) }, [id])

  // Supplying parsed_content means "write exactly this" (never re-parsed); a
  // matching raw_content is derived when absent. See prepareSongUpdates.
  const update = useCallback(async (updates) => {
    const updated = await updateSongRecord(id, prepareSongUpdates(updates, song?.title))
    songResource(id).set(updated)
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
    const res = _setlistResources.get(id)
    if (res) { res.clear(); _setlistResources.delete(id) }
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

  // Rapid drags are serialised and coalesced: requests run one at a time, and a
  // queued reorder that has been superseded by a newer drop is skipped (latest
  // wins), so responses can never land out of order.
  const reorderQueue = useRef({ seq: 0, chain: Promise.resolve() })

  const reorder = useCallback(async (orderedSlotIds) => {
    const r = setlistResource(id)
    const q = reorderQueue.current
    const current = r.getSnapshot()
    const mySeq = ++q.seq
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
    }
    const run = q.chain.then(async () => {
      if (mySeq !== q.seq) return // superseded: the newer reorder persists the final order
      await supabaseSetlistOps.reorderSongs(id, orderedSlotIds)
    })
    q.chain = run.catch(() => {})
    try {
      await run
      if (!current?.songs && mySeq === q.seq) await refresh()
    } catch (e) {
      // Roll back to the server's order (the RPC is atomic, so nothing partial
      // was written); fall back to the pre-drop snapshot if that fails too.
      if (mySeq === q.seq) await refresh().catch(() => { if (current) r.set(current) })
      throw e
    }
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
// Inputs that don't take typed text (sliders, toggles, buttons) must NOT swallow
// pedal keys: after touching the performer's scroll-speed slider, focus stays
// on it and a page-turner pedal would otherwise stop working.
const NON_TEXT_INPUT_TYPES = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color'])

export function isTypingTarget(el) {
  const tag = el?.tagName
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase())
  return tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable
}

export function useKeyboardControls({ onNext, onPrev, onToggle, enabled = true }) {
  useEffect(() => {
    if (!enabled) return undefined
    const handler = (e) => {
      const el = e.target
      if (isTypingTarget(el)) return
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

// ─── Per-song duration (manual override in localStorage, else auto-estimate) ──
// Estimation + formatting live in songDuration.js (pure); re-exported here so
// existing importers keep working.
export { DEFAULT_SONG_SECONDS, formatDuration, estimateSongSeconds }

/**
 * Per-song length in seconds. A manual override (set via setSongSeconds) always
 * wins; otherwise estimate from the song's structure + tempo when the song
 * object is supplied, falling back to the flat default.
 */
export function getSongSeconds(songId, song = null) {
  try {
    const v = localStorage.getItem(`cv-duration-${songId}`)
    if (v != null) {
      const n = JSON.parse(v)
      if (Number.isFinite(n)) return n
    }
  } catch { /* ignore */ }
  return song ? estimateSongSeconds(song) : DEFAULT_SONG_SECONDS
}

export function setSongSeconds(songId, seconds) {
  try { localStorage.setItem(`cv-duration-${songId}`, JSON.stringify(seconds)) } catch { /* quota */ }
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

  // Precompute weighted fields (incl. the parsed-content body) once per library
  // so keystrokes only re-score, never re-parse.
  const indexed = useMemo(
    () => allSongs.map(s => ({ song: s, fields: songSearchFields(s) })),
    [allSongs],
  )

  useEffect(() => {
    if (!debouncedQuery.trim()) { setResults(allSongs); return }
    const scored = []
    for (const { song, fields } of indexed) {
      const score = scoreFields(debouncedQuery, fields)
      if (score > 0) scored.push({ song, score })
    }
    // Relevance-rank while searching (title hits above lyric hits); stable for ties.
    scored.sort((a, b) => b.score - a.score)
    setResults(scored.map(x => x.song))
  }, [debouncedQuery, indexed, allSongs])

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
