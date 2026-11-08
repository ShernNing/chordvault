import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Metronome } from './metronome'

class FakeCtx {
  constructor() {
    this.state = 'suspended'
    this.currentTime = 0
    this.destination = {}
    this._resolve = null
  }
  resume() {
    return new Promise((r) => { this._resolve = () => { this.state = 'running'; r() } })
  }
  close() { this.state = 'closed' }
  createOscillator() {
    return { frequency: {}, connect: (g) => g, start() {}, stop() {} }
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d) => d }
  }
}

describe('Metronome start/stop races', () => {
  let ctx
  beforeEach(() => {
    vi.useFakeTimers()
    ctx = new FakeCtx()
    globalThis.window = globalThis.window || globalThis
    window.AudioContext = function () { return ctx }
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('double start while resume() is pending creates only one interval', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    const m = new Metronome()
    const a = m.start()
    const b = m.start()
    expect(a).toBe(b)
    ctx._resolve()
    await a
    expect(spy).toHaveBeenCalledTimes(1)
    m.stop()
    expect(m._timer).toBe(null)
    spy.mockRestore()
  })

  it('dispose during pending resume never starts the interval', async () => {
    const m = new Metronome()
    const p = m.start()
    m.dispose()
    ctx._resolve()
    await p
    expect(m.running).toBe(false)
    expect(m._timer).toBe(null)
  })

  it('stop during pending resume keeps it silent', async () => {
    const m = new Metronome()
    const p = m.start()
    m.stop()
    ctx._resolve()
    await p
    expect(m.running).toBe(false)
    expect(m._timer).toBe(null)
  })

  it('_tick is safe after the context is gone', () => {
    const m = new Metronome()
    m.running = true
    m._timer = setInterval(() => {}, 25)
    m.ctx = null
    expect(() => m._tick()).not.toThrow()
    expect(m._timer).toBe(null)
  })
})
