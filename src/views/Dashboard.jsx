import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Plus, Music2, Trash2, ListMusic, X } from 'lucide-react'
import { useSongs, useSearch, useSetlists } from '../lib/hooks'
import { setlistOps } from '../lib/db'
import { Button, Input, Select, EmptyState, ErrorState, SongCardSkeleton, Modal } from '../components/ui'
import SongCard from '../components/song/SongCard'

const SORT_OPTIONS = [
  { value: 'title', label: 'Title A–Z' },
  { value: 'artist', label: 'Artist A–Z' },
  { value: 'recent', label: 'Recently added' },
  { value: 'played', label: 'Recently played' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [sortBy, setSortBy] = useState('title')
  const { songs, loading, error, reload, deleteSong, bulkDeleteSongs } = useSongs(sortBy)
  const { query, setQuery, results } = useSearch(songs)
  const { setlists } = useSetlists()

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
      } else {
        await bulkDeleteSongs([...selectedIds])
        setSelectedIds(new Set())
      }
    } finally {
      setBulkDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleAddToSetlist = async () => {
    if (!chosenSetlistId) return
    setBulkAdding(true)
    try {
      const setlistId = Number(chosenSetlistId)
      for (const songId of selectedIds) {
        const song = songs.find(s => s.id === songId)
        await setlistOps.addSong(setlistId, songId, song?.original_key || null, 0)
      }
      setAddToSetlistOpen(false)
      setChosenSetlistId('')
      setSelectedIds(new Set())
    } finally {
      setBulkAdding(false)
    }
  }

  const selectedSongs = songs.filter(s => selectedIds.has(s.id))

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-[var(--color-ink)]">Library</h1>
          {!loading && (
            <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
              {songs.length} {songs.length === 1 ? 'song' : 'songs'}
            </p>
          )}
        </div>
        <Link to="/songs/new">
          <Button variant="primary" size="sm">
            <Plus size={14} /> Add song
          </Button>
        </Link>
      </div>

      {/* ── Search + Sort ────────────────────────────────────────── */}
      {(songs.length > 0 || query) && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search songs, artists, tags…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] hover:border-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-ink)] transition-colors"
            />
          </div>
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
      )}

      {/* ── Selection action bar ─────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-warm)] animate-fade-in">
          <span className="text-xs text-[var(--color-ink-soft)]">
            {selectedIds.size} {selectedIds.size === 1 ? 'song' : 'songs'} selected
          </span>
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={() => setAddToSetlistOpen(true)}>
            <ListMusic size={13} /> Add to setlist
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setDeleteTarget({ type: 'bulk' })}
          >
            <Trash2 size={13} /> Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            <X size={13} />
          </Button>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <SongCardSkeleton key={i} />)}
        </div>
      ) : songs.length === 0 ? (
        <EmptyState
          icon={Music2}
          title="Your library is empty"
          description="Paste a chord sheet to add your first song."
          action={
            <Link to="/songs/new">
              <Button variant="primary" size="sm">
                <Plus size={14} /> Add your first song
              </Button>
            </Link>
          }
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Search}
          title={`No results for "${query}"`}
          description="Try a different search term."
          action={
            <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {results.map(song => (
            <SongCard
              key={song.id}
              song={song}
              selected={selectedIds.has(song.id)}
              onSelect={toggleSelect}
              onDelete={(s) => setDeleteTarget({ type: 'single', song: s })}
            />
          ))}
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────────── */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.type === 'single' ? 'Delete song' : `Delete ${selectedIds.size} songs`}
      >
        {deleteTarget?.type === 'single' ? (
          <p className="text-sm text-[var(--color-ink-soft)] mb-5">
            Delete <strong>"{deleteTarget.song.title}"</strong>? This cannot be undone.
          </p>
        ) : (
          <div className="mb-5">
            <p className="text-sm text-[var(--color-ink-soft)] mb-3">
              Delete {selectedIds.size} songs? This cannot be undone.
            </p>
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {selectedSongs.map(s => (
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
