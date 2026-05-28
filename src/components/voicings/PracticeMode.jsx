import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Eye, EyeOff, RotateCw, Check, X as XIcon } from 'lucide-react'
import FretboardDiagram from './FretboardDiagram'
import { VOICINGS } from '../../lib/voicings/catalog'
import { useLocalStorage } from '../../lib/hooks'

function pickRandomVoicing(prev) {
  if (VOICINGS.length === 0) return null
  let v
  do { v = VOICINGS[Math.floor(Math.random() * VOICINGS.length)] } while (v === prev && VOICINGS.length > 1)
  return v
}

export default function PracticeMode() {
  const [current, setCurrent] = useState(() => pickRandomVoicing(null))
  const [revealed, setRevealed] = useState(false)
  const [score, setScore] = useLocalStorage('chordvault-practice-score', { correct: 0, total: 0 })

  const next = useCallback((wasCorrect) => {
    if (revealed) {
      setScore({
        correct: score.correct + (wasCorrect ? 1 : 0),
        total: score.total + 1,
      })
    }
    setRevealed(false)
    setCurrent(prev => pickRandomVoicing(prev))
  }, [revealed, score, setScore])

  // keyboard: space=reveal, y=correct, n=skip
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.code === 'Space') { e.preventDefault(); setRevealed(r => !r) }
      else if (e.key === 'y' || e.key === 'Enter') { if (revealed) next(true) }
      else if (e.key === 'n' || e.key === 'ArrowRight') { next(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, next])

  if (!current) return null

  const pct = score.total > 0 ? Math.round(score.correct / score.total * 100) : 0

  return (
    <div className="flex flex-col items-center gap-4">
      <header className="flex items-center justify-between w-full">
        <div className="flex flex-col">
          <h3 className="font-display text-lg text-[var(--color-ink)]">Practice mode</h3>
          <p className="text-xs text-[var(--color-ink-soft)]">
            Name the chord, then tap Reveal. Track your hit rate.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-display text-[var(--color-ink)]">{score.correct} / {score.total}</div>
          <div className="text-xs text-[var(--color-ink-muted)]">{pct}% correct</div>
        </div>
      </header>

      <div className="flex flex-col items-center gap-3 p-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-warm)] w-full max-w-md">
        <FretboardDiagram frets={current.frets} width={160} showLabels />

        <div className="h-9 flex items-center">
          {revealed ? (
            <span className="font-display text-3xl text-[var(--color-ink)]">{current.displayName}</span>
          ) : (
            <span className="font-display text-3xl text-[var(--color-ink-muted)] tracking-widest">? ? ?</span>
          )}
        </div>

        <div className="flex gap-2 w-full justify-center">
          <button
            onClick={() => setRevealed(r => !r)}
            className="flex items-center gap-2 h-9 px-4 rounded border border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors"
          >
            {revealed ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Reveal</>}
          </button>
          {revealed ? (
            <>
              <button
                onClick={() => next(true)}
                className="flex items-center gap-2 h-9 px-4 rounded bg-emerald-600 text-white hover:opacity-90"
              ><Check size={14} /> Got it</button>
              <button
                onClick={() => next(false)}
                className="flex items-center gap-2 h-9 px-4 rounded bg-rose-600 text-white hover:opacity-90"
              ><XIcon size={14} /> Missed</button>
            </>
          ) : (
            <button
              onClick={() => next(false)}
              className="flex items-center gap-2 h-9 px-4 rounded border border-[var(--color-border)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
            ><RotateCw size={14} /> Skip</button>
          )}
        </div>

        <div className="text-[10px] text-[var(--color-ink-muted)] text-center">
          Shortcuts — <kbd className="px-1 rounded border border-[var(--color-border)]">Space</kbd> reveal · <kbd className="px-1 rounded border border-[var(--color-border)]">Y</kbd> got it · <kbd className="px-1 rounded border border-[var(--color-border)]">N</kbd> skip
        </div>
      </div>

      <button
        onClick={() => setScore({ correct: 0, total: 0 })}
        className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink-soft)] underline"
      >Reset score</button>
    </div>
  )
}
