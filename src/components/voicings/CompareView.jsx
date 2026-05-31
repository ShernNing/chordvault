import React, { useState, useMemo } from 'react'
import VoicingCard from './VoicingCard'
import { VOICINGS } from '../../lib/voicings/catalog'
import { leadingScore, sharedStringMask } from '../../lib/voicings/voiceLeading'
import { voicingUniquePitchClasses } from '../../lib/voicings/notes'

export default function CompareView() {
  const [aId, setAId] = useState(VOICINGS[0]?.id)
  const [bId, setBId] = useState(VOICINGS[1]?.id)

  const a = VOICINGS.find(v => v.id === aId)
  const b = VOICINGS.find(v => v.id === bId)

  const score = useMemo(() => a && b ? leadingScore(a.frets, b.frets) : null, [a, b])
  const sharedTones = useMemo(() => {
    if (!a || !b) return []
    const pa = new Set(voicingUniquePitchClasses(a.frets))
    const pb = new Set(voicingUniquePitchClasses(b.frets))
    return [...pa].filter(p => pb.has(p))
  }, [a, b])

  const ChordPicker = ({ value, onChange }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 px-2 text-sm rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)] flex-1"
    >
      {VOICINGS.map(v => (
        <option key={v.id} value={v.id}>
          {v.displayName} — {v.frets.map(f => f == null ? 'x' : f).join(' ')}
        </option>
      ))}
    </select>
  )

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h3 className="font-display text-lg text-[var(--color-ink)]">Compare voicings</h3>
        <p className="text-xs text-[var(--color-ink-soft)]">
          Pick any two voicings to see voice-leading data: shared strings (green halo), shared notes, and total fret movement.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <ChordPicker value={aId} onChange={setAId} />
          {a && (
            <VoicingCard
              voicing={a}
              displayedFrets={a.frets}
              displayKey={a.rootChord.match(/^([A-G][b#]?)/)?.[1] || 'C'}
              displayMode="both"
              highlightRoot
              compareFrets={b?.frets}
              showFavorite={false}
              showEnharmonic
              absolute
            />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <ChordPicker value={bId} onChange={setBId} />
          {b && (
            <VoicingCard
              voicing={b}
              displayedFrets={b.frets}
              displayKey={b.rootChord.match(/^([A-G][b#]?)/)?.[1] || 'C'}
              displayMode="both"
              highlightRoot
              compareFrets={a?.frets}
              showFavorite={false}
              showEnharmonic
              absolute
            />
          )}
        </div>
      </div>

      {score && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total movement" value={`${score.movement} frets`} hint="Lower = smoother" />
          <Stat label="Shared strings" value={`${score.sharedStrings}`} hint="Same string, same fret" />
          <Stat label="Common tones" value={`${score.commonTones}`} hint="Same pitch class" />
          <Stat label="Common notes" value={sharedTones.join(', ') || '—'} hint="" small />
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, hint, small = false }) {
  return (
    <div className="flex flex-col gap-0.5 p-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-warm)]">
      <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</span>
      <span className={`font-display text-[var(--color-ink)] leading-tight ${small ? 'text-base' : 'text-xl'}`}>{value}</span>
      {hint && <span className="text-[10px] text-[var(--color-ink-muted)]">{hint}</span>}
    </div>
  )
}
