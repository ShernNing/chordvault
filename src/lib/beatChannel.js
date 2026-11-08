import { useCallback, useRef } from "react";

/**
 * A tiny pub/sub for metronome beats. The owner (PerformBar / SetlistPerformer)
 * calls `emit(beat)` from the metronome's onBeat; only <BeatIndicator> holds
 * beat state, so a beat re-renders four dots — never the chart.
 */
export function useBeatChannel() {
  const listeners = useRef(new Set());
  const emit = useCallback((b) => {
    listeners.current.forEach((l) => l(b));
  }, []);
  const subscribe = useCallback((l) => {
    listeners.current.add(l);
    return () => listeners.current.delete(l);
  }, []);
  return { emit, subscribe };
}
