import { supabase } from './supabase'
import { buildEmbedText } from './embedText'

// ── Filter helpers ───────────────────────────────────────────────────────────
// Escape LIKE/ILIKE wildcards so user text matches literally (backslash is the
// default Postgres LIKE escape character).
export function escapeLike(s) {
  return String(s ?? '').replace(/[\\%_]/g, ch => '\\' + ch)
}

// Quote a value for a PostgREST `or=(...)` filter: wrap in double quotes and
// backslash-escape `"` and `\` so reserved chars (, . ( ) :) can't alter it.
export function quoteFilterValue(s) {
  return `"${String(s ?? '').replace(/[\\"]/g, ch => '\\' + ch)}"`
}

// PostgREST "function not found": the RPC migration hasn't been applied yet.
const isMissingRpc = (error) =>
  error?.code === 'PGRST202' || /could not find the function/i.test(error?.message || '')

export class PermissionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PermissionError'
  }
}

export class DuplicateSlotError extends Error {
  constructor(message = 'Already in this setlist') {
    super(message)
    this.name = 'DuplicateSlotError'
  }
}

export const supabaseSongOps = {
  async getAll() {
    const { data, error } = await supabase.from('songs').select('*').order('title')
    if (error) throw error
    return data ?? []
  },

  async getByTitles(titles) {
    if (!titles.length) return []
    // Exact, case-insensitive title match: escape LIKE wildcards (% _) so a
    // title like "100% Yes" doesn't match unrelated songs.
    const filter = titles.map(t => `title.ilike.${quoteFilterValue(escapeLike(t))}`).join(',')
    const { data, error } = await supabase.from('songs').select('*').or(filter)
    if (error) throw error
    return data ?? []
  },

  async getById(id) {
    const { data, error } = await supabase.from('songs').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async create(songData) {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('songs')
      .insert({ ...songData, created_at: now, updated_at: now, last_played_at: null, play_count: 0 })
      .select()
      .single()
    if (error) throw error
    // Fire-and-forget: embedding is slow and must never block or fail the save.
    this.embedSong(data.id, data)
    return data
  },

  // RLS-blocked UPDATEs return no error and zero rows, so detect that and throw.
  async update(id, updates) {
    const { data, error } = await supabase
      .from('songs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    if (error) throw error
    const row = data?.[0]
    if (!row) throw new PermissionError("Not permitted: you can't edit this song (or it no longer exists)")
    this.embedSong(row.id, row)
    return row
  },

  // Delete the song FIRST (with .select so an RLS-blocked delete, 0 rows and no
  // error, is detected), and only then clean up its setlist slots. If a
  // non-cascading FK blocks the delete (23503), RLS already allowed it, so the
  // slots are cleared and the delete retried.
  async delete(id) {
    let { data, error } = await supabase.from('songs').delete().eq('id', id).select('id')
    if (error?.code === '23503') {
      const { error: slotErr } = await supabase.from('setlist_songs').delete().eq('song_id', id)
      if (slotErr) throw slotErr
      ;({ data, error } = await supabase.from('songs').delete().eq('id', id).select('id'))
    }
    if (error) throw error
    if (!data?.length) throw new PermissionError("You don't have permission to delete this song")
    // Orphaned slots (no FK cascade): best effort, the song itself is gone.
    const { error: cleanupErr } = await supabase.from('setlist_songs').delete().eq('song_id', id)
    if (cleanupErr) console.warn('Could not remove deleted song from setlists:', cleanupErr)
  },

  // Deletes each song independently so one forbidden song can't take the
  // others' setlist slots with it. Returns { deleted: id[], failed: [{ id, error }] }.
  async deleteMany(ids) {
    const deleted = []
    const failed = []
    for (const id of ids ?? []) {
      try {
        await this.delete(id)
        deleted.push(id)
      } catch (error) {
        failed.push({ id, error })
      }
    }
    return { deleted, failed }
  },

  // Play tracking goes through the mark_song_played RPC (SECURITY DEFINER) so
  // members, who can't UPDATE songs under RLS, still record plays atomically.
  async markPlayed(id) {
    const { error } = await supabase.rpc('mark_song_played', { p_song_id: id })
    if (!error) return
    if (!isMissingRpc(error)) throw error
    // Migration not applied yet: legacy read-modify-write (owners/superusers only).
    const { data: song, error: readErr } = await supabase.from('songs').select('play_count').eq('id', id).single()
    if (readErr) throw readErr
    const { error: updErr } = await supabase.from('songs').update({
      last_played_at: new Date().toISOString(),
      play_count: (song?.play_count ?? 0) + 1,
    }).eq('id', id)
    if (updErr) throw updErr
  },

  async search(query) {
    if (!query?.trim()) return this.getAll()
    // Quote + escape the value so reserved PostgREST chars (, ( ) .) in the
    // query can't alter the filter. % stays a LIKE wildcard inside the quotes.
    const q = query.toLowerCase().replace(/"/g, '""')
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .or(`title.ilike."%${q}%",artist.ilike."%${q}%"`)
      .order('title')
    if (error) throw error
    return data ?? []
  },

  // Fire the embedding for a song. Non-blocking by contract: a failure is logged
  // and swallowed so the save itself never fails — the song just won't appear in
  // semantic results until it is re-saved or picked up by the backfill script.
  async embedSong(songId, song) {
    if (!supabase) return
    try {
      const { error } = await supabase.functions.invoke('embed-song', {
        body: { songId, text: buildEmbedText(song) },
      })
      if (error) throw error
    } catch (e) {
      console.warn('embed-song failed; song saved without embedding:', e)
    }
  },

  // Semantic search: returns [{ id, similarity }] ranked most-similar first.
  async semanticSearch(query, { threshold = 0.7, count = 8 } = {}) {
    if (!supabase || !query?.trim()) return []
    const { data, error } = await supabase.functions.invoke('search-songs', {
      body: { query, threshold, count },
    })
    if (error) throw error
    return data?.results ?? []
  },
}

export const supabaseFavoriteOps = {
  // Song ids the signed-in user has starred.
  async list(userId) {
    const { data, error } = await supabase
      .from('song_favorites').select('song_id').eq('user_id', userId)
    if (error) throw error
    return (data ?? []).map(r => r.song_id)
  },

  async add(userId, songId) {
    const { error } = await supabase
      .from('song_favorites')
      .upsert({ user_id: userId, song_id: songId }, { onConflict: 'user_id,song_id' })
    if (error) throw error
  },

  async remove(userId, songId) {
    const { error } = await supabase
      .from('song_favorites').delete().eq('user_id', userId).eq('song_id', songId)
    if (error) throw error
  },
}

export const supabaseProfileOps = {
  // The signed-in user's own profile row (id, role, created_at, email if present).
  async getMine(userId) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) throw error
    return data
  },

  // All profiles. Only returns rows the RLS policies allow — for a member that's
  // just their own row; for an admin it's everyone (once the admin SELECT policy
  // in ROLES.md is in place). Degrades gracefully either way.
  async listAll() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  // Promote / demote. Rejected by Postgres unless the caller is an admin and the
  // admin UPDATE policy in ROLES.md is in place — the UI guard is cosmetic only.
  async setRole(userId, role) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)
      .select()
      .single()
    if (error) throw error
    return data
  },
}

