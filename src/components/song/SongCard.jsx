import React from 'react'
import { Link } from 'react-router-dom'
import { Music2, Clock, User, Tag } from 'lucide-react'
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

export default function SongCard({ song }) {
  return (
    <Link
      to={`/songs/${song.id}`}
      className="group block border border-[var(--color-border)] rounded-lg p-4 bg-[var(--color-bg)] hover:border-[var(--color-ink-muted)] hover:shadow-sm transition-all duration-150 animate-fade-in"
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-[var(--color-ink)] group-hover:text-[var(--color-ink)] leading-tight line-clamp-2">
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
  )
}
