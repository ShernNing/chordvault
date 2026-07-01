import { describe, it, expect } from 'vitest'
import { numberSlots } from './setlistSegments'

// Minimal slot fixtures. A song row has song_id + song; a divider has song_id
// null + label. A broken song row has song_id but no loaded song.
const song = (id, songId = `s${id}`) => ({
  id,
  song_id: songId,
  song: { id: songId, title: `Song ${id}` },
})
const divider = (id, label, page_break = false) => ({
  id,
  song_id: null,
  label,
  page_break,
})

describe('numberSlots', () => {
  it('numbers songs 1..n when there are no dividers', () => {
    const out = numberSlots([song(1), song(2), song(3)])
    expect(out.map((e) => e.kind)).toEqual(['song', 'song', 'song'])
    expect(out.map((e) => e.songNumber)).toEqual([1, 2, 3])
  })

  it('restarts numbering at each divider', () => {
    const out = numberSlots([
      song(1),
      song(2),
      divider(10, 'Communion'),
      song(3),
      divider(11, 'Prayer Meeting', true),
      song(4),
      song(5),
    ])
    expect(out.map((e) => e.kind)).toEqual([
      'song',
      'song',
      'divider',
      'song',
      'divider',
      'song',
      'song',
    ])
    expect(
      out.filter((e) => e.kind === 'song').map((e) => e.songNumber),
    ).toEqual([1, 2, 1, 1, 2])
  })

  it('carries divider label and pageBreak', () => {
    const out = numberSlots([
      divider(10, 'Prayer Meeting', true),
      song(1),
    ])
    expect(out[0]).toMatchObject({
      kind: 'divider',
      label: 'Prayer Meeting',
      pageBreak: true,
    })
    expect(out[1].songNumber).toBe(1)
  })

  it('drops song rows whose song failed to load but keeps dividers', () => {
    const broken = { id: 9, song_id: 'sX', song: null }
    const out = numberSlots([song(1), broken, divider(10, 'Communion'), song(2)])
    expect(out.map((e) => e.kind)).toEqual(['song', 'divider', 'song'])
    expect(
      out.filter((e) => e.kind === 'song').map((e) => e.songNumber),
    ).toEqual([1, 1])
  })

  it('preserves the original slot reference on each entry', () => {
    const s = song(1)
    const d = divider(10, 'Communion')
    const out = numberSlots([s, d])
    expect(out[0].slot).toBe(s)
    expect(out[1].slot).toBe(d)
  })

  it('returns an empty array for no slots', () => {
    expect(numberSlots([])).toEqual([])
  })
})
