import React, { useState, useMemo } from 'react'
import VoicingCard from './VoicingCard'
import { capoOptionsFor } from '../../lib/voicings/capo'
import { voicingsForChord } from '../../lib/voicings/lookup'

const CHORDS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C#', 'Eb', 'F#', 'G#', 'Bb',
  'Am', 'Bm', 'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'F#m', 'C#m', 'G#m', 'Bbm', 'Ebm']

export default function CapoHelper({ displayMode = 'both' }) {
  const [target, setTarget] = useState('F')
  const options = useMemo(() => capoOptionsFor(target), [target])

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[var(--color-bg-warm)] border border-[var(--color-border)] rounded p-3 flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">Target chord</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-8 px-2 text-sm rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
          >
            {CHORDS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <p className="text-xs text-[var(--color-ink-soft)] flex-1 min-w-[200px]">
          Each row shows: capo position, the open shape to play, and a sample voicing of that shape.
        </p>
      </div>

      {options.length === 0 ? (
        <div className="text-sm text-[var(--color-ink-muted)] py-6 text-center">
          No open-shape options for this chord (capo 0–9).
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {options.map(({ capoFret, shape }) => {
            const voicings = voicingsForChord(shape)
            const v = voicings[0]
            return (
              <div key={`${capoFret}-${shape}`} className="flex items-center gap-4 p-3 rounded border border-[var(--color-border)] bg-[var(--color-bg)]">
                <div className="flex flex-col items-center justify-center w-16 shrink-0">
                  <div className="text-2xl font-display text-[var(--color-ink)]">{capoFret}</div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">capo fret</div>
                </div>
                <div className="text-sm text-[var(--color-ink-soft)]">
                  Play <span className="font-display text-base text-[var(--color-ink)]">{shape}</span> shape
                  <div className="text-[11px] text-[var(--color-ink-muted)] mt-0.5">
                    Sounds like <span className="text-[var(--color-ink)]">{target}</span>.
                  </div>
                </div>
                <div className="ml-auto">
                  {v && (
                    <VoicingCard
                      voicing={v.voicing}
                      displayedFrets={v.frets}
                      displayKey={shape.match(/^([A-G][b#]?)/)?.[1] || 'C'}
                      displayMode={displayMode}
                      showFavorite={false}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
