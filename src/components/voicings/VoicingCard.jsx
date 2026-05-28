import React, { useState, useMemo } from 'react'
import { Play, Loader2, Music3 } from 'lucide-react'
import FretboardDiagram from './FretboardDiagram'
import FavoriteButton from './FavoriteButton'
import DifficultyBadge from './DifficultyBadge'
import { formatFrets, voicingUniquePitchClasses, keyPrefersFlats } from '../../lib/voicings/notes'
import { transposeChordName, semitoneDelta } from '../../lib/voicings/transpose'
import { playVoicing } from '../../lib/voicings/audio'
import { detectChordNames } from '../../lib/voicings/enharmonic'

/**
 * Single voicing card.
 *
 * Props:
 *   voicing         catalog voicing record
 *   displayedFrets  transposed frets array (caller computed)
 *   displayKey      key currently being shown
 *   displayMode     'svg' | 'text' | 'both'
 *   highlight       boolean — emphasis frame
 *   highlightRoot   boolean — ring root note in diagram
 *   dotLabels       'fret' | 'interval' | 'none'
 *   compareFrets    array — voice-leading shared-string halos
 *   stageMode       boolean — high-contrast / large
 *   showEnharmonic  boolean — show "also known as" detected names
 *   showFavorite    boolean — render star button (default true)
 *   onClick         optional card click handler
 *   audioOptions    object passed to playVoicing
 */
export default function VoicingCard({
  voicing,
  displayedFrets,
  displayKey,
  displayMode = 'both',
  highlight = false,
  highlightRoot = false,
  dotLabels = 'fret',
  compareFrets = null,
  stageMode = false,
  showEnharmonic = false,
  showFavorite = true,
  onClick = null,
  audioOptions = null,
}) {
  const [playing, setPlaying] = useState(false)
  const frets = displayedFrets || voicing.frets
  const preferFlats = keyPrefersFlats(displayKey)

  const delta = semitoneDelta(voicing.sourceKey, displayKey)
  const displayedName = transposeChordName(voicing.displayName, delta, preferFlats)
  const notes = voicingUniquePitchClasses(frets, preferFlats)

  const enharmonic = useMemo(() => {
    if (!showEnharmonic) return []
    return detectChordNames(frets).filter(n => n !== displayedName).slice(0, 3)
  }, [showEnharmonic, frets, displayedName])

  const onPlay = async (e) => {
    e?.stopPropagation()
    if (playing) return
    setPlaying(true)
    try {
      await playVoicing(frets, audioOptions || undefined)
    } catch (err) {
      console.warn('voicing playback failed', err)
    } finally {
      setPlaying(false)
    }
  }

  const showSvg = displayMode === 'svg' || displayMode === 'both'
  const showText = displayMode === 'text' || displayMode === 'both'

  const isCustom = !!voicing.isUser

  const diagramWidth = stageMode ? 200 : 150

  return (
    <div
      onClick={onClick}
      className={`
        flex flex-col gap-2 p-3 rounded border bg-[var(--color-bg)]
        transition-colors
        ${onClick ? 'cursor-pointer' : ''}
        ${highlight
          ? 'border-[var(--color-accent)] shadow-sm'
          : 'border-[var(--color-border)] hover:border-[var(--color-ink-muted)]'}
        ${stageMode ? 'p-4 gap-3' : ''}
      `}
    >
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`font-display leading-tight text-[var(--color-ink)] truncate ${stageMode ? 'text-2xl' : 'text-base'}`}>
            {displayedName}
          </span>
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            {voicing.position > 0 && !showSvg && (
              <span className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide">
                {voicing.position}fr
              </span>
            )}
            {voicing.shape && (
              <span className="text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide">
                {voicing.shape}
              </span>
            )}
            <DifficultyBadge frets={frets} tags={voicing.tags || []} />
            {isCustom && (
              <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900">
                Custom
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {showFavorite && <FavoriteButton voicingId={voicing.id} />}
          <button
            onClick={onPlay}
            disabled={playing}
            className="
              flex items-center justify-center
              w-7 h-7 rounded-full
              bg-[var(--color-bg-warm)] border border-[var(--color-border)]
              text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-ink-muted)]
              transition-colors
            "
            title="Play voicing"
            aria-label="Play voicing"
          >
            {playing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          </button>
        </div>
      </div>

      {/* diagram */}
      {showSvg && (
        <div className="flex justify-center py-1">
          <FretboardDiagram
            frets={frets}
            width={diagramWidth}
            showLabels
            highlightRoot={highlightRoot}
            chordName={displayedName}
            dotLabels={dotLabels}
            compareFrets={compareFrets}
            stageMode={stageMode}
          />
        </div>
      )}

      {/* text frets */}
      {showText && (
        <div className={`font-mono text-[var(--color-ink-soft)] tracking-wider text-center ${stageMode ? 'text-base' : 'text-xs'}`}>
          {formatFrets(frets)}
        </div>
      )}

      {/* notes */}
      <div className="flex flex-wrap gap-1 justify-center">
        {notes.map((n, i) => (
          <span
            key={i}
            className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-warm)] text-[var(--color-ink-soft)] border border-[var(--color-border)]"
          >
            {n}
          </span>
        ))}
      </div>

      {/* enharmonic / also known as */}
      {showEnharmonic && enharmonic.length > 0 && (
        <div className="flex items-center justify-center gap-1 text-[10px] text-[var(--color-ink-muted)]">
          <Music3 size={10} />
          <span>also: {enharmonic.join(', ')}</span>
        </div>
      )}

      {/* tags */}
      {voicing.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center">
          {voicing.tags.map((t) => (
            <span
              key={t}
              className="text-[9px] uppercase tracking-wide text-[var(--color-ink-muted)]"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* description */}
      {voicing.description && !stageMode && (
        <p className="text-[11px] text-[var(--color-ink-muted)] leading-snug text-center">
          {voicing.description}
        </p>
      )}
    </div>
  )
}
