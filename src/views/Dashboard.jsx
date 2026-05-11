import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, SlidersHorizontal, Music2 } from 'lucide-react'
import { useSongs, useSearch } from '../lib/hooks'
import { Button, Input, Select, EmptyState, ErrorState, SongCardSkeleton } from '../components/ui'
import SongCard from '../components/song/SongCard'

const SORT_OPTIONS = [
  { value: 'title', label: 'Title A–Z' },
  { value: 'artist', label: 'Artist A–Z' },
  { value: 'recent', label: 'Recently added' },
  { value: 'played', label: 'Recently played' },
]

export default function Dashboard() {
  const [sortBy, setSortBy] = useState('title')
  const { songs, loading, error, reload } = useSongs(sortBy)
  const { query, setQuery, results } = useSearch(songs)

  if (error) return <ErrorState message={error} onRetry={reload} />

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
            <SongCard key={song.id} song={song} />
          ))}
        </div>
      )}
    </div>
  )
}
