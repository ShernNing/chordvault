import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  ChevronUp,
  ChevronDown,
  Gauge,
  Music2,
  Timer,
  X,
} from "lucide-react";
import { tapsToBpm } from "../../lib/metronome";
import { useMetronome } from "../../lib/useMetronome";
import { createScrollAccumulator } from "../../lib/autoScroll";
import { useWakeLock } from "../../lib/wakeLock";
import { usePerformSurface } from "../../lib/stageChrome";
import { estimateSongSeconds, formatDuration } from "../../lib/songDuration";
import { Button, Tooltip } from "../ui";
import BeatIndicator from "./BeatIndicator";

// Hands-free auto-scroll: scroll the window at `speed` px/sec while active.
// Sub-pixel steps are accumulated (see lib/autoScroll) so slow speeds still move.
function useAutoScroll(speed) {
  const [scrolling, setScrolling] = useState(false);
  const rafRef = useRef(null);
  const lastRef = useRef(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    if (!scrolling) return undefined;
    lastRef.current = null;
    const acc = createScrollAccumulator();
    const step = (ts) => {
      if (lastRef.current == null) lastRef.current = ts;
      const dt = (ts - lastRef.current) / 1000;
      lastRef.current = ts;
      const px = acc.step(window.scrollY, speedRef.current * dt);
      if (px) window.scrollBy(0, px);
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 1;
      if (atBottom) {
        setScrolling(false);
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scrolling]);

  return { scrolling, setScrolling };
}

/**
 * PerformBar, sticky live-performance bar: auto-scroll + metronome.
 *
 * Props:
 *   bpm          number      , current tempo (stored by parent)
 *   onBpmChange  (bpm)=>void  , persist tempo
 *   beatsPerBar  number       , accent every N beats (default 4)
 *   song         object       , for BPM-synced scroll (structure → duration)
 *   onClose      ()=>void     , hide the bar
 */
export default function PerformBar({
  bpm = 100,
  onBpmChange,
  beatsPerBar = 4,
  song = null,
  onClose,
}) {
  const [manualSpeed, setManualSpeed] = useState(30); // px/s, slider value
  const [bpmSync, setBpmSync] = useState(false);
  const [bpmSpeed, setBpmSpeed] = useState(30); // px/s derived from tempo+length

  // Estimated single-pass duration at the current tempo — drives synced scroll
  // so the sheet reaches the bottom right as the song ends.
  const durationSec = song ? estimateSongSeconds(song, bpm, beatsPerBar) : 0;

  const recomputeBpmSpeed = useCallback(() => {
    const scrollable =
      document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable > 0 && durationSec > 0) setBpmSpeed(scrollable / durationSec);
  }, [durationSec]);

  // Keep the derived speed fresh while synced (tempo changes, layout settles).
  useEffect(() => {
    if (bpmSync) recomputeBpmSpeed();
  }, [bpmSync, recomputeBpmSpeed]);

  const activeSpeed = bpmSync ? bpmSpeed : manualSpeed;
  const { scrolling, setScrolling } = useAutoScroll(activeSpeed);

  const toggleScroll = () => {
    if (bpmSync) recomputeBpmSpeed(); // height may have changed since mount
    setScrolling((s) => !s);
  };

  const tapsRef = useRef([]);
  const {
    metroOn,
    toggle: toggleMetro,
    subscribeBeat,
  } = useMetronome({ bpm, beatsPerBar });

  // Keep the phone awake while it's driving the performance.
  useWakeLock(scrolling || metroOn);
  // Hide floating app chrome (back-to-top) that would sit on top of the bar.
  usePerformSurface(true);

  // Publish the bar's real height so the ChordPlayer can stack above it even
  // when the bar wraps onto two rows on a phone.
  const barRef = useRef(null);
  useEffect(() => {
    const el = barRef.current;
    const rootStyle = document.documentElement.style;
    if (!el) return undefined;
    const publish = () =>
      rootStyle.setProperty(
        "--perform-bar-h",
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      );
    publish();
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(publish);
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
      rootStyle.removeProperty("--perform-bar-h");
    };
  }, []);

  const nudgeBpm = (d) => onBpmChange?.(Math.max(30, Math.min(300, bpm + d)));

  const tap = () => {
    const now = performance.now();
    const taps = tapsRef.current;
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    const next = tapsToBpm(taps);
    if (next) onBpmChange?.(next);
  };

  return (
    <div
      ref={barRef}
      className='no-print fixed bottom-0 inset-x-0 z-30 flex justify-center px-3 pointer-events-none safe-x'
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className='pointer-events-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2.5 rounded-xl bg-[var(--color-bg-warm)] border border-[var(--color-border)] shadow-lg max-w-full'>
        {/* Auto-scroll */}
        <div className='flex items-center gap-2'>
          <Tooltip content={scrolling ? "Pause scroll" : "Auto-scroll"}>
            <Button
              variant={scrolling ? "primary" : "secondary"}
              size='icon-sm'
              hitArea
              aria-pressed={scrolling}
              onClick={toggleScroll}
            >
              {scrolling ? <Pause size={14} /> : <Play size={14} />}
            </Button>
          </Tooltip>

          {song && (
            <Tooltip
              content={
                bpmSync
                  ? "Synced to tempo — scrolls over the song's length"
                  : "Sync scroll speed to tempo"
              }
            >
              <Button
                variant={bpmSync ? "primary" : "secondary"}
                size='icon-sm'
                hitArea
                aria-pressed={bpmSync}
                onClick={() => setBpmSync((v) => !v)}
              >
                <Timer size={14} />
              </Button>
            </Tooltip>
          )}

          {bpmSync ? (
            <span className='text-[11px] font-mono text-[var(--color-ink-soft)] select-none whitespace-nowrap'>
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
                className='w-24 accent-[var(--color-accent)]'
                title={`Scroll speed ${manualSpeed}px/s`}
                aria-label='Scroll speed'
                aria-valuetext={`${manualSpeed} pixels per second`}
              />
            </>
          )}
        </div>

        <div className='w-px h-6 bg-[var(--color-border)]' />

        {/* Metronome */}
        <div className='flex items-center gap-2'>
          <Tooltip content={metroOn ? "Stop metronome" : "Start metronome"}>
            <Button
              variant={metroOn ? "primary" : "secondary"}
              size='icon-sm'
              hitArea
              aria-pressed={metroOn}
              onClick={toggleMetro}
            >
              <Music2 size={14} />
            </Button>
          </Tooltip>
          <Button
            variant='secondary'
            size='icon-sm'
            hitArea
            aria-label='Decrease tempo'
            onClick={() => nudgeBpm(-1)}
            disabled={bpm <= 30}
          >
            <ChevronDown size={13} />
          </Button>
          <div
            className='w-14 text-center font-mono text-sm font-semibold text-[var(--color-ink)] select-none leading-none'
            aria-live='polite'
          >
            {bpm}
            <span className='text-[9px] text-[var(--color-ink-muted)] ml-0.5'>
              bpm
            </span>
          </div>
          <Button
            variant='secondary'
            size='icon-sm'
            hitArea
            aria-label='Increase tempo'
            onClick={() => nudgeBpm(+1)}
            disabled={bpm >= 300}
          >
            <ChevronUp size={13} />
          </Button>
          <Button
            variant='secondary'
            size='sm'
            hitArea
            aria-label='Tap tempo'
            onClick={tap}
          >
            Tap
          </Button>

          {/* beat indicator — owns its own beat state */}
          <BeatIndicator
            subscribe={subscribeBeat}
            beatsPerBar={beatsPerBar}
            active={metroOn}
            className='ml-1'
          />
        </div>

        {onClose && (
          <>
            <div className='w-px h-6 bg-[var(--color-border)]' />
            <Button
              variant='ghost'
              size='icon-sm'
              hitArea
              onClick={onClose}
              title='Close perform bar'
              aria-label='Close perform bar'
            >
              <X size={14} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
