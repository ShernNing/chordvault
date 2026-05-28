// Lazy-loaded Tone.js voicing playback. Tone (~80KB gz) is fetched on first play.
// Supports strum (down/up), arpeggio, single chord, tunable speed + sustain.

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
  let pitches = voicingPitches(frets)
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
