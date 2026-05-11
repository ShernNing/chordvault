import React from 'react'
import { Link } from 'react-router-dom'
import { Clock, User, Square, CheckSquare, Trash2 } from 'lucide-react'
import { Badge } from '../ui'

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function SongCard({ song, selected = false, onSelect, onDelete }) {
  return (
    <div className={`relative group rounded-lg bg-[var(--color-bg)] transition-all duration-150 animate-fade-in
      ${selected
        ? 'border border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]'
        : 'border border-[var(--color-border)] hover:border-[var(--color-ink-muted)] hover:shadow-sm'}
    `}>
      {/* Checkbox — sibling to Link so it doesn't trigger navigation */}
      {onSelect && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(song.id) }}
          className={`absolute top-3 left-3 z-10 transition-opacity duration-150
            ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          title={selected ? 'Deselect' : 'Select'}
        >
          {selected
            ? <CheckSquare size={15} className="text-[var(--color-accent)]" />
            : <Square size={15} className="text-[var(--color-ink-muted)]" />}
        </button>
      )}

      <Link
        to={`/songs/${song.id}`}
        className={`block p-4 ${onSelect ? 'pl-8' : ''}`}
      >
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-[var(--color-ink)] leading-tight line-clamp-2">
            {song.title}
          </h3>
          {song.original_key && (
            <Badge variant="key" className="shrink-0 mt-0.5">
              {song.original_key}
            </Badge>
          )}
        </div>

        {/* Artist */}
        {song.artist && (
          <div className="flex items-center gap-1 mb-2">
            <User size={10} className="text-[var(--color-ink-muted)]" />
            <span className="text-xs text-[var(--color-ink-soft)] truncate">{song.artist}</span>
          </div>
        )}

        {/* Tags */}
        {song.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {song.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="default">{tag}</Badge>
            ))}
            {song.tags.length > 3 && (
              <Badge variant="default">+{song.tags.length - 3}</Badge>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-1">
            <Clock size={10} className="text-[var(--color-ink-muted)]" />
            <span className="text-[10px] text-[var(--color-ink-muted)]">
              {song.last_played_at
                ? `Played ${formatDate(song.last_played_at)}`
                : `Added ${formatDate(song.created_at)}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {song.play_count > 0 && (
              <span className="text-[10px] text-[var(--color-ink-muted)] font-mono">
                ×{song.play_count}
              </span>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(song.id) }}
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-red-400 hover:text-red-600"
                title="Delete song"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </Link>
    </div>
  )
}
