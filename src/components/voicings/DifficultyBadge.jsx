import { difficultyOf } from '../../lib/voicings/difficulty'

const STYLES = {
  easy:   'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
  medium: 'bg-amber-100   text-amber-700   border-amber-200   dark:bg-amber-950   dark:text-amber-300   dark:border-amber-900',
  hard:   'bg-rose-100    text-rose-700    border-rose-200    dark:bg-rose-950    dark:text-rose-300    dark:border-rose-900',
}

export default function DifficultyBadge({ frets, tags = [], className = '' }) {
  const { level, label, reasons } = difficultyOf(frets, tags)
  return (
    <span
      title={reasons.length ? reasons.join(' ') : undefined}
      className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${STYLES[level]} ${className}`}
    >
      {label}
    </span>
  )
}
