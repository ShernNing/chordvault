import React, { useEffect, useMemo } from 'react'
import { X, Guitar } from 'lucide-react'
import VoicingCard from './VoicingCard'
import { voicingsForChord } from '../../lib/voicings/lookup'
import { useTheme, useLocalStorage } from '../../lib/hooks'
import { useFavorites } from '../../lib/voicings/favorites'

/**
 * Right-side slide-in drawer showing voicings for a clicked chord.
 *
 * Props:
 *   chord       string e.g. "Bm7" — null = closed
 *   onClose     handler
 *   displayMode 'svg' | 'text' | 'both'
 *   prevFrets   optional — frets of the previous chord for voice-leading halos
 */
export default function VoicingDrawer({ chord, onClose, displayMode = 'both', prevFrets = null }) {
  const open = !!chord
  const { isStage } = useTheme()
  const [highlightRoot] = useLocalStorage('chordvault-voicings-highlightroot', true)
  const [dotLabels] = useLocalStorage('chordvault-voicings-dotlabels', 'fret')
  const { ids: favoriteIds, has: isFav } = useFavorites()

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const items = useMemo(() => chord ? voicingsForChord(chord) : [], [chord])
  const displayKey = useMemo(() => {
    if (!chord) return 'G'
    const m = chord.match(/^([A-G][b#]?)/)
    return m ? m[1] : 'G'
  }, [chord])

  // Sort: favorites first, then easy → hard.
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const fa = isFav(a.voicing.id), fb = isFav(b.voicing.id)
      if (fa !== fb) return fa ? -1 : 1
      return 0
    })
  }, [items, isFav])

  return (
    <>
      <div
        className={`
          fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 no-print
          ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`
          fixed top-0 right-0 bottom-0 z-50
          ${isStage ? 'w-[min(560px,98vw)]' : 'w-[min(420px,92vw)]'}
          bg-[var(--color-bg)] border-l border-[var(--color-border)]
          shadow-xl no-print
          transition-transform duration-200 ease-out
          ${open ? 'translate-x-0' : 'translate-x-full'}
          flex flex-col
        `}
        role="dialog"
        aria-modal="true"
        aria-label={`Voicings for ${chord || ''}`}
      >
        <header className="flex items-center justify-between gap-3 px-4 h-12 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 min-w-0">
            <Guitar size={isStage ? 20 : 16} className="text-[var(--color-ink-soft)] shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className={`font-display leading-tight text-[var(--color-ink)] truncate ${isStage ? 'text-2xl' : 'text-lg'}`}>
                {chord || '—'}
              </span>
              <span className="text-[10px] text-[var(--color-ink-muted)]">
                {items.length} voicing{items.length === 1 ? '' : 's'}
                {prevFrets ? ' · voice-led from previous chord' : ''}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded flex items-center justify-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]"
            aria-label="Close"
          ><X size={16} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          {sortedItems.length === 0 ? (
            <div className="text-sm text-[var(--color-ink-muted)] py-8 text-center">
              No voicings found for this chord.
            </div>
          ) : (
            <div className={`grid gap-3 ${isStage ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {sortedItems.map(({ voicing, frets, displayedName }, i) => (
                <VoicingCard
                  key={`${voicing.id}-${i}`}
                  voicing={{ ...voicing, displayName: displayedName }}
                  displayedFrets={frets}
                  displayKey={displayKey}
                  displayMode={displayMode}
                  highlightRoot={highlightRoot}
                  dotLabels={dotLabels}
                  compareFrets={i === 0 ? prevFrets : null}
                  stageMode={isStage}
                  showEnharmonic
                />
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
