import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: null }))

import { isTypingTarget } from './hooks'

const input = (type) => ({ tagName: 'INPUT', type })

describe('isTypingTarget (pedal keys)', () => {
  it('lets pedal keys through when a slider / toggle / button has focus', () => {
    for (const t of ['range', 'checkbox', 'radio', 'button', 'submit']) {
      expect(isTypingTarget(input(t))).toBe(false)
    }
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })

  it('still ignores keys while typing', () => {
    expect(isTypingTarget(input('text'))).toBe(true)
    expect(isTypingTarget(input('search'))).toBe(true)
    expect(isTypingTarget(input(undefined))).toBe(true)
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })
})
