// Sample-accurate click metronome using the Web Audio lookahead scheduler.
// No Tone.js dependency — a short oscillator burst per beat, accent on beat 1.

export class Metronome {
  constructor() {
    this.ctx = null
    this.bpm = 100
    this.beatsPerBar = 4
    this.running = false
    this._currentBeat = 0
    this._nextNoteTime = 0
    this._lookaheadMs = 25
    this._scheduleAheadSec = 0.12
    this._timer = null
    this.onBeat = null // callback(beatIndexInBar)
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      this.ctx = new AC()
    }
    return this.ctx
  }

  _scheduleClick(time, beat) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const accent = beat % this.beatsPerBar === 0
    osc.frequency.value = accent ? 1600 : 1000
    gain.gain.setValueAtTime(accent ? 0.6 : 0.32, time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05)
    osc.connect(gain).connect(ctx.destination)
    osc.start(time)
    osc.stop(time + 0.06)
    if (this.onBeat) {
      const delayMs = Math.max(0, (time - ctx.currentTime) * 1000)
      setTimeout(() => {
        if (this.running) this.onBeat?.(beat % this.beatsPerBar)
      }, delayMs)
    }
  }

  _tick = () => {
    const ctx = this.ctx
    // Disposed / stopped between interval fires — tear the timer down instead
    // of throwing every 25 ms.
    if (!ctx || !this.running) { this._clearTimer(); return }
    while (this._nextNoteTime < ctx.currentTime + this._scheduleAheadSec) {
      this._scheduleClick(this._nextNoteTime, this._currentBeat)
      this._nextNoteTime += 60 / this.bpm
      this._currentBeat++
    }
  }

  _clearTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  }

  /**
   * Start clicking. Idempotent: calling it while already running, or while a
   * previous start() is still awaiting ctx.resume(), returns the same promise
   * and never creates a second interval. A stop()/dispose() that lands during
   * the await wins — the metronome stays silent.
   */
  start() {
    if (this._disposed) return Promise.resolve()
    if (this.running) return Promise.resolve()
    if (this._starting) return this._starting
    const token = (this._startToken = (this._startToken || 0) + 1)
    this._starting = (async () => {
      try {
        const ctx = this._ensureCtx()
        if (ctx.state === 'suspended') await ctx.resume()
        // Disposed, stopped, or superseded while resume() was pending.
        if (this._disposed || !this.ctx || token !== this._startToken) return
        this._clearTimer()
        this.running = true
        this._currentBeat = 0
        this._nextNoteTime = this.ctx.currentTime + 0.06
        this._timer = setInterval(this._tick, this._lookaheadMs)
      } finally {
        if (token === this._startToken) this._starting = null
      }
    })()
    return this._starting
  }

  stop() {
    this.running = false
    // Invalidate any start() still awaiting resume().
    this._startToken = (this._startToken || 0) + 1
    this._starting = null
    this._clearTimer()
  }

  setBpm(b) {
    this.bpm = Math.max(30, Math.min(300, Math.round(b) || 100))
  }

  dispose() {
    this._disposed = true
    this.stop()
    this.onBeat = null
    if (this.ctx) { this.ctx.close?.(); this.ctx = null }
  }
}

// Average tap intervals into a BPM. Pass the running list of tap timestamps (ms).
// Resets if the gap since the last tap is > 2s.
export function tapsToBpm(taps) {
  if (!taps || taps.length < 2) return null
  const recent = taps.slice(-5)
  const intervals = []
  for (let i = 1; i < recent.length; i++) intervals.push(recent[i] - recent[i - 1])
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
  if (!avg) return null
  return Math.max(30, Math.min(300, Math.round(60000 / avg)))
}
