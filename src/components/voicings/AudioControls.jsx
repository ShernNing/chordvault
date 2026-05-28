import React from 'react'
import { Volume2, ArrowDownToLine, ArrowUpToLine } from 'lucide-react'

/**
 * Compact strip of audio playback controls. Controlled component — caller owns state.
 *
 * Props:
 *   value:     { mode, direction, speedMs, sustainSec }
 *   onChange:  (next) => void
 *   compact:   render even smaller variant
 */
export default function AudioControls({ value, onChange, compact = false }) {
  const update = (patch) => onChange({ ...value, ...patch })

  const modes = [
    { id: 'strum', label: 'Strum' },
    { id: 'arpeggio', label: 'Arpeggio' },
    { id: 'chord', label: 'All at once' },
  ]

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-[10px]' : 'text-xs'}`}>
      <Volume2 size={compact ? 12 : 14} className="text-[var(--color-ink-soft)] shrink-0" />

      {/* mode */}
      <div className="inline-flex rounded border border-[var(--color-border)] overflow-hidden">
        {modes.map((m, idx) => (
          <button
            key={m.id}
            onClick={() => update({ mode: m.id })}
            className={`px-2 py-1 transition-colors ${idx > 0 ? 'border-l border-[var(--color-border)]' : ''} ${
              value.mode === m.id
                ? 'bg-[var(--color-ink)] text-[var(--color-bg)]'
                : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >{m.label}</button>
        ))}
      </div>

      {/* direction (only for strum/arpeggio) */}
      {value.mode !== 'chord' && (
        <div className="inline-flex rounded border border-[var(--color-border)] overflow-hidden">
          <button
            onClick={() => update({ direction: 'down' })}
            title="Low → High"
            className={`px-2 py-1 transition-colors ${
              value.direction === 'down'
                ? 'bg-[var(--color-ink)] text-[var(--color-bg)]'
                : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          ><ArrowDownToLine size={12} /></button>
          <button
            onClick={() => update({ direction: 'up' })}
            title="High → Low"
            className={`px-2 py-1 transition-colors border-l border-[var(--color-border)] ${
              value.direction === 'up'
                ? 'bg-[var(--color-ink)] text-[var(--color-bg)]'
                : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          ><ArrowUpToLine size={12} /></button>
        </div>
      )}

      {/* speed */}
      <label className="flex items-center gap-1 text-[var(--color-ink-soft)]">
        Speed
        <input
          type="range"
          min={5}
          max={200}
          step={5}
          value={value.speedMs}
          onChange={(e) => update({ speedMs: Number(e.target.value) })}
          className="accent-[var(--color-accent)] w-20"
        />
        <span className="text-[var(--color-ink-muted)] w-10 text-right">{value.speedMs}ms</span>
      </label>

      {/* sustain */}
      <label className="flex items-center gap-1 text-[var(--color-ink-soft)]">
        Sustain
        <input
          type="range"
          min={0.3}
          max={4}
          step={0.1}
          value={value.sustainSec}
          onChange={(e) => update({ sustainSec: Number(e.target.value) })}
          className="accent-[var(--color-accent)] w-20"
        />
        <span className="text-[var(--color-ink-muted)] w-8 text-right">{value.sustainSec.toFixed(1)}s</span>
      </label>
    </div>
  )
}
