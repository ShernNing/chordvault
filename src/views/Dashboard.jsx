import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, Music2, Trash2, ListMusic, X } from 'lucide-react'
import { useSongs, useSearch, useSetlists } from '../lib/hooks'
import { Button, Input, Select, EmptyState, ErrorState, SongCardSkeleton, Modal, Badge } from '../components/ui'
import SongCard from '../components/song/SongCard'

const SORT_OPTIONS = [
  { value: 'title', label: 'Title A–Z' },
  { value: 'artist', label: 'Artist A–Z' },
  { value: 'recent', label: 'Recently added' },
  { value: 'played', label: 'Recently played' },
]

export default function Dashboard() {
  const [sortBy, setSortBy] = useState('title')
  const { songs, loading, error, reload, deleteSong } = useSongs(sortBy)
  const { setlists } = useSetlists()
  const { query, setQuery, results } = useSearch(songs)

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [deleteTarget, setDeleteTarget] = useState(null) // { ids: number[] }
  const [deleting, setDeleting] = useState(false)
  const [addToSetlistModal, setAddToSetlistModal] = useState(false)
  const [addingToSetlist, setAddingToSetlist] = useState(false)

  const handleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleDeleteSingle = (id) => {
    setDeleteTarget({ ids: [id] })
  }

  const handleDeleteSelected = () => {
    setDeleteTarget({ ids: [...selectedIds] })
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      for (const id of deleteTarget.ids) {
        await deleteSong(id)
      }
      setSelectedIds(prev => {
        const next = new Set(prev)
        deleteTarget.ids.forEach(id => next.delete(id))
        return next
      })
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleAddToSetlist = async (setlistId) => {
    setAddingToSetlist(true)
    try {
      const { setlistOps } = await import('../lib/db')
      for (const songId of selectedIds) {
        const song = songs.find(s => s.id === songId)
        await setlistOps.addSong(setlistId, songId, song?.original_key || null, 0)
      }
      setAddToSetlistModal(false)
      clearSelection()
    } finally {
      setAddingToSetlist(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />

  const selectedCount = selectedIds.size
  const deleteTargetSongs = deleteTarget
    ? songs.filter(s => deleteTarget.ids.includes(s.id))
    : []

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

      {/* ── Bulk action bar ──────────────────────────────────────── */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border border-[var(--color-accent)] rounded-lg bg-[var(--color-accent-soft)]">
          <span className="text-xs font-medium text-[var(--color-ink)] flex-1">
            {selectedCount} {selectedCount === 1 ? 'song' : 'songs'} selected
          </span>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setAddToSetlistModal(true)}
            disabled={setlists.length === 0}
            title={setlists.length === 0 ? 'No setlists yet' : undefined}
          >
            <ListMusic size={12} /> Add to setlist
          </Button>
          <Button
            variant="danger"
            size="xs"
            onClick={handleDeleteSelected}
          >
            <Trash2 size={12} /> Delete
          </Button>
          <button
            onClick={clearSelection}
            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
            title="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

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
              onSelect={handleSelect}
              onDelete={handleDeleteSingle}
            />
          ))}
        </div>
      )}

      {/* ── Delete confirmation modal ────────────────────────────── */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.ids?.length === 1 ? 'Delete song' : `Delete ${deleteTarget?.ids?.length} songs`}
      >
        {deleteTarget?.ids?.length === 1 ? (
          <p className="text-sm text-[var(--color-ink-soft)] mb-5">
            Delete <strong>"{deleteTargetSongs[0]?.title}"</strong>? This will also remove it from all setlists and cannot be undone.
          </p>
        ) : (
          <div className="mb-5">
            <p className="text-sm text-[var(--color-ink-soft)] mb-3">
              Delete {deleteTarget?.ids?.length} songs? They will also be removed from all setlists. This cannot be undone.
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {deleteTargetSongs.map(s => (
                <div key={s.id} className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
                  <span className="font-medium text-[var(--color-ink)]">{s.title}</span>
                  {s.artist && <span>— {s.artist}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={confirmDelete} loading={deleting}>
            <Trash2 size={13} /> Delete
          </Button>
        </div>
      </Modal>

      {/* ── Add to setlist modal ─────────────────────────────────── */}
      <Modal
        isOpen={addToSetlistModal}
        onClose={() => setAddToSetlistModal(false)}
        title={`Add ${selectedCount} ${selectedCount === 1 ? 'song' : 'songs'} to setlist`}
      >
        <div className="space-y-2 mb-2">
          {setlists.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)] py-4 text-center">
              No setlists yet. Create one from the Setlists page.
            </p>
          ) : (
            setlists.map(setlist => (
              <button
                key={setlist.id}
                onClick={() => handleAddToSetlist(setlist.id)}
                disabled={addingToSetlist}
                className="w-full flex items-center gap-3 p-3 border border-[var(--color-border)] rounded-lg text-left hover:border-[var(--color-ink-muted)] hover:bg-[var(--color-bg-warm)] transition-all duration-150 disabled:opacity-50"
              >
                <ListMusic size={14} className="text-[var(--color-ink-muted)] shrink-0" />
                <span className="text-sm font-medium text-[var(--color-ink)]">{setlist.name}</span>
              </button>
            ))
          )}
        </div>
      </Modal>
    </div>
  )
}
