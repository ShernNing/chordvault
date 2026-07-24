import { describe, it, expect } from 'vitest'
import { splitSections, defaultPlan, applyArrangement } from './arrangement'

const content = [
  { type: 'section_header', text: 'Verse' },
  { type: 'chord_line', tokens: [{ text: 'G' }] },
  { type: 'lyric_line', text: 'v1' },
  { type: 'blank' },
  { type: 'section_header', text: 'Chorus' },
  { type: 'chord_line', tokens: [{ text: 'C' }] },
  { type: 'lyric_line', text: 'c1' },
]

describe('splitSections', () => {
  it('splits on headers and trims trailing blanks', () => {
    const segs = splitSections(content)
    expect(segs.map((s) => s.label)).toEqual(['Verse', 'Chorus'])
    expect(segs[0].lines.at(-1).type).toBe('lyric_line') // trailing blank removed
  })
  it('captures a pre-header section as Intro', () => {
    const segs = splitSections([
      { type: 'chord_line', tokens: [{ text: 'A' }] },
      { type: 'section_header', text: 'Verse' },
      { type: 'lyric_line', text: 'x' },
    ])
    expect(segs[0].label).toBe('Intro')
  })
})

describe('applyArrangement', () => {
  it('reorders and repeats sections', () => {
    // Chorus, Verse, Chorus×2
    const plan = [
      { index: 1, repeat: 1 },
      { index: 0, repeat: 1 },
      { index: 1, repeat: 2 },
    ]
    const out = applyArrangement(content, plan)
    const headers = out.filter((l) => l.type === 'section_header').map((l) => l.text)
    expect(headers).toEqual(['Chorus', 'Verse', 'Chorus', 'Chorus'])
    // blank separators inserted between sections, not leading
    expect(out[0].type).toBe('section_header')
  })
  it('default plan reproduces the original order', () => {
    const out = applyArrangement(content, defaultPlan(content))
    const headers = out.filter((l) => l.type === 'section_header').map((l) => l.text)
    expect(headers).toEqual(['Verse', 'Chorus'])
  })
  it('empty plan returns original content', () => {
    expect(applyArrangement(content, [])).toBe(content)
  })
})
