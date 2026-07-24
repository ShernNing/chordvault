import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Gauge,
  Music2,
  Timer,
  Hash,
  Type,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  semitonesFromKeyToKey,
  transposeKey,
  getCapoDisplay,
} from "../../lib/transposition";
import { supabaseSongOps } from "../../lib/supabaseOps";
import { Metronome, tapsToBpm } from "../../lib/metronome";
import { useKeyboardControls, useDisplaySettings } from "../../lib/hooks";
import { cycleNashville, normalizeNashville } from "../../lib/nashville";
import { estimateSongSeconds, formatDuration } from "../../lib/songDuration";
import SongRenderer from "../song/SongRenderer";
import { Button, Tooltip, Badge } from "../ui";

function readBpm(songId) {
  try {
    const v = localStorage.getItem(`cv-bpm-${songId}`);
    return v != null ? JSON.parse(v) : 100;
  } catch {
    return 100;
  }
}

function slotDisplay(slot) {
  const song = slot.song;
  const semitones =
    slot.chosen_key && song?.original_key
      ? semitonesFromKeyToKey(song.original_key, slot.chosen_key)
      : 0;
  const displayKey = slot.chosen_key || song?.original_key || null;
  const capo = slot.capo || 0;
  const shapeSemitones = semitones - capo;
  const shapeKey =
    capo > 0 && displayKey ? transposeKey(displayKey, -capo) : displayKey;
  return { displayKey, capo, shapeSemitones, shapeKey };
}

/**
 * SetlistPerformer, full-screen, hands-free performance flow for a whole setlist.
 * Chains songs with prev/next (buttons, arrow keys, or a Bluetooth page pedal),
 * carries each slot's key + capo, auto-scrolls, and has a built-in metronome.
 */
