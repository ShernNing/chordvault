import React, { useMemo } from 'react'
import VoicingCard from './VoicingCard'
import { transposeVoicingTo } from '../../lib/voicings/transpose'
import { difficultyOf } from '../../lib/voicings/difficulty'

/**
 * Grid of voicing cards.
 *
 * Props:
 *   voicings        catalog records pre-filtered by chord
 *   displayKey      e.g. 'G', 'C'
 *   displayMode     'svg' | 'text' | 'both'
 *   highlightRoot   pass-through
 *   dotLabels       pass-through
 *   stageMode       pass-through
 *   showEnharmonic  pass-through
 *   audioOptions    pass-through
 *   searchQuery     optional substring filter (case-insensitive, matches name/tags/shape)
 *   difficulty      optional 'easy'|'medium'|'hard' filter
 *   favoritesOnly   boolean — filter against passed `favoriteIds` set
 *   favoriteIds     array of favorited voicing ids
 *   onCardClick     optional click handler (voicing, frets) => void
 */
export default function VoicingGrid({
  voicings,
  displayKey,
  displayMode = 'both',
  highlightRoot = false,
  dotLabels = 'fret',
  stageMode = false,
  showEnharmonic = false,
  audioOptions = null,
  searchQuery = '',
  difficulty = 'all',
  favoritesOnly = false,
  favoriteIds = [],
  onCardClick = null,
}) {
  const items = useMemo(() => {
    const favSet = new Set(favoriteIds)
    const q = searchQuery.trim().toLowerCase()
    return voicings
      .map(v => ({ voicing: v, frets: transposeVoicingTo(v, displayKey) }))
      .filter(x => x.frets != null)
      .filter(({ voicing }) => {
        if (favoritesOnly && !favSet.has(voicing.id)) return false
        if (difficulty !== 'all') {
          const d = difficultyOf(voicing.frets, voicing.tags || []).level
          if (d !== difficulty) return false
        }
        if (q) {
          const hay = [
            voicing.displayName,
            voicing.rootChord,
            voicing.shape,
            voicing.description,
            ...(voicing.tags || []),
          ].join(' ').toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
  }, [voicings, displayKey, searchQuery, difficulty, favoritesOnly, favoriteIds])

  if (items.length === 0) {
    return (
      <div className="text-sm text-[var(--color-ink-muted)] py-4 text-center">
        No voicings match the current filters.
      </div>
    )
  }

  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
      {items.map(({ voicing, frets }) => (
        <VoicingCard
          key={voicing.id}
          voicing={voicing}
          displayedFrets={frets}
          displayKey={displayKey}
          displayMode={displayMode}
          highlightRoot={highlightRoot}
          dotLabels={dotLabels}
          stageMode={stageMode}
          showEnharmonic={showEnharmonic}
          audioOptions={audioOptions}
          onClick={onCardClick ? () => onCardClick(voicing, frets) : null}
        />
      ))}
    </div>
  )
}
