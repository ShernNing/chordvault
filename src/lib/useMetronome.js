import { useCallback, useEffect, useRef, useState } from 'react'
import { Metronome } from './metronome'
import { useBeatChannel } from './beatChannel'

/**
 * Shared metronome wiring for the perform surfaces.
 *  - lazily creates one Metronome, keeps its tempo in sync, disposes on unmount
 *  - toggle() ignores taps while a start is still pending (no double intervals)
 *  - beats go out through a channel (`subscribeBeat`) instead of parent state,
 *    so only <BeatIndicator> re-renders per beat
 */
export function useMetronome({ bpm, beatsPerBar = 4 }) {
  const metroRef = useRef(null)
  const pendingRef = useRef(false)
  const mountedRef = useRef(true)
  const [metroOn, setMetroOn] = useState(false)
  const { emit, subscribe } = useBeatChannel()

  const bpmRef = useRef(bpm)
  bpmRef.current = bpm

  useEffect(() => {
    metroRef.current?.setBpm(bpm)
  }, [bpm])

  useEffect(() => {
    if (metroRef.current) metroRef.current.beatsPerBar = beatsPerBar
  }, [beatsPerBar])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      metroRef.current?.dispose()
      metroRef.current = null
    }
  }, [])

  const getMetro = useCallback(() => {
    if (!metroRef.current) {
      const m = new Metronome()
      m.beatsPerBar = beatsPerBar
      m.onBeat = (b) => emit(b)
      metroRef.current = m
    }
    return metroRef.current
  }, [beatsPerBar, emit])

  const toggle = useCallback(async () => {
    if (pendingRef.current) return
    const m = getMetro()
    m.setBpm(bpmRef.current)
    if (m.running) {
      m.stop()
      setMetroOn(false)
      emit(-1)
      return
    }
    pendingRef.current = true
    try {
      await m.start()
    } catch {
      // AudioContext refused (autoplay policy etc.) — stay off.
    } finally {
      pendingRef.current = false
    }
    if (mountedRef.current) setMetroOn(!!metroRef.current?.running)
  }, [getMetro, emit])

  return { metroOn, toggle, subscribeBeat: subscribe }
}
