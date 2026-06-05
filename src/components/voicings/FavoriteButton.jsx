import { Star } from 'lucide-react'
import { useFavorites } from '../../lib/voicings/favorites'

export default function FavoriteButton({ voicingId, size = 14, className = '' }) {
  const { has, toggle } = useFavorites()
  const active = has(voicingId)
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggle(voicingId) }}
      title={active ? 'Remove favorite' : 'Add to favorites'}
      aria-label={active ? 'Remove favorite' : 'Add to favorites'}
      className={`
        flex items-center justify-center
        w-7 h-7 rounded-full
        bg-[var(--color-bg-warm)] border border-[var(--color-border)]
        transition-colors
        ${active
          ? 'text-[var(--color-accent)] border-[var(--color-accent)]'
          : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-ink-muted)]'}
        ${className}
      `}
    >
      <Star size={size} fill={active ? 'currentColor' : 'none'} />
    </button>
  )
}
