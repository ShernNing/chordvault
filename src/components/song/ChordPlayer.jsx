import { useEffect, useRef, useState } from "react";
import { Play, Pause, X, Music4, Repeat } from "lucide-react";
import { createProgressionPlayer } from "../../lib/voicings/audio";
import { Button, Tooltip, Select } from "../ui";

/**
 * ChordPlayer, sticky bar that strums the song's chord progression at tempo
 * through the Tone.js synth. A practice backing track: hear the changes,
 * play along. Uses the sounding chords (post-transpose), not the capo shapes.
 *
 * Props:
 *   chords   string[]   , ordered chord names to play
 *   bpm      number     , tempo (shared with the perform bar)
 *   raised   boolean    , lift above the perform bar when both are open
 *   onClose  () => void
 */
export default function ChordPlayer({
  chords = [],
  bpm = 100,
  raised = false,
  onClose,
}) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [beatsPerChord, setBeatsPerChord] = useState(4);
  const [loop, setLoop] = useState(false);
  const playerRef = useRef(null);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  const stop = () => {
    playerRef.current?.stop();
    playerRef.current = null;
    setPlaying(false);
    setCurrent(-1);
  };

  // Tear down on unmount or when the inputs that define the progression change.
  useEffect(() => stop, []);
  useEffect(() => {
    if (playing) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart is intentional only on progression/tempo change
  }, [chords, bpm, beatsPerChord]);

  const start = () => {
    if (!chords.length) return;
    const player = createProgressionPlayer({
      chords,
      bpm,
      beatsPerChord,
      onStep: (i) => setCurrent(i),
      onEnd: () => {
        if (loopRef.current) {
          start();
        } else {
          setPlaying(false);
          setCurrent(-1);
        }
      },
    });
    playerRef.current = player;
    player.start();
    setPlaying(true);
  };

  const toggle = () => (playing ? stop() : start());

  const currentChord = current >= 0 ? chords[current] : null;
  const nextChord =
    current >= 0 && current + 1 < chords.length ? chords[current + 1] : null;

  if (!chords.length) return null;

  return (
    <div
      className='no-print fixed inset-x-0 z-30 flex justify-center px-3 pb-3 pointer-events-none'
      style={{ bottom: raised ? "3.75rem" : 0 }}
    >
      <div className='pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--color-bg-warm)] border border-[var(--color-border)] shadow-lg max-w-full'>
        <Tooltip content={playing ? "Stop" : "Play chords"}>
          <Button
            variant={playing ? "primary" : "secondary"}
            size='icon-sm'
            onClick={toggle}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </Button>
        </Tooltip>

        <Music4 size={13} className='text-[var(--color-ink-muted)] shrink-0' />

        {/* Current chord + upcoming strip */}
        <div className='flex items-center gap-1.5 overflow-hidden'>
          {playing && currentChord ? (
            <>
              <span className='font-mono text-base font-bold text-[var(--color-accent)] min-w-[2.5rem]'>
                {currentChord}
              </span>
              {nextChord && (
                <span className='font-mono text-xs text-[var(--color-ink-muted)] hidden sm:inline'>
                  → {nextChord}
                </span>
              )}
            </>
          ) : (
            <span className='text-xs text-[var(--color-ink-muted)] whitespace-nowrap'>
              {chords.length} chords · {bpm} bpm
            </span>
          )}
        </div>

        <div className='w-px h-6 bg-[var(--color-border)]' />

        {/* Beats per chord */}
        <div className='flex items-center gap-1.5'>
          <span className='text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wide hidden sm:inline'>
            Beats
          </span>
          <Select
            value={beatsPerChord}
            onChange={(e) => setBeatsPerChord(Number(e.target.value))}
            className='h-7 w-14 text-xs py-0'
          >
            {[1, 2, 4, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>

        <Tooltip content={loop ? "Looping" : "Loop"}>
          <Button
            variant={loop ? "primary" : "secondary"}
            size='icon-sm'
            onClick={() => setLoop((l) => !l)}
          >
            <Repeat size={13} />
          </Button>
        </Tooltip>

        {onClose && (
          <>
            <div className='w-px h-6 bg-[var(--color-border)]' />
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={onClose}
              title='Close chord player'
            >
              <X size={14} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
