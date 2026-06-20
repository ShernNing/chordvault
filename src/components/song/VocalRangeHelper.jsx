import { Note } from 'tonal'
import { Mic, Check } from 'lucide-react'
import { useLocalStorage } from '../../lib/hooks'
import { transposeKey } from '../../lib/transposition'
import { Button, Select } from '../ui'

// Note options across the singable range, low → high.
const NOTE_PCS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NOTE_OPTIONS = []
for (let oct = 2; oct <= 5; oct++) {
  for (const pc of NOTE_PCS) NOTE_OPTIONS.push(`${pc}${oct}`)
}

function NoteSelect({ value, onChange, className = '' }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={`h-7 w-16 text-xs py-0 ${className}`}>
      {NOTE_OPTIONS.map((n) => (
        <option key={n} value={n}>{n}</option>
      ))}
    </Select>
  )
}

/**
 * VocalRangeHelper — finds the transpose that drops a song into the singer's
 * comfortable range. The singer's range is stored once (per device); each song's
 * melodic low/high is captured per song. Both live in localStorage — no DB.
 *
 * Props:
 *   songId          string
 *   originalKey     string | null
 *   currentCapo     number
 *   onApply         (semitones, capo) => void
 */
export default function VocalRangeHelper({ songId, originalKey, currentCapo = 0, onApply }) {
  const [voice, setVoice] = useLocalStorage('cv-vocal-range', { low: 'A2', high: 'C4' })
  const [songRange, setSongRange] = useLocalStorage(`cv-song-range-${songId}`, null)

  const vLow = Note.midi(voice.low)
  const vHigh = Note.midi(voice.high)
  const ready = songRange && Note.midi(songRange.low) != null && Note.midi(songRange.high) != null

  let shift = null
  let resultKey = null
  let fullyFits = false
  if (ready && vLow != null && vHigh != null) {
    const sLow = Note.midi(songRange.low)
    const sHigh = Note.midi(songRange.high)
    const centered = Math.round((vLow + vHigh) / 2 - (sLow + sHigh) / 2)
    // Range of shifts that keep the whole melody inside the comfortable range.
    const minShift = vLow - sLow
    const maxShift = vHigh - sHigh
    if (minShift <= maxShift) {
      shift = Math.max(minShift, Math.min(maxShift, centered))
      fullyFits = true
    } else {
      shift = centered // can't fully fit (song spans more than the voice) — center it
    }
    shift = Math.max(-12, Math.min(12, shift))
    if (originalKey) resultKey = transposeKey(originalKey, shift)
  }

  return (
    <div className="no-print flex flex-col gap-3 px-3 py-3 bg-[var(--color-bg-warm)] border border-[var(--color-border)] rounded-lg">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink)] uppercase tracking-wide">
        <Mic size={13} /> Fit to my voice
      </div>

      {/* Singer's comfortable range (per device) */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--color-ink-muted)] w-24">My comfy range</span>
        <NoteSelect value={voice.low} onChange={(low) => setVoice((v) => ({ ...v, low }))} />
        <span className="text-xs text-[var(--color-ink-muted)]">to</span>
        <NoteSelect value={voice.high} onChange={(high) => setVoice((v) => ({ ...v, high }))} />
      </div>

      {/* This song's melodic range */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--color-ink-muted)] w-24">Song's lowest / highest melody note</span>
        <NoteSelect
          value={songRange?.low || 'C3'}
          onChange={(low) => setSongRange((r) => ({ low, high: r?.high || 'C4' }))}
        />
        <span className="text-xs text-[var(--color-ink-muted)]">to</span>
        <NoteSelect
          value={songRange?.high || 'C4'}
          onChange={(high) => setSongRange((r) => ({ low: r?.low || 'C3', high }))}
        />
      </div>

      {!ready ? (
        <p className="text-[11px] text-[var(--color-ink-muted)] italic">
          Set the song's lowest and highest melody notes (in the original key), then fit.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-[var(--color-ink-soft)]">
            {shift === 0 ? (
              <>Original key already fits your range.</>
            ) : (
              <>
                Transpose <strong className="font-mono">{shift > 0 ? `+${shift}` : shift}</strong>
                {resultKey && <> → key of <strong className="font-mono">{resultKey}</strong></>}
                {!fullyFits && <span className="text-amber-600 dark:text-amber-400"> (best fit — song is wide)</span>}
              </>
            )}
          </span>
          <Button
            variant="primary"
            size="sm"
            disabled={!originalKey}
            onClick={() => onApply?.(shift ?? 0, currentCapo)}
          >
            <Check size={12} /> Apply
          </Button>
        </div>
      )}
    </div>
  )
}
