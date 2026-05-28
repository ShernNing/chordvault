import React, { useState, useMemo } from 'react'
import { Save, Trash2, RotateCcw, X as XIcon } from 'lucide-react'
import FretboardDiagram from './FretboardDiagram'
import { useUserVoicings } from '../../lib/voicings/userVoicings'
import { detectChordNames } from '../../lib/voicings/enharmonic'
import { voicingUniquePitchClasses } from '../../lib/voicings/notes'

const NUM_STRINGS = 6
const MAX_FRET = 12
const STRING_LABEL = ['E', 'A', 'D', 'G', 'B', 'e']

/**
 * Visual voicing builder. Click strings/frets to set notes. Save to localStorage.
 */
export default function VoicingEditor({ onSaved = null, initial = null }) {
  const { add, remove, list } = useUserVoicings()
  const [frets, setFrets] = useState(initial?.frets || [null, null, null, null, null, null])
  const [rootChord, setRootChord] = useState(initial?.rootChord || 'C')
  const [displayName, setDisplayName] = useState(initial?.displayName || 'C')
  const [description, setDescription] = useState(initial?.description || '')

  const detected = useMemo(() => {
    return detectChordNames(frets).slice(0, 4)
  }, [frets])

  const notes = voicingUniquePitchClasses(frets)

  const setFret = (stringIdx, fret) => {
    setFrets(prev => {
      const next = prev.slice()
      next[stringIdx] = (prev[stringIdx] === fret) ? null : fret
      return next
    })
  }

  const setMute = (stringIdx) => {
    setFrets(prev => { const next = prev.slice(); next[stringIdx] = null; return next })
  }

  const setOpen = (stringIdx) => {
    setFrets(prev => { const next = prev.slice(); next[stringIdx] = 0; return next })
  }

  const reset = () => setFrets([null, null, null, null, null, null])

  const onSave = () => {
    if (frets.every(f => f == null)) return
    const saved = add({ rootChord: rootChord.trim() || 'C', displayName: displayName.trim() || rootChord, frets, description })
    onSaved?.(saved)
    reset()
    setDisplayName('')
  }

  return (
    <div className="flex flex-col gap-4 p-4 rounded border border-[var(--color-border)] bg-[var(--color-bg-warm)]">
      <header className="flex items-center justify-between">
        <h3 className="font-display text-lg text-[var(--color-ink)]">Build a custom voicing</h3>
        <button
          onClick={reset}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[var(--color-border)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-ink-muted)]"
        ><RotateCcw size={12} /> Reset</button>
      </header>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Editor grid */}
        <div className="flex flex-col items-center gap-1">
          {/* X / O row */}
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: NUM_STRINGS }, (_, s) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <button
                  onClick={() => setMute(s)}
                  title={`Mute ${STRING_LABEL[s]}`}
                  className={`w-7 h-7 rounded text-xs font-bold border transition-colors ${
                    frets[s] == null
                      ? 'bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)]'
                      : 'bg-[var(--color-bg)] text-[var(--color-ink-muted)] border-[var(--color-border)] hover:text-[var(--color-ink)]'
                  }`}
                >×</button>
                <button
                  onClick={() => setOpen(s)}
                  title={`Open ${STRING_LABEL[s]}`}
                  className={`w-7 h-7 rounded text-xs border transition-colors ${
                    frets[s] === 0
                      ? 'bg-[var(--color-accent)] text-black border-[var(--color-accent)]'
                      : 'bg-[var(--color-bg)] text-[var(--color-ink-muted)] border-[var(--color-border)] hover:text-[var(--color-ink)]'
                  }`}
                >O</button>
              </div>
            ))}
          </div>

          {/* Fret grid */}
          <div className="grid grid-cols-6 gap-1 mt-1">
            {Array.from({ length: MAX_FRET }, (_, fIdx) => {
              const f = fIdx + 1
              return (
                <React.Fragment key={f}>
                  {Array.from({ length: NUM_STRINGS }, (_, s) => {
                    const active = frets[s] === f
                    return (
                      <button
                        key={`${f}-${s}`}
                        onClick={() => setFret(s, f)}
                        className={`w-7 h-7 rounded text-xs border transition-colors ${
                          active
                            ? 'bg-[var(--color-accent)] text-black border-[var(--color-accent)]'
                            : 'bg-[var(--color-bg)] text-[var(--color-ink-muted)] border-[var(--color-border)] hover:border-[var(--color-ink-muted)] hover:text-[var(--color-ink-soft)]'
                        }`}
                        title={`String ${STRING_LABEL[s]}, fret ${f}`}
                      >{active ? f : ''}</button>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </div>

          {/* String labels */}
          <div className="grid grid-cols-6 gap-1 mt-1">
            {STRING_LABEL.map((l, i) => (
              <span key={i} className="w-7 text-center text-[10px] text-[var(--color-ink-muted)]">{l}</span>
            ))}
          </div>
        </div>

        {/* Preview + metadata form */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="flex justify-center">
            <FretboardDiagram frets={frets} width={140} showLabels />
          </div>

          {detected.length > 0 && (
            <div className="text-xs text-[var(--color-ink-soft)] text-center">
              Detected: <span className="text-[var(--color-ink)]">{detected.join(', ')}</span>
            </div>
          )}

          {notes.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center">
              {notes.map((n, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-ink-soft)] border border-[var(--color-border)]">
                  {n}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">Chord (group)</span>
              <input
                value={rootChord}
                onChange={(e) => setRootChord(e.target.value)}
                placeholder="e.g. C, Bm, F#dim"
                className="h-8 px-2 text-sm rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">Display name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Cmaj7"
                className="h-8 px-2 text-sm rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">Notes (optional)</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's special about this voicing?"
              className="h-8 px-2 text-sm rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
            />
          </label>

          <button
            onClick={onSave}
            disabled={frets.every(f => f == null)}
            className="flex items-center justify-center gap-2 h-9 rounded bg-[var(--color-ink)] text-[var(--color-bg)] hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          ><Save size={14} /> Save voicing</button>
        </div>
      </div>

      {list.length > 0 && (
        <section className="flex flex-col gap-2 pt-3 border-t border-[var(--color-border)]">
          <h4 className="text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">Your saved voicings ({list.length})</h4>
          <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
            {list.map(v => (
              <div key={v.id} className="flex items-center gap-2 p-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)]">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--color-ink)] truncate">{v.displayName}</div>
                  <div className="font-mono text-[10px] text-[var(--color-ink-muted)]">{v.frets.map(f => f == null ? 'x' : f).join(' ')}</div>
                </div>
                <button
                  onClick={() => remove(v.id)}
                  className="p-1 rounded text-[var(--color-ink-muted)] hover:text-red-500 hover:bg-[var(--color-bg-warm)]"
                  title="Delete"
                  aria-label="Delete"
                ><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
