import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Supabase client ──────────────────────────────────────────────────────
// Each `from(table)` returns a chainable, thenable query builder. Tests queue
// results per table (FIFO); every builder records the chain of calls it saw.
const h = vi.hoisted(() => {
  const state = { queues: {}, calls: [], rpc: [], rpcResults: [], invoke: [] }
  function builder(table) {
    const rec = { table, ops: [] }
    state.calls.push(rec)
    const b = {}
    for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'or', 'order', 'limit', 'single', 'upsert']) {
      b[op] = (...args) => { rec.ops.push([op, ...args]); return b }
    }
    b.then = (resolve, reject) => {
      const q = state.queues[table] || []
      const next = q.shift() ?? { data: null, error: null }
      return Promise.resolve(next).then(resolve, reject)
    }
    return b
  }
  const supabase = {
    from: (t) => builder(t),
    rpc: (name, args) => {
      state.rpc.push([name, args])
      return Promise.resolve(state.rpcResults.shift() ?? { data: null, error: null })
    },
    functions: { invoke: (name, opts) => { state.invoke.push([name, opts]); return new Promise(() => {}) } },
  }
  return { state, supabase }
})

vi.mock('./supabase', () => ({ supabase: h.supabase }))

import {
  supabaseSongOps,
  supabaseSetlistOps,
  escapeLike,
  quoteFilterValue,
  PermissionError,
  DuplicateSlotError,
} from './supabaseOps'

const queue = (table, ...results) => { (h.state.queues[table] ||= []).push(...results) }

beforeEach(() => {
  h.state.queues = {}
  h.state.calls = []
  h.state.rpc = []
  h.state.rpcResults = []
  h.state.invoke = []
})

describe('filter helpers', () => {
  it('escapes LIKE wildcards', () => {
    expect(escapeLike('100% _yes_')).toBe('100\\% \\_yes\\_')
    expect(escapeLike('a\\b')).toBe('a\\\\b')
  })
  it('quotes PostgREST values', () => {
    expect(quoteFilterValue('say "hi", ok')).toBe('"say \\"hi\\", ok"')
  })
  it('getByTitles escapes wildcards in the or-filter', async () => {
    queue('songs', { data: [], error: null })
    await supabaseSongOps.getByTitles(['50%_Off'])
    const or = h.state.calls[0].ops.find(o => o[0] === 'or')
    expect(or[1]).toBe('title.ilike."50\\\\%\\\\_Off"')
  })
})

describe('supabaseSongOps', () => {
  it('update throws a permission error when RLS matches 0 rows', async () => {
    queue('songs', { data: [], error: null })
    await expect(supabaseSongOps.update('s1', { title: 'x' })).rejects.toBeInstanceOf(PermissionError)
  })

  it('update does not await the embed call', async () => {
    queue('songs', { data: [{ id: 's1', title: 'x' }], error: null })
    // functions.invoke never resolves; update must still return.
    await expect(supabaseSongOps.update('s1', { title: 'x' })).resolves.toEqual({ id: 's1', title: 'x' })
    expect(h.state.invoke).toHaveLength(1)
  })

  it('delete removes the song before touching setlist slots and reports RLS blocks', async () => {
    queue('songs', { data: [], error: null })
    await expect(supabaseSongOps.delete('s1')).rejects.toThrow(/permission/)
    // setlist_songs must NOT have been touched
    expect(h.state.calls.map(c => c.table)).toEqual(['songs'])
  })

  it('delete clears slots and retries when a non-cascading FK blocks it', async () => {
    queue('songs', { data: null, error: { code: '23503', message: 'fk' } }, { data: [{ id: 's1' }], error: null })
    queue('setlist_songs', { data: null, error: null }, { data: null, error: null })
    await supabaseSongOps.delete('s1')
    expect(h.state.calls.map(c => c.table)).toEqual(['songs', 'setlist_songs', 'songs', 'setlist_songs'])
  })

  it('deleteMany reports partial failures', async () => {
    queue('songs', { data: [{ id: 'a' }], error: null }, { data: [], error: null })
    const r = await supabaseSongOps.deleteMany(['a', 'b'])
    expect(r.deleted).toEqual(['a'])
    expect(r.failed.map(f => f.id)).toEqual(['b'])
  })

  it('markPlayed calls the RPC', async () => {
    await supabaseSongOps.markPlayed('s1')
    expect(h.state.rpc).toEqual([['mark_song_played', { p_song_id: 's1' }]])
  })

  it('markPlayed surfaces RPC errors', async () => {
    h.state.rpcResults.push({ error: { code: '42501', message: 'nope' } })
    await expect(supabaseSongOps.markPlayed('s1')).rejects.toEqual({ code: '42501', message: 'nope' })
  })
})

describe('supabaseSetlistOps', () => {
  it('getWithSongs fetches songs in one request and keeps missing ones flagged', async () => {
    queue('setlists', { data: { id: 'L', name: 'Sun' }, error: null })
    queue('setlist_songs', {
      data: [
        { id: 'x1', song_id: 'a', position: 0 },
        { id: 'x2', song_id: null, label: 'Seg', position: 1 },
        { id: 'x3', song_id: 'gone', position: 2 },
      ],
      error: null,
    })
    queue('songs', { data: [{ id: 'a', title: 'A' }], error: null })
    const r = await supabaseSetlistOps.getWithSongs('L')
    expect(h.state.calls.filter(c => c.table === 'songs')).toHaveLength(1)
    expect(r.songs.map(s => [s.id, s.song?.title ?? null, !!s.missing])).toEqual([
      ['x1', 'A', false],
      ['x2', null, false],
      ['x3', null, true],
    ])
  })

  it('getWithSongs throws when the songs query fails', async () => {
    queue('setlists', { data: { id: 'L' }, error: null })
    queue('setlist_songs', { data: [{ id: 'x1', song_id: 'a' }], error: null })
    queue('songs', { data: null, error: { message: 'boom' } })
    await expect(supabaseSetlistOps.getWithSongs('L')).rejects.toEqual({ message: 'boom' })
  })

  it('addSong uses max(position)+1 and blocks duplicates', async () => {
    queue('setlist_songs',
      { data: [{ song_id: 'a', position: 0 }, { song_id: 'b', position: 5 }], error: null },
      { data: { id: 'new' }, error: null })
    await supabaseSetlistOps.addSong('L', 'c')
    const insert = h.state.calls[1].ops.find(o => o[0] === 'insert')
    expect(insert[1].position).toBe(6)

    queue('setlist_songs', { data: [{ song_id: 'a', position: 0 }], error: null })
    await expect(supabaseSetlistOps.addSong('L', 'a')).rejects.toBeInstanceOf(DuplicateSlotError)
  })

  it('reorderSongs uses the atomic RPC and throws on error', async () => {
    await supabaseSetlistOps.reorderSongs('L', ['x2', 'x1'])
    expect(h.state.rpc[0]).toEqual(['reorder_setlist_songs', { p_setlist_id: 'L', p_slot_ids: ['x2', 'x1'] }])
    h.state.rpcResults.push({ error: { code: '22023', message: 'mismatch' } })
    await expect(supabaseSetlistOps.reorderSongs('L', ['x1'])).rejects.toEqual({ code: '22023', message: 'mismatch' })
  })

  it('delete reports a setlist delete that matched 0 rows', async () => {
    queue('setlist_songs', { data: null, error: null })
    queue('setlists', { data: [], error: null })
    await expect(supabaseSetlistOps.delete('L')).rejects.toBeInstanceOf(PermissionError)
  })
})
