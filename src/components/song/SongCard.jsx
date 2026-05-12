import React from 'react'
import { Link } from 'react-router-dom'
import { Clock, User, Check, Trash2 } from 'lucide-react'
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
  const handleCheckbox = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect?.(song.id)
  }

  const handleDelete = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onDelete?.(song)
  }

  return (
    <div className="relative group">
      {/* Checkbox overlay — top-left */}
      {onSelect && (
        <button
          onClick={handleCheckbox}
          aria-label={selected ? 'Deselect song' : 'Select song'}
          className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150
            ${selected
              ? 'opacity-100 bg-[var(--color-ink)] border-[var(--color-ink)]'
              : 'opacity-0 group-hover:opacity-100 bg-[var(--color-bg)] border-[var(--color-border)] hover:border-[var(--color-ink-muted)]'
            }
          `}
        >
          {selected && <Check size={10} className="text-[var(--color-bg)]" />}
        </button>
      )}

      {/* Delete overlay — top-right */}
      {onDelete && (
        <button
          onClick={handleDelete}
          aria-label="Delete song"
          className="absolute top-2 right-2 z-10 w-6 h-6 rounded flex items-center justify-center text-[var(--color-ink-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition-all duration-150 opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
      )}

      <Link
        to={`/songs/${song.id}`}
        className={`block border rounded-lg p-4 bg-[var(--color-bg)] hover:shadow-sm transition-all duration-150 animate-fade-in
          ${selected
            ? 'border-[var(--color-ink)]'
            : 'border-[var(--color-border)] hover:border-[var(--color-ink-muted)]'
          }
        `}
      >
        {/* Title row */}
        <div className={`flex items-start justify-between gap-2 mb-1 ${onSelect ? 'pl-5' : ''}`}>
          <h3 className="text-sm font-semibold text-[var(--color-ink)] leading-tight line-clamp-2">
            {song.title}
          </h3>
          {song.original_key && (
            <span className={`shrink-0 mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-[var(--color-ink)] text-[var(--color-bg)] ${onDelete ? 'mr-5' : ''}`}>
              {song.original_key}
            </span>
          )}
        </div>

        {/* Artist */}
        {song.artist && (
          <div className={`flex items-center gap-1 mb-2 ${onSelect ? 'pl-5' : ''}`}>
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
                : `Added ${formatDate(song.created_at)}`
              }
            </span>
          </div>
          {song.play_count > 0 && (
            <span className="text-[10px] text-[var(--color-ink-muted)] font-mono">
              ×{song.play_count}
            </span>
          )}
        </div>
      </Link>
    </div>
  )
}
