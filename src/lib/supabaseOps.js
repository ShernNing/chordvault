import { supabase } from './supabase'

export const supabaseSongOps = {
  async getAll() {
    const { data, error } = await supabase.from('songs').select('*').order('title')
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
    return data
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('songs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id) {
    await supabase.from('setlist_songs').delete().eq('song_id', id)
    const { error } = await supabase.from('songs').delete().eq('id', id)
    if (error) throw error
  },

  async markPlayed(id) {
    const { data: song } = await supabase.from('songs').select('play_count').eq('id', id).single()
    await supabase.from('songs').update({
      last_played_at: new Date().toISOString(),
      play_count: (song?.play_count ?? 0) + 1,
    }).eq('id', id)
  },

  async search(query) {
    if (!query?.trim()) return this.getAll()
    const q = query.toLowerCase()
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .or(`title.ilike.%${q}%,artist.ilike.%${q}%`)
      .order('title')
    if (error) throw error
    return data ?? []
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
    const songs = await Promise.all(
      (slots ?? []).map(async slot => {
        const { data: song } = await supabase.from('songs').select('*').eq('id', slot.song_id).single()
        return { ...slot, song }
      })
    )
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
    await supabase.from('setlist_songs').delete().eq('setlist_id', id)
    const { error } = await supabase.from('setlists').delete().eq('id', id)
    if (error) throw error
  },

  async addSong(setlistId, songId, chosenKey = null, capo = 0) {
    const { data: existing } = await supabase.from('setlist_songs').select('id').eq('setlist_id', setlistId)
    const position = (existing ?? []).length
    const { data, error } = await supabase
      .from('setlist_songs')
      .insert({ setlist_id: setlistId, song_id: songId, position, chosen_key: chosenKey, capo })
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

  async reorderSongs(setlistId, orderedSlotIds) {
    await Promise.all(
      orderedSlotIds.map((slotId, position) =>
        supabase.from('setlist_songs').update({ position }).eq('id', slotId)
      )
    )
  },
}
