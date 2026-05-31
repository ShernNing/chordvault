import React, { useMemo, useState } from 'react'
import VoicingCard from './VoicingCard'
import { PROGRESSIONS, resolveProgression } from '../../lib/voicings/progressions'
import { voicingsForChord } from '../../lib/voicings/lookup'
import { pickBestNext } from '../../lib/voicings/voiceLeading'

const MAJOR_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_KEYS = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']

/**
 * Library of common progressions. Pick a key + progression → render a voice-led chain.
 */
export default function ProgressionsLibrary({ displayMode = 'both', highlightRoot = true }) {
  const [mode, setMode] = useState('major')
  const [keyName, setKeyName] = useState('G')
  const [activeProg, setActiveProg] = useState(PROGRESSIONS[0].id)

  const progs = useMemo(() => PROGRESSIONS.filter(p => p.mode === mode), [mode])
  const prog = progs.find(p => p.id === activeProg) || progs[0]

  const chain = useMemo(() => {
    if (!prog) return []
    const chordNames = resolveProgression(prog, keyName)

    // Voice-led pick: for each chord, pick the voicing that flows best from the previous.
    const out = []
    let prevFrets = null
    for (const ch of chordNames) {
      const candidates = voicingsForChord(ch)
      if (candidates.length === 0) { out.push({ chord: ch, voicing: null, frets: null }); prevFrets = null; continue }
      let chosenIdx = 0
      if (prevFrets) {
        const idx = pickBestNext(prevFrets, candidates.map(c => c.frets))
        if (idx >= 0) chosenIdx = idx
      }
      const chosen = candidates[chosenIdx]
      out.push({ chord: ch, voicing: chosen.voicing, frets: chosen.frets, displayName: chosen.displayedName })
      prevFrets = chosen.frets
    }
    return out
  }, [prog, keyName])

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 bg-[var(--color-bg-warm)] border border-[var(--color-border)] rounded p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">Tonality</label>
          <div className="inline-flex rounded border border-[var(--color-border)] overflow-hidden">
            <button
              onClick={() => { setMode('major'); setKeyName('G'); setActiveProg(PROGRESSIONS.find(p => p.mode === 'major').id) }}
              className={`h-8 px-3 text-xs font-medium ${mode === 'major' ? 'bg-[var(--color-ink)] text-[var(--color-bg)]' : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)]'}`}
            >Major</button>
            <button
              onClick={() => { setMode('minor'); setKeyName('Am'); setActiveProg(PROGRESSIONS.find(p => p.mode === 'minor').id) }}
              className={`h-8 px-3 text-xs font-medium border-l border-[var(--color-border)] ${mode === 'minor' ? 'bg-[var(--color-ink)] text-[var(--color-bg)]' : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)]'}`}
            >Minor</button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">Key</label>
          <select
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            className="h-8 px-2 text-sm rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
          >
            {(mode === 'major' ? MAJOR_KEYS : MINOR_KEYS).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
          <label className="text-[10px] font-medium text-[var(--color-ink-soft)] uppercase tracking-wide">Progression</label>
          <select
            value={activeProg}
            onChange={(e) => setActiveProg(e.target.value)}
            className="h-8 px-2 text-sm rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
          >
            {progs.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {prog && (
        <p className="text-sm text-[var(--color-ink-soft)] px-1">{prog.description}</p>
      )}

      {/* Chord chain */}
      <div className="flex gap-3 overflow-x-auto pb-3 snap-x">
        {chain.map((step, i) => (
          <div key={i} className="shrink-0 w-[170px] snap-start flex flex-col gap-1">
            <div className="text-center text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
              {i + 1}. {step.chord}
            </div>
            {step.voicing ? (
              <VoicingCard
                voicing={{ ...step.voicing, displayName: step.chord }}
                displayedFrets={step.frets}
                displayKey={keyName}
                displayMode={displayMode}
                highlightRoot={highlightRoot}
                compareFrets={i > 0 ? chain[i - 1]?.frets : null}
                showFavorite={false}
                absolute
              />
            ) : (
              <div className="p-3 rounded border border-dashed border-[var(--color-border)] text-xs text-[var(--color-ink-muted)] text-center">
                No voicing found for {step.chord}.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
