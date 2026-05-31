import React, { useMemo } from 'react'
import VoicingCard from './VoicingCard'
import { getVoicingById } from '../../lib/voicings/catalog'
import { transposeVoicingTo, transposeChordName, semitoneDelta } from '../../lib/voicings/transpose'
import { keyPrefersFlats } from '../../lib/voicings/notes'

/**
 * Renders a curated progression set (e.g. "Step-Up") as a horizontal strip.
 *
 * Props:
 *   set         { id, label, description, sourceKey, chords:[{ rootChord, voicingId }] }
 *   displayKey  current display key
 *   displayMode 'svg' | 'text' | 'both'
 */
export default function ProgressionStrip({ set, displayKey, displayMode = 'both' }) {
  const preferFlats = keyPrefersFlats(displayKey)
  const delta = semitoneDelta(set.sourceKey, displayKey)

  const items = useMemo(() => {
    return set.chords.map(({ rootChord, voicingId }) => {
      const v = getVoicingById(voicingId)
      if (!v) return null
      const frets = transposeVoicingTo(v, displayKey)
      if (!frets) return null
      const displayedRoot = transposeChordName(rootChord, delta, preferFlats)
      return { voicing: v, frets, displayedRoot }
    }).filter(Boolean)
  }, [set, displayKey, delta, preferFlats])

  return (
    <section className="flex flex-col gap-2">
      <header className="flex flex-col gap-0.5">
        <h3 className="font-display text-lg text-[var(--color-ink)]">{set.label}</h3>
        <p className="text-xs text-[var(--color-ink-soft)]">{set.description}</p>
      </header>

      {items.length === 0 ? (
        <div className="text-sm text-[var(--color-ink-muted)] py-3">
          Some voicings in this set don't transpose to {displayKey}.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {items.map(({ voicing, frets, displayedRoot }, i) => (
            <div key={i} className="shrink-0 w-[180px] snap-start flex flex-col gap-1">
              <div className="text-center text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                {i + 1}. {displayedRoot}
              </div>
              <VoicingCard
                voicing={{ ...voicing, displayName: displayedRoot }}
                displayedFrets={frets}
                displayKey={displayKey}
                displayMode={displayMode}
                absolute
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
