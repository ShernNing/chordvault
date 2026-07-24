// Lazy-loaded Tone.js voicing playback. Tone (~80KB gz) is fetched on first play.
// Supports strum (down/up), arpeggio, single chord, tunable speed + sustain.

import { Chord, Note } from 'tonal'
import { voicingPitches } from './notes'

let _tonePromise = null
let _synthPromise = null

async function getTone() {
  if (!_tonePromise) {
    _tonePromise = import('tone').then(mod => mod.default ? mod : mod)
  }
  return _tonePromise
}

async function getSynth() {
  if (!_synthPromise) {
    _synthPromise = (async () => {
      const Tone = await getTone()
      await Tone.start()
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.4, sustain: 0.25, release: 1.2 },
      })
      const reverb = new Tone.Reverb({ decay: 1.4, wet: 0.18 })
      await reverb.generate?.()
      synth.chain(reverb, Tone.Destination)
      synth.volume.value = -8
      return { Tone, synth }
    })()
  }
  return _synthPromise
}

export const DEFAULT_AUDIO_OPTIONS = {
  mode: 'strum',          // 'strum' | 'arpeggio' | 'chord'
  direction: 'down',      // 'down' | 'up'
  speedMs: 22,            // strum: stagger between adjacent strings; arpeggio: per note
  sustainSec: 1.4,        // ring duration of each note
}

/**
 * Play a voicing.
 *   frets: [lowE..highE], null = mute.
 *   options:
 *     mode:        'strum' | 'arpeggio' | 'chord'
 *     direction:   'down' (low → high) | 'up' (high → low)
 *     speedMs:     stagger / per-note interval
 *     sustainSec:  note duration
 */
export async function playVoicing(frets, options = {}) {
  const opts = { ...DEFAULT_AUDIO_OPTIONS, ...options }
  if (!frets) return
  let pitches = voicingPitches(frets, false, opts.tuning)
  if (pitches.length === 0) return

  if (opts.direction === 'up') pitches = pitches.slice().reverse()

  let Tone, synth
  try {
    ({ Tone, synth } = await getSynth())
  } catch (e) {
    console.warn('Tone.js failed to load; playback disabled', e)
    return
  }

  const now = Tone.now()
  const stagger = opts.mode === 'chord' ? 0 : opts.speedMs / 1000
  const sustain = opts.mode === 'arpeggio' ? Math.max(opts.sustainSec, opts.speedMs / 1000 * 1.5) : opts.sustainSec

  pitches.forEach((p, i) => {
    synth.triggerAttackRelease(p, sustain, now + i * stagger)
  })

  await new Promise(res => setTimeout(res, (opts.speedMs * pitches.length) + 120))
}

// ─── Chord progression playback (strum the whole song) ───────────────────────

/**
 * Turn a chord name into stacked pitches (with octaves), low → high.
 * Handles slash chords by placing the bass note an octave below.
 *   chordToPitches('Am7')   → ['A3','C4','E4','G4']
 *   chordToPitches('F/A')   → ['A2','F3','A3','C4']
 */
export function chordToPitches(chordName, { baseOctave = 3 } = {}) {
  if (!chordName) return []
  let name = chordName.trim()
  let bass = null
  if (name.includes('/')) {
    const [c, b] = name.split('/')
    name = c
    bass = b
  }

  const info = Chord.get(name)
  let notes = info && info.notes && info.notes.length ? info.notes : null
  if (!notes) {
    const m = name.match(/^([A-G][#b]?)/)
    if (!m) return []
    notes = [m[1]]
  }

  const out = []
  let prevMidi = -Infinity
  for (const pc of notes) {
    let oct = baseOctave
    let midi = Note.midi(`${pc}${oct}`)
    while (midi != null && midi <= prevMidi) { oct += 1; midi = Note.midi(`${pc}${oct}`) }
    if (midi == null) continue
    prevMidi = midi
    out.push(`${pc}${oct}`)
  }

  if (bass) {
    const bassPitch = `${bass}${baseOctave - 1}`
    if (Note.midi(bassPitch) != null) out.unshift(bassPitch)
  }
  return out
}

/**
 * Build a controllable player that walks a chord progression at tempo.
 *   chords:        ordered array of chord-name strings
 *   bpm:           tempo
 *   beatsPerChord: how many beats each chord rings (default 4 = one bar in 4/4)
 *   strum:         lightly stagger notes (true) vs block chord (false)
 *   onStep(i, chord): fired as each chord starts
 *   onEnd():       fired when the progression finishes
 * Returns { start, stop }. Safe to call stop() at any time.
 */
export function createProgressionPlayer({
  chords = [],
  bpm = 100,
  beatsPerChord = 4,
  beatsPerBar = 4,
  strum = true,
  countInBeats = 0,
  startIndex = 0,
  endIndex = null,
  onStep,
  onCount,
  onEnd,
}) {
  const lo = Math.max(0, Math.min(startIndex, chords.length))
  const hi = endIndex == null ? chords.length : Math.max(lo, Math.min(endIndex, chords.length))
  let i = lo
  let timer = null
  let stopped = false
  const beatMs = (60 / Math.max(bpm, 1)) * 1000
  const intervalMs = beatMs * beatsPerChord

  // Short synth blip for the count-in, accent on the downbeat.
  const click = async (accent) => {
    try {
      const { Tone, synth } = await getSynth()
      if (stopped) return
      synth.triggerAttackRelease(accent ? 'C6' : 'G5', 0.05, Tone.now())
    } catch { /* click is best-effort */ }
  }

  const playStep = async () => {
    if (stopped) return
    if (i >= hi) { stop(); onEnd?.(); return }
    const chord = chords[i]
    onStep?.(i, chord)
    const pitches = chordToPitches(chord)
    try {
      const { Tone, synth } = await getSynth()
      if (stopped) return
      const now = Tone.now()
      const stagger = strum ? 0.028 : 0
      const sustain = Math.min(intervalMs / 1000 * 0.95, 2.4)
      pitches.forEach((p, k) => synth.triggerAttackRelease(p, sustain, now + k * stagger))
    } catch (e) {
      console.warn('Chord playback failed', e)
    }
    i += 1
    timer = setTimeout(playStep, intervalMs)
  }

  // Tick the count-in beats, then hand off to the progression.
  const runCountIn = (beat) => {
    if (stopped) return
    if (beat >= countInBeats) { playStep(); return }
    onCount?.(countInBeats - beat) // remaining count, e.g. 4,3,2,1
    click(beat % beatsPerBar === 0)
    timer = setTimeout(() => runCountIn(beat + 1), beatMs)
  }

  const start = async () => {
    stopped = false
    i = lo
    try { await getSynth() } catch { /* keeps going; playStep handles failure */ }
    if (stopped) return
    if (countInBeats > 0) runCountIn(0)
    else playStep()
  }

  function stop() {
    stopped = true
    if (timer) { clearTimeout(timer); timer = null }
    _synthPromise?.then(({ synth }) => { try { synth.releaseAll() } catch { /* not ready */ } }).catch(() => {})
  }

  return { start, stop }
}
