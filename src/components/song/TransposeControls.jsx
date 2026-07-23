import {
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Hash,
  Guitar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  ALL_KEYS,
  transposeKey,
  getCapoDisplay,
  semitonesFromKeyToKey,
} from "../../lib/transposition";
import { normalizeNashville } from "../../lib/nashville";
import { PRESETS } from "../../lib/voicings/flow";
import { Button, Select, Tooltip, Badge } from "../ui";
import { RollValue } from "../../lib/motion";

/**
 * TransposeControls, always-visible control bar for song view.
 *
 * Props:
 *   originalKey   string , original key of the song
 *   semitones     number , current offset (-12..+12)
 *   capo          number , capo fret (0-12)
 *   onChange      (semitones, capo) => void
 */
export default function TransposeControls({
  originalKey,
  semitones = 0,
  capo = 0,
  onChange,
  nashville = false,
  onToggleNashville = null,
  voicings = false,
  onToggleVoicings = null,
  voicingPreset = 0,
  onCyclePreset = null,
}) {
  const displayKey = originalKey ? transposeKey(originalKey, semitones) : null;

  const capoDisplay =
    displayKey && capo > 0 ? getCapoDisplay(displayKey, capo) : null;

  const handleSemitones = (delta) => {
    const next = Math.max(-12, Math.min(12, semitones + delta));
    onChange(next, capo);
  };

  const handleReset = () => onChange(0, 0);

  const handleKeySelect = (targetKey) => {
    if (!originalKey || !targetKey) return;
    const diff = semitonesFromKeyToKey(originalKey, targetKey);
    onChange(diff, capo);
  };

  const handleCapo = (val) => {
    const c = Math.max(0, Math.min(12, Number(val) || 0));
    onChange(semitones, c);
  };

  const isDirty = semitones !== 0 || capo !== 0;

  return (
    <div className='flex flex-wrap items-center gap-3 p-3 bg-[var(--color-bg-warm)] border border-[var(--color-border)] rounded-lg no-print'>
      {/* ── Transpose ─────────────────────────────────────────────── */}
      <div className='flex items-center gap-1'>
        <span className='text-xs text-[var(--color-ink-muted)] uppercase tracking-wide mr-1 hidden sm:inline'>
          Transpose
        </span>
        <Tooltip content='Down 1 semitone'>
          <Button
            variant='secondary'
            size='icon-sm'
            onClick={() => handleSemitones(-1)}
            disabled={semitones <= -12}
          >
            <ChevronDown size={13} />
          </Button>
        </Tooltip>

        <div className='w-8 text-center font-mono text-xs font-semibold text-[var(--color-ink)] select-none'>
          <RollValue
            value={semitones > 0 ? `+${semitones}` : semitones}
            className='justify-items-center w-full'
          />
        </div>

        <Tooltip content='Up 1 semitone'>
          <Button
            variant='secondary'
            size='icon-sm'
            onClick={() => handleSemitones(+1)}
            disabled={semitones >= 12}
          >
            <ChevronUp size={13} />
          </Button>
        </Tooltip>
      </div>

      {/* ── Key Display / Selector ─────────────────────────────────── */}
      <div className='flex items-center gap-2'>
        <div className='flex items-center gap-1'>
          <span className='text-xs text-[var(--color-ink-muted)]'>Key</span>
          <Badge variant='key' className='text-xs'>
            <RollValue value={displayKey || "—"} />
          </Badge>
          {semitones !== 0 && originalKey && (
            <span className='text-[10px] text-[var(--color-ink-muted)] hidden sm:inline'>
              (orig: {originalKey})
            </span>
          )}
        </div>

        <Select
          className='w-20 h-7 text-xs'
          value={displayKey || ""}
          onChange={(e) => handleKeySelect(e.target.value)}
          title='Jump to key'
        >
          <option value=''>Jump…</option>
          {ALL_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </div>

      {/* ── Capo ─────────────────────────────────────────────────────── */}
      <div className='flex items-center gap-2'>
        <span className='text-xs text-[var(--color-ink-muted)]'>Capo</span>
        <div className='flex items-center gap-1'>
          <Button
            variant='secondary'
            size='icon-sm'
            onClick={() => handleCapo(capo - 1)}
            disabled={capo <= 0}
          >
            <ChevronDown size={13} />
          </Button>
          <div className='w-6 text-center font-mono text-xs font-semibold text-[var(--color-ink)] select-none'>
            <RollValue value={capo} className='justify-items-center w-full' />
          </div>
          <Button
            variant='secondary'
            size='icon-sm'
            onClick={() => handleCapo(capo + 1)}
            disabled={capo >= 12}
          >
            <ChevronUp size={13} />
          </Button>
        </div>
      </div>

      {/* ── Nashville numbers (off → numbers → numbers+chords) ───────────── */}
      {onToggleNashville &&
        (() => {
          const mode = normalizeNashville(nashville);
          const tip = !originalKey
            ? "Set a song key to use Nashville numbers"
            : mode === "off"
              ? "Show chords as Nashville numbers"
              : mode === "numbers"
                ? "Show numbers above the chord names"
                : "Hide Nashville numbers";
          return (
            <Tooltip content={tip}>
              <Button
                variant={mode !== "off" ? "primary" : "secondary"}
                size='sm'
                onClick={onToggleNashville}
                disabled={!originalKey}
              >
                <Hash size={12} />{" "}
                {mode === "both" ? "Nashville + chords" : "Nashville"}
              </Button>
            </Tooltip>
          );
        })()}

      {/* ── Voicings (fretboard diagrams under each chord) ──────────────── */}
      {onToggleVoicings && (
        <div className='flex items-center gap-1'>
          <Tooltip
            content={
              voicings
                ? "Hide chord voicings under the chords"
                : "Show a fretboard diagram under each chord"
            }
          >
            <Button
              variant={voicings ? "primary" : "secondary"}
              size='sm'
              onClick={onToggleVoicings}
            >
              <Guitar size={12} /> Voicings
            </Button>
          </Tooltip>
          {voicings && onCyclePreset && (
            <div className='flex items-center rounded border border-[var(--color-border)] text-xs h-8'>
              <button
                type='button'
                onClick={() => onCyclePreset(-1)}
                aria-label='Previous voicing set'
                className='px-1.5 h-full flex items-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]'
              >
                <ChevronLeft size={14} />
              </button>
              <span className='px-1 min-w-[92px] text-center text-[var(--color-ink)]'>
                {PRESETS[voicingPreset]?.label || PRESETS[0].label}
              </span>
              <button
                type='button'
                onClick={() => onCyclePreset(1)}
                aria-label='Next voicing set'
                className='px-1.5 h-full flex items-center text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg-warm)]'
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Capo hint ────────────────────────────────────────────────── */}
      {capoDisplay && (
        <span className='text-[10px] text-[var(--color-ink-muted)] font-mono hidden lg:inline'>
          {capoDisplay}
        </span>
      )}

      {/* ── Reset ────────────────────────────────────────────────────── */}
      {isDirty && (
        <Tooltip content='Reset to original key'>
          <Button variant='ghost' size='icon-sm' onClick={handleReset}>
            <RotateCcw size={13} />
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
