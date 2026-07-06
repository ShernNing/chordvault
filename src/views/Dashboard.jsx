import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Plus, Music2, Trash2, ListMusic, X, RefreshCw } from 'lucide-react'
import { useSongs, useSearch, useSetlists, useSemanticSearch } from '../lib/hooks'
import { useAuth } from '../lib/AuthContext'
import { supabaseSetlistOps } from '../lib/supabaseOps'
import { selectRelatedSongs } from '../lib/relatedSongs'
import { Button, Select, EmptyState, ErrorState, SongCardSkeleton, Modal, Tooltip } from '../components/ui'
import SongCard from '../components/song/SongCard'
import { motion, AnimatePresence, Reveal, AnimatedNumber, ease } from '../lib/motion'
import { useToast } from '../lib/toast'

const SORT_OPTIONS = [
  { value: 'title', label: 'Title A–Z' },
  { value: 'artist', label: 'Artist A–Z' },
  { value: 'key', label: 'Key A–Z' },
  { value: 'recent', label: 'Recently added' },
  { value: 'played', label: 'Recently played' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [sortBy, setSortBy] = useState('title')
  const { songs, loading, error, reload, deleteSong, bulkDeleteSongs } = useSongs(sortBy)
  const { query, setQuery, results } = useSearch(songs)
  const { relatedIds } = useSemanticSearch(query)
  const { setlists } = useSetlists()
  const toast = useToast()
  const { canAddSongs, canDeleteSong } = useAuth()
  const [keyFilter, setKeyFilter] = useState('')

  // Keys present in the library, for the key filter dropdown.
  const availableKeys = React.useMemo(
    () => [...new Set(songs.map(s => s.original_key).filter(Boolean))].sort(),
    [songs],
  )
  const filteredResults = keyFilter
    ? results.filter(s => s.original_key === keyFilter)
    : results

  const relatedToShow = React.useMemo(
    () => selectRelatedSongs(relatedIds, songs, {
      excludeIds: new Set(filteredResults.map(s => s.id)),
      keyFilter,
    }),
    [relatedIds, songs, filteredResults, keyFilter],
  )

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [deleteTarget, setDeleteTarget] = useState(null) // null | { type: 'single', song } | { type: 'bulk' }
  const [addToSetlistOpen, setAddToSetlistOpen] = useState(false)
  const [chosenSetlistId, setChosenSetlistId] = useState('')
  const [bulkAdding, setBulkAdding] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  if (error) return <ErrorState message={error} onRetry={reload} />

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setBulkDeleting(true)
    try {
      if (deleteTarget.type === 'single') {
        await deleteSong(deleteTarget.song.id)
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.delete(deleteTarget.song.id)
          return next
        })
        toast.success(`Deleted "${deleteTarget.song.title}"`)
      } else {
        // Only delete songs this user owns (or all, if admin); RLS would reject
        // the rest anyway.
        const ids = deletableSelected.map(s => s.id)
        const n = ids.length
        await bulkDeleteSongs(ids)
        setSelectedIds(new Set())
        toast.success(`Deleted ${n} song${n === 1 ? '' : 's'}`)
      }
    } catch (e) {
      toast.error(e.message || 'Delete failed')
    } finally {
      setBulkDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleAddToSetlist = async () => {
    if (!chosenSetlistId) return
    setBulkAdding(true)
    try {
      const n = selectedIds.size
      for (const songId of selectedIds) {
        const song = songs.find(s => s.id === songId)
        await supabaseSetlistOps.addSong(chosenSetlistId, songId, song?.original_key || null, 0)
      }
      const dest = setlists.find(s => s.id === chosenSetlistId)?.name || 'setlist'
      setAddToSetlistOpen(false)
      setChosenSetlistId('')
      setSelectedIds(new Set())
      toast.success(`Added ${n} song${n === 1 ? '' : 's'} to ${dest}`)
    } catch (e) {
      toast.error(e.message || 'Could not add to setlist')
    } finally {
      setBulkAdding(false)
    }
  }

  const selectedSongs = songs.filter(s => selectedIds.has(s.id))
  // Keep only the songs this user may delete (superuser: any; leader: own).
  // RLS would reject the rest anyway, so they're dropped from the bulk action.
  const deletableSelected = selectedSongs.filter(s => canDeleteSong(s))

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-[var(--color-ink)]">Library</h1>
          {!loading && (
            <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
              <AnimatedNumber value={songs.length} /> {songs.length === 1 ? 'song' : 'songs'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content="Force reload all songs">
            <Button variant="ghost" size="icon-sm" onClick={() => window.location.reload()} title="Reload">
              <RefreshCw size={14} />
            </Button>
          </Tooltip>
          {canAddSongs && (
            <Link to="/songs/new">
              <Button variant="primary" size="sm">
                <Plus size={14} /> Add song
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── Search + Sort ────────────────────────────────────────── */}
      {(songs.length > 0 || query) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 sm:max-w-sm">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search songs, artists, tags…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] hover:border-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-ink)] transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            {availableKeys.length > 0 && (
              <Select
                value={keyFilter}
                onChange={e => setKeyFilter(e.target.value)}
                className="w-28"
                title="Filter by key"
              >
                <option value="">All keys</option>
                {availableKeys.map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </Select>
            )}
            <Select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="w-40"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {/* ── Selection action bar ─────────────────────────────────── */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            className="flex items-center gap-2 px-3 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-warm)] overflow-hidden"
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={ease}
          >
            <span className="text-xs text-[var(--color-ink-soft)]">
              {selectedIds.size} {selectedIds.size === 1 ? 'song' : 'songs'} selected
            </span>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={() => setAddToSetlistOpen(true)}>
              <ListMusic size={13} /> Add to setlist
            </Button>
            {deletableSelected.length > 0 && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleteTarget({ type: 'bulk' })}
              >
                <Trash2 size={13} /> Delete{deletableSelected.length < selectedIds.size ? ` (${deletableSelected.length})` : ''}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <X size={13} />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <SongCardSkeleton key={i} />)}
        </div>
      ) : songs.length === 0 ? (
        <EmptyState
          icon={Music2}
          title="Your library is empty"
          description={canAddSongs
            ? "Paste a chord sheet to add your first song."
            : "No songs yet. Ask a leader or superuser to add some."}
          action={canAddSongs && (
            <Link to="/songs/new">
              <Button variant="primary" size="sm">
                <Plus size={14} /> Add your first song
              </Button>
            </Link>
          )}
        />
      ) : filteredResults.length === 0 && relatedToShow.length === 0 ? (
        <EmptyState
          icon={Search}
          title={query ? `No results for "${query}"` : `No songs in key of ${keyFilter}`}
          description="Try a different search term or key filter."
          action={
            <Button variant="secondary" size="sm" onClick={() => { setQuery(''); setKeyFilter('') }}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredResults.map((song, i) => (
            <Reveal key={song.id} delay={Math.min(i, 20) * 0.03}>
              <SongCard
                song={song}
                selected={selectedIds.has(song.id)}
                onSelect={toggleSelect}
                onDelete={(s) => setDeleteTarget({ type: 'single', song: s })}
                canDelete={canDeleteSong(song)}
              />
            </Reveal>
          ))}
        </div>
      )}

      {/* ── Related songs (semantic) ─────────────────────────────── */}
      {query && relatedToShow.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            Related songs
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {relatedToShow.map((song, i) => (
              <Reveal key={song.id} delay={Math.min(i, 20) * 0.03}>
                <SongCard
                  song={song}
                  selected={selectedIds.has(song.id)}
                  onSelect={toggleSelect}
                  onDelete={(s) => setDeleteTarget({ type: 'single', song: s })}
                  canDelete={canDeleteSong(song)}
                />
              </Reveal>
            ))}
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────────── */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.type === 'single' ? 'Delete song' : `Delete ${deletableSelected.length} songs`}
      >
        {deleteTarget?.type === 'single' ? (
          <p className="text-sm text-[var(--color-ink-soft)] mb-5">
            Delete <strong>"{deleteTarget.song.title}"</strong>? This cannot be undone.
          </p>
        ) : (
          <div className="mb-5">
            <p className="text-sm text-[var(--color-ink-soft)] mb-3">
              Delete {deletableSelected.length} song{deletableSelected.length === 1 ? '' : 's'}? This cannot be undone.
            </p>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {deletableSelected.map(s => (
                <li key={s.id} className="text-xs text-[var(--color-ink-muted)] truncate">
                  • {s.title}{s.artist ? ` — ${s.artist}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={bulkDeleting}
            onClick={handleConfirmDelete}
          >
            <Trash2 size={13} /> Delete
          </Button>
        </div>
      </Modal>

      {/* ── Add to setlist modal ──────────────────────────────────── */}
      <Modal
        isOpen={addToSetlistOpen}
        onClose={() => { setAddToSetlistOpen(false); setChosenSetlistId('') }}
        title="Add to setlist"
      >
        {setlists.length === 0 ? (
          <>
            <p className="text-sm text-[var(--color-ink-soft)] mb-4">
              No setlists yet. Create one first.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => { setAddToSetlistOpen(false); setChosenSetlistId('') }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={() => { setAddToSetlistOpen(false); navigate('/setlists') }}>
                <ListMusic size={13} /> Go to Setlists
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--color-ink-soft)] mb-4">
              Add {selectedIds.size} {selectedIds.size === 1 ? 'song' : 'songs'} to:
            </p>
            <Select
              value={chosenSetlistId}
              onChange={e => setChosenSetlistId(e.target.value)}
              className="w-full"
            >
              <option value="">Choose a setlist…</option>
              {setlists.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <div className="flex gap-2 justify-end mt-5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setAddToSetlistOpen(false); setChosenSetlistId('') }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={bulkAdding}
                disabled={!chosenSetlistId}
                onClick={handleAddToSetlist}
              >
                <ListMusic size={13} /> Add to setlist
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
