import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Play, Pause, ChevronUp, ChevronDown, Gauge, Music2, X } from 'lucide-react'
import { Metronome, tapsToBpm } from '../../lib/metronome'
import { Button, Tooltip } from '../ui'

// Hands-free auto-scroll: scroll the window at `speed` px/sec while active.
function useAutoScroll(speed) {
  const [scrolling, setScrolling] = useState(false)
  const rafRef = useRef(null)
  const lastRef = useRef(null)
  const speedRef = useRef(speed)
  speedRef.current = speed

  useEffect(() => {
    if (!scrolling) return undefined
    lastRef.current = null
    const step = (ts) => {
      if (lastRef.current == null) lastRef.current = ts
      const dt = (ts - lastRef.current) / 1000
      lastRef.current = ts
      window.scrollBy(0, speedRef.current * dt)
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1
      if (atBottom) { setScrolling(false); return }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [scrolling])

  return { scrolling, setScrolling }
}

/**
 * PerformBar — sticky live-performance bar: auto-scroll + metronome.
 *
 * Props:
 *   bpm          number       — current tempo (stored by parent)
 *   onBpmChange  (bpm)=>void   — persist tempo
 *   beatsPerBar  number        — accent every N beats (default 4)
 *   onClose      ()=>void      — hide the bar
 */
export default function PerformBar({ bpm = 100, onBpmChange, beatsPerBar = 4, onClose }) {
  const [speed, setSpeed] = useState(30)
  const { scrolling, setScrolling } = useAutoScroll(speed)

  const metroRef = useRef(null)
  const [metroOn, setMetroOn] = useState(false)
  const [beat, setBeat] = useState(-1)
  const tapsRef = useRef([])

  // Lazily create the metronome; keep its bpm in sync.
  const getMetro = useCallback(() => {
    if (!metroRef.current) {
      const m = new Metronome()
      m.beatsPerBar = beatsPerBar
      m.onBeat = (b) => setBeat(b)
      metroRef.current = m
    }
    return metroRef.current
  }, [beatsPerBar])

  useEffect(() => {
    if (metroRef.current) metroRef.current.setBpm(bpm)
  }, [bpm])

  useEffect(() => () => { metroRef.current?.dispose() }, [])

  const toggleMetro = async () => {
    const m = getMetro()
    m.setBpm(bpm)
    if (metroOn) { m.stop(); setMetroOn(false); setBeat(-1) }
    else { await m.start(); setMetroOn(true) }
  }

  const nudgeBpm = (d) => onBpmChange?.(Math.max(30, Math.min(300, bpm + d)))

  const tap = () => {
    const now = performance.now()
    const taps = tapsRef.current
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0
    taps.push(now)
    const next = tapsToBpm(taps)
    if (next) onBpmChange?.(next)
  }

  return (
    <div className="no-print fixed bottom-0 inset-x-0 z-30 flex justify-center px-3 pb-3 pointer-events-none">
      <div className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 rounded-xl bg-[var(--color-bg-warm)] border border-[var(--color-border)] shadow-lg">

        {/* Auto-scroll */}
        <div className="flex items-center gap-2">
          <Tooltip content={scrolling ? 'Pause scroll' : 'Auto-scroll'}>
            <Button variant={scrolling ? 'primary' : 'secondary'} size="icon-sm" onClick={() => setScrolling(s => !s)}>
              {scrolling ? <Pause size={14} /> : <Play size={14} />}
            </Button>
          </Tooltip>
          <Gauge size={13} className="text-[var(--color-ink-muted)]" />
          <input
            type="range" min={6} max={120} step={2}
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            className="w-24 accent-[var(--color-accent)]"
            title={`Scroll speed ${speed}px/s`}
          />
        </div>

        <div className="w-px h-6 bg-[var(--color-border)]" />

        {/* Metronome */}
        <div className="flex items-center gap-2">
          <Tooltip content={metroOn ? 'Stop metronome' : 'Start metronome'}>
            <Button variant={metroOn ? 'primary' : 'secondary'} size="icon-sm" onClick={toggleMetro}>
              <Music2 size={14} />
            </Button>
          </Tooltip>
          <Button variant="secondary" size="icon-sm" onClick={() => nudgeBpm(-1)} disabled={bpm <= 30}>
            <ChevronDown size={13} />
          </Button>
          <div className="w-14 text-center font-mono text-sm font-semibold text-[var(--color-ink)] select-none leading-none">
            {bpm}<span className="text-[9px] text-[var(--color-ink-muted)] ml-0.5">bpm</span>
          </div>
          <Button variant="secondary" size="icon-sm" onClick={() => nudgeBpm(+1)} disabled={bpm >= 300}>
            <ChevronUp size={13} />
          </Button>
          <Button variant="secondary" size="sm" onClick={tap}>Tap</Button>

          {/* beat indicator */}
          <div className="flex items-center gap-1 ml-1">
            {Array.from({ length: beatsPerBar }, (_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  metroOn && beat === i
                    ? (i === 0 ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-ink)]')
                    : 'bg-[var(--color-border)]'
                }`}
              />
            ))}
          </div>
        </div>

        {onClose && (
          <>
            <div className="w-px h-6 bg-[var(--color-border)]" />
            <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close perform bar">
              <X size={14} />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