export default function SetlistPerformer({ slots, onClose }) {
  const { fontSize, setFontSize } = useDisplaySettings();
  const playable = (slots || []).filter((s) => s.song);
  const [index, setIndex] = useState(0);
  const [nashville, setNashville] = useState(false);

  const scrollRef = useRef(null);
  const [scrolling, setScrolling] = useState(false);
  const [manualSpeed, setManualSpeed] = useState(28);
  const [bpmSync, setBpmSync] = useState(false);
  const [bpmSpeed, setBpmSpeed] = useState(28);
  const speedRef = useRef(28);

  const slot = playable[index];
  const song = slot?.song;

  // Metronome
  const metroRef = useRef(null);
  const [metroOn, setMetroOn] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [bpm, setBpm] = useState(() => (song ? readBpm(song.id) : 100));
  const tapsRef = useRef([]);
  const beatsPerBar = 4;

  // BPM-synced scroll: derive px/s so the chart scrolls over the song's
  // estimated single-pass length at the current tempo.
  const durationSec = song ? estimateSongSeconds(song, bpm, beatsPerBar) : 0;
  const recomputeBpmSpeed = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    if (scrollable > 0 && durationSec > 0) setBpmSpeed(scrollable / durationSec);
  }, [durationSec]);
  const activeSpeed = bpmSync ? bpmSpeed : manualSpeed;
  speedRef.current = activeSpeed;

  // Refresh derived speed when synced, on tempo change, or on song change.
  useEffect(() => {
    if (bpmSync) recomputeBpmSpeed();
  }, [bpmSync, recomputeBpmSpeed, index]);

  const goTo = useCallback(
    (next) => {
      setIndex(Math.max(0, Math.min(playable.length - 1, next)));
    },
    [playable.length],
  );

  const onNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const onPrev = useCallback(() => goTo(index - 1), [goTo, index]);
  const toggleScroll = useCallback(() => {
    if (bpmSync) recomputeBpmSpeed();
    setScrolling((s) => !s);
  }, [bpmSync, recomputeBpmSpeed]);

  useKeyboardControls({
    onNext,
    onPrev,
    onToggle: toggleScroll,
    enabled: true,
  });

  // Esc closes
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset scroll + tempo when the song changes; mark it played.
  useEffect(() => {
    if (!song) return;
    scrollRef.current?.scrollTo({ top: 0 });
    setScrolling(false);
    setBpm(readBpm(song.id));
    supabaseSongOps.markPlayed(song.id).catch(() => {});
  }, [index, song]);

  // Auto-scroll the content container.
  useEffect(() => {
    if (!scrolling) return undefined;
    let raf;
    let last = null;
    const step = (ts) => {
      if (last == null) last = ts;
      const dt = (ts - last) / 1000;
      last = ts;
      const el = scrollRef.current;
      if (el) {
        el.scrollTop += speedRef.current * dt;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          setScrolling(false);
          return;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [scrolling]);

  // Keep the metronome's tempo in sync.
  useEffect(() => {
    metroRef.current?.setBpm(bpm);
  }, [bpm]);
  useEffect(
    () => () => {
      metroRef.current?.dispose();
    },
    [],
  );

  const getMetro = useCallback(() => {
    if (!metroRef.current) {
      const m = new Metronome();
      m.beatsPerBar = beatsPerBar;
      m.onBeat = (b) => setBeat(b);
      metroRef.current = m;
    }
    return metroRef.current;
  }, []);

  const toggleMetro = async () => {
    const m = getMetro();
    m.setBpm(bpm);
    if (metroOn) {
      m.stop();
      setMetroOn(false);
      setBeat(-1);
    } else {
      await m.start();
      setMetroOn(true);
    }
  };

  const nudgeBpm = (d) => setBpm((b) => Math.max(30, Math.min(300, b + d)));
  const tap = () => {
    const now = performance.now();
    const taps = tapsRef.current;
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    const next = tapsToBpm(taps);
    if (next) setBpm(next);
  };

  if (!song) return null;
  const { displayKey, capo, shapeSemitones, shapeKey } = slotDisplay(slot);
  const capoHint =
    displayKey && capo > 0 ? getCapoDisplay(displayKey, capo) : null;

  return createPortal(
    <div className='fixed inset-0 z-[60] bg-[var(--color-bg)] flex flex-col'>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className='flex items-center gap-3 px-4 h-12 border-b border-[var(--color-border)] shrink-0'>
        <span className='text-xs font-mono text-[var(--color-ink-muted)] tabular-nums shrink-0'>
          {index + 1}/{playable.length}
        </span>
        <div className='min-w-0 flex-1'>
          <div className='flex items-baseline gap-2'>
            <h2 className='font-mono text-sm font-bold text-[var(--color-ink)] truncate'>
              {song.title}
            </h2>
            {displayKey && (
              <Badge variant='key'>
                {displayKey}
                {capo > 0 ? ` · capo ${capo}` : ""}
              </Badge>
            )}
          </div>
          {song.artist && (
            <p className='text-[10px] text-[var(--color-ink-muted)] truncate'>
              {song.artist}
            </p>
          )}
        </div>

        {/* Font size */}
        <div className='hidden sm:flex items-center gap-1'>
          <Type size={12} className='text-[var(--color-ink-muted)]' />
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={() => setFontSize((s) => Math.max(10, s - 1))}
            disabled={fontSize <= 10}
          >
            −
          </Button>
          <span className='w-8 text-center font-mono text-[11px]'>
            {fontSize}px
          </span>
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={() => setFontSize((s) => Math.min(28, s + 1))}
            disabled={fontSize >= 28}
          >
            +
          </Button>
        </div>

        <Tooltip
          content={
            !song.original_key
              ? "Set a key to use Nashville"
              : normalizeNashville(nashville) === "off"
                ? "Nashville numbers"
                : normalizeNashville(nashville) === "numbers"
                  ? "Numbers above chords"
                  : "Hide Nashville numbers"
          }
        >
          <Button
            variant={
              normalizeNashville(nashville) !== "off" ? "primary" : "ghost"
            }
            size='icon-sm'
            onClick={() => setNashville(cycleNashville)}
            disabled={!displayKey}
          >
            <Hash size={14} />
            {normalizeNashville(nashville) === "both" && (
              <span className='text-[9px] font-bold leading-none ml-0.5'>
                +
              </span>
            )}
          </Button>
        </Tooltip>

        <Button
          variant='ghost'
          size='icon-sm'
          onClick={onClose}
          title='Exit (Esc)'
        >
          <X size={16} />
        </Button>
      </div>

      {capoHint && (
        <div className='px-4 py-1 text-[10px] text-[var(--color-ink-muted)] font-mono border-b border-[var(--color-border)] shrink-0'>
          {capoHint}
        </div>
      )}

      {/* ── Scrollable chart ────────────────────────────────────── */}
      <div ref={scrollRef} className='flex-1 overflow-y-auto px-5 py-6'>
        <div className='max-w-3xl mx-auto'>
          <SongRenderer
            key={song.id}
            parsedContent={song.parsed_content}
            semitones={shapeSemitones}
            targetKey={shapeKey}
            fontSize={fontSize}
            nashville={nashville}
          />
          {/* tail space so the last lines can scroll up into view */}
          <div className='h-[40vh]' />
        </div>
      </div>

      {/* ── Bottom control bar ──────────────────────────────────── */}
      <div className='flex items-center justify-between gap-3 px-3 sm:px-4 h-16 border-t border-[var(--color-border)] bg-[var(--color-bg-warm)] shrink-0'>
        {/* Prev */}
        <Button
          variant='secondary'
          size='md'
          onClick={onPrev}
          disabled={index <= 0}
        >
          <ChevronLeft size={16} />{" "}
          <span className='hidden sm:inline'>Prev</span>
        </Button>

        {/* Center cluster: scroll + metronome */}
        <div className='flex items-center gap-3 sm:gap-4 overflow-x-auto'>
          <div className='flex items-center gap-1.5 shrink-0'>
            <Tooltip
              content={
                scrolling ? "Pause scroll (space)" : "Auto-scroll (space)"
              }
            >
              <Button
                variant={scrolling ? "primary" : "secondary"}
                size='icon-sm'
                onClick={toggleScroll}
              >
                {scrolling ? <Pause size={14} /> : <Play size={14} />}
              </Button>
            </Tooltip>
            <Tooltip
              content={
                bpmSync ? "Synced to tempo" : "Sync scroll speed to tempo"
              }
            >
              <Button
                variant={bpmSync ? "primary" : "secondary"}
                size='icon-sm'
                onClick={() => setBpmSync((v) => !v)}
              >
                <Timer size={14} />
              </Button>
            </Tooltip>
            {bpmSync ? (
              <span className='text-[11px] font-mono text-[var(--color-ink-soft)] tabular-nums whitespace-nowrap'>
                ~{formatDuration(durationSec)}
              </span>
            ) : (
              <>
                <Gauge size={13} className='text-[var(--color-ink-muted)]' />
                <input
                  type='range'
                  min={6}
                  max={120}
                  step={2}
                  value={manualSpeed}
                  onChange={(e) => setManualSpeed(Number(e.target.value))}
                  className='w-16 sm:w-24 accent-[var(--color-accent)]'
                  title={`Scroll ${manualSpeed}px/s`}
                />
              </>
            )}
          </div>

          <div className='w-px h-6 bg-[var(--color-border)] shrink-0' />

          <div className='flex items-center gap-1.5 shrink-0'>
            <Tooltip content={metroOn ? "Stop metronome" : "Start metronome"}>
              <Button
                variant={metroOn ? "primary" : "secondary"}
                size='icon-sm'
                onClick={toggleMetro}
              >
                <Music2 size={14} />
              </Button>
            </Tooltip>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => nudgeBpm(-1)}
              disabled={bpm <= 30}
            >
              −
            </Button>
            <span className='w-12 text-center font-mono text-sm font-semibold tabular-nums'>
              {bpm}
              <span className='text-[9px] text-[var(--color-ink-muted)] ml-0.5'>
                bpm
              </span>
            </span>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => nudgeBpm(1)}
              disabled={bpm >= 300}
            >
              +
            </Button>
            <Button variant='secondary' size='sm' onClick={tap}>
              Tap
            </Button>
            <div className='hidden sm:flex items-center gap-1 ml-1'>
              {Array.from({ length: beatsPerBar }, (_, i) => (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    metroOn && beat === i
                      ? i === 0
                        ? "bg-[var(--color-accent)]"
                        : "bg-[var(--color-ink)]"
                      : "bg-[var(--color-border)]"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Next */}
        <Button
          variant='secondary'
          size='md'
          onClick={onNext}
          disabled={index >= playable.length - 1}
        >
          <span className='hidden sm:inline'>Next</span>{" "}
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>,
    document.body,
  );
}