export const supabaseSetlistOps = {
  async getAll() {
    const { data, error } = await supabase
      .from('setlists')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getById(id) {
    const { data, error } = await supabase.from('setlists').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async getWithSongs(id) {
    const { data: setlist, error: e1 } = await supabase.from('setlists').select('*').eq('id', id).single()
    if (e1) throw e1
    const { data: slots, error: e2 } = await supabase
      .from('setlist_songs')
      .select('*')
      .eq('setlist_id', id)
      .order('position')
    if (e2) throw e2
    // One request for every song in the setlist (not one per slot).
    const songIds = [...new Set((slots ?? []).map(s => s.song_id).filter(Boolean))]
    let byId = new Map()
    if (songIds.length) {
      const { data: songRows, error: e3 } = await supabase.from('songs').select('*').in('id', songIds)
      if (e3) throw e3
      byId = new Map((songRows ?? []).map(s => [s.id, s]))
    }
    const songs = (slots ?? []).map(slot => {
      // Divider rows have no song_id; keep the row as-is.
      if (!slot.song_id) return { ...slot, song: null }
      const song = byId.get(slot.song_id) ?? null
      // Keep slots whose song is gone/unreadable, flagged so the UI shows it
      // instead of silently dropping it from the setlist.
      return song ? { ...slot, song } : { ...slot, song: null, missing: true }
    })
    return { ...setlist, songs }
  },

  async create(name) {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('setlists')
      .insert({ name, created_at: now, updated_at: now })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('setlists')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id) {
    const { error: slotErr } = await supabase.from('setlist_songs').delete().eq('setlist_id', id)
    if (slotErr) throw slotErr
    const { data, error } = await supabase.from('setlists').delete().eq('id', id).select('id')
    if (error) throw error
    if (!data?.length) throw new PermissionError("You don't have permission to delete this setlist")
  },

  // Existing slots + next free position = max(position) + 1 (a row count
  // collides with existing positions after removals).
  async _slotState(setlistId) {
    const { data, error } = await supabase
      .from('setlist_songs')
      .select('song_id, position')
      .eq('setlist_id', setlistId)
    if (error) throw error
    const rows = data ?? []
    const nextPosition = rows.reduce((m, r) => Math.max(m, (r.position ?? -1) + 1), 0)
    return { rows, nextPosition }
  },

  // Throws DuplicateSlotError when the song is already in the setlist.
  async addSong(setlistId, songId, chosenKey = null, capo = 0) {
    const { rows, nextPosition: position } = await this._slotState(setlistId)
    if (rows.some(r => r.song_id === songId)) throw new DuplicateSlotError()
    const { data, error } = await supabase
      .from('setlist_songs')
      .insert({ setlist_id: setlistId, song_id: songId, position, chosen_key: chosenKey, capo })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async addDivider(setlistId, label, pageBreak = false) {
    const { nextPosition: position } = await this._slotState(setlistId)
    const { data, error } = await supabase
      .from('setlist_songs')
      .insert({ setlist_id: setlistId, song_id: null, label, page_break: pageBreak, position })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async removeSong(slotId) {
    const { error } = await supabase.from('setlist_songs').delete().eq('id', slotId)
    if (error) throw error
  },

  async updateSongSlot(slotId, updates) {
    const { error } = await supabase.from('setlist_songs').update(updates).eq('id', slotId)
    if (error) throw error
  },

  // One atomic UPDATE via the reorder_setlist_songs RPC (all-or-nothing; the
  // function verifies every id belongs to the setlist). Throws on failure so
  // the caller can roll back its optimistic order.
  async reorderSongs(setlistId, orderedSlotIds) {
    const { error } = await supabase.rpc('reorder_setlist_songs', {
      p_setlist_id: setlistId,
      p_slot_ids: orderedSlotIds,
    })
    if (!error) return
    if (!isMissingRpc(error)) throw error
    // Migration not applied yet: per-row fallback, but never ignore failures.
    const results = await Promise.all(
      orderedSlotIds.map((slotId, position) =>
        supabase.from('setlist_songs').update({ position }).eq('id', slotId).eq('setlist_id', setlistId)
      )
    )
    const failed = results.find(r => r.error)
    if (failed) throw failed.error
  },
}
