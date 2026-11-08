import { useEffect, useState } from "react";

// Beat dots for the metronome. Owns the beat state itself (fed through a
// useBeatChannel() subscription) so a beat never re-renders the chart.

export default function BeatIndicator({
  subscribe,
  beatsPerBar = 4,
  active = false,
  className = "",
}) {
  const [beat, setBeat] = useState(-1);
  useEffect(() => subscribe(setBeat), [subscribe]);

  return (
    <div className={`flex items-center gap-1 ${className}`} aria-hidden='true'>
      {Array.from({ length: beatsPerBar }, (_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full transition-colors ${
            active && beat === i
              ? i === 0
                ? "bg-[var(--color-accent)]"
                : "bg-[var(--color-ink)]"
              : "bg-[var(--color-border)]"
          }`}
        />
      ))}
    </div>
  );
}
